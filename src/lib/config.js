const path = require('path');
const { fileExists, readJson, writeJson } = require('./fs');
const { getAppPaths } = require('./paths');

function getUserConfigPath() {
  const p = getAppPaths();
  return path.join(p.configDir, 'config.json');
}

async function loadConfig() {
  const configPath = getUserConfigPath();
  if (!(await fileExists(configPath))) {
    const initial = { version: 1, defaultProfile: 'default', remoteProfileUrl: null };
    await writeJson(configPath, initial);
    return { configPath, config: initial };
  }
  try {
    const config = await readJson(configPath);
    return { configPath, config: config || { version: 1, defaultProfile: 'default', remoteProfileUrl: null } };
  } catch {
    const fallback = { version: 1, defaultProfile: 'default', remoteProfileUrl: null };
    await writeJson(configPath, fallback);
    return { configPath, config: fallback };
  }
}

async function setDefaultProfile(name) {
  const { configPath, config } = await loadConfig();
  const next = { ...(config || {}), version: 1, defaultProfile: String(name || 'default') };
  await writeJson(configPath, next);
  return { configPath, config: next };
}

async function setRemoteProfileUrl(url) {
  const { configPath, config } = await loadConfig();
  const next = { ...(config || {}), version: 1, remoteProfileUrl: url ? String(url) : null };
  await writeJson(configPath, next);
  return { configPath, config: next };
}

function getDefaultProfileFromEnv() {
  const v = process.env.SKILLMANAGER_PROFILE;
  return v && String(v).trim() ? String(v).trim() : null;
}

function getRemoteProfileUrlFromEnv() {
  const v = process.env.SKILLMANAGER_PROFILE_URL;
  return v && String(v).trim() ? String(v).trim() : null;
}

async function getEffectiveDefaultProfile() {
  const env = getDefaultProfileFromEnv();
  if (env) return env;
  const { config } = await loadConfig();
  const v = config?.defaultProfile;
  return v && String(v).trim() ? String(v).trim() : 'default';
}

async function getEffectiveRemoteProfileUrl() {
  const env = getRemoteProfileUrlFromEnv();
  if (env) return env;
  const { config } = await loadConfig();
  const v = config?.remoteProfileUrl;
  return v && String(v).trim() ? String(v).trim() : null;
}

module.exports = {
  loadConfig,
  setDefaultProfile,
  setRemoteProfileUrl,
  getEffectiveDefaultProfile,
  getEffectiveRemoteProfileUrl,
  getUserConfigPath
};

