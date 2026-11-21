/**
 * WebDAV sync.
 *
 * Two-way sync between a vault on the phone and a folder on a WebDAV server
 * (Nextcloud, ownCloud, a NAS, or any other server that speaks WebDAV). It
 * is the phone's copy of the desktop app's WebDAV sync
 * (`desktop/src-tauri/src/sync_webdav.rs`): the same folder layout on the
 * server, the same rules (`sync-plan.ts`), and the same care taken before
 * anything is replaced or removed. A phone and a computer can therefore
 * share one remote folder.
 *
 * What the phone does not do yet: read a folder the desktop app encrypted.
 * It recognises one and refuses to sync with it, so readable notes are never
 * written beside encrypted ones.
 *
 * The record of the last sync lives outside the vault, so it is never synced
 * itself: a record from another device would describe the wrong files.
 */
import * as FS from '@/lib/file-system';
import { getItem, KEYS } from '@/lib/storage';
import {
  Action,
  allows,
  conflictRel,
  conflictStamp,
  DEFAULT_FILTER,
  enters,
  FileRecord,
  isSettingsFile,
  KEY_FILE,
  LocalFile,
  plan,
  RECORD_VERSION,
  RemoteFile,
  safeRel,
  SyncFilter,
  SyncRecord,
} from '@/lib/sync-plan';
import { vaultFileUri } from '@/lib/sync-state';
import {
  buildClient,
  Client,
  dirUrl,
  ensureRoot,
  Expect,
  explainStatus,
  fileUrl,
  foldersOverlap,
  get,
  listRemote,
  mkcol,
  propfind,
  put,
  relUnder,
  decodedPath,
  remove,
  RemoteFolderMissing,
  rootUrl,
  statRemote,
  WebDavConfig,
} from '@/lib/webdav-client';
import { Vault } from '@/types';

export type { WebDavConfig } from '@/lib/webdav-client';

/** The record is written out after this many changes, and at the end of a run. */
const SAVE_EVERY = 20;

/**
 * A download is written beside its note under a name with this ending, and
 * then takes the note's place. No kind of synced file has this ending.
 */
const PART_ENDING = '.noteriv-part';

const ENCRYPTED_FOLDER =
  'This remote folder is encrypted. The phone app cannot read an encrypted folder yet, so nothing was synced.';

/** A note that had changed on both sides, and where the version that did not keep its name went. */
export interface ConflictCopy {
  note: string;
  copy: string;
}

