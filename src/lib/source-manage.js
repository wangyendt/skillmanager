const { readUserSourcesManifest, writeUserSourcesManifest } = require('./manifest');
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

async function upsertUserSourceFromInput(repoOrRef, opts = {}) {
  const { manifest, sources, userPath } = await readUserSourcesManifest();
  const gh = parseGitHubRef(repoOrRef);

  const existing = sources.find((s) => {
    if (!s) return false;
    if (opts?.id && s.id === String(opts.id)) return true;
    if (gh?.openskillsRef && normalizeRef(s.openskillsRef) === normalizeRef(gh.openskillsRef)) return true;
    if (gh?.httpsRepo && normalizeRepo(s.repo) === normalizeRepo(gh.httpsRepo)) return true;
    return normalizeRepo(s.repo) === normalizeRepo(repoOrRef);
  });

  if (existing) {
    if (opts?.enableIfExists && existing.enabled === false) {
      const nextSources = sources.map((s) => (s && s.id === existing.id ? { ...s, enabled: true } : s));
      const next = { ...(manifest || {}), version: Number(manifest?.version || 1), sources: nextSources };
      await writeUserSourcesManifest(next);
      return { added: false, source: { ...existing, enabled: true }, userPath };
    }
    return { added: false, source: existing, userPath };
  }

  const existingIds = new Set(sources.map((s) => s && s.id).filter(Boolean));
  const desiredId = opts?.id ? String(opts.id) : defaultSourceIdFromInput(repoOrRef);
  const id = uniqueId(desiredId, existingIds);

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
    sources: [...sources, newSource]
  };
  await writeUserSourcesManifest(next);
  return { added: true, source: newSource, userPath };
}

module.exports = { upsertUserSourceFromInput };
