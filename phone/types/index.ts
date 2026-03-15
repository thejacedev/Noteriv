export interface Vault {
  id: string;
  name: string;
  path: string;
  gitRemote: string | null;
  gitBranch: string;
  autoSync: boolean;
  lastOpened: number;
}

export interface AppSettings {
  autoSaveInterval: number;
  spellCheck: boolean;
  accentColor: string;
  fontSize: number;
  lineHeight: number;
  editorFont: string;
  tabSize: number;
  gitSyncInterval: number;
  syncOnSave: boolean;
  pullOnOpen: boolean;
  commitMessageFormat: string;
  theme: string;
  autoUpdate: boolean;
}

export interface WorkspaceState {
  openTabs: string[];
  activeTab: string | null;
  expandedFolders: string[];
  viewMode: 'edit' | 'preview';
  fileOrder?: Record<string, string[]>;
  bookmarks?: string[];
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface SearchResult {
  filePath: string;
  fileName: string;
  line: number;
  text: string;
}

export interface HotkeyBinding {
  action: string;
  keys: string;
}
