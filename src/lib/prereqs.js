const { execFile } = require('child_process');
const fsp = require('fs/promises');

const MIN_GIT = { major: 2, minor: 34, patch: 0 };
const MIN_NODE_FOR_OPENSKILLS = { major: 20, minor: 6, patch: 0 };
const MIN_OPENSKILLS = { major: 1, minor: 5, patch: 0 };

let warnedOnce = false;

function parseSemverLike(input) {
  const s = String(input || '');
  const m = s.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function cmpVersion(a, b) {
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function fmt(v) {
  if (!v) return '(unknown)';
  return `${v.major}.${v.minor}.${v.patch}`;
}

async function execFileText(cmd, args) {
  return await new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(String(stdout || stderr || '').trim());
    });
  });
}

async function getGitVersion() {
  const out = await execFileText('git', ['--version']).catch(() => null);
  if (!out) return null;
  // e.g. "git version 2.25.1" / "git version 2.44.0.windows.1"
  return parseSemverLike(out);
}

async function getOpenSkillsVersion() {
  try {
    const pkgPath = require.resolve('openskills/package.json');
    const txt = await fsp.readFile(pkgPath, 'utf8');
    const json = JSON.parse(txt);
    return parseSemverLike(json?.version);
  } catch {
    return null;
  }
}

function getNodeVersion() {
  return parseSemverLike(process.versions.node);
}

async function warnPrereqs({ needGit = false, needOpenSkills = false } = {}) {
  // 只在实际运行（非 help）且需要相关能力时提示一次，避免刷屏
  if (warnedOnce) return;
  warnedOnce = true;

  const lines = [];

  if (needGit) {
    const gitV = await getGitVersion();
    if (!gitV) {
      lines.push('- git：未检测到 `git`（需要安装 git 才能拉取来源仓库）。');
    } else if (cmpVersion(gitV, MIN_GIT) < 0) {
      lines.push(
        `- git：检测到 ${fmt(gitV)}，建议至少 ${fmt(MIN_GIT)}。低版本在 GitHub HTTPS/partial clone 场景下可能出现 TLS/gnutls 握手中断（例如 gnutls_handshake）。`
      );
      lines.push('  - 建议：升级 git（或设置 `SKILLMANAGER_GIT_PROTOCOL=ssh` 使用 SSH 拉取；并避免开启 partial clone filter）。');
    }
  }

  if (needOpenSkills) {
    const nodeV = getNodeVersion();
    if (nodeV && cmpVersion(nodeV, MIN_NODE_FOR_OPENSKILLS) < 0) {
      lines.push(
        `- Node.js：检测到 ${fmt(nodeV)}，openskills 需要至少 ${fmt(MIN_NODE_FOR_OPENSKILLS)}（否则可能出现语法错误，例如 RegExp /v flag）。`
      );
    }

    const osV = await getOpenSkillsVersion();
    if (!osV) {
      lines.push('- openskills：未检测到依赖（或无法读取版本）。如需 sync/安装来源，请确保已安装 openskills。');
    } else if (cmpVersion(osV, MIN_OPENSKILLS) < 0) {
      lines.push(`- openskills：检测到 ${fmt(osV)}，建议至少 ${fmt(MIN_OPENSKILLS)}。`);
    }
  }

  if (lines.length) {
    // eslint-disable-next-line no-console
    console.warn(['\n⚠️ 环境兼容性提示（skillmanager）', ...lines, ''].join('\n'));
  }
}

module.exports = { warnPrereqs };

