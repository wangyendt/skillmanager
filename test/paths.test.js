const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { getAppPaths } = require('../src/lib/paths');

test('new installations use SkillTruck application paths', () => {
  const home = path.join(path.sep, 'home', 'test-user');
  const paths = getAppPaths({ home, platform: 'linux', env: {}, existsSync: () => false });
  assert.equal(paths.configDir, path.join(home, '.config', 'skilltruck'));
  assert.equal(paths.cacheDir, path.join(home, '.cache', 'skilltruck'));
});

test('existing SkillManager configuration remains discoverable after rename', () => {
  const home = path.join(path.sep, 'home', 'test-user');
  const legacyConfigDir = path.join(home, '.config', 'skillmanager');
  const paths = getAppPaths({
    home,
    platform: 'linux',
    env: {},
    existsSync: (candidate) => candidate === legacyConfigDir
  });
  assert.equal(paths.configDir, legacyConfigDir);
  assert.equal(paths.cacheDir, path.join(home, '.cache', 'skillmanager'));
});

test('SkillTruck paths win after the new configuration directory exists', () => {
  const home = path.join(path.sep, 'home', 'test-user');
  const currentConfigDir = path.join(home, '.config', 'skilltruck');
  const legacyConfigDir = path.join(home, '.config', 'skillmanager');
  const paths = getAppPaths({
    home,
    platform: 'linux',
    env: {},
    existsSync: (candidate) => candidate === currentConfigDir || candidate === legacyConfigDir
  });
  assert.equal(paths.configDir, currentConfigDir);
});
