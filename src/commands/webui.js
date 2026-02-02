const path = require('path');
const os = require('os');
const fsp = require('fs/promises');

const { getAppPaths } = require('../lib/paths');
const { ensureDir } = require('../lib/fs');
const { loadSourcesManifest } = require('../lib/manifest');
const { ensureRepo } = require('../lib/git');
const { scanSkillsInRepo } = require('../lib/scan');
const { loadProfile, saveProfile } = require('../lib/profiles');
const { getEffectiveDefaultProfile } = require('../lib/config');
const { mapWithConcurrency } = require('../lib/concurrency');
const { installFromLocalSkillDir } = require('../lib/local-install');
const { listInstalledSkills } = require('../lib/installed');
const { syncAgents } = require('../lib/openskills');
const { launchSelectionUi } = require('../ui/server');

function resolveTargetDir({ globalInstall, universal }) {
  const folder = universal ? '.agent/skills' : '.claude/skills';
  return globalInstall ? path.join(os.homedir(), folder) : path.join(process.cwd(), folder);
}

async function webui(opts) {
  const modeRaw = String(opts?.mode || 'install').toLowerCase();
  const mode = modeRaw === 'uninstall' ? 'uninstall' : 'install';

  const globalInstall = !!opts?.global;
  const universal = !!opts?.universal;
  const targetDir = resolveTargetDir({ globalInstall, universal });

  if (mode === 'uninstall') {
    const installed = await listInstalledSkills(targetDir);
    const installedByName = new Map(installed.map((s) => [s.name, s]));

    const chosen = await launchSelectionUi({
      title: `skillmanager webui · uninstall · ${globalInstall ? 'global' : 'project'} · ${universal ? '.agent' : '.claude'}`,
      skills: installed.map((s) => ({
        id: s.name,
        sourceId: 'installed',
        sourceName: 'Installed',
        name: s.name,
        description: s.description
      })),
      selectedSkillIds: installed.map((s) => s.name)
    });

    const toRemove = Array.from(new Set(chosen)).filter((n) => installedByName.has(n));

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
    return;
  }

  // install mode
  const paths = getAppPaths();
  await ensureDir(paths.reposDir);
  await ensureDir(paths.profilesDir);

  const profileName = opts?.profile || (await getEffectiveDefaultProfile());
  const existing = await loadProfile({ profilesDir: paths.profilesDir, profileName });

  const { sources } = await loadSourcesManifest();
  const enabledSources = sources.filter((s) => s && s.enabled !== false);

  const concurrency = Number(opts?.concurrency || process.env.SKILLMANAGER_CONCURRENCY || 3);
  // eslint-disable-next-line no-console
  console.log(`并发扫描：${Math.max(1, concurrency)}（可用 --concurrency 或环境变量 SKILLMANAGER_CONCURRENCY 调整）`);

  const skillsById = new Map();
  const perSource = await mapWithConcurrency(enabledSources, concurrency, async (s) => {
    try {
      const repoDir = await ensureRepo({ reposDir: paths.reposDir, source: s });
      const skills = await scanSkillsInRepo({
        sourceId: s.id,
        sourceName: s.name || s.id,
        repoDir
      });
      return { source: s, skills };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`警告：拉取/扫描来源失败，将跳过：${s.name || s.id}`);
      // eslint-disable-next-line no-console
      console.warn(err?.message || String(err));
      return { source: s, skills: [] };
    }
  });

  for (const { skills } of perSource) for (const sk of skills) skillsById.set(sk.id, sk);

  const allSkills = Array.from(skillsById.values());
  const initialSelected =
    existing?.selectedSkillIds && Array.isArray(existing.selectedSkillIds) ? existing.selectedSkillIds : allSkills.map((s) => s.id);

  const chosen = await launchSelectionUi({
    title: `skillmanager webui · install · profile=${profileName}`,
    skills: allSkills.map((s) => ({
      id: s.id,
      sourceId: s.sourceId,
      sourceName: s.sourceName,
      name: s.name,
      description: s.description
    })),
    selectedSkillIds: initialSelected
  });

  const selectedIds = Array.from(new Set(chosen)).filter((id) => skillsById.has(id));
  await saveProfile({ profilesDir: paths.profilesDir, profileName, selectedSkillIds: selectedIds });

  // eslint-disable-next-line no-console
  console.log(`将安装 ${selectedIds.length} 个 skills（目标：${targetDir}，profile=${profileName}）…`);

  for (const id of selectedIds) {
    const skill = skillsById.get(id);
    // eslint-disable-next-line no-console
    console.log(`- install ${skill.name}  (${skill.sourceId})`);
    const { targetPath } = await installFromLocalSkillDir({ skillDir: skill.skillDir, targetDir });
    // eslint-disable-next-line no-console
    console.log(`  ✅ ${targetPath}`);
  }

  if (opts?.sync !== false) {
    await syncAgents({ output: opts?.output, cwd: process.cwd() });
  }

  // eslint-disable-next-line no-console
  console.log('完成。');
}

module.exports = { webui };

