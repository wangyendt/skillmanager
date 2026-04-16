const path = require('path');
const fsp = require('fs/promises');
const fs = require('fs');
const matter = require('gray-matter');

async function readInstalledSkillMeta(skillMd) {
  let name = '';
  let description = '';
  try {
    const raw = await fsp.readFile(skillMd, 'utf8');
    const parsed = matter(raw);
    if (parsed?.data?.name) name = String(parsed.data.name).trim();
    if (parsed?.data?.description) description = String(parsed.data.description).trim();
  } catch {}
  return { name, description };
}

async function listInstalledSkills(targetDir) {
  try {
    const entries = await fsp.readdir(targetDir, { withFileTypes: true });
    const skills = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const skillDir = path.join(targetDir, e.name);
      const skillMd = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      const meta = await readInstalledSkillMeta(skillMd);
      skills.push({
        name: meta.name || e.name,
        description: meta.description,
        skillDir
      });
    }
    skills.sort((a, b) => a.name.localeCompare(b.name));
    return skills;
  } catch {
    return [];
  }
}

async function listInstalledSkillsAcrossTargets(targets) {
  const merged = new Map();
  for (const target of targets) {
    const installed = await listInstalledSkills(target.targetDir);
    for (const s of installed) {
      if (!merged.has(s.name)) {
        merged.set(s.name, {
          name: s.name,
          description: s.description || '',
          entries: []
        });
      }
      const item = merged.get(s.name);
      if (!item.description && s.description) item.description = s.description;
      item.entries.push({
        ...s,
        targetDir: target.targetDir,
        agentIds: Array.isArray(target.agentIds) ? target.agentIds : [],
        agentNames: Array.isArray(target.agentNames) ? target.agentNames : []
      });
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { listInstalledSkills, listInstalledSkillsAcrossTargets };
