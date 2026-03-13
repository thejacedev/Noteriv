const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set([".git", ".noteriv", "node_modules", ".obsidian", ".trash"]);
const SYNC_EXTS = new Set([".md", ".markdown", ".txt", ".css", ".json", ".yaml", ".yml"]);

function walkFiles(dir, base) {
  base = base || dir;
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && SKIP_DIRS.has(entry.name)) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, base));
    } else if (SYNC_EXTS.has(path.extname(entry.name).toLowerCase())) {
      const rel = path.relative(base, full).replace(/\\/g, "/");
      const stat = fs.statSync(full);
      results.push({ rel, full, mtime: stat.mtimeMs });
    }
  }
  return results;
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = { walkFiles, ensureParentDir, SKIP_DIRS, SYNC_EXTS };
