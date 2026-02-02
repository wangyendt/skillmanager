const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function fileExists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  const raw = await fsp.readFile(p, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(p, obj) {
  await ensureDir(path.dirname(p));
  await fsp.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

async function rmDir(p) {
  await fsp.rm(p, { recursive: true, force: true });
}

module.exports = { ensureDir, fileExists, readJson, writeJson, rmDir };

