const path = require('path');
const os = require('os');

function getAppPaths() {
  const home = os.homedir();
  const platform = process.platform;

  let configDir;
  let cacheDir;
  let dataDir;
  let logDir;
  let tempDir;

  if (platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const tmp = process.env.TEMP || process.env.TMP || path.join(local, 'Temp');

    configDir = path.join(roaming, 'skillmanager');
    cacheDir = path.join(local, 'skillmanager', 'Cache');
    dataDir = path.join(local, 'skillmanager', 'Data');
    logDir = path.join(local, 'skillmanager', 'Logs');
    tempDir = path.join(tmp, 'skillmanager');
  } else {
    configDir = process.env.XDG_CONFIG_HOME ? path.join(process.env.XDG_CONFIG_HOME, 'skillmanager') : path.join(home, '.config', 'skillmanager');
    cacheDir = process.env.XDG_CACHE_HOME ? path.join(process.env.XDG_CACHE_HOME, 'skillmanager') : path.join(home, '.cache', 'skillmanager');
    dataDir = process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, 'skillmanager') : path.join(home, '.local', 'share', 'skillmanager');
    logDir = path.join(cacheDir, 'logs');
    tempDir = path.join(os.tmpdir(), 'skillmanager');
  }

  return {
    cacheDir,
    configDir,
    dataDir,
    logDir,
    tempDir,
    reposDir: path.join(cacheDir, 'repos'),
    profilesDir: path.join(configDir, 'profiles')
  };
}

module.exports = { getAppPaths };

