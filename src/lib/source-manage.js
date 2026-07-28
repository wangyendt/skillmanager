const {
  getRemovedSourceIds,
  readBuiltinSourcesManifest,
  readUserSourcesManifest,
  writeUserSourcesManifest
} = require('./manifest');
const { defaultSourceIdFromInput, parseGitHubRef } = require('./source-utils');

function uniqueId(desired, existingIds) {
  if (!existingIds.has(desired)) return desired;
  for (let i = 2; i < 1000; i++) {
    const next = `${desired}-${i}`;
    if (!existingIds.has(next)) return next;
  }
  throw new Error(`无法生成唯一 id：${desired}`);
}

function normalizeRepo(repo) {
  return String(repo || '')
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function normalizeRef(ref) {
  return String(ref || '').trim().toLowerCase();
}

function sourceMatchesInput(source, repoOrRef, gh) {
  if (!source) return false;
  if (gh?.openskillsRef && normalizeRef(source.openskillsRef) === normalizeRef(gh.openskillsRef)) return true;
  if (gh?.httpsRepo && normalizeRepo(source.repo) === normalizeRepo(gh.httpsRepo)) return true;
  return normalizeRepo(source.repo) === normalizeRepo(repoOrRef);
}

async function upsertUserSourceFromInput(repoOrRef, opts = {}) {
  const { manifest, sources, userPath } = await readUserSourcesManifest();
  const gh = parseGitHubRef(repoOrRef);
  const removedSourceIds = getRemovedSourceIds(manifest);

  const existing = sources.find((s) => {
    if (!s) return false;
    if (opts?.id && s.id === String(opts.id)) return true;
    return sourceMatchesInput(s, repoOrRef, gh);
  });

  if (existing) {
    const shouldEnable = opts?.enableIfExists && existing.enabled === false;
    const clearedTombstone = removedSourceIds.delete(existing.id);
    if (shouldEnable || clearedTombstone) {
      const nextSource = shouldEnable ? { ...existing, enabled: true } : existing;
      const nextSources = sources.map((s) => (s && s.id === existing.id ? nextSource : s));
      const next = {
        ...(manifest || {}),
        version: Number(manifest?.version || 1),
        sources: nextSources,
        removedSourceIds: [...removedSourceIds]
      };
      await writeUserSourcesManifest(next);
      return { added: false, restored: clearedTombstone, source: nextSource, userPath };
    }
    return { added: false, restored: false, source: existing, userPath };
  }

  const { sources: builtinSources } = await readBuiltinSourcesManifest();
  const restorableBuiltin = builtinSources.find(
    (source) =>
      source?.id &&
      removedSourceIds.has(source.id) &&
      (!opts?.id || String(opts.id) === source.id) &&
      sourceMatchesInput(source, repoOrRef, gh)
  );
  if (restorableBuiltin) {
    const restoredSource = {
      ...restorableBuiltin,
      ...(opts?.name ? { name: String(opts.name) } : {}),
      ...(opts?.ref ? { openskillsRef: String(opts.ref) } : {}),
      enabled: opts?.enabled === false ? false : true
    };
    removedSourceIds.delete(restorableBuiltin.id);
    const next = {
      ...(manifest || {}),
      version: Number(manifest?.version || 1),
      sources: [...sources, restoredSource],
      removedSourceIds: [...removedSourceIds]
    };
    await writeUserSourcesManifest(next);
    return { added: true, restored: true, source: restoredSource, userPath };
  }

  const existingIds = new Set(sources.map((s) => s && s.id).filter(Boolean));
  const desiredId = opts?.id ? String(opts.id) : defaultSourceIdFromInput(repoOrRef);
  const id = uniqueId(desiredId, existingIds);
  const restored = removedSourceIds.delete(id);

  const newSource = {
    id,
    name: opts?.name ? String(opts.name) : gh ? `${gh.owner}/${gh.repo}` : String(repoOrRef),
    kind: 'git',
    enabled: opts?.enabled === false ? false : true,
    repo: gh?.httpsRepo || String(repoOrRef),
    openskillsRef: opts?.ref ? String(opts.ref) : gh?.openskillsRef || undefined
  };

  const next = {
    ...(manifest || {}),
    version: Number(manifest?.version || 1),
    sources: [...sources, newSource],
    removedSourceIds: [...removedSourceIds]
  };
  await writeUserSourcesManifest(next);
  return { added: true, restored, source: newSource, userPath };
}

module.exports = { upsertUserSourceFromInput };
