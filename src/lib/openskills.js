const path = require('path');
const { spawn } = require('child_process');

function getOpenSkillsCliPath() {
  // openskills bin points to dist/cli.js
  return require.resolve('openskills/dist/cli.js');
}

async function runOpenSkills(args, opts = {}) {
  const cliPath = getOpenSkillsCliPath();
  const node = process.execPath;
  return await new Promise((resolve, reject) => {
    const child = spawn(node, [cliPath, ...args], {
      cwd: opts.cwd || process.cwd(),
      stdio: 'inherit',
      windowsHide: true
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`openskills exited with code ${code}`));
    });
  });
}

async function syncAgents({ output, cwd }) {
  const args = ['sync', '--yes'];
  if (output) args.push('--output', path.resolve(cwd || process.cwd(), output));
  await runOpenSkills(args, { cwd });
}

module.exports = { syncAgents, runOpenSkills };
