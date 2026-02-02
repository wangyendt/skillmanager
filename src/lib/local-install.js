const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

function isPathInside(targetPath, targetDir) {
  const resolvedTargetPath = path.resolve(targetPath);
  const resolvedTargetDir = path.resolve(targetDir);
  const resolvedTargetDirWithSep = resolvedTargetDir.endsWith(path.sep) ? resolvedTargetDir : resolvedTargetDir + path.sep;
  return resolvedTargetPath.startsWith(resolvedTargetDirWithSep);
}

async function installFromLocalSkillDir({ skillDir, targetDir }) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    throw new Error(`SKILL.md not found: ${skillMd}`);
  }

  const skillName = path.basename(skillDir);
  const targetPath = path.join(targetDir, skillName);

  await fsp.mkdir(targetDir, { recursive: true });
  if (!isPathInside(targetPath, targetDir)) {
    throw new Error(`Security error: target path outside targetDir: ${targetPath}`);
  }

  // overwrite for deterministic bootstrap/update
  await fsp.rm(targetPath, { recursive: true, force: true });
  // Node 20: fs.promises.cp exists
  await fsp.cp(skillDir, targetPath, { recursive: true, dereference: true });

  return { skillName, targetPath };
}

module.exports = { installFromLocalSkillDir };

