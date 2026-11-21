/**
 * What a two-way sync does with each file: the rules, and nothing that
 * touches a file or a server.
 *
 * This is the phone's copy of the rules the desktop app syncs by
 * (`desktop/src-tauri/src/sync_webdav.rs`). The two have to agree, because
 * a phone and a computer meet in the same folder on the server: a file one
 * of them leaves out must never look deleted to the other, and both must
 * keep both versions of a note that changed on two devices.
 *
 * The app keeps a small record of what each file looked like on both sides
 * the last time they matched. Comparing the current state with that record
 * is what tells a real change from a file this app uploaded itself, and a
 * deleted file from one that was never synced.
 */

// ============================================================
// What is synced
// ============================================================

/** File types that are always synced. Anything not listed here or in one of the kinds below stays local. */
const NOTE_EXTS = ['md', 'markdown', 'txt', 'canvas', 'drawing', 'base', 'json', 'csv', 'css', 'yaml', 'yml'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif'];
const PDF_EXTS = ['pdf'];
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'ogg', 'flac'];
const VIDEO_EXTS = ['mp4', 'mov', 'mkv'];
/** Sound or video: the desktop app's own recordings are sound in a `.webm` file. */
const EITHER_EXTS = ['webm'];

/** Folders that are never synced, on either side. `.trash` is this app's own trash. */
export const SKIP_DIRS = ['.git', '.noteriv', 'node_modules', '.obsidian', '.trash'];

/**
 * The app's own folder in a vault, and the files in it that hold settings
 * worth having on every device. The rest of the folder stays where it is.
 */
const SETTINGS_DIR = '.noteriv';
const SETTINGS_FILES = ['bookmarks.json', 'types.json', 'workspaces.json'];

/** Whether a file is one of the vault's settings files rather than a note. */
export function isSettingsFile(rel: string): boolean {
  return rel.startsWith(`${SETTINGS_DIR}/`) && SETTINGS_FILES.includes(rel.slice(SETTINGS_DIR.length + 1));
}

/**
 * The encryption key file the desktop app puts in a folder it encrypts.
 * Its ending is one no kind of synced file has, so it is never listed,
 * downloaded into a vault or deleted as a note.
 */
export const KEY_FILE = 'noteriv-encryption.key';

/**
 * What is synced. The same choice is applied to the vault and to the other
 * side, which is what makes leaving something out safe: a file that is left
 * out is invisible on both sides, so it is never taken for one that was
 * deleted.
 */
export interface SyncFilter {
  images: boolean;
  pdfs: boolean;
  audio: boolean;
  video: boolean;
  /** Bookmarks, property types and saved layouts. */
  settings: boolean;
  /** Folders left out, as paths inside the vault with `/`. */
  excludeFolders: string[];
}

/** Notes, images and PDFs: what the desktop app syncs when nothing is chosen. */
export const DEFAULT_FILTER: SyncFilter = {
  images: true,
  pdfs: true,
  audio: false,
  video: false,
  settings: false,
  excludeFolders: [],
};

function excluded(filter: SyncFilter, rel: string): boolean {
  return filter.excludeFolders.some((raw) => {
    const folder = raw.trim().replace(/^\/+|\/+$/g, '');
    if (folder === '' || !rel.startsWith(folder)) return false;
    const rest = rel.slice(folder.length);
    return rest === '' || rest.startsWith('/');
  });
}

