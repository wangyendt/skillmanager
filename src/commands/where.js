const { getAppPaths } = require('../lib/paths');
const { loadSourcesManifest } = require('../lib/manifest');

async function where() {
  const p = getAppPaths();
  const m = await loadSourcesManifest();

  // eslint-disable-next-line no-console
  console.log('skillmanager paths:');
  // eslint-disable-next-line no-console
  console.log(`- configDir:  ${p.configDir}`);
  // eslint-disable-next-line no-console
  console.log(`- profilesDir:${p.profilesDir}`);
  // eslint-disable-next-line no-console
  console.log(`- cacheDir:   ${p.cacheDir}`);
  // eslint-disable-next-line no-console
  console.log(`- reposDir:   ${p.reposDir}`);
  // eslint-disable-next-line no-console
  console.log(`- manifest:   ${m.manifestPath}`);
}

module.exports = { where };

