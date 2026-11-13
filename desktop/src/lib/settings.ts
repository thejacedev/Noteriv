export interface AppSettings {
  autoSaveInterval: number; // seconds, 0 = disabled
  spellCheck: boolean;
  accentColor: string;
  fontSize: number;
  lineHeight: number;
  editorFont: string;
  tabSize: number;
  gitSyncInterval: number; // minutes, 0 = disabled
  syncOnSave: boolean;     // git sync after every manual save
  pullOnOpen: boolean;     // git pull when opening a vault
  commitMessageFormat: string; // template: {date}, {time}, {count}
  extraSyncProvider: "none" | "folder" | "webdav";
  folderSync: { targetPath: string; direction: "push" | "pull" | "both" };
  webdavSync: { url: string; username: string; password: string; remotePath: string; encryptionPassword?: string };
  /** What the cloud folder and WebDAV sync carry. The same choice applies to both sides. */
  syncFilter: import("./sync-providers").SyncFilterSettings;
  theme: string; // theme ID
  autoUpdate: boolean; // check for and install updates automatically
  autoCollapseSidebar: boolean;
  sidebarCollapseWidth: number;
  /** Rewrite links across the vault when a note, attachment or folder is renamed or moved. */
  updateLinksOnRename: boolean;
  /** How the path in a link the app writes is chosen: see `link-format.ts`. */
  linkFormat: import("./link-format").LinkFormat;
  /** Write `[[Note]]` links. When off, `[Note](Note.md)`. */
  useWikilinks: boolean;
  /** Where a new note is created: the top of the vault, beside the open note, or in `newNoteFolder`. */
  newNoteLocation: "root" | "current" | "folder";
  newNoteFolder: string;
  /** The folder inside the vault that new attachments are saved to. */
  attachmentFolder: string;
  /** Paths left out of search, the graph, link suggestions and Quick Open: one per line. */
  excludedFiles: string;
  /** Where a deleted file goes: the app's own trash (restorable in the app) or the system's. */
  deletedFiles: "noteriv" | "system";
  /** How the file list is ordered. */
  fileSort: import("./file-list").FileSort;
  /** Open the file list at the note that is opened. */
  autoRevealFile: boolean;
  /** Open web links from notes in the app's reader instead of the browser. */
  openLinksInReader: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoSaveInterval: 30,
  spellCheck: false,
  accentColor: "#89b4fa",
  fontSize: 15,
  lineHeight: 1.75,
  editorFont: "JetBrains Mono",
  tabSize: 4,
  gitSyncInterval: 5,
  syncOnSave: false,
  pullOnOpen: true,
  commitMessageFormat: "Sync {date} {time}",
  extraSyncProvider: "none",
  folderSync: { targetPath: "", direction: "both" },
  webdavSync: { url: "", username: "", password: "", remotePath: "/Noteriv", encryptionPassword: "" },
  syncFilter: { images: true, pdfs: true, audio: false, video: false, settings: false, excludeFolders: "" },
  theme: "catppuccin-mocha",
  autoUpdate: true,
  autoCollapseSidebar: true,
  sidebarCollapseWidth: 800,
  updateLinksOnRename: true,
  linkFormat: "shortest",
  useWikilinks: true,
  newNoteLocation: "root",
  newNoteFolder: "",
  attachmentFolder: "attachments",
  excludedFiles: "",
  deletedFiles: "noteriv",
  fileSort: "manual",
  autoRevealFile: false,
  openLinksInReader: false,
};

export const ACCENT_COLORS = [
  { name: "Blue", value: "#89b4fa" },
  { name: "Lavender", value: "#b4befe" },
  { name: "Mauve", value: "#cba6f7" },
  { name: "Pink", value: "#f38ba8" },
  { name: "Peach", value: "#fab387" },
  { name: "Yellow", value: "#f9e2af" },
  { name: "Green", value: "#a6e3a1" },
  { name: "Teal", value: "#94e2d5" },
];

export const EDITOR_FONTS = [
  { name: "JetBrains Mono", value: "JetBrains Mono" },
  { name: "Fira Code", value: "Fira Code" },
  { name: "Cascadia Code", value: "Cascadia Code" },
  { name: "Source Code Pro", value: "Source Code Pro" },
  { name: "SF Mono", value: "SF Mono" },
  { name: "System Mono", value: "monospace" },
];

export const AUTO_SAVE_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "10 seconds", value: 10 },
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "5 minutes", value: 300 },
];

export const SYNC_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "1 minute", value: 1 },
  { label: "5 minutes", value: 5 },
  { label: "10 minutes", value: 10 },
  { label: "30 minutes", value: 30 },
];

export function applySettings(s: AppSettings) {
  const root = document.documentElement.style;
  root.setProperty("--accent", s.accentColor);
  root.setProperty("--editor-font-size", `${s.fontSize}px`);
  root.setProperty("--editor-line-height", String(s.lineHeight));
  root.setProperty("--editor-font", `'${s.editorFont}', 'Fira Code', monospace`);
}

export function mergeSettings(saved: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    // A choice saved before a kind was added keeps the default for that kind.
    syncFilter: { ...DEFAULT_SETTINGS.syncFilter, ...(saved.syncFilter ?? {}) },
  };
}

export function formatCommitMessage(template: string, changeCount?: number): string {
  const now = new Date();
  return template
    .replace("{date}", now.toISOString().split("T")[0])
    .replace("{time}", now.toLocaleTimeString())
    .replace("{count}", String(changeCount ?? 0));
}
