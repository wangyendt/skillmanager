const path = require('path');
const simpleGit = require('simple-git');
const { ensureDir, fileExists, rmDir } = require('./fs');

function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureRepo({ reposDir, source }) {
  if (!source?.repo) {
    throw new Error(`Invalid source repo for ${source?.id || '<unknown>'}`);
  }

  const repoDir = path.join(reposDir, sanitizeId(source.id));
  await ensureDir(reposDir);

  const gitDir = path.join(repoDir, '.git');
  const git = simpleGit();

  if (!(await fileExists(gitDir))) {
    const cloneArgs = ['--depth', '1', '--single-branch', '--filter=blob:none'];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await rmDir(repoDir);
        await ensureDir(repoDir);
        await git.clone(source.repo, repoDir, cloneArgs);
        return repoDir;
      } catch (err) {
        await rmDir(repoDir);
        if (attempt === 3) throw err;
        await sleep(1000 * attempt);
      }
    }
    return repoDir;
  }

  const repoGit = simpleGit(repoDir);
  try {
    await repoGit.fetch(['--depth', '1', '--filter=blob:none']);
  } catch {
    // ignore fetch errors; pull may still work
  }
  // Best-effort: try to fast-forward current branch
  try {
    await repoGit.pull(['--ff-only']);
  } catch {
    // ignore ff-only failures (e.g. detached HEAD) — user can clean manually
  }
  return repoDir;
}

module.exports = { ensureRepo };

