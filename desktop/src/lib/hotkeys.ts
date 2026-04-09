/** Hotkey action identifiers */
export type HotkeyAction =
  // File
  | "save"
  | "saveAs"
  | "newFile"
  | "newFolder"
  | "openFile"
  | "closeTab"
  | "closeAllTabs"
  | "closeOtherTabs"
  | "deleteFile"
  // Navigation
  | "nextTab"
  | "prevTab"
  | "quickOpen"
  | "commandPalette"
  // Search
  | "findInFile"
  | "findInVault"
  // View
  | "toggleSidebar"
  | "toggleViewMode"
  | "toggleFullscreen"
  | "zenMode"
  | "settings"
  // Edit
  | "undo"
  | "redo"
  // Formatting
  | "toggleBold"
  | "toggleItalic"
  | "toggleCode"
  | "toggleStrikethrough"
  | "insertLink"
  | "insertImage"
  | "insertHorizontalRule"
  | "insertCodeBlock"
  | "insertBlockquote"
  | "insertTaskList"
  | "insertTable"
  // Sync
  | "gitSync"
  // Daily notes
  | "dailyNote"
  // Outline
  | "toggleOutline"
  // New features
  | "graphView"
  | "toggleBacklinks"
  | "toggleTags"
  | "insertTemplate"
  | "toggleBookmark"
  | "randomNote"
  | "noteComposer"
  | "fileRecovery"
  | "exportPDF"
  | "audioRecorder"
  | "attachments"
  | "slidePresentation"
  | "pluginManager"
  | "cssSnippets"
  // New features
  | "calendarView"
  | "newBoard"
  | "insertDrawing"
  | "insertToc"
  | "updateToc"
  | "insertDataview"
  | "focusMode"
  | "publishNote"
  | "flashcardReview"
  | "startCollab"
  | "newCanvas"
  | "openPdfViewer"
  | "exportPdfAnnotations"
  | "openTrash"
  | "togglePinTab"
  | "noteHistory"
  | "toggleLint"
  | "splitEditor"
  | "closeSplit"
  | "vaultInsights";

export interface HotkeyBinding {
  action: HotkeyAction;
  label: string;
  keys: string; // e.g. "Ctrl+S", "Ctrl+Shift+F"
  category: string;
}

