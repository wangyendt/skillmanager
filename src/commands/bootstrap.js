const { getAppPaths } = require('../lib/paths');
const { ensureDir } = require('../lib/fs');
const { loadSourcesManifest } = require('../lib/manifest');
const { ensureRepo } = require('../lib/git');
const { scanSkillsInRepo } = require('../lib/scan');
const { loadProfile } = require('../lib/profiles');
const { mapWithConcurrency } = require('../lib/concurrency');
const { getEffectiveDefaultProfile } = require('../lib/config');
const path = require('path');
const os = require('os');
const { installSourceRef, syncAgents } = require('../lib/openskills');
const { installFromLocalSkillDir } = require('../lib/local-install');


function uniq(arr) {
  return Array.from(new Set(arr));
}

async function bootstrap(opts) {
  const paths = getAppPaths();
  await ensureDir(paths.reposDir);
  await ensureDir(paths.profilesDir);

  const { sources } = await loadSourcesManifest();
  const enabledSources = sources.filter((s) => s && s.enabled !== false);

  const profileName = opts?.profile || (await getEffectiveDefaultProfile());
  const existing = await loadProfile({ profilesDir: paths.profilesDir, profileName });

  const wantsSelection = existing?.selectedSkillIds && Array.isArray(existing.selectedSkillIds);
  const globalInstall = !!opts?.global;
  const universal = !!opts?.universal;

  if (!wantsSelection) {
    // Default path: install everything from each enabled source via openskills directly.
    // This avoids repo scanning and matches “bootstrap 安装所有 skills”的默认体验。
    // eslint-disable-next-line no-console
    console.log(`将从 ${enabledSources.length} 个来源安装（global=${globalInstall}, universal=${universal}）…`);

    if (opts?.dryRun) {
      // eslint-disable-next-line no-console
      console.log('\n--dry-run 已启用：将安装以下来源（不执行安装）');
      for (const s of enabledSources) {
        const ref = s.openskillsRef || s.repo;
        // eslint-disable-next-line no-console
        console.log(`- ${s.name || s.id}  (${ref || 'missing-ref'})`);
      }
      // eslint-disable-next-line no-console
      console.log('\n完成（dry-run）。');
      return;
    }

    for (const s of enabledSources) {
      const ref = s.openskillsRef || s.repo;
      if (!ref) continue;
      // eslint-disable-next-line no-console
      console.log(`\n==> Installing source: ${s.name || s.id}  (${ref})`);
      await installSourceRef({ ref, globalInstall, universal });
    }

    if (opts?.sync !== false) {
      await syncAgents({ output: opts?.output, cwd: process.cwd() });
    }

    // eslint-disable-next-line no-console
    console.log('\n完成。');
    return;
  }

  // Selection path: clone repos + scan SKILL.md, then install selected skill dirs.
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

  for (const { skills } of perSource) {
    for (const sk of skills) skillsById.set(sk.id, sk);
  }

  const allSkills = Array.from(skillsById.values());
  let selectedIds =
    existing?.selectedSkillIds && Array.isArray(existing.selectedSkillIds)
      ? existing.selectedSkillIds
      : allSkills.map((s) => s.id);

  // 交互式选择已迁移到：skillmanager webui（mode=install）

  selectedIds = uniq(selectedIds).filter((id) => skillsById.has(id));

  // eslint-disable-next-line no-console
  console.log(`将安装 ${selectedIds.length} 个 skills（global=${globalInstall}, universal=${universal}）…`);

  if (opts?.dryRun) {
    // eslint-disable-next-line no-console
    console.log('\n--dry-run 已启用：仅展示前 30 个将安装的 skills（按解析顺序）');
    for (const id of selectedIds.slice(0, 30)) {
      const s = skillsById.get(id);
      // eslint-disable-next-line no-console
      console.log(`- ${s.name}  [${s.sourceId}]  (${s.id})`);
    }
    if (selectedIds.length > 30) {
      // eslint-disable-next-line no-console
      console.log(`… 还有 ${selectedIds.length - 30} 个`);
    }
    // eslint-disable-next-line no-console
    console.log('\n完成（dry-run）。');
    return;
  }

  // 2) install selected
  for (const id of selectedIds) {
    const skill = skillsById.get(id);
    // eslint-disable-next-line no-console
    console.log(`\n==> Installing: ${skill.name}  (${skill.sourceId})`);

    // NOTE: On Windows, openskills does not recognize absolute paths like C:\...
    // So for selection-mode we perform a direct local install (copy) ourselves, then rely on openskills sync.
    const folder = universal ? '.agent/skills' : '.claude/skills';
    const targetDir = globalInstall ? path.join(os.homedir(), folder) : path.join(process.cwd(), folder);
    const { targetPath } = await installFromLocalSkillDir({ skillDir: skill.skillDir, targetDir });
    // eslint-disable-next-line no-console
    console.log(`✅ Installed (local copy): ${targetPath}`);
  }

  // 3) sync AGENTS.md (optional)
  if (opts?.sync !== false) {
    await syncAgents({ output: opts?.output, cwd: process.cwd() });
  }

  // eslint-disable-next-line no-console
  console.log('\n完成。');
}

module.exports = { bootstrap };

