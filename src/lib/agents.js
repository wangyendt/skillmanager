const path = require('path');
const os = require('os');
const { readJson } = require('./fs');

function getAgentsManifestPath() {
  // src/lib -> src -> project root
  return path.resolve(__dirname, '../../manifests/agents.json');
}

async function loadAgentsManifest() {
  const manifestPath = getAgentsManifestPath();
  const manifest = await readJson(manifestPath);
  const agents = Array.isArray(manifest?.agents) ? manifest.agents : [];
  return { manifestPath, manifest, agents };
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function getScopeFromOpts(opts) {
  const isProject = !!opts?.project;
  const isGlobal = !!opts?.global;
  if (isProject && isGlobal) {
    throw new Error('`--project` 与 `--global` 不能同时使用。');
  }
  return isGlobal ? 'global' : 'project';
}

function defaultAgentIds(agents) {
  const ids = agents.map((a) => a?.id).filter(Boolean);
  if (ids.includes('claude-code')) return ['claude-code'];
  return ids.length ? [ids[0]] : [];
}

function normalizeSelectedAgentIds(ids, agents) {
  const valid = new Set(agents.map((a) => a.id));
  return unique((Array.isArray(ids) ? ids : []).filter((id) => valid.has(id)));
}

function toAbsoluteTargetDir(raw, scope, cwd) {
  const v = String(raw || '').trim();
  if (!v) return null;

  if (scope === 'global') {
    if (v === '~') return os.homedir();
    if (v.startsWith('~/') || v.startsWith('~\\')) return path.join(os.homedir(), v.slice(2));
    return path.resolve(v);
  }

  if (v.startsWith('./') || v.startsWith('.\\')) return path.resolve(cwd, v.slice(2));
  return path.resolve(cwd, v);
}

function resolveAgentTargets({ selectedAgentIds, agents, scope, cwd }) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const targetsByDir = new Map();

  for (const id of selectedAgentIds) {
    const agent = byId.get(id);
    if (!agent) continue;
    const rawPath = scope === 'global' ? agent.globalPath : agent.projectPath;
    const targetDir = toAbsoluteTargetDir(rawPath, scope, cwd);
    if (!targetDir) continue;

    if (!targetsByDir.has(targetDir)) {
      targetsByDir.set(targetDir, {
        targetDir,
        scope,
        agentIds: [agent.id],
        agentNames: [agent.name]
      });
      continue;
    }
    const t = targetsByDir.get(targetDir);
    t.agentIds.push(agent.id);
    t.agentNames.push(agent.name);
  }

  return Array.from(targetsByDir.values());
}

function buildAgentSelectionItems(agents) {
  return agents.map((a) => ({
    id: a.id,
    sourceId: 'supported-agents',
    sourceName: 'Supported Agents',
    name: a.name,
    description: `project: ${a.projectPath || 'N/A'} | global: ${a.globalPath || 'N/A'}`
  }));
}

module.exports = {
  loadAgentsManifest,
  getScopeFromOpts,
  defaultAgentIds,
  normalizeSelectedAgentIds,
  resolveAgentTargets,
  buildAgentSelectionItems
};