export interface Outcome {
  pushed: number;
  pulled: number;
  deleted: number;
  conflicts: number;
  /** One entry per conflict counted in `conflicts`. */
  conflictCopies: ConflictCopy[];
  /** One line per file that could not be synced this run. */
  errors: string[];
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const sameFile = (a: LocalFile | null | undefined, b: LocalFile | null | undefined): boolean =>
  a == null || b == null ? a == null && b == null : a.mtimeMs === b.mtimeMs && a.size === b.size;

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ============================================================
// The phone's side
// ============================================================

/**
 * List every synced file in the vault.
 *
 * A folder or file that cannot be read stops the listing with an error. It
 * must never be skipped: a note that is merely unreadable right now would
 * otherwise look like one the user deleted, and be deleted from the server.
 */
export function listLocal(vaultPath: string, filter: SyncFilter): Map<string, LocalFile> {
  const out = new Map<string, LocalFile>();
  const unreadable = (what: string, error: unknown) =>
    new Error(`"${what}" could not be read (${message(error)}), so nothing was synced.`);

  const walk = (dirUri: string, prefix: string) => {
    let items: FS.DirItem[];
    try {
      items = FS.listDir(dirUri);
    } catch (error) {
      throw unreadable(prefix === '' ? 'The vault' : prefix, error);
    }
    for (const item of items) {
      const rel = prefix === '' ? item.name : `${prefix}/${item.name}`;
      if (item.isDirectory) {
        if (enters(filter, rel, item.name)) walk(item.uri, rel);
        continue;
      }
      if (item.name.endsWith(PART_ENDING)) {
        // A download that was cut off, by the app being closed in the middle
        // of it. Only one sync runs at a time, so it belongs to no run.
        FS.deleteFile(item.uri);
        continue;
      }
      if (!allows(filter, rel) || !safeRel(rel)) continue;
      let stat: LocalFile | null;
      try {
        stat = FS.statFile(item.uri);
      } catch (error) {
        throw unreadable(rel, error);
      }
      // A file that vanished since the folder was read was deleted just now.
      if (stat !== null) out.set(rel, stat);
    }
  };

  walk(vaultPath, '');
  return out;
}

/**
 * A file's bytes with the fingerprint and state that belong to exactly those
 * bytes. If the file is written while it is being read, the three would not
 * describe the same content, so that is an error and the next run tries again.
 */
async function readSettled(fileUri: string): Promise<{ bytes: Uint8Array; hash: string; stat: LocalFile }> {
  const before = FS.statFile(fileUri);
  if (before === null) throw new Error('The file is no longer on the phone.');
  const bytes = await FS.readBytes(fileUri);
  const hash = await FS.fileDigest(fileUri);
  if (!sameFile(FS.statFile(fileUri), before) || bytes.length !== before.size) {
    throw new Error('The file changed while it was being read. It will be synced next time.');
  }
  return { bytes, hash, stat: before };
}

/**
 * Write `bytes` to `rel`, unless the file on the phone no longer looks the
 * way it did when this run listed it (`expected`; undefined means it was not
 * there). Returns the file's new state and fingerprint, or null if it was
 * left alone.
 */
async function writeLocalIfUnchanged(
  vaultPath: string,
  rel: string,
  bytes: Uint8Array,
  expected: LocalFile | undefined,
): Promise<{ now: LocalFile; hash: string } | null> {
  const dest = vaultFileUri(vaultPath, rel);
  // A folder under the file's name is not a file that changed: it is in the
  // way. Moving the download onto it would remove the folder and all in it.
  if (FS.dirExists(dest)) throw new Error('A folder on the phone has the same name, so the file was left on the server.');
  if (!sameFile(FS.statFile(dest), expected)) return null;

  // The new content goes beside the note first and takes its place in one
  // step, so a note is never left half written. The name starts with a dot,
  // so the app's own lists never show it.
  const slash = rel.lastIndexOf('/');
  const part = vaultFileUri(vaultPath, `${rel.slice(0, slash + 1)}.${rel.slice(slash + 1)}${PART_ENDING}`);
  try {
    FS.writeBytes(part, bytes);
    const hash = await FS.fileDigest(part);
    // Looked at again, now that nothing can come between the look and the move.
    if (!sameFile(FS.statFile(dest), expected)) {
      FS.deleteFile(part);
      return null;
    }
    FS.replaceFile(part, dest);
    const now = FS.statFile(dest);
    if (now === null) throw new Error('The downloaded file could not be read back.');
    return { now, hash };
  } catch (error) {
    FS.deleteFile(part);
    throw error;
  }
}

/**
 * Move a file into the vault's trash, where the app's Trash screen finds it,
 * so a note removed on another device can still be restored here. Returns
 * false if the file changed since this run listed it and was kept.
 */
function moveToTrashIfUnchanged(vaultPath: string, rel: string, expected: LocalFile): boolean {
  const source = vaultFileUri(vaultPath, rel);
  if (!sameFile(FS.statFile(source), expected)) return false;
  if (!FS.trashFile(source, vaultPath)) throw new Error('The file could not be moved to the trash.');
  return true;
}

// ============================================================
// The record of the last sync
// ============================================================

/**
 * A record that is missing, unreadable, from an older version, or written
 * for another vault or server counts as no record at all.
 */
export async function loadRecord(recordUri: string, vault: string, remote: string): Promise<SyncRecord | null> {
  const text = await FS.readFile(recordUri);
  if (!text) return null;
  try {
    const record = JSON.parse(text) as SyncRecord;
    if (record.version !== RECORD_VERSION || record.vault !== vault || record.remote !== remote) return null;
    if (record.files === null || typeof record.files !== 'object') return null;
    return record;
  } catch {
    return null;
  }
}

export function saveRecord(recordUri: string, record: SyncRecord): void {
  const part = `${recordUri}.part`;
  if (!FS.writeFile(part, JSON.stringify(record))) throw new Error('it could not be written');
  FS.replaceFile(part, recordUri);
}

/**
 * A file whose time changed but whose size did not may only have been
 * written again with the same text, as saving a note without changing it
 * does. Read those and compare fingerprints: if the content is what was
 * synced, note the new time and move on, so it is neither uploaded again nor
 * counted as one side of a conflict.
 */
async function settleTouchedFiles(vaultPath: string, local: ReadonlyMap<string, LocalFile>, record: SyncRecord): Promise<void> {
  for (const [rel, file] of local) {
    const entry: FileRecord | undefined = Object.prototype.hasOwnProperty.call(record.files, rel)
      ? record.files[rel]
      : undefined;
    if (!entry || file.mtimeMs === entry.localMtimeMs || file.size !== entry.localSize || entry.hash === '') continue;
    try {
      const uri = vaultFileUri(vaultPath, rel);
      const hash = await FS.fileDigest(uri);
      // The fingerprint only counts if it is of the file as it was listed.
      if (hash === entry.hash && sameFile(FS.statFile(uri), file)) entry.localMtimeMs = file.mtimeMs;
    } catch {
      // Left as a change; the run itself reports a file it cannot read.
    }
  }
}

// ============================================================
// Doing it
// ============================================================

/** The first bytes of a file the desktop app encrypted: its mark, the format version, and at least a full header. */
function looksEncrypted(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 45 &&
    bytes[0] === 0x4e && // N
    bytes[1] === 0x52 && // R
    bytes[2] === 0x56 && // V
    bytes[3] === 0x45 && // E
    bytes[4] === 1
  );
}

