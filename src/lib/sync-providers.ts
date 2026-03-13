export type SyncProviderType = "none" | "folder" | "webdav" | "s3";

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

export interface S3SyncConfig {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
  prefix: string;
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

export const DEFAULT_S3_CONFIG: S3SyncConfig = {
  endpoint: "",
  bucket: "",
  accessKey: "",
  secretKey: "",
  region: "us-east-1",
  prefix: "noteriv/",
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
    description: "Google Drive, Dropbox, OneDrive, iCloud — sync to their local folder",
  },
  {
    type: "webdav",
    name: "WebDAV",
    description: "Nextcloud, ownCloud, or any WebDAV server",
  },
  {
    type: "s3",
    name: "S3 Storage",
    description: "AWS S3, Backblaze B2, Cloudflare R2, MinIO",
  },
];

export const FOLDER_DIRECTIONS: { label: string; value: FolderSyncConfig["direction"] }[] = [
  { label: "Two-way (push & pull)", value: "both" },
  { label: "Push only (local → folder)", value: "push" },
  { label: "Pull only (folder → local)", value: "pull" },
];
