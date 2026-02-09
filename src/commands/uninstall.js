const fsp = require('fs/promises');

const { getAppPaths } = require('../lib/paths');
const { ensureDir } = require('../lib/fs');
const { getEffectiveDefaultProfile } = require('../lib/config');
const { loadProfile, saveProfile } = require('../lib/profiles');
const { listInstalledSkillsAcrossTargets } = require('../lib/installed');
const { syncAgents } = require('../lib/openskills');
const { promptSkillSelection } = require('../lib/cli-select');
const {
  loadAgentsManifest,
  getScopeFromOpts,
  defaultAgentIds,
  normalizeSelectedAgentIds,
  resolveAgentTargets,
  buildAgentSelectionItems
} = require('../lib/agents');

async function uninstall(opts, skillNames) {
  const scope = getScopeFromOpts(opts);
  const appPaths = getAppPaths();
  await ensureDir(appPaths.profilesDir);
  const profileName = opts?.profile || (await getEffectiveDefaultProfile());
  const existing = await loadProfile({ profilesDir: appPaths.profilesDir, profileName });

  const { agents } = await loadAgentsManifest();
  if (!agents.length) throw new Error('agents 映射为空，请检查 manifests/agents.json');

  let initialAgentIds = normalizeSelectedAgentIds(existing?.selectedAgentIdsByScope?.[scope], agents);
  if (!initialAgentIds.length) initialAgentIds = defaultAgentIds(agents);
  const chosenAgentIds = await promptSkillSelection({
    title: `skillmanager uninstall · agents · ${scope}`,
    skills: buildAgentSelectionItems(agents),
    initialSelectedIds: initialAgentIds
  });
  if (chosenAgentIds == null) {
    // eslint-disable-next-line no-console
    console.log('已取消（未执行卸载）。');
    return;
  }

  const selectedAgentIds = normalizeSelectedAgentIds(chosenAgentIds, agents);
  if (!selectedAgentIds.length) {
    // eslint-disable-next-line no-console
    console.log('未选择任何 agent，已取消。');
    return;
  }

  const targets = resolveAgentTargets({ selectedAgentIds, agents, scope, cwd: process.cwd() });
  if (!targets.length) throw new Error('未解析出任何目标目录，请检查 agents 路径映射。');

  const installedGroups = await listInstalledSkillsAcrossTargets(targets);
  const installedByName = new Map(installedGroups.map((s) => [s.name, s]));
  if (installedGroups.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`未检测到可卸载的 skill。scope=${scope}`);
    // eslint-disable-next-line no-console
    console.log(`目录：\n${targets.map((t) => `- ${t.targetDir}`).join('\n')}`);
    return;
  }

  let toRemove = [];
  if (opts?.all) {
    toRemove = installedGroups.map((s) => s.name);
  } else {
    const initialSelected = Array.isArray(skillNames) ? skillNames.filter(Boolean) : [];
    const chosen = await promptSkillSelection({
      title: `skillmanager uninstall · skills · ${scope}`,
      skills: installedGroups.map((s) => ({
        id: s.name,
        sourceId: 'installed',
        sourceName: Array.from(new Set(s.entries.flatMap((e) => e.agentIds))).join(', ') || 'installed',
        name: s.name,
        description: s.description || ''
      })),
      initialSelectedIds: initialSelected
    });
    if (chosen == null) {
      // eslint-disable-next-line no-console
      console.log('已取消（未执行卸载）。');
      return;
    }
    toRemove = chosen;
  }

  toRemove = Array.from(new Set(toRemove)).filter((n) => installedByName.has(n));
  if (toRemove.length === 0) {
    // eslint-disable-next-line no-console
    console.log('未选择任何可卸载的 skill。');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`将卸载 ${toRemove.length} 个 skills（scope=${scope}，agents=${selectedAgentIds.length}）…`);
  for (const name of toRemove) {
    const group = installedByName.get(name);
    if (!group) continue;
    for (const entry of group.entries) {
      // eslint-disable-next-line no-console
      console.log(`- remove ${name}  @ ${entry.targetDir}`);
      await fsp.rm(entry.skillDir, { recursive: true, force: true });
    }
  }

  const nextSelectedAgentIdsByScope = {
    project: Array.isArray(existing?.selectedAgentIdsByScope?.project) ? existing.selectedAgentIdsByScope.project : [],
    global: Array.isArray(existing?.selectedAgentIdsByScope?.global) ? existing.selectedAgentIdsByScope.global : [],
    [scope]: selectedAgentIds
  };
  await saveProfile({
    profilesDir: appPaths.profilesDir,
    profileName,
    selectedSkillIds: Array.isArray(existing?.selectedSkillIds) ? existing.selectedSkillIds : [],
    selectedAgentIdsByScope: nextSelectedAgentIdsByScope
  });

  if (opts?.sync) {
    await syncAgents({ output: opts?.output, cwd: process.cwd() });
  }

  // eslint-disable-next-line no-console
  console.log('完成。');
}

module.exports = { uninstall };
