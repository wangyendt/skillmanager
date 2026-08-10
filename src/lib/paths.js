const path = require('path');
const os = require('os');
const fs = require('fs');

function buildAppPaths(name, { home, platform, env }) {
  let configDir;
  let cacheDir;
  let dataDir;
  let logDir;
  let tempDir;

  if (platform === 'win32') {
    const roaming = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const tmp = env.TEMP || env.TMP || path.join(local, 'Temp');

    configDir = path.join(roaming, name);
    cacheDir = path.join(local, name, 'Cache');
    dataDir = path.join(local, name, 'Data');
    logDir = path.join(local, name, 'Logs');
    tempDir = path.join(tmp, name);
  } else {
    configDir = env.XDG_CONFIG_HOME ? path.join(env.XDG_CONFIG_HOME, name) : path.join(home, '.config', name);
    cacheDir = env.XDG_CACHE_HOME ? path.join(env.XDG_CACHE_HOME, name) : path.join(home, '.cache', name);
    dataDir = env.XDG_DATA_HOME ? path.join(env.XDG_DATA_HOME, name) : path.join(home, '.local', 'share', name);
    logDir = path.join(cacheDir, 'logs');
    tempDir = path.join(os.tmpdir(), name);
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

function getAppPaths(options = {}) {
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const platform = options.platform || process.platform;
  const existsSync = options.existsSync || fs.existsSync;
  const current = buildAppPaths('skilltruck', { home, platform, env });
  const legacy = buildAppPaths('skillmanager', { home, platform, env });

  // Existing installations keep using their established directory so profiles,
  // sources, and tombstones remain available. New installations use skilltruck.
  if (!existsSync(current.configDir) && existsSync(legacy.configDir)) return legacy;
  return current;
}

module.exports = { buildAppPaths, getAppPaths };
