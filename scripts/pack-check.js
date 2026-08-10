const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
const report = JSON.parse(output)[0];
const files = report.files.map((entry) => entry.path);

for (const required of [
  'src/cli.js',
  'src/index.js',
  'manifests/agents.json',
  'manifests/sources.json',
  'skills/skilltruck/SKILL.md',
  'skills/skilltruck/agents/openai.yaml'
]) {
  if (!files.includes(required)) throw new Error(`npm package is missing ${required}`);
}

for (const forbidden of ['test/', 'scripts/', '.github/', 'docs/']) {
  if (files.some((file) => file.startsWith(forbidden))) throw new Error(`npm package leaks ${forbidden}`);
}

process.stdout.write(`${JSON.stringify({ ok: true, files: files.length, bytes: report.size })}\n`);
