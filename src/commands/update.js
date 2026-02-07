const { getAppPaths } = require('../lib/paths');
const { ensureDir } = require('../lib/fs');
const { loadSourcesManifest } = require('../lib/manifest');
const { ensureRepo } = require('../lib/git');
const { scanSkillsInRepo } = require('../lib/scan');
const { loadProfile } = require('../lib/profiles');
const path = require('path');
const os = require('os');
const { syncAgents, runOpenSkills } = require('../lib/openskills');
const { installFromLocalSkillDir } = require('../lib/local-install');
const { mapWithConcurrency } = require('../lib/concurrency');
const { getEffectiveDefaultProfile } = require('../lib/config');
const { warnPrereqs } = require('../lib/prereqs');


function uniq(arr) {
  return Array.from(new Set(arr));
}

async function runFallbackOpenSkillsUpdate(opts) {
  // eslint-disable-next-line no-console
  console.log('正在执行 openskills update（更新所有已记录来源）…');
  await runOpenSkills(['update']);
  if (opts?.sync !== false) {
    await syncAgents({ output: opts?.output, cwd: process.cwd() });
  }
  // eslint-disable-next-line no-console
  console.log('\n完成。');
}

async function update(opts) {
  await warnPrereqs({ needGit: true, needOpenSkills: true });
  const globalInstall = !!opts?.global;
  const universal = !!opts?.universal;

  if (opts?.openskills) {
    await runFallbackOpenSkillsUpdate(opts);
    return;
  }

  // Default path: profile-based update (explicit profile > default profile).
  const paths = getAppPaths();
  await ensureDir(paths.profilesDir);
  const effectiveProfileName = opts?.profile || (await getEffectiveDefaultProfile());
  const existing = await loadProfile({ profilesDir: paths.profilesDir, profileName: effectiveProfileName });
  const hasSelection = Array.isArray(existing?.selectedSkillIds);

  if (!hasSelection) {
    // eslint-disable-next-line no-console
    console.warn(
      `未找到可用 profile 选择集：${effectiveProfileName}，将回退到 openskills update。` +
        `可先运行 skillmanager webui --profile ${effectiveProfileName} 保存选择集。`
    );
    await runFallbackOpenSkillsUpdate(opts);
    return;
  }

  // Profile-based update: refresh repos cache and re-install selected skill dirs.
  await ensureDir(paths.reposDir);

  const { sources } = await loadSourcesManifest();
  const enabledSources = sources.filter((s) => s && s.enabled !== false);

  const concurrency = Number(opts?.concurrency || process.env.SKILLMANAGER_CONCURRENCY || 3);
  // eslint-disable-next-line no-console
  console.log(`并发扫描：${Math.max(1, concurrency)}（可用 --concurrency 或环境变量 SKILLMANAGER_CONCURRENCY 调整）`);

  const skillsById = new Map();
  const perSource = await mapWithConcurrency(enabledSources, concurrency, async (s) => {
    try {
      const repoDir = await ensureRepo({ reposDir: paths.reposDir, source: s, forceRefresh: !!opts?.forceRefresh });
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

  for (const { skills } of perSource) {
    for (const sk of skills) skillsById.set(sk.id, sk);
  }

  let selectedIds = existing.selectedSkillIds;

  // 交互式选择已迁移到：skillmanager webui（mode=install），先保存 profile 再 update --profile

  selectedIds = uniq(selectedIds).filter((id) => skillsById.has(id));

  // eslint-disable-next-line no-console
  console.log(
    `将按 profile=${effectiveProfileName} 更新/重装 ${selectedIds.length} 个 skills（global=${globalInstall}, universal=${universal}）…`
  );

  for (const id of selectedIds) {
    const skill = skillsById.get(id);
    // eslint-disable-next-line no-console
    console.log(`\n==> Re-installing: ${skill.name}  (${skill.sourceId})`);
    const folder = universal ? '.agent/skills' : '.claude/skills';
    const targetDir = globalInstall ? path.join(os.homedir(), folder) : path.join(process.cwd(), folder);
    const { targetPath } = await installFromLocalSkillDir({ skillDir: skill.skillDir, targetDir });
    // eslint-disable-next-line no-console
    console.log(`✅ Re-installed (local copy): ${targetPath}`);
  }

  if (opts?.sync !== false) {
    await syncAgents({ output: opts?.output, cwd: process.cwd() });
  }

  // eslint-disable-next-line no-console
  console.log('\n完成。');
}

module.exports = { update };
