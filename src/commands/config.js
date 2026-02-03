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
  console.log('\n说明：');
  // eslint-disable-next-line no-console
  console.log('  - push/pull 会同步 sources.json 和 profiles/[profile].json');
  // eslint-disable-next-line no-console
  console.log('  - URL 应该是基础路径（以 / 结尾），例如：');
  // eslint-disable-next-line no-console
  console.log('    https://your-bucket.oss-region.aliyuncs.com/skillmanager/');
  // eslint-disable-next-line no-console
  console.log('\n⚠️  警告：把远端设置为"公共写"非常危险，建议使用签名 URL 或私有桶。');
}

function normalizeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  return u;
}

async function pushProfileCmd(opts) {
  const profileName = String(opts?.profile || 'default');
  let baseUrl = normalizeUrl(opts?.url) || (await getEffectiveRemoteProfileUrl());
  if (!baseUrl) throw new Error('缺少 --url，或未设置 config.remoteProfileUrl / SKILLMANAGER_PROFILE_URL');

  // 确保 baseUrl 以 / 结尾
  if (!baseUrl.endsWith('/')) baseUrl += '/';

  const appPaths = getAppPaths();
  const profilesDir = appPaths.profilesDir;
  const profile = await loadProfile({ profilesDir, profileName });
  if (!profile) throw new Error(`本地 profile 不存在：${profileName}`);

  // eslint-disable-next-line no-console
  console.log('警告：如果该 URL 允许公共写入，任何人都可以篡改你的配置。\n');

  // 1. 推送 sources.json
  const { readUserSourcesManifest } = require('../lib/manifest');
  const { manifest: sourcesManifest } = await readUserSourcesManifest();
  const sourcesUrl = `${baseUrl}sources.json`;

  // eslint-disable-next-line no-console
  console.log(`📤 上传 sources.json -> ${sourcesUrl}`);
  const sourcesRes = await httpFetch(sourcesUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(sourcesManifest, null, 2)
  });
  if (!sourcesRes.ok) {
    const text = await sourcesRes.text().catch(() => '');
    throw new Error(`sources.json push 失败：HTTP ${sourcesRes.status} ${sourcesRes.statusText} ${text ? `\n${text}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log('✅ sources.json 上传成功');

  // 2. 推送 profile
  const profileUrl = `${baseUrl}profiles/${profileName}.json`;
  // eslint-disable-next-line no-console
  console.log(`📤 上传 profile=${profileName} -> ${profileUrl}`);
  const profileRes = await httpFetch(profileUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(profile, null, 2)
  });
  if (!profileRes.ok) {
    const text = await profileRes.text().catch(() => '');
    throw new Error(`profile push 失败：HTTP ${profileRes.status} ${profileRes.statusText} ${text ? `\n${text}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log('✅ profile 上传成功');

  // eslint-disable-next-line no-console
  console.log('\n🎉 push 完成！');
}

async function pullProfileCmd(opts) {
  const profileName = String(opts?.profile || 'default');
  let baseUrl = normalizeUrl(opts?.url) || (await getEffectiveRemoteProfileUrl());
  if (!baseUrl) throw new Error('缺少 --url，或未设置 config.remoteProfileUrl / SKILLMANAGER_PROFILE_URL');

  // 确保 baseUrl 以 / 结尾
  if (!baseUrl.endsWith('/')) baseUrl += '/';

  // 1. 拉取 sources.json
  const sourcesUrl = `${baseUrl}sources.json`;
  // eslint-disable-next-line no-console
  console.log(`📥 下载 sources.json <- ${sourcesUrl}`);
  const sourcesRes = await httpFetch(sourcesUrl, { method: 'GET' });
  if (!sourcesRes.ok) {
    const text = await sourcesRes.text().catch(() => '');
    throw new Error(`sources.json pull 失败：HTTP ${sourcesRes.status} ${sourcesRes.statusText} ${text ? `\n${text}` : ''}`);
  }
  const sourcesJson = await sourcesRes.json();

  const { writeUserSourcesManifest } = require('../lib/manifest');
  await writeUserSourcesManifest(sourcesJson);
  // eslint-disable-next-line no-console
  console.log('✅ sources.json 下载成功');

  // 2. 拉取 profile
  const profileUrl = `${baseUrl}profiles/${profileName}.json`;
  // eslint-disable-next-line no-console
  console.log(`📥 下载 profile=${profileName} <- ${profileUrl}`);
  const profileRes = await httpFetch(profileUrl, { method: 'GET' });
  if (!profileRes.ok) {
    const text = await profileRes.text().catch(() => '');
    throw new Error(`profile pull 失败：HTTP ${profileRes.status} ${profileRes.statusText} ${text ? `\n${text}` : ''}`);
  }
  const profileJson = await profileRes.json();

  const appPaths = getAppPaths();
  const profilesDir = appPaths.profilesDir;
  await saveProfile({
    profilesDir,
    profileName,
    selectedSkillIds: Array.isArray(profileJson?.selectedSkillIds) ? profileJson.selectedSkillIds : []
  });
  // eslint-disable-next-line no-console
  console.log('✅ profile 下载成功');

  // eslint-disable-next-line no-console
  console.log('\n🎉 pull 完成！');
}

module.exports = { showConfig, setDefaultProfileCmd, setRemoteProfileUrlCmd, pushProfileCmd, pullProfileCmd };
