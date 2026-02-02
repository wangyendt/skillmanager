const path = require('path');
const fsp = require('fs/promises');
const fg = require('fast-glob');
const matter = require('gray-matter');

async function scanSkillsInRepo({ sourceId, sourceName, repoDir }) {
  const entries = await fg(['**/SKILL.md'], {
    cwd: repoDir,
    dot: false,
    onlyFiles: true,
    ignore: ['**/node_modules/**', '**/.git/**']
  });

  const skills = [];
  for (const relSkillMd of entries) {
    const absSkillMd = path.join(repoDir, relSkillMd);
    const skillDir = path.dirname(absSkillMd);
    let name = path.basename(skillDir);
    let description = '';
    try {
      const raw = await fsp.readFile(absSkillMd, 'utf8');
      const parsed = matter(raw);
      if (parsed?.data?.name) name = String(parsed.data.name).trim();
      if (parsed?.data?.description) description = String(parsed.data.description).trim();
    } catch {
      // ignore parse errors
    }

    const relSkillDir = path.relative(repoDir, skillDir).replace(/\\/g, '/');
    skills.push({
      id: `${sourceId}:${relSkillDir}`,
      sourceId,
      sourceName,
      name,
      description,
      skillDir,
      skillMd: absSkillMd
    });
  }

  // stable sort: by source then name
  skills.sort((a, b) => {
    if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId);
    return a.name.localeCompare(b.name);
  });
  return skills;
}

module.exports = { scanSkillsInRepo };

