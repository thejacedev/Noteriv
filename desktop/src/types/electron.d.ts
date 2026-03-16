interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface Vault {
  id: string;
  name: string;
  path: string;
  gitRemote: string | null;
  gitBranch: string;
  autoSync: boolean;
  lastOpened: number;
}

interface AppConfig {
  vaults: Vault[];
  activeVaultId: string | null;
  setupComplete: boolean;
}

interface GitStatus {
  isRepo: boolean;
  changes: number;
  branch: string | null;
  remote: string | null;
  ahead: number;
  behind: number;
}

interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

interface GitHubUser {
  valid: boolean;
  username?: string;
  name?: string;
  avatar?: string;
  error?: string;
}

interface GitHubRepo {
  name: string;
  fullName: string;
  private: boolean;
  cloneUrl: string;
  sshUrl: string;
  description: string | null;
  updatedAt: string;
}

interface WorkspaceState {
  openTabs: string[];      // file paths in tab order
  activeTab: string | null;
  expandedFolders: string[]; // folder paths that are expanded
  sidebarCollapsed: boolean;
  viewMode: "live" | "source" | "view";
  fileOrder?: Record<string, string[]>; // dir path -> ordered file/folder names
  pinnedTabs?: string[]; // file paths of pinned tabs
}

interface ElectronAPI {
  // Window controls
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<boolean>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  getPlatform: () => Promise<string>;

  // Workspace state
  loadWorkspace: (vaultPath: string) => Promise<WorkspaceState | null>;
  saveWorkspace: (vaultPath: string, state: WorkspaceState) => Promise<boolean>;

  // File dialogs
  openFile: () => Promise<{ filePath: string; content: string } | null>;
  openFolder: () => Promise<string | null>;
  saveFileDialog: (defaultPath?: string) => Promise<string | null>;
  showOpenDialog: (options: {
    properties?: string[];
    filters?: { name: string; extensions: string[] }[];
    title?: string;
    defaultPath?: string;
  }) => Promise<{ canceled: boolean; filePaths: string[] }>;

  // File system
  readFile: (filePath: string) => Promise<string | null>;
  readBinaryFile: (filePath: string) => Promise<string | null>;
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  readDir: (dirPath: string) => Promise<FileEntry[]>;
  createFile: (filePath: string) => Promise<boolean>;
  deleteFile: (filePath: string) => Promise<boolean>;
  deleteDir: (dirPath: string) => Promise<boolean>;
  rename: (oldPath: string, newPath: string) => Promise<boolean>;
  createDir: (dirPath: string) => Promise<boolean>;
  copyFile: (src: string, dest: string) => Promise<boolean>;
  writeBinaryFile: (filePath: string, base64: string) => Promise<boolean>;

  // Vault management
  getConfig: () => Promise<AppConfig>;
  isSetupComplete: () => Promise<boolean>;
  getVaults: () => Promise<Vault[]>;
  getActiveVault: () => Promise<Vault | null>;
  createVault: (data: {
    name: string;
    vaultPath: string;
    gitRemote?: string;
    gitBranch?: string;
    autoSync?: boolean;
  }) => Promise<Vault>;
  updateVault: (id: string, updates: Partial<Vault>) => Promise<Vault | null>;
  deleteVault: (id: string) => Promise<boolean>;
  setActiveVault: (id: string) => Promise<Vault | null>;

  // GitHub auth
  authSaveToken: (vaultId: string, token: string) => Promise<boolean>;
  authHasToken: (vaultId: string) => Promise<boolean>;
  authRemoveToken: (vaultId: string) => Promise<boolean>;
  authValidateToken: (token: string) => Promise<GitHubUser>;
  authListRepos: (token: string, page?: number) => Promise<GitHubRepo[]>;
  authCreateRepo: (
    token: string,
    name: string,
    isPrivate?: boolean,
    description?: string
  ) => Promise<GitHubRepo>;
  authOpenTokenPage: () => Promise<boolean>;
  authGetUser: (vaultId: string) => Promise<GitHubUser | null>;

  // Git operations
  gitIsInstalled: () => Promise<boolean>;
  gitIsRepo: (dir: string) => Promise<boolean>;
  gitInit: (dir: string) => Promise<boolean>;
  gitSetRemote: (dir: string, url: string) => Promise<boolean>;
  gitStatus: (dir: string) => Promise<GitStatus>;
  gitSync: (dir: string, message?: string, vaultId?: string) => Promise<boolean>;
  gitPull: (dir: string, vaultId?: string) => Promise<boolean>;
  gitFetch: (dir: string, vaultId?: string) => Promise<boolean>;
  gitLog: (dir: string, count?: number) => Promise<GitLogEntry[]>;
  gitClone: (url: string, dir: string, vaultId?: string) => Promise<boolean>;
  gitFileLog: (dir: string, filePath: string) => Promise<GitLogEntry[]>;
  gitShowFile: (dir: string, filePath: string, hash: string) => Promise<string | null>;

  // Settings
  loadSettings: () => Promise<Record<string, any>>;
  saveSettings: (settings: Record<string, any>) => Promise<boolean>;

  saveHtmlDialog: (defaultPath: string) => Promise<string | null>;

  // Shell
  openExternal: (url: string) => Promise<void>;
  openPath: (filePath: string) => Promise<string>;

  // Vault file watcher
  onVaultChanged: (callback: (filePath: string) => void) => () => void;

  // Web Clipper
  clipperGetPort: () => Promise<number>;
  clipperSetEnabled: (enabled: boolean) => Promise<void>;
  onClipperClipped: (callback: (filePath: string) => void) => () => void;

  // Updater
  updaterCheck: () => Promise<{ available: boolean; version?: string; releaseDate?: string; releaseNotes?: string; error?: string }>;
  updaterDownload: () => Promise<boolean>;
  updaterInstall: () => Promise<void>;
  updaterGetVersion: () => Promise<string>;
  onUpdaterUpdateAvailable: (callback: (data: { version: string; releaseDate?: string; releaseNotes?: string }) => void) => () => void;
  onUpdaterUpdateNotAvailable: (callback: () => void) => () => void;
  onUpdaterDownloadProgress: (callback: (data: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => () => void;
  onUpdaterUpdateDownloaded: (callback: (data: { version: string }) => void) => () => void;
  onUpdaterError: (callback: (data: { message: string }) => void) => () => void;

  // Sync providers (folder, webdav, s3)
  syncProviderSync: (vaultPath: string, providerType: string, config: Record<string, any>) => Promise<{ pushed: number; pulled: number }>;
  syncProviderTest: (providerType: string, config: Record<string, any>) => Promise<{ ok: boolean; error?: string }>;

  // Search / file listing
  searchInFiles: (dir: string, query: string) => Promise<{
    filePath: string;
    fileName: string;
    line: number;
    text: string;
  }[]>;
  listAllFiles: (dir: string) => Promise<{
    filePath: string;
    fileName: string;
    relativePath: string;
  }[]>;

  // Menu events
  onMenuSave: (callback: () => void) => () => void;
  onMenuSaveAs: (callback: () => void) => () => void;
  onMenuNewFile: (callback: () => void) => () => void;
  onMenuOpenFile: (callback: () => void) => () => void;
  onMenuOpenFolder: (callback: () => void) => () => void;
}

// Extend Window with electronAPI
interface Window {
  electronAPI: ElectronAPI;
}
