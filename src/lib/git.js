const path = require('path');
const simpleGit = require('simple-git');
const { ensureDir, fileExists, rmDir } = require('./fs');

function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTruthy(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function shouldAutoRefreshCache() {
  // 默认开启自动刷新（发现远端更新时自动重新拉取）
  // 如需关闭：SKILLMANAGER_AUTO_REFRESH=0
  if (process.env.SKILLMANAGER_AUTO_REFRESH != null) {
    return isTruthy(process.env.SKILLMANAGER_AUTO_REFRESH);
  }
  return true;
}

async function getLocalHead(repoGit) {
  try {
    const out = await repoGit.revparse(['HEAD']);
    return String(out || '').trim() || null;
  } catch {
    return null;
  }
}

async function getRemoteHead(repoGit) {
  try {
    const out = await repoGit.raw(['ls-remote', 'origin', 'HEAD']);
    const first = String(out || '').trim().split(/\s+/)[0];
    return first || null;
  } catch {
    return null;
  }
}

async function isRepoStale(repoGit) {
  const [localHead, remoteHead] = await Promise.all([getLocalHead(repoGit), getRemoteHead(repoGit)]);
  if (!localHead || !remoteHead) return false;
  return localHead !== remoteHead;
}

async function cloneRepo({ git, repoUrl, repoDir, cloneArgs }) {
  await rmDir(repoDir);
  await ensureDir(repoDir);
  await git.clone(repoUrl, repoDir, cloneArgs);
  return repoDir;
}

async function ensureRepo({ reposDir, source, forceRefresh = false }) {
  if (!source?.repo) {
    throw new Error(`Invalid source repo for ${source?.id || '<unknown>'}`);
  }

  const repoDir = path.join(reposDir, sanitizeId(source.id));
  await ensureDir(reposDir);

  const gitDir = path.join(repoDir, '.git');
  const git = simpleGit();
  const cloneArgs = ['--depth', '1', '--single-branch', '--filter=blob:none'];

  if (!(await fileExists(gitDir))) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await cloneRepo({ git, repoUrl: source.repo, repoDir, cloneArgs });
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

  // 如果缓存仓库落后于远端，自动重新拉取（可用 env 关闭）
  try {
    const stale = await isRepoStale(repoGit);
    if (stale) {
      const shouldRefresh = forceRefresh || shouldAutoRefreshCache();
      if (shouldRefresh) {
        // eslint-disable-next-line no-console
        console.warn(`检测到缓存仓库落后于远端：${source.id}，正在重新拉取最新版本…`);
        return await cloneRepo({ git, repoUrl: source.repo, repoDir, cloneArgs });
      }
      // eslint-disable-next-line no-console
      console.warn(`检测到缓存仓库落后于远端：${source.id}。可使用 --force-refresh 或设置 SKILLMANAGER_AUTO_REFRESH=1。`);
    }
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      `提示：无法检查远端版本（可能网络/权限问题），缓存可能过期。可使用 --force-refresh 强制刷新，或删除 ${repoDir} 后重试。`
    );
  }
  return repoDir;
}

module.exports = { ensureRepo };

