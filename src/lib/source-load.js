const { ensureRepo } = require('./git');
const { scanSkillsInRepo } = require('./scan');

async function scanSourceOnce({ reposDir, source, forceRefresh = false, preferCompatibleClone = false }) {
  const repoDir = await ensureRepo({ reposDir, source, forceRefresh, preferCompatibleClone });
  const skills = await scanSkillsInRepo({
    sourceId: source.id,
    sourceName: source.name || source.id,
    repoDir
  });
  return { repoDir, skills };
}

async function loadSkillsFromSource({ reposDir, source, forceRefresh = false }) {
  let result = await scanSourceOnce({ reposDir, source, forceRefresh });
  if (result.skills.length) return result;

  // Some machines end up with incomplete filtered clones even though clone/fetch succeeds.
  // Retry once with a plain compatibility clone before declaring the source empty.
  // eslint-disable-next-line no-console
  console.warn(`提示：来源 ${source.id} 未扫描到任何 SKILL.md，正在使用兼容模式重新拉取…`);
  result = await scanSourceOnce({
    reposDir,
    source,
    forceRefresh: true,
    preferCompatibleClone: true
  });

  if (!result.skills.length) {
    // eslint-disable-next-line no-console
    console.warn(`提示：来源 ${source.id} 重新拉取后仍未发现任何 SKILL.md。`);
  }
  return result;
}

module.exports = { loadSkillsFromSource };