class Run {
  readonly outcome: Outcome = { pushed: 0, pulled: 0, deleted: 0, conflicts: 0, conflictCopies: [], errors: [] };

  constructor(
    private readonly client: Client,
    private readonly root: string,
    private readonly vaultPath: string,
    private readonly local: ReadonlyMap<string, LocalFile>,
    private readonly remote: ReadonlyMap<string, RemoteFile>,
    /** Remote folders known to exist, so each is created at most once. */
    private readonly remoteDirs: Set<string>,
    readonly record: SyncRecord,
  ) {}

  /**
   * The contents of a file fetched from the server. The key file is looked
   * for before a run starts, so an encrypted file here is one from a folder
   * whose key file went missing. It must not be written into a vault as if
   * it were a note.
   */
  private unseal(bytes: Uint8Array): Uint8Array {
    if (looksEncrypted(bytes)) {
      throw new Error('The copy on the server is encrypted, and the phone app cannot read it, so it was left alone.');
    }
    return bytes;
  }

  private async ensureRemoteParents(rel: string): Promise<void> {
    const parts = rel.split('/').slice(0, -1);
    let soFar = '';
    for (const part of parts) {
      soFar = soFar === '' ? part : `${soFar}/${part}`;
      if (this.remoteDirs.has(soFar)) continue;
      this.remoteDirs.add(soFar);
      // If this fails the upload that follows reports the real problem.
      await mkcol(this.client, dirUrl(this.root, soFar)).catch(() => {});
    }
  }

