const path = require('path');
const { fileExists, readJson, writeJson, ensureDir } = require('./fs');

function profilePath({ profilesDir, profileName }) {
  const safe = String(profileName || 'default').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.join(profilesDir, `${safe}.json`);
}

async function loadProfile({ profilesDir, profileName }) {
  const p = profilePath({ profilesDir, profileName });
  if (!(await fileExists(p))) return null;
  try {
    const raw = await readJson(p);
    const selectedSkillIds = Array.isArray(raw?.selectedSkillIds) ? raw.selectedSkillIds : [];
    const selectedAgentIdsByScope = {
      project: Array.isArray(raw?.selectedAgentIdsByScope?.project) ? raw.selectedAgentIdsByScope.project : [],
      global: Array.isArray(raw?.selectedAgentIdsByScope?.global) ? raw.selectedAgentIdsByScope.global : []
    };
    return {
      ...(raw || {}),
      version: Number(raw?.version || 1) >= 2 ? Number(raw.version) : 2,
      selectedSkillIds,
      selectedAgentIdsByScope
    };
  } catch {
    return null;
  }
}

async function saveProfile({ profilesDir, profileName, selectedSkillIds, selectedAgentIdsByScope }) {
  await ensureDir(profilesDir);
  const p = profilePath({ profilesDir, profileName });
  let existing = null;
  if (await fileExists(p)) {
    try {
      existing = await readJson(p);
    } catch {
      existing = null;
    }
  }
  const existingSkillIds = Array.isArray(existing?.selectedSkillIds) ? existing.selectedSkillIds : [];
  const existingAgentIdsByScope = {
    project: Array.isArray(existing?.selectedAgentIdsByScope?.project) ? existing.selectedAgentIdsByScope.project : [],
    global: Array.isArray(existing?.selectedAgentIdsByScope?.global) ? existing.selectedAgentIdsByScope.global : []
  };

  const nextSkillIds = Array.isArray(selectedSkillIds) ? selectedSkillIds : existingSkillIds;
  const nextSelectedAgentIdsByScope =
    selectedAgentIdsByScope && typeof selectedAgentIdsByScope === 'object'
      ? {
          project: Array.isArray(selectedAgentIdsByScope.project) ? selectedAgentIdsByScope.project : [],
          global: Array.isArray(selectedAgentIdsByScope.global) ? selectedAgentIdsByScope.global : []
        }
      : existingAgentIdsByScope;

  await writeJson(p, {
    version: 2,
    updatedAt: new Date().toISOString(),
    selectedSkillIds: nextSkillIds,
    selectedAgentIdsByScope: nextSelectedAgentIdsByScope
  });
  return p;
}

module.exports = { loadProfile, saveProfile, profilePath };
