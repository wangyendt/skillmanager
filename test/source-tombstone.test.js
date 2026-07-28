const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fsp = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const repoDir = path.resolve(__dirname, '..');
const cliPath = path.join(repoDir, 'src', 'cli.js');

async function makeCliContext(t) {
  const configRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'skillmanager-source-tombstone-'));
  t.after(async () => fsp.rm(configRoot, { recursive: true, force: true }));
  return {
    configRoot,
    manifestPath: path.join(configRoot, 'skillmanager', 'sources.json'),
    env: { ...process.env, XDG_CONFIG_HOME: configRoot }
  };
}

async function runCli(args, env) {
  return execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoDir,
    env,
    encoding: 'utf8'
  });
}

async function readManifest(manifestPath) {
  return JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
}

async function writeManifest(manifestPath, manifest) {
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

test('removing a built-in source records a tombstone and prevents automatic restoration', async (t) => {
  const context = await makeCliContext(t);
  await runCli(['source', 'list'], context.env);
  await runCli(['source', 'remove', 'superpowers'], context.env);

  let manifest = await readManifest(context.manifestPath);
  assert.ok(!manifest.sources.some((source) => source.id === 'superpowers'));
  assert.ok(manifest.removedSourceIds.includes('superpowers'));

  const listed = await runCli(['source', 'list'], context.env);
  assert.doesNotMatch(listed.stdout, /^- superpowers\b/m);

  manifest = await readManifest(context.manifestPath);
  assert.ok(!manifest.sources.some((source) => source.id === 'superpowers'));
});

test('a tombstone wins if an older client writes the built-in source back', async (t) => {
  const context = await makeCliContext(t);
  await runCli(['source', 'list'], context.env);
  await runCli(['source', 'remove', 'superpowers'], context.env);

  const manifest = await readManifest(context.manifestPath);
  manifest.customRoot = { keep: true };
  manifest.sources.push({
    id: 'superpowers',
    name: 'Obra Superpowers',
    kind: 'git',
    enabled: true,
    repo: 'https://github.com/obra/superpowers.git',
    openskillsRef: 'obra/superpowers'
  });
  manifest.sources = manifest.sources.filter((source) => source.id !== 'anthropic');
  await writeManifest(context.manifestPath, manifest);

  await runCli(['source', 'list'], context.env);
  const normalized = await readManifest(context.manifestPath);
  assert.ok(!normalized.sources.some((source) => source.id === 'superpowers'));
  assert.ok(normalized.sources.some((source) => source.id === 'anthropic'));
  assert.ok(normalized.removedSourceIds.includes('superpowers'));
  assert.deepEqual(normalized.customRoot, { keep: true });
});

test('removing an unknown source does not create a tombstone', async (t) => {
  const context = await makeCliContext(t);
  await runCli(['source', 'list'], context.env);

  const result = await runCli(['source', 'remove', 'does-not-exist'], context.env);
  assert.match(result.stdout, /未找到来源：does-not-exist/);

  const manifest = await readManifest(context.manifestPath);
  assert.ok(!Array.isArray(manifest.removedSourceIds) || !manifest.removedSourceIds.includes('does-not-exist'));
});

test('a malformed tombstone is reported without overwriting the manifest', async (t) => {
  const context = await makeCliContext(t);
  await runCli(['source', 'list'], context.env);

  const manifest = await readManifest(context.manifestPath);
  manifest.removedSourceIds = 'superpowers';
  await writeManifest(context.manifestPath, manifest);
  const before = await fsp.readFile(context.manifestPath, 'utf8');

  await assert.rejects(runCli(['source', 'list'], context.env), /removedSourceIds/);
  assert.equal(await fsp.readFile(context.manifestPath, 'utf8'), before);
});

test('adding the same repository restores its built-in id and clears the tombstone', async (t) => {
  const context = await makeCliContext(t);
  await runCli(['source', 'list'], context.env);
  await runCli(['source', 'remove', 'superpowers'], context.env);

  const result = await runCli(['source', 'add', 'https://github.com/obra/superpowers'], context.env);
  assert.match(result.stdout, /已恢复来源：superpowers/);

  const manifest = await readManifest(context.manifestPath);
  assert.equal(manifest.sources.filter((source) => source.id === 'superpowers').length, 1);
  assert.ok(!manifest.removedSourceIds.includes('superpowers'));
});

test('custom sources can be removed and re-added with the same generated id', async (t) => {
  const context = await makeCliContext(t);
  await runCli(['source', 'list'], context.env);
  await runCli(['source', 'add', 'example/example-skills'], context.env);
  await runCli(['source', 'remove', 'example-example-skills'], context.env);

  let manifest = await readManifest(context.manifestPath);
  assert.ok(!manifest.sources.some((source) => source.id === 'example-example-skills'));
  assert.ok(manifest.removedSourceIds.includes('example-example-skills'));

  const result = await runCli(['source', 'add', 'example/example-skills'], context.env);
  assert.match(result.stdout, /已恢复来源：example-example-skills/);
  manifest = await readManifest(context.manifestPath);
  assert.equal(manifest.sources.filter((source) => source.id === 'example-example-skills').length, 1);
  assert.ok(!manifest.removedSourceIds.includes('example-example-skills'));
});