/** The ending of a file's name in lower case, or null when it has none. */
function extensionOf(rel: string): string | null {
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  // ".hidden" is a name, not an ending.
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

/** Whether a file is synced. */
export function allows(filter: SyncFilter, rel: string): boolean {
  if (rel === SETTINGS_DIR || rel.startsWith(`${SETTINGS_DIR}/`)) {
    return filter.settings && isSettingsFile(rel);
  }
  if (excluded(filter, rel)) return false;
  const ext = extensionOf(rel);
  if (ext === null) return false;
  return (
    NOTE_EXTS.includes(ext) ||
    (filter.images && IMAGE_EXTS.includes(ext)) ||
    (filter.pdfs && PDF_EXTS.includes(ext)) ||
    (filter.audio && AUDIO_EXTS.includes(ext)) ||
    (filter.video && VIDEO_EXTS.includes(ext)) ||
    ((filter.audio || filter.video) && EITHER_EXTS.includes(ext))
  );
}

/** Whether a folder is looked into at all. `rel` is its path inside the vault and `name` its own name. */
export function enters(filter: SyncFilter, rel: string, name: string): boolean {
  if (rel === SETTINGS_DIR) return filter.settings;
  return !SKIP_DIRS.includes(name) && !rel.startsWith(`${SETTINGS_DIR}/`) && !excluded(filter, rel);
}

/**
 * A relative path is only used if it cannot point outside the vault. The
 * names come from the server as well as from the phone, so this is checked.
 */
export function safeRel(rel: string): boolean {
  if (rel === '' || rel.includes('\\') || rel.includes('\0')) return false;
  return rel.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

// ============================================================
// The two sides and the record
// ============================================================

export interface LocalFile {
  mtimeMs: number;
  size: number;
}

export interface RemoteFile {
  /** Changes whenever the file's content on the server changes. */
  sig: string;
  /** The server's own modification time. Only used to pick a conflict winner. */
  mtimeMs: number;
  /**
   * The server's tag for this version, when it gives a usable one. Sent
   * back with an upload so the server refuses it if the file has changed.
   */
  etag: string | null;
}

export interface FileRecord {
  /** The local file's modification time and size when it last matched the server. */
  localMtimeMs: number;
  localSize: number;
  /** The server's signature for the file at that moment. */
  remoteSig: string;
  /**
   * A fingerprint of the content, so a file that was only written again
   * (same content, new time) is not mistaken for an edit. "" when unknown.
   */
  hash: string;
}

/** Bumped when the record's meaning changes; an older record is then ignored. */
export const RECORD_VERSION = 1;

export interface SyncRecord {
  version: number;
  vault: string;
  remote: string;
  files: Record<string, FileRecord>;
}

// ============================================================
// Deciding what to do
// ============================================================

export type ActionKind =
  /** Send the local file to the server. */
  | 'upload'
  /** Fetch the server's file. */
  | 'download'
  /** The file was deleted here: remove it from the server. */
  | 'deleteRemote'
  /** The file was deleted on the server: move the local copy to the trash. */
  | 'trashLocal'
  /** On both sides with no record: fetch it and compare the contents. */
  | 'compare'
  /** Changed on both sides since the last sync. */
  | 'conflict'
  /** Gone from both sides: drop it from the record. */
  | 'forget';

export interface Action {
  kind: ActionKind;
  /** The file's path inside the vault, with `/`. */
  rel: string;
}

/**
 * Work out what to do with every file, from what is on the phone, what is
 * on the server, and what both looked like after the last sync. Touches
 * nothing.
 *
 * Deletions are only ever planned from a record. When one side is completely
 * empty the record is not trusted: an empty vault is more likely one that
 * could not be read than a user who deleted every note, and an empty server
 * is more likely a wiped or replaced one. Both cases copy files back instead.
 */
export function plan(
  local: ReadonlyMap<string, LocalFile>,
  remote: ReadonlyMap<string, RemoteFile>,
  record: SyncRecord | null,
): Action[] {
  const trusted = local.size > 0 && remote.size > 0 ? record : null;
  const recorded = trusted?.files ?? {};
  const seen = (rel: string): FileRecord | undefined =>
    Object.prototype.hasOwnProperty.call(recorded, rel) ? recorded[rel] : undefined;

  const names = [...new Set([...local.keys(), ...remote.keys(), ...Object.keys(recorded)])].sort();

  const localChanged = (l: LocalFile, s: FileRecord) => l.mtimeMs !== s.localMtimeMs || l.size !== s.localSize;
  const remoteChanged = (r: RemoteFile, s: FileRecord) => r.sig !== s.remoteSig;

  const actions: Action[] = [];
  const add = (kind: ActionKind, rel: string) => actions.push({ kind, rel });

  for (const rel of names) {
    const l = local.get(rel);
    const r = remote.get(rel);
    const s = seen(rel);

    if (l && r && s) {
      const here = localChanged(l, s);
      const there = remoteChanged(r, s);
      if (here && there) add('conflict', rel);
      else if (here) add('upload', rel);
      else if (there) add('download', rel);
    } else if (l && r) {
      add('compare', rel);
    } else if (l && s) {
      // Deleted on the server. An edit made here since then outranks the deletion.
      add(localChanged(l, s) ? 'upload' : 'trashLocal', rel);
    } else if (l) {
      add('upload', rel);
    } else if (r && s) {
      // Deleted here. An edit made on the server since then outranks the deletion.
      add(remoteChanged(r, s) ? 'download' : 'deleteRemote', rel);
    } else if (r) {
      add('download', rel);
    } else if (s) {
      add('forget', rel);
    }
  }
  return actions;
}

/**
 * "Folder/Note.md" becomes "Folder/Note (conflict 2026-11-12 14-30-05).md",
 * with a number added if that name is taken too.
 */
export function conflictRel(rel: string, stamp: string, taken: (candidate: string) => boolean): string {
  const slash = rel.lastIndexOf('/');
  const dir = rel.slice(0, slash + 1);
  const name = rel.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';

  let candidate = `${dir}${stem} (conflict ${stamp})${ext}`;
  for (let n = 2; taken(candidate); n++) {
    candidate = `${dir}${stem} (conflict ${stamp} ${n})${ext}`;
  }
  return candidate;
}

/** The time a conflict copy is named after: "2026-11-12 14-30-05", in the phone's own time zone. */
export function conflictStamp(now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ` +
    `${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`
  );
}
