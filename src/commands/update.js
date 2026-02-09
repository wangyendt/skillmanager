const { getAppPaths } = require('../lib/paths');
const { ensureDir } = require('../lib/fs');
const { loadSourcesManifest } = require('../lib/manifest');
const { ensureRepo } = require('../lib/git');
const { scanSkillsInRepo } = require('../lib/scan');
const { loadProfile, saveProfile } = require('../lib/profiles');
const { syncAgents, runOpenSkills } = require('../lib/openskills');
const { installFromLocalSkillDir } = require('../lib/local-install');
const { mapWithConcurrency } = require('../lib/concurrency');
const { getEffectiveDefaultProfile } = require('../lib/config');
const { warnPrereqs } = require('../lib/prereqs');
const { promptSkillSelection } = require('../lib/cli-select');
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

async function runFallbackOpenSkillsUpdate(opts) {
  // eslint-disable-next-line no-console
  console.log('正在执行 openskills update（更新所有已记录来源）…');
  await runOpenSkills(['update']);
  if (opts?.sync) {
    await syncAgents({ output: opts?.output, cwd: process.cwd() });
  }
  // eslint-disable-next-line no-console
  console.log('\n完成。');
}

async function update(opts) {
  await warnPrereqs({ needGit: true, needOpenSkills: true });
  const scope = getScopeFromOpts(opts);

  if (opts?.openskills) {
    await runFallbackOpenSkillsUpdate(opts);
    return;
  }

  const paths = getAppPaths();
  await ensureDir(paths.profilesDir);
  const profileName = opts?.profile || (await getEffectiveDefaultProfile());
  const existing = await loadProfile({ profilesDir: paths.profilesDir, profileName });
  const hasSelection = Array.isArray(existing?.selectedSkillIds);

  await ensureDir(paths.reposDir);
  const { sources } = await loadSourcesManifest();
  const enabledSources = sources.filter((s) => s && s.enabled !== false);
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
  for (const { skills } of perSource) for (const sk of skills) skillsById.set(sk.id, sk);

  let selectedIds = hasSelection ? uniq(existing.selectedSkillIds).filter((id) => skillsById.has(id)) : Array.from(skillsById.keys());
  if (!hasSelection) {
    // eslint-disable-next-line no-console
    console.warn(`未找到可用 profile 选择集：${profileName}，本次将更新全部可见 skills。`);
  }
  if (!selectedIds.length) {
    // eslint-disable-next-line no-console
    console.warn(`profile=${profileName} 当前选择在来源中无可更新项，跳过。`);
    return;
  }

  const { agents } = await loadAgentsManifest();
  if (!agents.length) throw new Error('agents 映射为空，请检查 manifests/agents.json');
  let selectedAgentIds = normalizeSelectedAgentIds(existing?.selectedAgentIdsByScope?.[scope], agents);
  if (!selectedAgentIds.length) {
    const chosenAgentIds = await promptSkillSelection({
      title: `skillmanager update · agents · ${scope}`,
      skills: buildAgentSelectionItems(agents),
      initialSelectedIds: defaultAgentIds(agents)
    });
    if (chosenAgentIds == null) {
      // eslint-disable-next-line no-console
      console.log('已取消（未执行更新）。');
      return;
    }
    selectedAgentIds = normalizeSelectedAgentIds(chosenAgentIds, agents);
  }
  if (!selectedAgentIds.length) {
    // eslint-disable-next-line no-console
    console.log('未选择任何 agent，已取消。');
    return;
  }
  const targets = resolveAgentTargets({ selectedAgentIds, agents, scope, cwd: process.cwd() });
  if (!targets.length) throw new Error('未解析出任何目标目录，请检查 agents 路径映射。');

  // eslint-disable-next-line no-console
  console.log(`将按 profile=${profileName} 更新/重装 ${selectedIds.length} 个 skills（scope=${scope}，agents=${selectedAgentIds.length}）…`);
  for (const id of selectedIds) {
    const skill = skillsById.get(id);
    // eslint-disable-next-line no-console
    console.log(`\n==> Re-installing: ${skill.name}  (${skill.sourceId})`);
    for (const target of targets) {
      const { targetPath } = await installFromLocalSkillDir({ skillDir: skill.skillDir, targetDir: target.targetDir });
      // eslint-disable-next-line no-console
      console.log(`✅ Re-installed: ${targetPath}  [${target.agentIds.join(', ')}]`);
    }
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

  if (opts?.sync) {
    await syncAgents({ output: opts?.output, cwd: process.cwd() });
  }

  // eslint-disable-next-line no-console
  console.log('\n完成。');
}

module.exports = { update };
