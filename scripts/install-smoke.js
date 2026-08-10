const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'skilltruck-install-'));

try {
  const output = execFileSync('npm', ['pack', '--json', '--pack-destination', temp], {
    cwd: root,
    encoding: 'utf8'
  });
  const filename = JSON.parse(output)[0].filename;
  const packagePath = path.join(temp, filename);
  execFileSync('npm', ['install', '--ignore-scripts', '--prefix', temp, packagePath], { stdio: 'ignore' });

  const installed = path.join(temp, 'node_modules', 'skilltruck');
  require(path.join(installed, 'src', 'index.js'));
  const manifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'));
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(temp, 'config'),
    XDG_CACHE_HOME: path.join(temp, 'cache'),
    XDG_DATA_HOME: path.join(temp, 'data')
  };
  const cliVersion = execFileSync(process.execPath, [path.join(installed, 'src', 'cli.js'), '--version'], {
    encoding: 'utf8',
    env
  }).trim();
  if (cliVersion !== manifest.version) {
    throw new Error(`CLI version ${cliVersion} does not match package version ${manifest.version}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