  /**
   * Send a local file and note what both sides look like afterwards.
   *
   * Returns false if the server turned the upload down because the file
   * changed there after this run listed it. Nothing is recorded then, so the
   * next run sees both versions and keeps both.
   */
  private async upload(rel: string): Promise<boolean> {
    // The state is taken with the bytes: if the file changes after this, the next run sees it as changed.
    const { bytes, hash, stat } = await readSettled(vaultFileUri(this.vaultPath, rel));
    const url = fileUrl(this.root, rel);
    // Only replace the version this run saw, and only create a file that was not there.
    const listed = this.remote.get(rel);
    const listedSig = listed?.sig ?? null;
    const expect: Expect = !listed
      ? { kind: 'absent' }
      : listed.etag !== null
        ? { kind: 'version', tag: listed.etag }
        : { kind: 'anything' };

    await this.ensureRemoteParents(rel);
    if (!(await put(this.client, url, bytes, expect))) {
      const now = (await statRemote(this.client, this.root, rel))?.sig ?? null;
      // Another device changed it in the meantime.
      if (now !== listedSig) return false;
      // The server refused, yet still shows exactly what this run listed:
      // its answer contradicts its own listing, so send the file plainly.
      await put(this.client, url, bytes, { kind: 'anything' });
    }
    const missing = 'The file was uploaded but the server does not list it.';
    let uploaded = await statRemote(this.client, this.root, rel);
    if (uploaded === null) throw new Error(missing);
    if (listedSig !== null && listedSig === uploaded.sig) {
      // Some servers tell versions apart only by the second and the size.
      // This upload looks the same to the server as the version it replaced,
      // so other devices would never notice it. Send it again a moment
      // later, when it gets a time of its own.
      await sleep(1100);
      await put(this.client, url, bytes, { kind: 'anything' });
      uploaded = await statRemote(this.client, this.root, rel);
      if (uploaded === null) throw new Error(missing);
    }
    this.record.files[rel] = { localMtimeMs: stat.mtimeMs, localSize: stat.size, remoteSig: uploaded.sig, hash };
    this.outcome.pushed += 1;
    return true;
  }

  /** Put the server's bytes in place of the local file as this run listed it. */
  private async placeDownload(rel: string, bytes: Uint8Array, remote: RemoteFile): Promise<void> {
    const written = await writeLocalIfUnchanged(this.vaultPath, rel, bytes, this.local.get(rel));
    // Null: the file was edited while this run was working. Leave it; the next run decides.
    if (written === null) return;
    this.record.files[rel] = {
      localMtimeMs: written.now.mtimeMs,
      localSize: written.now.size,
      remoteSig: remote.sig,
      hash: written.hash,
    };
    this.outcome.pulled += 1;
  }

  private async download(rel: string): Promise<void> {
    const remote = this.remote.get(rel);
    if (!remote) throw new Error('The file is no longer on the server.');
    const bytes = this.unseal(await get(this.client, fileUrl(this.root, rel)));
    await this.placeDownload(rel, bytes, remote);
  }

