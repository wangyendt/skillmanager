const { readUserSourcesManifest, writeUserSourcesManifest, loadSourcesManifest, getUserManifestPath } = require('../lib/manifest');
const { upsertUserSourceFromInput } = require('../lib/source-manage');

async function listSources() {
  const { sources, manifestPath } = await loadSourcesManifest();
  // eslint-disable-next-line no-console
  console.log(`sources（来自：${manifestPath}）`);
  for (const s of sources) {
    // eslint-disable-next-line no-console
    console.log(
      `- ${s.id}  [${s.enabled === false ? 'disabled' : 'enabled'}]  ${s.name || ''}\n  repo=${s.repo || ''}\n  openskillsRef=${s.openskillsRef || ''}`
    );
  }
  // eslint-disable-next-line no-console
  console.log(`\n用户配置文件路径：${getUserManifestPath()}`);
}

async function addSource(repoOrRef, opts) {
  const { added, source: newSource, userPath } = await upsertUserSourceFromInput(repoOrRef, {
    id: opts?.id,
    name: opts?.name,
    ref: opts?.ref,
    enabled: opts?.disabled ? false : true
  });

  // eslint-disable-next-line no-console
  console.log(added ? `已添加来源：${newSource.id}` : `来源已存在：${newSource.id}`);
  // eslint-disable-next-line no-console
  console.log(`写入：${userPath}`);
  // eslint-disable-next-line no-console
  console.log(`repo=${newSource.repo}`);
  // eslint-disable-next-line no-console
  console.log(`openskillsRef=${newSource.openskillsRef || '(none)'}`);
}

async function removeSource(id) {
  const { manifest, sources, userPath } = await readUserSourcesManifest();
  const before = sources.length;
  const nextSources = sources.filter((s) => s && s.id !== id);
  if (nextSources.length === before) {
    // eslint-disable-next-line no-console
    console.log(`未找到来源：${id}`);
    return;
  }
  const next = { ...(manifest || {}), sources: nextSources };
  await writeUserSourcesManifest(next);
  // eslint-disable-next-line no-console
  console.log(`已移除来源：${id}`);
  // eslint-disable-next-line no-console
  console.log(`写入：${userPath}`);
}

async function setEnabled(id, enabled) {
  const { manifest, sources, userPath } = await readUserSourcesManifest();
  let found = false;
  const nextSources = sources.map((s) => {
    if (s && s.id === id) {
      found = true;
      return { ...s, enabled };
    }
    return s;
  });
  if (!found) {
    // eslint-disable-next-line no-console
    console.log(`未找到来源：${id}`);
    return;
  }
  const next = { ...(manifest || {}), sources: nextSources };
  await writeUserSourcesManifest(next);
  // eslint-disable-next-line no-console
  console.log(`已${enabled ? '启用' : '禁用'}来源：${id}`);
  // eslint-disable-next-line no-console
  console.log(`写入：${userPath}`);
}

module.exports = { listSources, addSource, removeSource, setEnabled };
