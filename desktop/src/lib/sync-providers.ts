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
