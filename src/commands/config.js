const { loadConfig, setDefaultProfile, setRemoteProfileUrl, getEffectiveRemoteProfileUrl } = require('../lib/config');
const { getAppPaths } = require('../lib/paths');
const { loadProfile, saveProfile } = require('../lib/profiles');
const { httpFetch } = require('../lib/http');

async function showConfig() {
  const { configPath, config } = await loadConfig();
  // eslint-disable-next-line no-console
  console.log(`config: ${configPath}`);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(config, null, 2));
}

async function setDefaultProfileCmd(name) {
  const { configPath, config } = await setDefaultProfile(name);
  // eslint-disable-next-line no-console
  console.log(`已设置 defaultProfile=${config.defaultProfile}`);
  // eslint-disable-next-line no-console
  console.log(`写入：${configPath}`);
  // eslint-disable-next-line no-console
  console.log(`你也可以用环境变量临时覆盖：SKILLMANAGER_PROFILE=${config.defaultProfile}`);
}

async function setRemoteProfileUrlCmd(url) {
  const { configPath, config } = await setRemoteProfileUrl(url);
  // eslint-disable-next-line no-console
  console.log(`已设置 remoteProfileUrl=${config.remoteProfileUrl}`);
  // eslint-disable-next-line no-console
  console.log(`写入：${configPath}`);
  // eslint-disable-next-line no-console
  console.log('提示：把远端设置为“公共写”非常危险，建议后续改成签名 URL 或私有桶。');
}

function normalizeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  return u;
}

async function pushProfileCmd(opts) {
  const profileName = String(opts?.profile || 'default');
  const url = normalizeUrl(opts?.url) || (await getEffectiveRemoteProfileUrl());
  if (!url) throw new Error('缺少 --url，或未设置 config.remoteProfileUrl / SKILLMANAGER_PROFILE_URL');

  const appPaths = getAppPaths();
  const profilesDir = appPaths.profilesDir;
  const profile = await loadProfile({ profilesDir, profileName });
  if (!profile) throw new Error(`本地 profile 不存在：${profileName}`);

  // eslint-disable-next-line no-console
  console.log(`上传 profile=${profileName} -> ${url}`);
  // eslint-disable-next-line no-console
  console.log('警告：如果该 URL 允许公共写入，任何人都可以篡改你的配置。');

  const res = await httpFetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(profile, null, 2)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`push 失败：HTTP ${res.status} ${res.statusText} ${text ? `\n${text}` : ''}`);
  }

  // eslint-disable-next-line no-console
  console.log('push 成功。');
}

async function pullProfileCmd(opts) {
  const profileName = String(opts?.profile || 'default');
  const url = normalizeUrl(opts?.url) || (await getEffectiveRemoteProfileUrl());
  if (!url) throw new Error('缺少 --url，或未设置 config.remoteProfileUrl / SKILLMANAGER_PROFILE_URL');

  // eslint-disable-next-line no-console
  console.log(`下载 profile=${profileName} <- ${url}`);
  const res = await httpFetch(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`pull 失败：HTTP ${res.status} ${res.statusText} ${text ? `\n${text}` : ''}`);
  }
  const json = await res.json();

  const appPaths = getAppPaths();
  const profilesDir = appPaths.profilesDir;
  await saveProfile({
    profilesDir,
    profileName,
    selectedSkillIds: Array.isArray(json?.selectedSkillIds) ? json.selectedSkillIds : []
  });

  // eslint-disable-next-line no-console
  console.log('pull 成功。');
}

module.exports = { showConfig, setDefaultProfileCmd, setRemoteProfileUrlCmd, pushProfileCmd, pullProfileCmd };

