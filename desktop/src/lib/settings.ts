export interface AppSettings {
  autoSaveInterval: number; // seconds, 0 = disabled
  spellCheck: boolean;
  accentColor: string;
  fontSize: number;
  lineHeight: number;
  /** The monospace font: Source mode, and code inside notes. */
  editorFont: string;
  /** The font for note text in Live and View: one of TEXT_FONTS. */
  textFont: string;
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
  textFont: "Inter",
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

/**
 * Monospace fonts, for Source mode and for code inside notes. JetBrains Mono
 * ships with the app (src/app/fonts.css). The others are only there when the
 * computer has them, and the list says so: until 3.0.6 it offered six names
 * and on a computer with none of them installed every one gave the same
 * system typewriter face (issue 56).
 */
export const EDITOR_FONTS = [
  { name: "JetBrains Mono", value: "JetBrains Mono" },
  { name: "Fira Code (if installed)", value: "Fira Code" },
  { name: "Cascadia Code (if installed)", value: "Cascadia Code" },
  { name: "Source Code Pro (if installed)", value: "Source Code Pro" },
  { name: "SF Mono (macOS)", value: "SF Mono" },
  { name: "System Mono", value: "monospace" },
];

/** Fonts for note text in Live and View. Inter ships with the app; the rest are the computer's own. */
export const TEXT_FONTS = [
  { name: "Inter", value: "Inter" },
  { name: "System", value: "system" },
  { name: "Serif", value: "serif" },
  { name: "Monospace (the code font)", value: "mono" },
];

/** The system's own monospace font: `ui-monospace` is how a web view reaches SF Mono on a Mac. */
const SYSTEM_MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";

/** The font list for code. A font the computer lacks falls back to the one the app ships, never to a bare `monospace`. */
export function codeFontStack(font: string): string {
  if (font === "monospace") return SYSTEM_MONO;
  if (font === "SF Mono") return `ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace`;
  if (!font || font === "JetBrains Mono") return `'JetBrains Mono', ${SYSTEM_MONO}`;
  return `'${font.replace(/['"\\;{}]/g, "")}', 'JetBrains Mono', ${SYSTEM_MONO}`;
}

/** The font list for note text in Live and View. An unknown choice reads as the default. */
export function textFontStack(font: string, codeFont: string): string {
  switch (font) {
    case "mono":
      return codeFontStack(codeFont);
    case "serif":
      return "ui-serif, 'Iowan Old Style', 'Palatino Linotype', Georgia, 'Noto Serif', serif";
    case "system":
      return "system-ui, -apple-system, 'Segoe UI', sans-serif";
    default:
      return "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
  }
}

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
  root.setProperty("--editor-font", codeFontStack(s.editorFont));
  root.setProperty("--text-font", textFontStack(s.textFont, s.editorFont));
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