  /**
   * Both sides have the file and it is not known which is right. Fetch the
   * server's copy: identical contents are simply noted as in step. If they
   * differ, the newer one stays under the note's name and the other is kept
   * beside it as a conflict copy, on this phone and on the server.
   */
  private async reconcile(rel: string): Promise<void> {
    const listed = this.local.get(rel);
    if (!listed) throw new Error('The file is no longer on the phone.');
    const remote = this.remote.get(rel);
    if (!remote) throw new Error('The file is no longer on the server.');

    const local = await readSettled(vaultFileUri(this.vaultPath, rel));
    const remoteBytes = this.unseal(await get(this.client, fileUrl(this.root, rel)));

    if (sameBytes(local.bytes, remoteBytes)) {
      this.record.files[rel] = {
        localMtimeMs: local.stat.mtimeMs,
        localSize: local.stat.size,
        remoteSig: remote.sig,
        hash: local.hash,
      };
      return;
    }

    const serverIsNewer = remote.mtimeMs > listed.mtimeMs;

    if (isSettingsFile(rel)) {
      // Bookmarks and the like are not notes: the newer file wins and no
      // second copy is kept beside it.
      if (serverIsNewer) await this.placeDownload(rel, remoteBytes, remote);
      else await this.upload(rel);
      return;
    }

    const stamp = conflictStamp(new Date());
    const copyRel = conflictRel(
      rel,
      stamp,
      (candidate) => FS.fileExists(vaultFileUri(this.vaultPath, candidate)) || this.remote.has(candidate),
    );
    const losingBytes = serverIsNewer ? local.bytes : remoteBytes;

    // Save the version that will not keep the name first, so it exists before anything is replaced.
    if ((await writeLocalIfUnchanged(this.vaultPath, copyRel, losingBytes, undefined)) === null) {
      throw new Error('A conflict copy could not be written.');
    }
    await this.upload(copyRel);

    if (serverIsNewer) await this.placeDownload(rel, remoteBytes, remote);
    else await this.upload(rel);

    this.outcome.conflicts += 1;
    this.outcome.conflictCopies.push({ note: rel, copy: copyRel });
  }

  async apply(action: Action): Promise<void> {
    const { kind, rel } = action;
    switch (kind) {
      case 'upload':
        await this.upload(rel);
        return;
      case 'download':
        await this.download(rel);
        return;
      case 'compare':
      case 'conflict':
        await this.reconcile(rel);
        return;
      case 'deleteRemote':
        await remove(this.client, fileUrl(this.root, rel));
        delete this.record.files[rel];
        this.outcome.deleted += 1;
        return;
      case 'trashLocal': {
        const expected = this.local.get(rel);
        if (!expected) throw new Error('The file is no longer on the phone.');
        if (moveToTrashIfUnchanged(this.vaultPath, rel, expected)) {
          delete this.record.files[rel];
          this.outcome.deleted += 1;
        }
        return;
      }
      case 'forget':
        delete this.record.files[rel];
        return;
    }
  }
}

/**
 * Sync a vault with its WebDAV folder. `recordUri` is where this phone keeps
 * its record of the vault's earlier syncs.
 *
 * Listing either side has to succeed completely, or the run stops there and
 * this throws. After that each file stands alone: one that fails is reported
 * in `errors` and does not stop the rest.
 */
export async function sync(
  vaultPath: string,
  cfg: WebDavConfig,
  recordUri: string,
  filter: SyncFilter = DEFAULT_FILTER,
): Promise<Outcome> {
  if (!FS.dirExists(vaultPath)) throw new Error('The vault folder is missing, so nothing was synced.');

  const root = rootUrl(cfg);
  const client = buildClient(cfg);

  let listing;
  try {
    listing = await listRemote(client, root, filter);
  } catch (error) {
    if (!(error instanceof RemoteFolderMissing)) throw error;
    // The first sync into a folder that is not there yet: create it.
    await ensureRoot(client, cfg);
    listing = await listRemote(client, root, filter);
  }
  // Before any note is looked at: is this a folder the phone cannot read?
  if (listing.encrypted) throw new Error(ENCRYPTED_FOLDER);

  const local = listLocal(vaultPath, filter);
  const remoteId = `${root}\n${cfg.username}`;
  const loaded = await loadRecord(recordUri, vaultPath, remoteId);
  if (loaded) await settleTouchedFiles(vaultPath, local, loaded);
  const actions = plan(local, listing.files, loaded);

  const run = new Run(
    client,
    root,
    vaultPath,
    local,
    listing.files,
    new Set(listing.dirs),
    loaded ?? { version: RECORD_VERSION, vault: vaultPath, remote: remoteId, files: {} },
  );

  let sinceSave = 0;
  for (const action of actions) {
    try {
      await run.apply(action);
      sinceSave += 1;
      if (sinceSave >= SAVE_EVERY) {
        sinceSave = 0;
        try {
          saveRecord(recordUri, run.record);
        } catch {}
      }
    } catch (error) {
      run.outcome.errors.push(`${action.rel}: ${message(error)}`);
    }
  }
  try {
    saveRecord(recordUri, run.record);
  } catch (error) {
    throw new Error(`The record of this sync could not be saved: ${message(error)}`);
  }
  return run.outcome;
}

