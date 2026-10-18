import * as FS from '@/lib/file-system';

// Sync used to treat the remote as the source of truth: pull deleted every
// local note the remote didn't have and overwrote every note that differed,
// before push ran. A note created or edited on the phone was therefore deleted
// or reverted on the next sync tick, before it was ever uploaded (issue #18).
//
// The state below records, per note, a hash of the content local and remote
// last agreed on. Pull only applies a remote deletion or change to a note that
// hasn't been edited on this device since then; anything else is kept for
// push, and edits on both sides keep both versions.

const STATE_FILE = '.noteriv/sync-state.json';

interface StoredState {
  remote: string;
  files: Record<string, string>;
}

export type SyncBase = Record<string, string>;

/** FNV-1a over UTF-16 code units, plus the length. Only used to detect change. */
export function contentHash(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16)}:${content.length}`;
}

function stateKey(remote: string, branch?: string): string {
  return `${remote.trim()}#${branch ?? ''}`;
}

/** The last-synced hashes for this vault, or none if it last synced elsewhere. */
export async function loadSyncBase(vaultPath: string, remote: string, branch?: string): Promise<SyncBase> {
  const raw = await FS.readFile(vaultFileUri(vaultPath, STATE_FILE));
  if (!raw) return {};
  try {
    const state = JSON.parse(raw) as StoredState;
    return state.remote === stateKey(remote, branch) && state.files ? state.files : {};
  } catch {
    return {};
  }
}

export function saveSyncBase(vaultPath: string, remote: string, branch: string | undefined, files: SyncBase): void {
  const state: StoredState = { remote: stateKey(remote, branch), files };
  FS.writeFile(vaultFileUri(vaultPath, STATE_FILE), JSON.stringify(state));
}

/**
 * A note's path inside the vault as the remote names it. File URIs from the
 * file system are percent-encoded (`My%20note.md`); remote paths are not.
 */
export function vaultRelativePath(vaultPath: string, fileUri: string): string {
  const base = vaultPath.endsWith('/') ? vaultPath : `${vaultPath}/`;
  const rel = (fileUri.startsWith(base) ? fileUri.slice(base.length) : fileUri).replace(/^\/+/, '');
  try {
    return decodeURIComponent(rel);
  } catch {
    return rel;
  }
}

/** The file URI for a vault-relative path, encoding each segment. */
export function vaultFileUri(vaultPath: string, relativePath: string): string {
  const base = vaultPath.endsWith('/') ? vaultPath : `${vaultPath}/`;
  return base + relativePath.split('/').map(encodeURIComponent).join('/');
}

/** `notes/plan.md` -> `notes/plan (conflict 2026-10-18).md` */
export function conflictCopyPath(relativePath: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const match = relativePath.match(/^(.*?)(\.(?:md|markdown))$/i);
  return match ? `${match[1]} (conflict ${date})${match[2]}` : `${relativePath} (conflict ${date})`;
}

export type PullAction = 'skip' | 'take-remote' | 'keep-local' | 'conflict';

/** What pull should do with a note the remote has. */
export function pullAction(local: string | null, remote: string, base: string | undefined): PullAction {
  if (local === null) return 'take-remote';
  if (local === remote) return 'skip';
  if (base !== undefined && contentHash(local) === base) return 'take-remote';
  if (base !== undefined && contentHash(remote) === base) return 'keep-local';
  return 'conflict';
}

/**
 * Whether pull should delete a local note the remote no longer has: only a
 * copy that was synced before and hasn't been edited here since. A note the
 * remote has never seen is new on this device and is left for push.
 */
export function shouldDeleteLocal(local: string | null, base: string | undefined): boolean {
  return local !== null && base !== undefined && contentHash(local) === base;
}
