const path = require('path');
const os = require('os');
const fsp = require('fs/promises');

const { listInstalledSkills } = require('../lib/installed');
const { syncAgents } = require('../lib/openskills');
const { promptSkillSelection } = require('../lib/cli-select');

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

  if (installed.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`未检测到可卸载的 skill。目标目录：${targetDir}`);
    return;
  }

  let toRemove = [];
  if (opts?.all) {
    toRemove = installed.map((s) => s.name);
  } else {
    const initialSelected = Array.isArray(skillNames) ? skillNames.filter(Boolean) : [];
    const chosen = await promptSkillSelection({
      title: 'skillmanager uninstall',
      skills: installed.map((s) => ({
        id: s.name,
        sourceId: 'installed',
        sourceName: 'Installed',
        name: s.name,
        description: s.description,
        skillDir: s.skillDir
      })),
      initialSelectedIds: initialSelected
    });
    if (chosen == null) {
      // eslint-disable-next-line no-console
      console.log('已取消（未执行卸载）。');
      return;
    }
    toRemove = chosen;
  }

  toRemove = Array.from(new Set(toRemove)).filter((n) => installedByName.has(n));

  if (toRemove.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`未选择任何可卸载的 skill。目标目录：${targetDir}`);
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

