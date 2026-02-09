const { getAppPaths } = require('../lib/paths');
const { ensureDir } = require('../lib/fs');
const { loadSourcesManifest } = require('../lib/manifest');
const { ensureRepo } = require('../lib/git');
const { scanSkillsInRepo } = require('../lib/scan');
const { loadProfile, saveProfile } = require('../lib/profiles');
const { mapWithConcurrency } = require('../lib/concurrency');
const { getEffectiveDefaultProfile } = require('../lib/config');
const { syncAgents } = require('../lib/openskills');
const { installFromLocalSkillDir } = require('../lib/local-install');
const { warnPrereqs } = require('../lib/prereqs');
const { promptSkillSelection } = require('../lib/cli-select');
const { upsertUserSourceFromInput } = require('../lib/source-manage');
const {
  loadAgentsManifest,
  getScopeFromOpts,
  defaultAgentIds,
  normalizeSelectedAgentIds,
  resolveAgentTargets,
  buildAgentSelectionItems
} = require('../lib/agents');


function uniq(arr) {
  return Array.from(new Set(arr));
}

async function bootstrap(opts, repoOrRef) {
  await warnPrereqs({ needGit: true, needOpenSkills: true });
  const paths = getAppPaths();
  await ensureDir(paths.reposDir);
  await ensureDir(paths.profilesDir);

  const scope = getScopeFromOpts(opts);
  const { sources } = await loadSourcesManifest();
  let enabledSources = sources.filter((s) => s && s.enabled !== false);

  const inputSource = repoOrRef ? String(repoOrRef).trim() : '';
  if (inputSource) {
    const { added, source } = await upsertUserSourceFromInput(inputSource, { enabled: true, enableIfExists: true });
    enabledSources = [source];
    // eslint-disable-next-line no-console
    console.log(added ? `已自动写入来源：${source.id}` : `已复用来源：${source.id}`);
  }

  const profileName = opts?.profile || (await getEffectiveDefaultProfile());
  const existing = await loadProfile({ profilesDir: paths.profilesDir, profileName });

  // Selection path: clone repos + scan SKILL.md, then install selected skill dirs.
  const concurrency = Number(opts?.concurrency || process.env.SKILLMANAGER_CONCURRENCY || 3);
  // eslint-disable-next-line no-console
  console.log(`并发扫描：${Math.max(1, concurrency)}（可用 --concurrency 或环境变量 SKILLMANAGER_CONCURRENCY 调整）`);

  const skillsById = new Map();
  const perSource = await mapWithConcurrency(enabledSources, concurrency, async (s) => {
    try {
      const repoDir = await ensureRepo({ reposDir: paths.reposDir, source: s, forceRefresh: !!opts?.forceRefresh });
      const skills = await scanSkillsInRepo({
        sourceId: s.id,
        sourceName: s.name || s.id,
        repoDir
      });
      return { source: s, skills };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`警告：拉取/扫描来源失败，将跳过：${s.name || s.id}`);
      // eslint-disable-next-line no-console
      console.warn(err?.message || String(err));
      return { source: s, skills: [] };
    }
  });

  for (const { skills } of perSource) {
    for (const sk of skills) skillsById.set(sk.id, sk);
  }

  const allSkills = Array.from(skillsById.values());
  if (allSkills.length === 0) {
    // eslint-disable-next-line no-console
    console.log('未找到可安装的 skills。');
    return;
  }

  let selectedIds =
    existing?.selectedSkillIds && Array.isArray(existing.selectedSkillIds)
      ? existing.selectedSkillIds
      : allSkills.map((s) => s.id);

  const chosen = await promptSkillSelection({
    title: `skillmanager install · profile=${profileName}`,
    skills: allSkills,
    initialSelectedIds: selectedIds
  });
  if (chosen == null) {
    // eslint-disable-next-line no-console
    console.log('已取消（未执行安装）。');
    return;
  }
  selectedIds = uniq(chosen).filter((id) => skillsById.has(id));

  const { agents } = await loadAgentsManifest();
  if (!agents.length) throw new Error('agents 映射为空，请检查 manifests/agents.json');

  let initialAgentIds = normalizeSelectedAgentIds(existing?.selectedAgentIdsByScope?.[scope], agents);
  if (!initialAgentIds.length) initialAgentIds = defaultAgentIds(agents);

  const chosenAgentIds = await promptSkillSelection({
    title: `skillmanager install · agents · ${scope}`,
    skills: buildAgentSelectionItems(agents),
    initialSelectedIds: initialAgentIds
  });
  if (chosenAgentIds == null) {
    // eslint-disable-next-line no-console
    console.log('已取消（未执行安装）。');
    return;
  }
  const selectedAgentIds = normalizeSelectedAgentIds(chosenAgentIds, agents);
  if (!selectedAgentIds.length) {
    // eslint-disable-next-line no-console
    console.log('未选择任何 agent，已取消。');
    return;
  }

  const nextSelectedAgentIdsByScope = {
    project: Array.isArray(existing?.selectedAgentIdsByScope?.project) ? existing.selectedAgentIdsByScope.project : [],
    global: Array.isArray(existing?.selectedAgentIdsByScope?.global) ? existing.selectedAgentIdsByScope.global : [],
    [scope]: selectedAgentIds
  };
  await saveProfile({
    profilesDir: paths.profilesDir,
    profileName,
    selectedSkillIds: selectedIds,
    selectedAgentIdsByScope: nextSelectedAgentIdsByScope
  });

  const targets = resolveAgentTargets({ selectedAgentIds, agents, scope, cwd: process.cwd() });
  if (!targets.length) throw new Error('未解析出任何安装目录，请检查 agents 路径映射。');

  // eslint-disable-next-line no-console
  console.log(`将安装 ${selectedIds.length} 个 skills（scope=${scope}，agents=${selectedAgentIds.length}，dirs=${targets.length}）…`);

  if (opts?.dryRun) {
    // eslint-disable-next-line no-console
    console.log('\n--dry-run 已启用：仅展示前 30 个将安装的 skills（按解析顺序）');
    for (const id of selectedIds.slice(0, 30)) {
      const s = skillsById.get(id);
      // eslint-disable-next-line no-console
      console.log(`- ${s.name}  [${s.sourceId}]  (${s.id})`);
    }
    if (selectedIds.length > 30) {
      // eslint-disable-next-line no-console
      console.log(`… 还有 ${selectedIds.length - 30} 个`);
    }
    // eslint-disable-next-line no-console
    console.log('\n目标目录（按 agent 去重）：');
    for (const t of targets) {
      // eslint-disable-next-line no-console
      console.log(`- ${t.targetDir}  [${t.agentIds.join(', ')}]`);
    }
    // eslint-disable-next-line no-console
    console.log('\n完成（dry-run）。');
    return;
  }

  // 2) install selected
  for (const id of selectedIds) {
    const skill = skillsById.get(id);
    // eslint-disable-next-line no-console
    console.log(`\n==> Installing: ${skill.name}  (${skill.sourceId})`);

    // NOTE: We perform direct local install (copy), then optional openskills sync.
    for (const target of targets) {
      const { targetPath } = await installFromLocalSkillDir({ skillDir: skill.skillDir, targetDir: target.targetDir });
      // eslint-disable-next-line no-console
      console.log(`✅ Installed: ${targetPath}  [${target.agentIds.join(', ')}]`);
    }
  }

  // 3) sync AGENTS.md (optional)
  if (opts?.sync) {
    await syncAgents({ output: opts?.output, cwd: process.cwd() });
  }

  // eslint-disable-next-line no-console
  console.log('\n完成。');
}

module.exports = { bootstrap };
