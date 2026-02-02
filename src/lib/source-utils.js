function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function parseGitHubRef(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  // owner/repo
  const mRef = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (mRef) {
    const owner = mRef[1];
    const repo = mRef[2];
    return {
      kind: 'github',
      owner,
      repo,
      openskillsRef: `${owner}/${repo}`,
      httpsRepo: `https://github.com/${owner}/${repo}.git`
    };
  }

  // https://github.com/owner/repo(.git)?
  const mHttps = raw.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i);
  if (mHttps) {
    const owner = mHttps[1];
    const repo = mHttps[2];
    return {
      kind: 'github',
      owner,
      repo,
      openskillsRef: `${owner}/${repo}`,
      httpsRepo: `https://github.com/${owner}/${repo}.git`
    };
  }

  // git@github.com:owner/repo(.git)
  const mSsh = raw.match(/^git@github\.com:([^/]+)\/([^/#?]+?)(?:\.git)?$/i);
  if (mSsh) {
    const owner = mSsh[1];
    const repo = mSsh[2];
    return {
      kind: 'github',
      owner,
      repo,
      openskillsRef: `${owner}/${repo}`,
      httpsRepo: `https://github.com/${owner}/${repo}.git`,
      sshRepo: `git@github.com:${owner}/${repo}.git`
    };
  }

  return null;
}

function defaultSourceIdFromInput(input) {
  const gh = parseGitHubRef(input);
  if (gh) return sanitizeId(`${gh.owner}-${gh.repo}`);
  return sanitizeId(input);
}

module.exports = { sanitizeId, parseGitHubRef, defaultSourceIdFromInput };