/**
 * Check that the server can be reached with these details and that the
 * remote folder exists, creating it if it does not. Throws with the reason
 * when something is wrong.
 */
export async function testConnection(cfg: WebDavConfig): Promise<void> {
  const root = rootUrl(cfg);
  const client = buildClient(cfg);
  const url = dirUrl(root, '');

  const first = await propfind(client, url, 1);
  if (first.status >= 200 && first.status < 300) {
    const base = decodedPath(url);
    const encrypted = first.entries.some((entry) => !entry.isDir && relUnder(entry.path, base) === KEY_FILE);
    if (encrypted) throw new Error(ENCRYPTED_FOLDER);
    return;
  }
  if (first.status !== 404) throw new Error(explainStatus(first.status, 'Reaching the remote folder'));

  await ensureRoot(client, cfg);
  const { status } = await propfind(client, url, 0);
  if (status < 200 || status >= 300) {
    throw new Error(`The remote folder does not exist and could not be created (HTTP ${status}).`);
  }
}

// ============================================================
// A vault's own settings
// ============================================================

/** What sync needs to know of a vault: which it is, where its files are, and where it syncs to. */
export type SyncedVault = Pick<Vault, 'id' | 'path' | 'webdav'>;

/** The details a vault syncs with, or null when it has none or its password is gone. */
export async function vaultConfig(vault: SyncedVault): Promise<WebDavConfig | null> {
  if (!vault.webdav?.url) return null;
  const password = await getItem<string>(KEYS.WEBDAV_PASSWORD(vault.id));
  if (password === null) return null;
  return { url: vault.webdav.url, username: vault.webdav.username, remotePath: vault.webdav.remotePath, password };
}

/** Sync a vault with the WebDAV folder it is set up for. */
export function syncVault(vault: SyncedVault, cfg: WebDavConfig): Promise<Outcome> {
  return sync(vault.path, cfg, FS.syncRecordUri(vault.id));
}

/**
 * The name of another vault on this phone that already syncs with this
 * remote folder, with one that holds it, or with one inside it. Two vaults
 * in one folder would be mixed into each other.
 */
export function vaultSharingFolder(vaults: Vault[], vaultId: string, cfg: Pick<WebDavConfig, 'url' | 'remotePath'>): string | null {
  const root = rootUrl(cfg);
  for (const other of vaults) {
    if (other.id === vaultId || !other.webdav?.url) continue;
    try {
      if (foldersOverlap(root, rootUrl(other.webdav))) return other.name;
    } catch {
      // A vault whose own address cannot be read syncs nowhere.
    }
  }
  return null;
}

/** One line for the settings screen about what a sync did. */
export function describeOutcome(outcome: Outcome): string {
  const parts: string[] = [];
  if (outcome.pushed > 0) parts.push(`${outcome.pushed} uploaded`);
  if (outcome.pulled > 0) parts.push(`${outcome.pulled} downloaded`);
  if (outcome.deleted > 0) parts.push(`${outcome.deleted} deleted`);
  if (outcome.conflicts > 0) {
    parts.push(outcome.conflicts === 1 ? '1 conflict copy kept' : `${outcome.conflicts} conflict copies kept`);
  }
  const done = parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'Up to date';
  if (outcome.errors.length === 0) return done;
  const count = outcome.errors.length === 1 ? '1 file could not be synced' : `${outcome.errors.length} files could not be synced`;
  return `${done}. ${count}: ${outcome.errors[0]}`;
}
