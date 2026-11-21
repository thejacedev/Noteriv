// lib/file-system.ts on a real disk, for the tests that sync with a real
// server. Only what WebDAV sync uses. A vault is an ordinary folder and a
// file is named by its file:// address, as on a phone.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toPath = (uri) => fileURLToPath(uri);

export async function readFile(fileUri) {
  try {
    return fs.readFileSync(toPath(fileUri), 'utf8');
  } catch {
    return null;
  }
}

export function writeFile(fileUri, content) {
  try {
    fs.mkdirSync(path.dirname(toPath(fileUri)), { recursive: true });
    fs.writeFileSync(toPath(fileUri), content);
    return true;
  } catch {
    return false;
  }
}

export function deleteFile(fileUri) {
  try {
    fs.rmSync(toPath(fileUri), { force: true });
    return true;
  } catch {
    return false;
  }
}

export function createDir(dirUri) {
  fs.mkdirSync(toPath(dirUri), { recursive: true });
  return true;
}

export function dirExists(dirUri) {
  try {
    return fs.statSync(toPath(dirUri)).isDirectory();
  } catch {
    return false;
  }
}

export function listDir(dirUri) {
  const dir = toPath(dirUri);
  return fs.readdirSync(dir, { withFileTypes: true }).map((item) => {
    const isDirectory = item.isDirectory();
    const uri = pathToFileURL(path.join(dir, item.name)).href;
    return { name: item.name, uri: isDirectory ? `${uri}/` : uri, isDirectory };
  });
}

export function statFile(fileUri) {
  let stat;
  try {
    stat = fs.statSync(toPath(fileUri));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile()) throw new Error('not a file');
  return { mtimeMs: Math.round(stat.mtimeMs), size: stat.size };
}

export async function readBytes(fileUri) {
  return new Uint8Array(fs.readFileSync(toPath(fileUri)));
}

export function writeBytes(fileUri, bytes) {
  fs.mkdirSync(path.dirname(toPath(fileUri)), { recursive: true });
  fs.writeFileSync(toPath(fileUri), bytes);
}

export function replaceFile(fromUri, toUri) {
  fs.renameSync(toPath(fromUri), toPath(toUri));
}

export async function fileDigest(fileUri) {
  return createHash('sha256').update(fs.readFileSync(toPath(fileUri))).digest('hex');
}

export function fileExists(uri) {
  return fs.existsSync(toPath(uri));
}

/** The records of every phone in a run sit in one folder the run names. */
export function syncRecordUri(vaultId) {
  return pathToFileURL(path.join(process.env.NOTERIV_LIVE_RECORDS, `webdav-${vaultId}.json`)).href;
}

export function trashFile(fileUri, vaultUri) {
  try {
    const trash = path.join(toPath(vaultUri), '.trash');
    fs.mkdirSync(trash, { recursive: true });
    fs.renameSync(toPath(fileUri), path.join(trash, `${Date.now()}_${path.basename(toPath(fileUri))}`));
    return true;
  } catch {
    return false;
  }
}
