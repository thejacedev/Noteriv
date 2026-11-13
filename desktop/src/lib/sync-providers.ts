export type SyncProviderType = "none" | "folder" | "webdav";

export interface FolderSyncConfig {
  targetPath: string;
  direction: "push" | "pull" | "both";
}

export interface WebDAVSyncConfig {
  url: string;
  username: string;
  password: string;
  remotePath: string;
  /** Set to encrypt file contents before they are uploaded. Names stay readable. */
  encryptionPassword?: string;
}

/** What sync carries, as the settings screen keeps it. */
export interface SyncFilterSettings {
  images: boolean;
  pdfs: boolean;
  audio: boolean;
  video: boolean;
  /** Bookmarks, property types and saved layouts. */
  settings: boolean;
  /** Folders left out, one to a line, as paths inside the vault. */
  excludeFolders: string;
}

/** The filter as the backend reads it. */
export function syncFilterConfig(filter: SyncFilterSettings) {
  return {
    images: filter.images,
    pdfs: filter.pdfs,
    audio: filter.audio,
    video: filter.video,
    settings: filter.settings,
    excludeFolders: filter.excludeFolders
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
      .filter((line) => line !== "" && !line.split("/").includes("..")),
  };
}

/**
 * What a sync run, or a connection test, is given for the provider in use.
 * Null when there is none.
 */
export function providerConfig(settings: {
  extraSyncProvider: string;
  folderSync: FolderSyncConfig;
  webdavSync: WebDAVSyncConfig;
  syncFilter: SyncFilterSettings;
}): Record<string, unknown> | null {
  const filter = syncFilterConfig(settings.syncFilter);
  if (settings.extraSyncProvider === "folder") return { ...settings.folderSync, filter };
  if (settings.extraSyncProvider === "webdav") {
    return { ...settings.webdavSync, encryptionPassword: settings.webdavSync.encryptionPassword || null, filter };
  }
  return null;
}

/**
 * Whether the vault syncs on the timer and on save: it does when it has
 * anywhere to sync to. A vault can sync through a folder or WebDAV without
 * ever having a Git remote.
 */
export function autoSyncApplies(gitRemote: string | null | undefined, extraProvider: SyncProviderType): boolean {
  return Boolean(gitRemote) || extraProvider !== "none";
}

export const DEFAULT_FOLDER_CONFIG: FolderSyncConfig = {
  targetPath: "",
  direction: "both",
};

export const DEFAULT_WEBDAV_CONFIG: WebDAVSyncConfig = {
  url: "",
  username: "",
  password: "",
  remotePath: "/Noteriv",
};

export interface SyncProviderInfo {
  type: SyncProviderType;
  name: string;
  description: string;
}

export const SYNC_PROVIDERS: SyncProviderInfo[] = [
  {
    type: "none",
    name: "None",
    description: "No additional sync provider",
  },
  {
    type: "folder",
    name: "Cloud Drive (Folder)",
    description: "Google Drive, Dropbox, OneDrive, iCloud: sync with a folder of its own inside theirs",
  },
  {
    type: "webdav",
    name: "WebDAV",
    description: "Nextcloud, ownCloud, or any WebDAV server",
  },
];

export const FOLDER_DIRECTIONS: { label: string; value: FolderSyncConfig["direction"] }[] = [
  { label: "Two-way (changes and deletions)", value: "both" },
  { label: "Push only (vault → folder, never deletes)", value: "push" },
  { label: "Pull only (folder → vault, never deletes)", value: "pull" },
];
