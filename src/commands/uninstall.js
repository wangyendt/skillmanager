const path = require('path');
const os = require('os');
const fsp = require('fs/promises');

const { listInstalledSkills } = require('../lib/installed');
const { syncAgents } = require('../lib/openskills');

function resolveTargetDir({ globalInstall, universal }) {
  const folder = universal ? '.agent/skills' : '.claude/skills';
  return globalInstall ? path.join(os.homedir(), folder) : path.join(process.cwd(), folder);
}

async function uninstall(opts, skillNames) {
  const globalInstall = !!opts?.global;
  const universal = !!opts?.universal;
  const targetDir = resolveTargetDir({ globalInstall, universal });

  const installed = await listInstalledSkills(targetDir);
  const installedByName = new Map(installed.map((s) => [s.name, s]));

  let toRemove = Array.isArray(skillNames) ? skillNames.filter(Boolean) : [];

  if (opts?.all) {
    toRemove = installed.map((s) => s.name);
  }

  toRemove = Array.from(new Set(toRemove)).filter((n) => installedByName.has(n));

  if (toRemove.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`未选择任何可卸载的 skill。目标目录：${targetDir}`);
    // eslint-disable-next-line no-console
    console.log('用法：');
    // eslint-disable-next-line no-console
    console.log('  - skillmanager webui --mode uninstall');
    // eslint-disable-next-line no-console
    console.log('  - skillmanager uninstall <skill1> <skill2>');
    // eslint-disable-next-line no-console
    console.log('  - skillmanager uninstall --all');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`将卸载 ${toRemove.length} 个 skills（目标：${targetDir}）…`);

  for (const name of toRemove) {
    const entry = installedByName.get(name);
    if (!entry) continue;
    // eslint-disable-next-line no-console
    console.log(`- remove ${name}`);
    await fsp.rm(entry.skillDir, { recursive: true, force: true });
  }

  if (opts?.sync !== false) {
    await syncAgents({ output: opts?.output, cwd: process.cwd() });
  }

  // eslint-disable-next-line no-console
  console.log('完成。');
}

module.exports = { uninstall };

