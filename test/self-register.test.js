const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fsp = require('fs/promises');

const {
  SELF_SKILL_ID,
  ensureSelfRegistration,
  isGlobalNpmInstall
} = require('../src/lib/self-register');
const { scanSkillsInRepo } = require('../src/lib/scan');

async function makeTempConfigDir(t) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'skillmanager-self-register-'));
  t.after(async () => fsp.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

test('fresh registration creates built-in sources with skillmanager enabled', async (t) => {
  const configDir = await makeTempConfigDir(t);

  const result = await ensureSelfRegistration({ configDir, packageVersion: '9.9.9', force: true });
  const manifest = await readJson(path.join(configDir, 'sources.json'));
  const config = await readJson(path.join(configDir, 'config.json'));
  const self = manifest.sources.find((source) => source.id === 'skillmanager');

  assert.equal(result.sourcesChanged, true);
  assert.equal(self.enabled, true);
  assert.equal(self.repo, 'https://github.com/wangyendt/skillmanager.git');
  assert.ok(manifest.sources.some((source) => source.id === 'anthropic'));
  assert.equal(config.migrations.skillmanagerSelfRegistration, '9.9.9');
});

test('migration preserves unrelated sources, selected skills, agents, and custom fields', async (t) => {
  const configDir = await makeTempConfigDir(t);
  const sourcesPath = path.join(configDir, 'sources.json');
  const profilePath = path.join(configDir, 'profiles', 'work.json');
  const otherSource = {
    id: 'private-team',
    name: 'Private Team',
    enabled: false,
    repo: 'ssh://example.test/private.git',
    tokenHint: 'keep-me'
  };
  const profile = {
    version: 2,
    selectedSkillIds: ['private-team:skills/alpha', 'wayne:skills/beta'],
    selectedAgentIdsByScope: { project: ['codex'], global: ['claude-code'] },
    custom: { keep: true }
  };

  await writeJson(sourcesPath, {
    version: 2,
    customRoot: 'keep-root',
    sources: [otherSource, { id: 'skillmanager', enabled: false, customSelf: 'keep-self' }]
  });
  await writeJson(profilePath, profile);
  await writeJson(path.join(configDir, 'config.json'), {
    version: 1,
    defaultProfile: 'work',
    remoteProfileUrl: null,
    customConfig: 'keep-config'
  });

  await ensureSelfRegistration({ configDir, packageVersion: '9.9.9', force: true });
  await ensureSelfRegistration({ configDir, packageVersion: '9.9.9', force: true });

  const manifest = await readJson(sourcesPath);
  const nextProfile = await readJson(profilePath);
  const nextConfig = await readJson(path.join(configDir, 'config.json'));
  const selfSources = manifest.sources.filter((source) => source.id === 'skillmanager');

  assert.deepEqual(manifest.sources[0], otherSource);
  assert.equal(manifest.customRoot, 'keep-root');
  assert.equal(selfSources.length, 1);
  assert.equal(selfSources[0].enabled, true);
  assert.equal(selfSources[0].customSelf, 'keep-self');
  assert.deepEqual(nextProfile.selectedSkillIds, [...profile.selectedSkillIds, SELF_SKILL_ID]);
  assert.deepEqual(nextProfile.selectedAgentIdsByScope, profile.selectedAgentIdsByScope);
  assert.deepEqual(nextProfile.custom, profile.custom);
  assert.equal(nextConfig.customConfig, 'keep-config');
});

test('runtime retry respects choices made after the current version was registered', async (t) => {
  const configDir = await makeTempConfigDir(t);
  await ensureSelfRegistration({ configDir, packageVersion: '9.9.9', force: true });

  const sourcesPath = path.join(configDir, 'sources.json');
  const manifest = await readJson(sourcesPath);
  manifest.sources.find((source) => source.id === 'skillmanager').enabled = false;
  await writeJson(sourcesPath, manifest);

  const result = await ensureSelfRegistration({ configDir, packageVersion: '9.9.9' });
  const afterRetry = await readJson(sourcesPath);

  assert.equal(result.skipped, true);
  assert.equal(afterRetry.sources.find((source) => source.id === 'skillmanager').enabled, false);

  await ensureSelfRegistration({ configDir, packageVersion: '9.9.9', force: true });
  const afterReinstall = await readJson(sourcesPath);
  assert.equal(afterReinstall.sources.find((source) => source.id === 'skillmanager').enabled, true);
});

test('forced registration respects a tombstoned skillmanager source', async (t) => {
  const configDir = await makeTempConfigDir(t);
  const sourcesPath = path.join(configDir, 'sources.json');
  const profilePath = path.join(configDir, 'profiles', 'default.json');

  await writeJson(sourcesPath, {
    version: 4,
    removedSourceIds: ['skillmanager'],
    sources: [{ id: 'anthropic', enabled: true, repo: 'https://github.com/anthropics/skills.git' }]
  });
  await writeJson(profilePath, {
    version: 2,
    selectedSkillIds: ['anthropic:skills/example'],
    selectedAgentIdsByScope: { project: ['codex'], global: [] }
  });

  const result = await ensureSelfRegistration({ configDir, packageVersion: '9.9.9', force: true });
  const manifest = await readJson(sourcesPath);
  const profile = await readJson(profilePath);

  assert.equal(result.selfSourceRemoved, true);
  assert.ok(!manifest.sources.some((source) => source.id === 'skillmanager'));
  assert.deepEqual(manifest.removedSourceIds, ['skillmanager']);
  assert.deepEqual(profile.selectedSkillIds, ['anthropic:skills/example']);
});

test('malformed profile is never overwritten and prevents a partial migration', async (t) => {
  const configDir = await makeTempConfigDir(t);
  const sourcesPath = path.join(configDir, 'sources.json');
  const profilePath = path.join(configDir, 'profiles', 'broken.json');
  const manifest = { version: 1, sources: [{ id: 'other', enabled: true, repo: 'https://example.test/other.git' }] };
  const malformedProfile = { selectedSkillIds: 'other:skills/keep-me', custom: 'untouched' };
  await writeJson(sourcesPath, manifest);
  await writeJson(profilePath, malformedProfile);

  await assert.rejects(
    ensureSelfRegistration({ configDir, packageVersion: '9.9.9', force: true }),
    /selectedSkillIds 不是数组/
  );

  assert.deepEqual(await readJson(sourcesPath), manifest);
  assert.deepEqual(await readJson(profilePath), malformedProfile);
});

test('global npm install detection is narrow and deterministic', () => {
  assert.equal(isGlobalNpmInstall({ npm_config_global: 'true' }), true);
  assert.equal(isGlobalNpmInstall({ npm_config_global: '1' }), true);
  assert.equal(isGlobalNpmInstall({ npm_config_location: 'global' }), true);
  assert.equal(isGlobalNpmInstall({ npm_config_global: 'false' }), false);
  assert.equal(isGlobalNpmInstall({}), false);
});

test('repository exposes the bundled skillmanager skill at the stable profile id', async () => {
  const repoDir = path.resolve(__dirname, '..');
  const skills = await scanSkillsInRepo({ sourceId: 'skillmanager', sourceName: 'Skillmanager', repoDir });
  const selfSkill = skills.find((skill) => skill.id === SELF_SKILL_ID);

  assert.ok(selfSkill);
  assert.equal(selfSkill.name, 'skillmanager');
  assert.match(selfSkill.description, /installing or updating skills/i);
});
