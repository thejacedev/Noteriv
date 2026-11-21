// In-memory stand-in for lib/file-system.ts, with the shapes sync relies on:
// percent-encoded file URIs, dot files and folders hidden from the listings
// the screens use, and a modification time and size for every file.
import { createHash } from 'node:crypto';

import { clock } from './clock.mjs';

/** uri -> { bytes: Buffer, mtimeMs } */
const files = new Map();
/** Folders made on purpose, so that an empty one exists. Each ends with "/". */
const folders = new Set();
/** Folders a test has made unreadable. */
const unreadable = new Set();
/** Things a test wants done while a file's fingerprint is being taken: { fileUri, run }. */
const digestHooks = [];

const asFolder = (uri) => (uri.endsWith('/') ? uri : `${uri}/`);
const put = (uri, bytes) => files.set(uri, { bytes: Buffer.from(bytes), mtimeMs: clock.tick() });

export function reset() {
  files.clear();
  folders.clear();
  unreadable.clear();
  digestHooks.length = 0;
  clock.reset();
}

/** Every stored file as { 'decoded/relative/path': content } for one vault. */
export function snapshot(vaultPath) {
  const out = {};
  for (const [uri, file] of files) {
    if (uri.startsWith(vaultPath)) out[decodeURIComponent(uri.slice(vaultPath.length))] = file.bytes.toString('utf8');
  }
  return out;
}

export async function readFile(filePath) {
  return files.has(filePath) ? files.get(filePath).bytes.toString('utf8') : null;
}

export function writeFile(filePath, content) {
  put(filePath, content);
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

// What lib/vault.ts and context/AppContext.tsx call besides reading and
// writing. The listing the screens use is not modelled: it is empty.
export function ensureVaultsDir() {}

export function getVaultPath(name) {
  return `file:///data/vaults/${encodeURIComponent(name)}/`;
}

export function createDir(dirPath) {
  folders.add(asFolder(dirPath));
  return true;
}

export function readDir() {
  return [];
}

// ── What WebDAV sync uses ──

export function dirExists(dirUri) {
  const dir = asFolder(dirUri);
  if (folders.has(dir)) return true;
  for (const uri of files.keys()) if (uri.startsWith(dir)) return true;
  return false;
}

/** Everything in a folder, hidden names included. Throws when a test made the folder unreadable. */
export function listDir(dirUri) {
  const dir = asFolder(dirUri);
  if (unreadable.has(dir)) throw new Error('permission denied');
  const items = new Map();
  const add = (uri) => {
    const rest = uri.slice(dir.length);
    if (!uri.startsWith(dir) || rest === '') return;
    const [first, ...deeper] = rest.split('/');
    const isDirectory = deeper.length > 0;
    items.set(first, { name: decodeURIComponent(first), uri: isDirectory ? `${dir}${first}/` : `${dir}${first}`, isDirectory });
  };
  for (const uri of folders) add(uri);
  for (const uri of files.keys()) add(uri);
  return [...items.values()];
}

export function statFile(fileUri) {
  const file = files.get(fileUri);
  return file ? { mtimeMs: file.mtimeMs, size: file.bytes.length } : null;
}

export async function readBytes(fileUri) {
  const file = files.get(fileUri);
  if (!file) throw new Error('no such file');
  return new Uint8Array(file.bytes);
}

export function writeBytes(fileUri, bytes) {
  put(fileUri, bytes);
}

/** A move keeps the time the file was written, as a rename on a phone does. */
export function replaceFile(fromUri, toUri) {
  const file = files.get(fromUri);
  if (!file) throw new Error('no such file');
  files.delete(fromUri);
  files.set(toUri, file);
}

export async function fileDigest(fileUri) {
  const file = files.get(fileUri);
  if (!file) throw new Error('no such file');
  const digest = createHash('sha256').update(file.bytes).digest('hex');
  // The fingerprint takes a moment on a phone: other code runs meanwhile.
  const hook = digestHooks.findIndex((h) => h.fileUri === fileUri);
  if (hook >= 0) digestHooks.splice(hook, 1)[0].run();
  return digest;
}

export function fileExists(path) {
  return files.has(path) || dirExists(path);
}

export function syncRecordUri(vaultId) {
  return `file:///data/sync-records/webdav-${vaultId}.json`;
}

export function trashFile(filePath, vaultPath) {
  const file = files.get(filePath);
  if (!file) return false;
  const name = filePath.split('/').pop();
  files.delete(filePath);
  files.set(`${asFolder(vaultPath)}.trash/${clock.tick()}_${name}`, file);
  return true;
}

// ── For tests only ──

/** A file's bytes, or null. */
export function bytesOf(fileUri) {
  return files.has(fileUri) ? new Uint8Array(files.get(fileUri).bytes) : null;
}

/** Give a file a new time without changing what is in it. */
export function touch(fileUri) {
  files.get(fileUri).mtimeMs = clock.tick();
}

/** Run something once while this file's fingerprint is being taken. */
export function duringDigest(fileUri, run) {
  digestHooks.push({ fileUri, run });
}

/** Make a folder fail to list, as one whose permissions changed would. */
export function makeUnreadable(dirUri) {
  unreadable.add(asFolder(dirUri));
}
