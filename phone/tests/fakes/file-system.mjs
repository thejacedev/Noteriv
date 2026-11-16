// In-memory stand-in for lib/file-system.ts, with the shapes sync relies on:
// percent-encoded file URIs, and dot files and folders hidden from listings.
const files = new Map();

export function reset() {
  files.clear();
}

/** Every stored file as { 'decoded/relative/path': content } for one vault. */
export function snapshot(vaultPath) {
  const out = {};
  for (const [uri, content] of files) {
    if (uri.startsWith(vaultPath)) out[decodeURIComponent(uri.slice(vaultPath.length))] = content;
  }
  return out;
}

export async function readFile(filePath) {
  return files.has(filePath) ? files.get(filePath) : null;
}

export function writeFile(filePath, content) {
  files.set(filePath, content);
  return true;
}

export function deleteFile(filePath) {
  files.delete(filePath);
  return true;
}

export async function listAllMarkdownFiles(dir) {
  const found = [];
  for (const uri of files.keys()) {
    if (!uri.startsWith(dir)) continue;
    const segments = uri.slice(dir.length).split('/').map(decodeURIComponent);
    const name = segments[segments.length - 1];
    if (segments.some((segment) => segment.startsWith('.'))) continue;
    if (!name.endsWith('.md') && !name.endsWith('.markdown')) continue;
    found.push({ filePath: uri, fileName: name.replace(/\.(md|markdown)$/i, ''), relativePath: uri.slice(dir.length) });
  }
  return found;
}
