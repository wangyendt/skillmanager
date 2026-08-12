const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fsp = require('node:fs/promises');

const workflowPath = path.resolve(__dirname, '../.github/workflows/release-on-main.yml');
const releaseTriggerPaths = [
  'src/**',
  'manifests/**',
  'skills/**',
  'package.json',
  'package-lock.json'
];

test('automatic npm releases are limited to core package changes', async () => {
  const source = await fsp.readFile(workflowPath, 'utf8');
  const lines = new Set(source.split(/\r?\n/).map((line) => line.trim()));

  assert.match(source, /^\s{4}paths:\s*$/m);
  for (const triggerPath of releaseTriggerPaths) {
    assert.ok(lines.has(`- ${triggerPath}`), `missing release path: ${triggerPath}`);
  }

  assert.doesNotMatch(source, /^\s+- (README(?:_EN)?\.md|docs\/\*\*|test\/\*\*|examples\/\*\*)\s*$/m);
});
