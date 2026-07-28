const path = require('path');
const fsp = require('fs/promises');
const { randomUUID } = require('crypto');

const { getAppPaths } = require('./paths');
const { getRemovedSourceIds } = require('./manifest');
const builtinSourcesManifest = require('../../manifests/sources.json');
const packageJson = require('../../package.json');

const SELF_SOURCE_ID = 'skillmanager';
const SELF_SKILL_RELATIVE_DIR = 'skills/skillmanager';
const SELF_SKILL_ID = `${SELF_SOURCE_ID}:${SELF_SKILL_RELATIVE_DIR}`;
const MIGRATION_KEY = 'skillmanagerSelfRegistration';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getBuiltinSelfSource() {
  const sources = Array.isArray(builtinSourcesManifest?.sources) ? builtinSourcesManifest.sources : [];
  const source = sources.find((item) => item?.id === SELF_SOURCE_ID);
  if (!source) throw new Error(`内置 sources.json 缺少来源：${SELF_SOURCE_ID}`);
  return source;
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return fallback;
    throw new Error(`无法安全读取 JSON，已保留原文件：${filePath}\n${err?.message || String(err)}`);
  }
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT') return false;
    throw err;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let mode = 0o666;
  try {
    mode = (await fsp.stat(filePath)).mode & 0o777;
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }

  try {
    await fsp.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode });
    await fsp.rename(tempPath, filePath);
  } catch (err) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    throw err;
  }
}

function prepareSourcesManifest(manifest) {
  if (!isObject(manifest) || !Array.isArray(manifest.sources)) {
    throw new Error('sources.json 格式异常：需要包含 sources 数组；为避免覆盖已有配置，迁移已停止。');
  }

  const selfSource = getBuiltinSelfSource();
  const removedSourceIds = getRemovedSourceIds(manifest);
  if (removedSourceIds.has(SELF_SOURCE_ID)) {
    return {
      ...manifest,
      version: Math.max(Number(manifest.version || 1), Number(builtinSourcesManifest.version || 1)),
      sources: manifest.sources.filter((source) => !isObject(source) || source.id !== SELF_SOURCE_ID)
    };
  }

  let found = false;
  const sources = manifest.sources.map((source) => {
    if (!isObject(source) || source.id !== SELF_SOURCE_ID) return source;
    found = true;
    return { ...source, ...selfSource, enabled: true };
  });
  if (!found) sources.push({ ...selfSource, enabled: true });

  return {
    ...manifest,
    version: Math.max(Number(manifest.version || 1), Number(builtinSourcesManifest.version || 1)),
    sources
  };
}

async function readProfiles(profilesDir) {
  let entries;
  try {
    entries = await fsp.readdir(profilesDir, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }

  const profiles = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(profilesDir, entry.name);
    const profile = await readJsonFile(filePath, null);
    if (!isObject(profile)) {
      throw new Error(`profile 格式异常，已保留原文件：${filePath}`);
    }
    if (profile.selectedSkillIds != null && !Array.isArray(profile.selectedSkillIds)) {
      throw new Error(`profile.selectedSkillIds 不是数组，已保留原文件：${filePath}`);
    }
    profiles.push({ filePath, profile });
  }
  return profiles;
}

function prepareProfile(profile, options = {}) {
  if (options.registerSelf === false) return profile;
  const selectedSkillIds = Array.isArray(profile.selectedSkillIds) ? profile.selectedSkillIds : [];
  if (selectedSkillIds.includes(SELF_SKILL_ID)) return profile;
  return { ...profile, selectedSkillIds: [...selectedSkillIds, SELF_SKILL_ID] };
}

function prepareConfig(config, packageVersion) {
  if (!isObject(config)) {
    throw new Error('config.json 格式异常；为避免覆盖已有配置，迁移已停止。');
  }
  if (config.migrations != null && !isObject(config.migrations)) {
    throw new Error('config.json 的 migrations 字段格式异常；为避免覆盖已有配置，迁移已停止。');
  }
  return {
    ...config,
    version: Number(config.version || 1),
    migrations: {
      ...(config.migrations || {}),
      [MIGRATION_KEY]: packageVersion
    }
  };
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function ensureSelfRegistration(options = {}) {
  const configDir = options.configDir || getAppPaths().configDir;
  const packageVersion = String(options.packageVersion || packageJson.version);
  const force = options.force === true;
  const sourcesPath = path.join(configDir, 'sources.json');
  const configPath = path.join(configDir, 'config.json');
  const profilesDir = path.join(configDir, 'profiles');

  const initialConfig = { version: 1, defaultProfile: 'default', remoteProfileUrl: null };
  const config = await readJsonFile(configPath, initialConfig);
  if (!isObject(config)) {
    throw new Error(`config.json 格式异常，已保留原文件：${configPath}`);
  }
  const appliedVersion = isObject(config.migrations) ? config.migrations[MIGRATION_KEY] : null;
  if (!force && appliedVersion === packageVersion) {
    return { changed: false, skipped: true, sourcesPath, configPath, profilesChanged: 0 };
  }

  // Read and validate every existing file before writing any of them. This prevents
  // a malformed profile from causing a partial migration that hides other skills.
  const sourcesExists = await fileExists(sourcesPath);
  const sourcesManifest = await readJsonFile(sourcesPath, builtinSourcesManifest);
  const profiles = await readProfiles(profilesDir);
  const nextSourcesManifest = prepareSourcesManifest(sourcesManifest);
  const registerSelf = !getRemovedSourceIds(nextSourcesManifest).has(SELF_SOURCE_ID);
  const nextProfiles = profiles.map(({ filePath, profile }) => ({
    filePath,
    profile,
    next: prepareProfile(profile, { registerSelf })
  }));
  const nextConfig = prepareConfig(config, packageVersion);

  const sourcesChanged = !sourcesExists || !sameJson(sourcesManifest, nextSourcesManifest);
  const changedProfiles = nextProfiles.filter(({ profile, next }) => !sameJson(profile, next));
  const configChanged = !sameJson(config, nextConfig);

  if (sourcesChanged) await writeJsonAtomic(sourcesPath, nextSourcesManifest);
  for (const { filePath, next } of changedProfiles) await writeJsonAtomic(filePath, next);
  // Write the marker last. If an earlier write fails, the next CLI run retries safely.
  if (configChanged) await writeJsonAtomic(configPath, nextConfig);

  return {
    changed: sourcesChanged || changedProfiles.length > 0 || configChanged,
    skipped: false,
    sourcesChanged,
    profilesChanged: changedProfiles.length,
    selfSourceRemoved: !registerSelf,
    sourcesPath,
    configPath
  };
}

function isGlobalNpmInstall(env = process.env) {
  return /^(?:1|true)$/i.test(String(env.npm_config_global || '')) || env.npm_config_location === 'global';
}

module.exports = {
  SELF_SOURCE_ID,
  SELF_SKILL_ID,
  ensureSelfRegistration,
  isGlobalNpmInstall
};
