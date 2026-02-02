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
    return await readJson(p);
  } catch {
    return null;
  }
}

async function saveProfile({ profilesDir, profileName, selectedSkillIds }) {
  await ensureDir(profilesDir);
  const p = profilePath({ profilesDir, profileName });
  await writeJson(p, {
    version: 1,
    updatedAt: new Date().toISOString(),
    selectedSkillIds: Array.isArray(selectedSkillIds) ? selectedSkillIds : []
  });
  return p;
}

module.exports = { loadProfile, saveProfile, profilePath };

