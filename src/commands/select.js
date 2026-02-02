const { getAppPaths } = require('../lib/paths');
const { ensureDir } = require('../lib/fs');
const { loadSourcesManifest } = require('../lib/manifest');
const { ensureRepo } = require('../lib/git');
const { scanSkillsInRepo } = require('../lib/scan');
const { loadProfile, saveProfile } = require('../lib/profiles');
const { mapWithConcurrency } = require('../lib/concurrency');
const { getEffectiveDefaultProfile } = require('../lib/config');
const { launchSelectionUi } = require('../ui/server');

async function selectUi(opts) {
  const paths = getAppPaths();
  await ensureDir(paths.reposDir);
  await ensureDir(paths.profilesDir);

  const { sources } = await loadSourcesManifest();
  const enabledSources = sources.filter((s) => s && s.enabled !== false);

  const concurrency = Number(opts?.concurrency || process.env.SKILLMANAGER_CONCURRENCY || 3);
  // eslint-disable-next-line no-console
  console.log(`并发扫描：${Math.max(1, concurrency)}（可用 --concurrency 或环境变量 SKILLMANAGER_CONCURRENCY 调整）`);

  const perSource = await mapWithConcurrency(enabledSources, concurrency, async (s) => {
    try {
      // eslint-disable-next-line no-console
      console.log(`\n==> 扫描来源：${s.name || s.id}`);
      const repoDir = await ensureRepo({ reposDir: paths.reposDir, source: s });
      const skills = await scanSkillsInRepo({
        sourceId: s.id,
        sourceName: s.name || s.id,
        repoDir
      });
      // eslint-disable-next-line no-console
      console.log(`    找到 ${skills.length} 个 skills`);
      return skills;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`警告：拉取/扫描来源失败，将跳过：${s.name || s.id}`);
      // eslint-disable-next-line no-console
      console.warn(err?.message || String(err));
      return [];
    }
  });

  const allSkills = perSource.flat();

  const profileName = opts?.profile || (await getEffectiveDefaultProfile());
  const existing = await loadProfile({ profilesDir: paths.profilesDir, profileName });
  const initialSelected =
    existing?.selectedSkillIds && Array.isArray(existing.selectedSkillIds)
      ? existing.selectedSkillIds
      : allSkills.map((s) => s.id);

  const chosen = await launchSelectionUi({
    title: `skillmanager · profile=${profileName}`,
    skills: allSkills.map((s) => ({
      id: s.id,
      sourceId: s.sourceId,
      sourceName: s.sourceName,
      name: s.name,
      description: s.description
    })),
    selectedSkillIds: initialSelected
  });

  const savedPath = await saveProfile({
    profilesDir: paths.profilesDir,
    profileName,
    selectedSkillIds: chosen
  });

  // eslint-disable-next-line no-console
  console.log(`已保存 profile：${profileName}`);
  // eslint-disable-next-line no-console
  console.log(`路径：${savedPath}`);
}

module.exports = { selectUi };