/** Default keybindings */
export const DEFAULT_HOTKEYS: HotkeyBinding[] = [
  // File
  { action: "save", label: "Save", keys: "Ctrl+S", category: "File" },
  { action: "saveAs", label: "Save As", keys: "Ctrl+Shift+S", category: "File" },
  { action: "newFile", label: "New File", keys: "Ctrl+N", category: "File" },
  { action: "newFolder", label: "New Folder", keys: "Ctrl+Shift+N", category: "File" },
  { action: "openFile", label: "Open File", keys: "Ctrl+O", category: "File" },
  { action: "closeTab", label: "Close Tab", keys: "Ctrl+W", category: "File" },
  { action: "closeAllTabs", label: "Close All Tabs", keys: "Ctrl+Shift+W", category: "File" },
  { action: "closeOtherTabs", label: "Close Other Tabs", keys: "", category: "File" },
  { action: "deleteFile", label: "Delete File", keys: "", category: "File" },

  // Navigation
  { action: "nextTab", label: "Next Tab", keys: "Ctrl+Tab", category: "Navigation" },
  { action: "prevTab", label: "Previous Tab", keys: "Ctrl+Shift+Tab", category: "Navigation" },
  { action: "quickOpen", label: "Quick Open", keys: "Ctrl+P", category: "Navigation" },
  { action: "commandPalette", label: "Command Palette", keys: "Ctrl+Shift+P", category: "Navigation" },

  // Search
  { action: "findInFile", label: "Find in File", keys: "Ctrl+F", category: "Search" },
  { action: "findInVault", label: "Find in Vault", keys: "Ctrl+Shift+F", category: "Search" },

  // View
  { action: "toggleSidebar", label: "Toggle Sidebar", keys: "Ctrl+B", category: "View" },
  { action: "toggleViewMode", label: "Toggle View Mode", keys: "Ctrl+E", category: "View" },
  { action: "toggleFullscreen", label: "Toggle Fullscreen", keys: "F11", category: "View" },
  { action: "zenMode", label: "Zen Mode", keys: "Ctrl+Shift+E", category: "View" },
  { action: "settings", label: "Settings", keys: "Ctrl+,", category: "View" },

  // Edit
  { action: "undo", label: "Undo", keys: "Ctrl+Z", category: "Edit" },
  { action: "redo", label: "Redo", keys: "Ctrl+Shift+Z", category: "Edit" },

  // Formatting
  { action: "toggleBold", label: "Bold", keys: "", category: "Formatting" },
  { action: "toggleItalic", label: "Italic", keys: "Ctrl+I", category: "Formatting" },
  { action: "toggleCode", label: "Inline Code", keys: "Ctrl+`", category: "Formatting" },
  { action: "toggleStrikethrough", label: "Strikethrough", keys: "", category: "Formatting" },
  { action: "insertLink", label: "Insert Link", keys: "Ctrl+K", category: "Formatting" },
  { action: "insertImage", label: "Insert Image", keys: "", category: "Formatting" },
  { action: "insertHorizontalRule", label: "Horizontal Rule", keys: "", category: "Formatting" },
  { action: "insertCodeBlock", label: "Code Block", keys: "", category: "Formatting" },
  { action: "insertBlockquote", label: "Blockquote", keys: "", category: "Formatting" },
  { action: "insertTaskList", label: "Task List", keys: "", category: "Formatting" },
  { action: "insertTable", label: "Insert Table", keys: "", category: "Formatting" },

  // Sync
  { action: "gitSync", label: "Sync Now", keys: "Ctrl+Shift+G", category: "Sync" },

  // Daily notes
  { action: "dailyNote", label: "Open Daily Note", keys: "Ctrl+D", category: "Navigation" },

  // Outline
  { action: "toggleOutline", label: "Toggle Outline", keys: "Ctrl+Shift+O", category: "View" },

  // New features
  { action: "graphView", label: "Graph View", keys: "Ctrl+G", category: "View" },
  { action: "toggleBacklinks", label: "Toggle Backlinks", keys: "", category: "View" },
  { action: "toggleTags", label: "Toggle Tag Pane", keys: "", category: "View" },
  { action: "insertTemplate", label: "Insert Template", keys: "Ctrl+T", category: "Edit" },
  { action: "toggleBookmark", label: "Toggle Bookmark", keys: "Ctrl+Shift+B", category: "File" },
  { action: "randomNote", label: "Open Random Note", keys: "Ctrl+Shift+R", category: "Navigation" },
  { action: "noteComposer", label: "Note Composer", keys: "", category: "Edit" },
  { action: "fileRecovery", label: "File Recovery", keys: "", category: "File" },
  { action: "exportPDF", label: "Export as PDF", keys: "", category: "File" },
  { action: "audioRecorder", label: "Audio Recorder", keys: "", category: "Edit" },
  { action: "attachments", label: "Attachment Manager", keys: "", category: "Edit" },
  { action: "slidePresentation", label: "Start Presentation", keys: "", category: "View" },
  // Ecosystem
  { action: "pluginManager", label: "Plugin Manager", keys: "", category: "View" },
  { action: "cssSnippets", label: "CSS Snippets", keys: "", category: "View" },
  // New features
  { action: "calendarView", label: "Calendar View", keys: "", category: "View" },
  { action: "newBoard", label: "New Board", keys: "", category: "File" },
  { action: "insertDrawing", label: "New Drawing", keys: "", category: "Edit" },
  { action: "insertToc", label: "Insert Table of Contents", keys: "", category: "Edit" },
  { action: "updateToc", label: "Update Table of Contents", keys: "", category: "Edit" },
  { action: "insertDataview", label: "Insert Dataview Query", keys: "", category: "Edit" },
  { action: "focusMode", label: "Toggle Focus Mode", keys: "Ctrl+Shift+D", category: "View" },
  { action: "publishNote", label: "Publish Note as HTML", keys: "", category: "File" },
  { action: "flashcardReview", label: "Flashcard Review", keys: "", category: "Navigation" },
  { action: "startCollab", label: "Live Collaboration", keys: "", category: "Edit" },
  { action: "newCanvas", label: "New Canvas / Whiteboard", keys: "", category: "File" },
  // PDF
  { action: "openPdfViewer", label: "Open PDF", keys: "", category: "File" },
  { action: "exportPdfAnnotations", label: "Export PDF Annotations", keys: "", category: "File" },
  // Trash
  { action: "openTrash", label: "Open Trash", keys: "", category: "File" },
  // Tab pinning
  { action: "togglePinTab", label: "Pin/Unpin Tab", keys: "Ctrl+Shift+T", category: "File" },
  // Note history & lint
  { action: "noteHistory", label: "Note History", keys: "", category: "View" },
  { action: "toggleLint", label: "Toggle Lint Warnings", keys: "Ctrl+Shift+L", category: "View" },
  { action: "splitEditor", label: "Split Editor", keys: "Ctrl+\\", category: "View" },
  { action: "closeSplit", label: "Close Split", keys: "Ctrl+Shift+\\", category: "View" },
  { action: "vaultInsights", label: "Vault Insights", keys: "", category: "View" },
];

