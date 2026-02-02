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
  // - add any builtin sources missing from user
  // - bump version to max(builtin, user)
  if (manifestPath === userPath) {
    const userSources = Array.isArray(manifest?.sources) ? manifest.sources : [];
    const userIds = new Set(userSources.map((s) => s && s.id).filter(Boolean));
    const builtinSources = Array.isArray(builtin?.sources) ? builtin.sources : [];

    const mergedSources = [...userSources];
    for (const s of builtinSources) {
      if (!s?.id) continue;
      if (!userIds.has(s.id)) mergedSources.push(s);
    }

    const mergedVersion = Math.max(Number(manifest?.version || 1), Number(builtin?.version || 1));
    const changed = mergedVersion !== Number(manifest?.version || 1) || mergedSources.length !== userSources.length;

    if (changed) {
      manifest = { ...(manifest || {}), version: mergedVersion, sources: mergedSources };
      await writeJson(userPath, manifest);
    }
  }

  const sources = Array.isArray(manifest?.sources) ? manifest.sources : [];
  return { version: manifest?.version ?? 1, sources, manifestPath };
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

module.exports = { loadSourcesManifest, getUserManifestPath, readUserSourcesManifest, writeUserSourcesManifest };

