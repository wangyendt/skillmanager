const fsp = require('fs/promises');

const { getAppPaths } = require('../lib/paths');
const { ensureDir } = require('../lib/fs');
const { loadSourcesManifest } = require('../lib/manifest');
const { loadSkillsFromSource } = require('../lib/source-load');
const { loadProfile, saveProfile } = require('../lib/profiles');
const { getEffectiveDefaultProfile } = require('../lib/config');
const { mapWithConcurrency } = require('../lib/concurrency');
const { installFromLocalSkillDir } = require('../lib/local-install');
const { listInstalledSkillsAcrossTargets } = require('../lib/installed');
const { syncAgents } = require('../lib/openskills');
const { launchSelectionUi } = require('../ui/server');
const { warnPrereqs } = require('../lib/prereqs');
const {
  loadAgentsManifest,
  getScopeFromOpts,
  defaultAgentIds,
  normalizeSelectedAgentIds,
  resolveAgentTargets
} = require('../lib/agents');

function uniq(arr) {
  return Array.from(new Set(arr));
}

async function webui(opts) {
  await warnPrereqs({ needGit: true, needOpenSkills: true });
  const modeRaw = String(opts?.mode || 'install').toLowerCase();
  const mode = modeRaw === 'uninstall' ? 'uninstall' : 'install';
  const scope = getScopeFromOpts(opts);

  const paths = getAppPaths();
  await ensureDir(paths.profilesDir);
  const profileName = opts?.profile || (await getEffectiveDefaultProfile());
  const existing = await loadProfile({ profilesDir: paths.profilesDir, profileName });

  const { agents } = await loadAgentsManifest();
  if (!agents.length) throw new Error('agents 映射为空，请检查 manifests/agents.json');
  const initialAgentIdsRaw = existing?.selectedAgentIdsByScope?.[scope];
  let initialSelectedAgentIds = normalizeSelectedAgentIds(initialAgentIdsRaw, agents);
  if (!initialSelectedAgentIds.length) initialSelectedAgentIds = defaultAgentIds(agents);

  if (mode === 'uninstall') {
    const allTargets = resolveAgentTargets({
      selectedAgentIds: agents.map((a) => a.id),
      agents,
      scope,
      cwd: process.cwd()
    });
    const installedGroups = await listInstalledSkillsAcrossTargets(allTargets);
    if (!installedGroups.length) {
      // eslint-disable-next-line no-console
      console.log(`未检测到可卸载的 skill。scope=${scope}`);
      return;
    }
    const installedByName = new Map(installedGroups.map((g) => [g.name, g]));

    const chosen = await launchSelectionUi({
      title: `skillmanager webui · uninstall · ${scope}`,
      skills: installedGroups.map((s) => ({
        id: s.name,
        sourceId: 'installed',
        sourceName: Array.from(new Set(s.entries.flatMap((e) => e.agentIds))).join(', ') || 'installed',
        name: s.name,
        description: s.description
      })),
      selectedSkillIds: installedGroups.map((s) => s.name),
      agents: agents.map((a) => ({ id: a.id, name: a.name, projectPath: a.projectPath, globalPath: a.globalPath })),
      selectedAgentIds: initialSelectedAgentIds
    });

    const selectedAgentIds = normalizeSelectedAgentIds(chosen?.selectedAgentIds, agents);
    const selectedSkillIds = uniq(Array.isArray(chosen?.selectedSkillIds) ? chosen.selectedSkillIds : []).filter((n) =>
      installedByName.has(n)
    );
    if (!selectedAgentIds.length || !selectedSkillIds.length) {
      // eslint-disable-next-line no-console
      console.log('未选择可卸载项，已取消。');
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
      selectedSkillIds: Array.isArray(existing?.selectedSkillIds) ? existing.selectedSkillIds : [],
      selectedAgentIdsByScope: nextSelectedAgentIdsByScope
    });

    // eslint-disable-next-line no-console
    console.log(`将卸载 ${selectedSkillIds.length} 个 skills（scope=${scope}，agents=${selectedAgentIds.length}）…`);
    for (const name of selectedSkillIds) {
      const group = installedByName.get(name);
      if (!group) continue;
      for (const entry of group.entries) {
        const belongs = entry.agentIds.some((id) => selectedAgentIds.includes(id));
        if (!belongs) continue;
        // eslint-disable-next-line no-console
        console.log(`- remove ${name}  @ ${entry.targetDir}`);
        await fsp.rm(entry.skillDir, { recursive: true, force: true });
      }
    }

    if (opts?.sync) {
      await syncAgents({ output: opts?.output, cwd: process.cwd() });
    }

    // eslint-disable-next-line no-console
    console.log('完成。');
    return;
  }

  // install mode
  await ensureDir(paths.reposDir);
  const { sources } = await loadSourcesManifest();
  const enabledSources = sources.filter((s) => s && s.enabled !== false);
  const concurrency = Number(opts?.concurrency || process.env.SKILLMANAGER_CONCURRENCY || 3);
  // eslint-disable-next-line no-console
  console.log(`并发扫描：${Math.max(1, concurrency)}（可用 --concurrency 或环境变量 SKILLMANAGER_CONCURRENCY 调整）`);

  const skillsById = new Map();
  const perSource = await mapWithConcurrency(enabledSources, concurrency, async (s) => {
    try {
      const { skills } = await loadSkillsFromSource({
        reposDir: paths.reposDir,
        source: s,
        forceRefresh: !!opts?.forceRefresh
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

  const allSkills = Array.from(skillsById.values());
  if (!allSkills.length) {
    // eslint-disable-next-line no-console
    console.log('未找到可安装的 skills。');
    return;
  }
  const initialSelectedSkillIds =
    existing?.selectedSkillIds && Array.isArray(existing.selectedSkillIds) ? existing.selectedSkillIds : allSkills.map((s) => s.id);
  const chosen = await launchSelectionUi({
    title: `skillmanager webui · install · profile=${profileName} · ${scope}`,
    skills: allSkills.map((s) => ({
      id: s.id,
      sourceId: s.sourceId,
      sourceName: s.sourceName,
      name: s.name,
      description: s.description
    })),
    selectedSkillIds: initialSelectedSkillIds,
    agents: agents.map((a) => ({ id: a.id, name: a.name, projectPath: a.projectPath, globalPath: a.globalPath })),
    selectedAgentIds: initialSelectedAgentIds
  });

  const selectedIds = uniq(Array.isArray(chosen?.selectedSkillIds) ? chosen.selectedSkillIds : []).filter((id) => skillsById.has(id));
  const selectedAgentIds = normalizeSelectedAgentIds(chosen?.selectedAgentIds, agents);
  if (!selectedIds.length || !selectedAgentIds.length) {
    // eslint-disable-next-line no-console
    console.log('未选择可安装项，已取消。');
    return;
  }

  const targets = resolveAgentTargets({ selectedAgentIds, agents, scope, cwd: process.cwd() });
  if (!targets.length) throw new Error('未解析出任何安装目录，请检查 agents 路径映射。');

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

  // eslint-disable-next-line no-console
  console.log(`将安装 ${selectedIds.length} 个 skills（scope=${scope}，agents=${selectedAgentIds.length}，dirs=${targets.length}）…`);
  for (const id of selectedIds) {
    const skill = skillsById.get(id);
    // eslint-disable-next-line no-console
    console.log(`- install ${skill.name}  (${skill.sourceId})`);
    for (const target of targets) {
      const { targetPath } = await installFromLocalSkillDir({ skillDir: skill.skillDir, targetDir: target.targetDir });
      // eslint-disable-next-line no-console
      console.log(`  ✅ ${targetPath}  [${target.agentIds.join(', ')}]`);
    }
  }

  if (opts?.sync) {
    await syncAgents({ output: opts?.output, cwd: process.cwd() });
  }

  // eslint-disable-next-line no-console
  console.log('完成。');
}

module.exports = { webui };
