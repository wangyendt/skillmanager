const path = require('path');
const { readJson, fileExists, writeJson } = require('./fs');
const { getAppPaths } = require('./paths');

function getBuiltinManifestPath() {
  // src/lib -> src -> project root
  return path.resolve(__dirname, '../../manifests/sources.json');
}

function getUserManifestPath() {
  const appPaths = getAppPaths();
  return path.join(appPaths.configDir, 'sources.json');
}

function normalizeRemovedSourceIds(manifest) {
  const value = manifest?.removedSourceIds;
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('sources.json 格式异常：removedSourceIds 必须是非空字符串数组。');
  }
  return Array.from(new Set(value.map((id) => id.trim())));
}

function getRemovedSourceIds(manifest) {
  return new Set(normalizeRemovedSourceIds(manifest));
}

async function loadSourcesManifest() {
  const builtinPath = getBuiltinManifestPath();
  const userPath = getUserManifestPath();

  const builtin = await readJson(builtinPath);

  // Ensure user manifest exists (copy builtin on first run)
  if (!(await fileExists(userPath))) {
    await writeJson(userPath, builtin);
  }

  let manifestPath = userPath;
  let manifest;
  try {
    manifest = await readJson(manifestPath);
  } catch {
    // fallback to builtin if user file is corrupted
    manifestPath = builtinPath;
    manifest = await readJson(manifestPath);
  }

  // Merge-in new builtin sources by id (non-destructive):
  // - keep user's existing entries as-is (including enabled flags)
  // - remove entries explicitly tombstoned by the user
  // - add any builtin sources missing from user
  // - bump version to max(builtin, user)
  if (manifestPath === userPath) {
    const userSources = Array.isArray(manifest?.sources) ? manifest.sources : [];
    const normalizedRemovedSourceIds = normalizeRemovedSourceIds(manifest);
    const removedSourceIds = new Set(normalizedRemovedSourceIds);
    const retainedUserSources = userSources.filter((s) => !s?.id || !removedSourceIds.has(s.id));
    const userIds = new Set(retainedUserSources.map((s) => s && s.id).filter(Boolean));
    const builtinSources = Array.isArray(builtin?.sources) ? builtin.sources : [];

    const mergedSources = [...retainedUserSources];
    for (const s of builtinSources) {
      if (!s?.id) continue;
      if (!userIds.has(s.id) && !removedSourceIds.has(s.id)) mergedSources.push(s);
    }

    const mergedVersion = Math.max(Number(manifest?.version || 1), Number(builtin?.version || 1));
    const removedSourceIdsChanged =
      Array.isArray(manifest?.removedSourceIds) &&
      JSON.stringify(normalizedRemovedSourceIds) !== JSON.stringify(manifest.removedSourceIds);
    const sourcesChanged = JSON.stringify(mergedSources) !== JSON.stringify(userSources);
    const changed =
      mergedVersion !== Number(manifest?.version || 1) || sourcesChanged || removedSourceIdsChanged;

    if (changed) {
      manifest = {
        ...(manifest || {}),
        version: mergedVersion,
        sources: mergedSources,
        ...(manifest?.removedSourceIds != null ? { removedSourceIds: normalizedRemovedSourceIds } : {})
      };
      await writeJson(userPath, manifest);
    }
  }

  const sources = Array.isArray(manifest?.sources) ? manifest.sources : [];
  return { version: manifest?.version ?? 1, sources, manifestPath };
}

async function readBuiltinSourcesManifest() {
  const builtin = await readJson(getBuiltinManifestPath());
  const sources = Array.isArray(builtin?.sources) ? builtin.sources : [];
  return { manifest: builtin, sources };
}

async function readUserSourcesManifest() {
  const builtinPath = getBuiltinManifestPath();
  const userPath = getUserManifestPath();

  if (!(await fileExists(userPath))) {
    const builtin = await readJson(builtinPath);
    await writeJson(userPath, builtin);
  }
  const manifest = await readJson(userPath);
  const sources = Array.isArray(manifest?.sources) ? manifest.sources : [];
  return { manifest, sources, userPath };
}

async function writeUserSourcesManifest(manifest) {
  const userPath = getUserManifestPath();
  await writeJson(userPath, manifest);
  return userPath;
}

module.exports = {
  loadSourcesManifest,
  getUserManifestPath,
  getRemovedSourceIds,
  normalizeRemovedSourceIds,
  readBuiltinSourcesManifest,
  readUserSourcesManifest,
  writeUserSourcesManifest
};