/**
 * Parse a key combo string like "Ctrl+Shift+F" and check if
 * a KeyboardEvent matches it.
 */
export function matchesHotkey(e: KeyboardEvent, keys: string): boolean {
  const parts = keys.toLowerCase().split("+").map((p) => p.trim());
  const needCtrl = parts.includes("ctrl") || parts.includes("cmd");
  const needShift = parts.includes("shift");
  const needAlt = parts.includes("alt");
  const key = parts.find(
    (p) => p !== "ctrl" && p !== "cmd" && p !== "shift" && p !== "alt"
  );
  if (!key) return false;

  const mod = e.metaKey || e.ctrlKey;
  if (needCtrl && !mod) return false;
  if (!needCtrl && mod) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;

  // Normalize the key
  const eventKey = e.key.toLowerCase();
  if (key === "tab") return eventKey === "tab";
  if (key === ",") return eventKey === ",";
  return eventKey === key;
}

/**
 * Format a key combo for display — replaces Ctrl with Cmd on macOS.
 */
export function formatHotkey(keys: string, platform: string): string {
  if (platform === "darwin") {
    return keys
      .replace(/Ctrl/g, "\u2318")
      .replace(/Shift/g, "\u21E7")
      .replace(/Alt/g, "\u2325")
      .replace(/\+/g, "");
  }
  return keys;
}

/**
 * Convert a KeyboardEvent to a key combo string.
 * Used when recording a new binding.
 */
export function eventToKeyString(e: KeyboardEvent): string | null {
  const key = e.key;
  // Ignore standalone modifier presses
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  // Normalize key name
  let keyName = key;
  if (key === " ") keyName = "Space";
  else if (key.length === 1) keyName = key.toUpperCase();
  else if (key === "ArrowUp") keyName = "Up";
  else if (key === "ArrowDown") keyName = "Down";
  else if (key === "ArrowLeft") keyName = "Left";
  else if (key === "ArrowRight") keyName = "Right";

  parts.push(keyName);
  return parts.join("+");
}

/** Merge saved bindings (partial) over defaults */
export function mergeHotkeys(
  saved: Partial<Record<HotkeyAction, string>>
): HotkeyBinding[] {
  return DEFAULT_HOTKEYS.map((def) => ({
    ...def,
    keys: saved[def.action] ?? def.keys,
  }));
}

/** Extract just the action→keys map for saving */
export function hotkeysToPersist(
  bindings: HotkeyBinding[]
): Partial<Record<HotkeyAction, string>> {
  const result: Partial<Record<HotkeyAction, string>> = {};
  for (const b of bindings) {
    const def = DEFAULT_HOTKEYS.find((d) => d.action === b.action);
    if (def && b.keys !== def.keys) {
      result[b.action] = b.keys;
    }
  }
  return result;
}
