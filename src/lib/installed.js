const path = require('path');
const fsp = require('fs/promises');
const fs = require('fs');
const matter = require('gray-matter');

async function listInstalledSkills(targetDir) {
  try {
    const entries = await fsp.readdir(targetDir, { withFileTypes: true });
    const skills = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const skillDir = path.join(targetDir, e.name);
      const skillMd = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      let description = '';
      try {
        const raw = await fsp.readFile(skillMd, 'utf8');
        const parsed = matter(raw);
        if (parsed?.data?.description) description = String(parsed.data.description).trim();
      } catch {}
      skills.push({
        name: e.name,
        description,
        skillDir
      });
    }
    skills.sort((a, b) => a.name.localeCompare(b.name));
    return skills;
  } catch {
    return [];
  }
}

module.exports = { listInstalledSkills };

