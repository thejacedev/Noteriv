"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import TitleBar from "@/components/TitleBar";
import SetupWizard from "@/components/SetupWizard";
import DocumentTitle from "@/components/DocumentTitle";
import FormattingToolbar from "@/components/FormattingToolbar";
import SplitPane from "@/components/SplitPane";
import ContextMenu, { ContextMenuItem } from "@/components/ContextMenu";
import SettingsModal from "@/components/SettingsModal";
import QuickOpen from "@/components/QuickOpen";
import VaultSearch from "@/components/VaultSearch";
import CommandPalette from "@/components/CommandPalette";
import OutlinePanel from "@/components/OutlinePanel";
import BacklinksPanel from "@/components/BacklinksPanel";
import TagPane from "@/components/TagPane";
import TemplatePicker from "@/components/TemplatePicker";
import BookmarksPanel from "@/components/BookmarksPanel";
import PropertiesEditor from "@/components/PropertiesEditor";
import AllPropertiesPanel from "@/components/AllPropertiesPanel";
import WorkspacesModal from "@/components/WorkspacesModal";
import BaseView from "@/components/BaseView";
import { addText, freeNoteName, headingLine, linkWriteQuestion, type AppRequest } from "@/lib/app-requests";
import { fromVaultRelative, toVaultRelative } from "@/lib/vault-paths";
import ImportModal from "@/components/ImportModal";
import { NEW_BASE, isBaseFile } from "@/lib/bases-data";
import {
  EMPTY_LAYOUTS,
  fromStoredLayout,
  parseLayouts,
  putLayout,
  removeLayout,
  renameLayout,
  serializeLayouts,
  toStoredLayout,
  type Layout,
  type LayoutStore,
} from "@/lib/workspaces";
import { parsePropertyTypes, serializePropertyTypes, type PropertyType } from "@/lib/properties";
import { frontmatterLineCount, hasProperties } from "@/lib/frontmatter-block";
import NoteComposer from "@/components/NoteComposer";
import FileRecovery from "@/components/FileRecovery";
import AudioRecorder from "@/components/AudioRecorder";
import AttachmentManager from "@/components/AttachmentManager";
import PluginManagerModal from "@/components/PluginManager";
import CSSSnippets from "@/components/CSSSnippets";
import CalendarView from "@/components/CalendarView";
import DataviewBlock from "@/components/DataviewBlock";
import { isBoardContent, isBoardFile, createBoardContent } from "@/lib/board-utils";
import { isDrawingFile, generateDrawingName, createEmptyDrawing, serializeDrawing } from "@/lib/drawing-utils";
import { isPdfFile } from "@/lib/pdf-annotation";
import { isImageFile } from "@/lib/attachment-utils";
import PublishPreview from "@/components/PublishPreview";
import FlashcardReview from "@/components/FlashcardReview";
import CollabPanel from "@/components/CollabPanel";
import TrashPanel from "@/components/TrashPanel";
import NoteHistory from "@/components/NoteHistory";
import TimeScrubber from "@/components/TimeScrubber";
import LintPanel from "@/components/LintPanel";
import ConfirmDialogHost, { confirmDialog } from "@/components/ConfirmDialog";
import { trashFile, cleanupOldTrash } from "@/lib/trash-utils";
import { insertTocPlaceholder, generateTocBlock, updateTocBlocks, hasTocBlock } from "@/lib/toc-utils";
import { splitWikiTarget, findAnchorLine, findLinkedFile, findLinkedNote, linkKey, type WikiAnchor } from "@/lib/wiki-link-utils";
import { pdfPage } from "@/lib/embed-utils";
import { linkUpdateMessage, updateOpenNote } from "@/lib/link-updates";
import { linkPlace } from "@/lib/link-open";
import { noteContaining } from "@/lib/note-path";
import { countWords, plural } from "@/lib/text-stats";
import { newNoteFolder, nextTimestampName } from "@/lib/file-list";
import { setLinkPrefs, setVaultPrefs } from "@/lib/vault-prefs";
import FootnotesPanel from "@/components/FootnotesPanel";
import { findNoteByAlias, invalidateVaultIndex, loadVaultIndex } from "@/lib/vault-index";
import { unfoldAll } from "@codemirror/language";
import { foldAllHeadingsAndLists } from "@/lib/editor-extensions";
import { insertAtCursor } from "@/lib/editor-commands";
import {
  HotkeyBinding,
  HotkeyAction,
  DEFAULT_HOTKEYS,
  matchesHotkey,
  mergeHotkeys,
  hotkeysToPersist,
  EDITOR_NATIVE_ACTIONS,
  setActiveHotkeys,
} from "@/lib/hotkeys";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  mergeSettings,
  applySettings,
  formatCommitMessage,
} from "@/lib/settings";
import { autoSyncApplies, providerConfig } from "@/lib/sync-providers";
import { addConflicts, conflictsFor, dismissConflicts, removeConflictCopy, splitPath, type SyncConflict } from "@/lib/sync-conflicts";
import SyncConflictNotice from "@/components/SyncConflictNotice";
import {
  wrapSelection,
  insertLink as editorInsertLink,
  insertImage as editorInsertImage,
  insertHorizontalRule as editorInsertHR,
  insertCodeBlock as editorInsertCodeBlock,
  insertBlockquote as editorInsertBlockquote,
  insertTaskList as editorInsertTaskList,
  insertTable as editorInsertTable,
} from "@/lib/editor-commands";
import {
  EMPTY_BOOKMARKS,
  parseBookmarks,
  removeBookmarkPaths,
  renameBookmarkPaths,
  serializeBookmarks,
  toggleBookmarkItem,
  type Bookmark,
  type BookmarkStore,
} from "@/lib/bookmarks";
import { getRandomNote } from "@/lib/random-note";
import { exportToPDF } from "@/lib/pdf-export";
import { saveSnapshot } from "@/lib/file-recovery";
import { PluginManager, type PluginInstance, type PluginCommand, type StatusBarItem, type SidebarPanel, type SettingsTab } from "@/lib/plugin-api";
import PluginSidebarPanel, { PluginPanelIcon } from "@/components/PluginSidebarPanel";
import { BUILT_IN_THEMES, applyTheme, loadCustomThemes } from "@/lib/theme-utils";
import { loadSnippets, refreshSnippets, type CSSSnippet } from "@/lib/css-snippets";
import { hashContent } from "@/lib/knowledge/knowledge-service";
import { relativePathFromVault } from "@/lib/knowledge/path-safety";
import type { KnowledgeSourcePreset } from "@/components/KnowledgeIngest";
import type { EditorView } from "@codemirror/view";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });
// The pop-out holds an editor, which cannot be loaded where there is no page to draw on.
const PopoutNote = dynamic(() => import("@/components/PopoutNote"), { ssr: false });
const WebViewer = dynamic(() => import("@/components/WebViewer"), { ssr: false });
const SourceEditor = dynamic(() => import("@/components/SourceEditor"), { ssr: false });
const ReadOnlyView = dynamic(() => import("@/components/ReadOnlyView"), { ssr: false });
const GraphView = dynamic(() => import("@/components/GraphView"), { ssr: false });
const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });
const ImageViewer = dynamic(() => import("@/components/ImageViewer"), { ssr: false });
const SlidePresentation = dynamic(() => import("@/components/SlidePresentation"), { ssr: false });
const BoardView = dynamic(() => import("@/components/BoardView"), { ssr: false });
const DrawingEditor = dynamic(() => import("@/components/DrawingEditor"), { ssr: false });
const PDFViewer = dynamic(() => import("@/components/PDFViewer"), { ssr: false });
const VaultInsights = dynamic(() => import("@/components/VaultInsights"), { ssr: false });
const KnowledgeIngest = dynamic(() => import("@/components/KnowledgeIngest"), { ssr: false });

type ViewMode = "live" | "source" | "view";
type AppState = "loading" | "setup" | "app";

interface TabState {
  filePath: string;
  content: string;
  savedContent: string;
  // Non-markdown tabs render a dedicated view instead of the text editor.
  // Absent = a normal markdown note.
  kind?: "canvas" | "drawing" | "pdf" | "image" | "base";
  externalConflict?: boolean;
}

function pathIdentity(filePath: string, platform: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return platform === "win32" ? normalized.toLocaleLowerCase() : normalized;
}

async function writeTabGuarded(tab: TabState, content: string) {
  const baseHash = await hashContent(tab.savedContent);
  return window.electronAPI.writeFileGuarded(tab.filePath, content, baseHash);
}

function isTabDirty(tab: TabState): boolean {
  return tab.content !== tab.savedContent;
}

// Closing a tab drops its unsaved edits, so check with the user first.
function confirmDiscardUnsaved(closing: TabState[]): Promise<boolean> {
  const dirty = closing.filter(isTabDirty);
  if (dirty.length === 0) return Promise.resolve(true);
  const name = (tab: TabState) => tab.filePath.split(/[\\/]/).pop() || tab.filePath;
  return confirmDialog(dirty.length === 1
    ? {
        title: `Close "${name(dirty[0])}" without saving?`,
        message: "Your unsaved changes will be lost.",
        confirmLabel: "Discard Changes",
        danger: true,
      }
    : {
        title: `Close ${dirty.length} tabs without saving?`,
        message: `Unsaved changes in ${dirty.map(name).join(", ")} will be lost.`,
        confirmLabel: "Discard Changes",
        danger: true,
      });
}

const neverChanges = () => () => {};

/**
 * The page is the whole app in the main window, and one note in a pop-out
 * window. Which it is cannot be known until the page is running, so nothing
 * is drawn before then.
 */
export default function Page() {
  const popout = useSyncExternalStore<string | null | undefined>(
    neverChanges,
    () => window.__NOTERIV_POPOUT__?.path ?? null,
    () => undefined
  );
  if (popout === undefined) return null;
  return popout ? <PopoutNote initialPath={popout} /> : <Home />;
}

function Home() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  // Vault
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [activeVault, setActiveVault] = useState<Vault | null>(null);

  // Tabs
  const [tabs, setTabs] = useState<TabState[]>([]);
  const tabsRef = useRef<TabState[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // Split editor
  const [splitTab, setSplitTab] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);

  // UI
  const [viewMode, setViewMode] = useState<ViewMode>("live");
  const [fileViewModes, setFileViewModes] = useState<Record<string, ViewMode>>({});
  const [editorContextMenu, setEditorContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
    noteSource: KnowledgeSourcePreset | null;
    selectionSource: KnowledgeSourcePreset | null;
  } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [fileOrder, setFileOrder] = useState<Record<string, string[]>>({});
  const [platform, setPlatform] = useState("linux");

  // Zen mode
  const [zenMode, setZenMode] = useState(false);

  // Modals / overlays
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [showVaultSearch, setShowVaultSearch] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showFootnotes, setShowFootnotes] = useState(false);
  // A file the file list should scroll to.
  const [revealFile, setRevealFile] = useState<{ path: string; tick: number } | null>(null);
  const [showGraphView, setShowGraphView] = useState(false);
  // A page a link asked a PDF to open at.
  const [pdfPageRequest, setPdfPageRequest] = useState<{ filePath: string; page: number; tick: number } | null>(null);
  // Whether the graph opens on the current note's neighbourhood.
  const [graphStartsLocal, setGraphStartsLocal] = useState(false);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [showTagPane, setShowTagPane] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [showFileRecovery, setShowFileRecovery] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showSlidePresentation, setShowSlidePresentation] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkStore>(EMPTY_BOOKMARKS);
  // The vault whose bookmarks are loaded: nothing is written back before then.
  const bookmarksLoadedFor = useRef<string | null>(null);
  // The bookmarks file as it is on disk (null when there is none yet).
  const bookmarksOnDisk = useRef<string | null>(null);
  // A search to open the search panel with, from a bookmarked search.
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  // The types the vault has given its properties, from .noteriv/types.json.
  const [propertyTypes, setPropertyTypes] = useState<Record<string, PropertyType>>({});
  const propertyTypesLoadedFor = useRef<string | null>(null);
  // Counts the runs of the Add Property command; the note it was last run on shows the editor even when empty.
  const [addPropertyRequest, setAddPropertyRequest] = useState(0);
  const [addPropertyFor, setAddPropertyFor] = useState<string | null>(null);
  const [showAllProperties, setShowAllProperties] = useState(false);
  // Saved layouts ("workspaces") of the vault, from .noteriv/workspaces.json.
  const [layoutStore, setLayoutStore] = useState<LayoutStore>(EMPTY_LAYOUTS);
  const layoutsLoadedFor = useRef<string | null>(null);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // Counts up when the vault's own settings files may have changed on disk, so they are read again.
  const [vaultFilesTick, setVaultFilesTick] = useState(0);

  // Ecosystem
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showCSSSnippets, setShowCSSSnippets] = useState(false);

  // New features
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showCollab, setShowCollab] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [pinnedTabs, setPinnedTabs] = useState<Set<string>>(new Set());
  const [showNoteHistory, setShowNoteHistory] = useState(false);
  const [showTimeScrubber, setShowTimeScrubber] = useState(false);
  const [showLintPanel, setShowLintPanel] = useState(false);
  const [showVaultInsights, setShowVaultInsights] = useState(false);
  const [showKnowledgeIngest, setShowKnowledgeIngest] = useState(false);
  const [knowledgeSource, setKnowledgeSource] = useState<KnowledgeSourcePreset | null>(null);
  const [recentCommands, setRecentCommands] = useState<HotkeyAction[]>([]);
  const [pluginInstances, setPluginInstances] = useState<PluginInstance[]>([]);
  const [cssSnippets, setCSSSnippets] = useState<CSSSnippet[]>([]);
  // UI registered by plugins, refreshed whenever a plugin adds or removes some
  const [pluginUI, setPluginUI] = useState<{
    commands: PluginCommand[];
    statusBarItems: StatusBarItem[];
    sidebarPanels: SidebarPanel[];
    settingsTabs: SettingsTab[];
  }>({ commands: [], statusBarItems: [], sidebarPanels: [], settingsTabs: [] });
  const [openPluginPanels, setOpenPluginPanels] = useState<string[]>([]);
  const pluginManagerRef = useRef<PluginManager | null>(null);

  // Editor view ref (for formatting commands)
  const editorViewRef = useRef<EditorView | null>(null);
  const splitEditorViewRef = useRef<EditorView | null>(null);
  // The read-only view gets its own ref: formatting commands write through
  // editorViewRef and must never reach it.
  const readViewRef = useRef<EditorView | null>(null);
  // A wiki link to a heading or block, waiting for its note to be on screen.
  const pendingJumpRef = useRef<{
    filePath: string;
    /** A heading or block to find, or a line number already known. */
    anchor?: WikiAnchor;
    line?: number;
    expires: number;
    appliedTo?: EditorView;
  } | null>(null);
  const [jumpTick, setJumpTick] = useState(0);
  const contentRef = useRef<string>("");
  const activeTabRef = useRef<string | null>(null);

  // Sync status
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  // A short message in the status bar, such as how many links a rename updated.
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const statusNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showStatusNote = useCallback((message: string) => {
    if (statusNoteTimerRef.current) clearTimeout(statusNoteTimerRef.current);
    setStatusNote(message);
    statusNoteTimerRef.current = setTimeout(() => setStatusNote(null), 8000);
  }, []);
  // Notes that sync kept two versions of, until the notice is dismissed.
  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>([]);
  const [gitChanges, setGitChanges] = useState(0);
  const syncInFlightRef = useRef(false);

  // Hotkeys
  const [hotkeys, setHotkeys] = useState<HotkeyBinding[]>(DEFAULT_HOTKEYS.map((d) => ({ ...d })));

  // App settings
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS });

  // Timers
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workspaceSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  const manualSidebarCollapsedRef = useRef(sidebarCollapsed);
  const responsiveSidebarRef = useRef(false);
  const fontSizeSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    sidebarCollapsedRef.current = sidebarCollapsed;
  }, [sidebarCollapsed]);

  useEffect(() => () => {
    if (fontSizeSaveRef.current) clearTimeout(fontSizeSaveRef.current);
  }, []);

  // Current tab helpers
  const currentTab = tabs.find((t) => t.filePath === activeTab) || null;
  // Dedicated views are driven by the active tab's kind, so they live in the
  // tab strip and own the title bar / export the same way notes do.
  const drawingFile = currentTab?.kind === "drawing" ? currentTab.filePath : null;
  const pdfFile = currentTab?.kind === "pdf" ? currentTab.filePath : null;
  const content = currentTab?.content || "";
  const isDirty = currentTab ? currentTab.content !== currentTab.savedContent : false;

  useEffect(() => {
    const title = activeTab ? `${activeTab} - Noteriv` : activeVault ? `${activeVault.path} - Noteriv` : "Noteriv";
    document.title = title;
    window.electronAPI?.windowSetTitle(title);
  }, [activeTab, activeVault]);

  const handleToggleSidebar = useCallback(() => {
    responsiveSidebarRef.current = false;
    const collapsed = !sidebarCollapsedRef.current;
    manualSidebarCollapsedRef.current = collapsed;
    sidebarCollapsedRef.current = collapsed;
    setSidebarCollapsed(collapsed);
  }, []);

  useEffect(() => {
    if (appState !== "app") return;

    const updateResponsiveSidebar = () => {
      if (!settings.autoCollapseSidebar) {
        if (responsiveSidebarRef.current) {
          responsiveSidebarRef.current = false;
          sidebarCollapsedRef.current = manualSidebarCollapsedRef.current;
          setSidebarCollapsed(manualSidebarCollapsedRef.current);
        }
        return;
      }

      if (window.innerWidth < settings.sidebarCollapseWidth) {
        if (!sidebarCollapsedRef.current) {
          responsiveSidebarRef.current = true;
          sidebarCollapsedRef.current = true;
          setSidebarCollapsed(true);
        }
      } else if (responsiveSidebarRef.current) {
        responsiveSidebarRef.current = false;
        sidebarCollapsedRef.current = manualSidebarCollapsedRef.current;
        setSidebarCollapsed(manualSidebarCollapsedRef.current);
      }
    };

    updateResponsiveSidebar();
    window.addEventListener("resize", updateResponsiveSidebar);
    return () => window.removeEventListener("resize", updateResponsiveSidebar);
  }, [appState, settings.autoCollapseSidebar, settings.sidebarCollapseWidth]);

  // Apply per-file view mode when switching tabs
  useEffect(() => {
    if (activeTab && fileViewModes[activeTab]) {
      setViewMode(fileViewModes[activeTab]);
    }
  }, [activeTab]);

  // Split tab helpers
  const splitTabState = splitTab ? tabs.find((t) => t.filePath === splitTab) || null : null;
  const splitContent = splitTabState?.content || "";

  useEffect(() => {
    contentRef.current = content;
    activeTabRef.current = activeTab;
  });

  // The web page reader: the address it shows ("" while it waits for one)
  // and the tab it was opened over. It shows only while that tab is in
  // front, so choosing another tab puts the notes back.
  const [webReader, setWebReader] = useState<{ url: string; tab: string | null } | null>(null);
  const webReaderUrl = webReader && webReader.tab === activeTab ? webReader.url : null;
  const setWebReaderUrl = useCallback((url: string | null) => {
    setWebReader(url === null ? null : { url, tab: activeTabRef.current });
  }, []);
  const openLinksInReaderRef = useRef(false);

  const tabInfos = tabs.map((t) => ({
    filePath: t.filePath,
    name: (t.filePath.split("/").pop()?.split("\\").pop() || "Untitled").replace(/\.(md|markdown)$/i, ""),
    isDirty: t.content !== t.savedContent,
  }));

  // ============================================================
  // Workspace persistence
  // ============================================================

  const saveWorkspace = useCallback(async () => {
    if (!window.electronAPI || !activeVault) return;
    const state: WorkspaceState = {
      openTabs: tabs.map((t) => t.filePath),
      activeTab,
      expandedFolders,
      sidebarCollapsed: manualSidebarCollapsedRef.current,
      sidebarWidth,
      viewMode,
      fileOrder,
      fileViewModes,
      pinnedTabs: Array.from(pinnedTabs),
    };
    await window.electronAPI.saveWorkspace(activeVault.path, state);
  }, [activeVault, tabs, activeTab, expandedFolders, sidebarCollapsed, sidebarWidth, viewMode, fileOrder, fileViewModes, pinnedTabs]);

  // Debounced workspace save
  const debounceSaveWorkspace = useCallback(() => {
    if (workspaceSaveRef.current) clearTimeout(workspaceSaveRef.current);
    workspaceSaveRef.current = setTimeout(saveWorkspace, 1000);
  }, [saveWorkspace]);

  // Save workspace when state changes
  useEffect(() => {
    if (appState === "app") debounceSaveWorkspace();
  }, [appState, tabs.length, activeTab, expandedFolders, sidebarCollapsed, sidebarWidth, viewMode, fileOrder, fileViewModes, pinnedTabs, debounceSaveWorkspace]);

  /** Open tabs for a list of files, reading the notes among them. A file that is gone is left out. */
  const readTabs = useCallback(async (paths: string[]): Promise<TabState[]> => {
    const restored: TabState[] = [];
    for (const filePath of paths) {
      // Dedicated-view tabs (canvas/drawing/pdf) carry no text content; they
      // load their own files. Restore them by kind, not by reading as markdown.
      let kind: TabState["kind"];
      if (isDrawingFile(filePath)) kind = "drawing";
      else if (filePath.endsWith(".canvas")) kind = "canvas";
      else if (isPdfFile(filePath)) kind = "pdf";
      else if (isImageFile(filePath)) kind = "image";
      else if (isBaseFile(filePath)) kind = "base";
      if (kind) {
        restored.push({ filePath, content: "", savedContent: "", kind });
        continue;
      }
      const fileContent = await window.electronAPI.readFile(filePath);
      if (fileContent !== null) {
        restored.push({ filePath, content: fileContent, savedContent: fileContent });
      }
    }
    return restored;
  }, []);

  const loadWorkspace = useCallback(async (vault: Vault) => {
    if (!window.electronAPI) return;
    const ws = await window.electronAPI.loadWorkspace(vault.path);
    if (!ws) return;

    // Restore UI state
    const restoredSidebarCollapsed = ws.sidebarCollapsed ?? false;
    manualSidebarCollapsedRef.current = restoredSidebarCollapsed;
    sidebarCollapsedRef.current = restoredSidebarCollapsed;
    responsiveSidebarRef.current = false;
    setSidebarCollapsed(restoredSidebarCollapsed);
    setSidebarWidth(Math.max(180, Math.min(520, ws.sidebarWidth ?? 250)));
    setViewMode(ws.viewMode ?? "live");
    setExpandedFolders(ws.expandedFolders ?? []);
    setFileOrder(ws.fileOrder ?? {});
    setFileViewModes(ws.fileViewModes ?? {});
    setPinnedTabs(new Set(ws.pinnedTabs ?? []));

    // Restore tabs
    const restoredTabs = await readTabs(ws.openTabs || []);
    setTabs(restoredTabs);
    setActiveTab(ws.activeTab && restoredTabs.some((t) => t.filePath === ws.activeTab) ? ws.activeTab : restoredTabs[0]?.filePath || null);
  }, [readTabs]);

  // ============================================================
  // Initialization
  // ============================================================

  useEffect(() => {
    async function init() {
      if (!window.electronAPI) { setAppState("setup"); return; }

      // Load recent commands from localStorage
      try {
        const saved = localStorage.getItem("noteriv-recent-commands");
        if (saved) setRecentCommands(JSON.parse(saved));
      } catch {}

      // Load platform
      window.electronAPI.getPlatform().then(setPlatform);

      // Load saved settings
      let merged = DEFAULT_SETTINGS;
      try {
        const saved = await window.electronAPI.loadSettings();
        if (saved.hotkeys) {
          setHotkeys(mergeHotkeys(saved.hotkeys));
        }
        merged = mergeSettings(saved);
        setSettings(merged);
        applySettings(merged);
        // Apply theme
        if (merged.theme) {
          const allBuiltIn = BUILT_IN_THEMES;
          const theme = allBuiltIn.find((t) => t.id === merged.theme);
          if (theme) applyTheme(theme);
        }
      } catch {}

      const setupDone = await window.electronAPI.isSetupComplete();
      if (!setupDone) { setAppState("setup"); return; }

      const allVaults = await window.electronAPI.getVaults();
      setVaults(allVaults);

      const active = await window.electronAPI.getActiveVault();
      const vault = active || (allVaults.length > 0 ? await window.electronAPI.setActiveVault(allVaults[0].id) : null);

      if (vault) {
        setActiveVault(vault);

        // Pull on open if enabled
        if (vault.gitRemote && merged.pullOnOpen) {
          try {
            await window.electronAPI.gitPull(vault.path, vault.id);
          } catch (err) {
            const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "Pull failed";
            console.warn("[sync] pull on open:", msg);
            setSyncError(msg);
            setSyncStatus("error");
          }
        }

        await loadWorkspace(vault);

        // Fetch initial git status
        if (vault.gitRemote) {
          try {
            const status = await window.electronAPI.gitStatus(vault.path);
            setGitChanges(status.changes);
          } catch {}
        }

        // Auto-cleanup old trash (>30 days)
        try { await cleanupOldTrash(vault.path, 30); } catch {}

        // Load CSS snippets
        try {
          const snips = await loadSnippets(vault.path);
          setCSSSnippets(snips);
          refreshSnippets(snips);
        } catch {}

        // Initialize plugin manager
        try {
          const pm = new PluginManager(vault.path, () => {
            const view = editorViewRef.current;
            return {
              content: contentRef.current,
              currentFile: activeTabRef.current,
              insertAtCursor: (text: string) => {
                if (!view) return;
                const pos = view.state.selection.main.head;
                view.dispatch({ changes: { from: pos, insert: text } });
              },
              getSelection: () => {
                if (!view) return "";
                return view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
              },
              replaceSelection: (text: string) => {
                if (!view) return;
                view.dispatch(view.state.replaceSelection(text));
              },
              getCursorPosition: () => {
                if (!view) return { line: 0, ch: 0 };
                const pos = view.state.selection.main.head;
                const line = view.state.doc.lineAt(pos);
                return { line: line.number, ch: pos - line.from };
              },
              setContent: (newContent: string) => {
                if (!view) return;
                view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: newContent } });
              },
            };
          });
          pm.setUIChangeHandler(() =>
            setPluginUI({
              commands: pm.getCommands(),
              statusBarItems: pm.getStatusBarItems(),
              sidebarPanels: pm.getSidebarPanels(),
              settingsTabs: pm.getSettingsTabs(),
            })
          );
          pluginManagerRef.current = pm;
          await pm.loadAllEnabled();
          setPluginInstances(pm.getPlugins());
        } catch {}

        // Load custom themes and apply if active theme is custom
        try {
          const customs = await loadCustomThemes(vault.path);
          if (merged.theme) {
            const allBuiltIn = BUILT_IN_THEMES;
            const isBuiltIn = allBuiltIn.some((t) => t.id === merged.theme);
            if (!isBuiltIn) {
              const custom = customs.find((t) => t.id === merged.theme);
              if (custom) applyTheme(custom);
            }
          }
        } catch {}

        setAppState("app");
      } else {
        setAppState("setup");
      }
    }
    init();
  }, [loadWorkspace]);

  // ============================================================
  // Re-apply theme & snippets after app is ready
  // (guards against Next.js hydration clearing injected styles)
  // ============================================================

  useEffect(() => {
    if (appState !== "app") return;
    // Re-apply theme
    if (settings.theme) {
      const builtIn = BUILT_IN_THEMES.find((t) => t.id === settings.theme);
      if (builtIn) {
        applyTheme(builtIn);
      } else if (activeVault) {
        loadCustomThemes(activeVault.path).then((customs) => {
          const custom = customs.find((t) => t.id === settings.theme);
          if (custom) applyTheme(custom);
        });
      }
    }
    // Re-apply CSS snippets
    if (cssSnippets.length > 0) {
      refreshSnippets(cssSnippets);
    }
    // Re-load enabled plugins
    const pm = pluginManagerRef.current;
    if (pm) {
      pm.loadAllEnabled().then(() => {
        setPluginInstances(pm.getPlugins());
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState]);

  // ============================================================
  // Auto-save every 30s
  // ============================================================

  useEffect(() => {
    if (appState !== "app" || showKnowledgeIngest || settings.autoSaveInterval <= 0) return;
    autoSaveRef.current = setInterval(async () => {
      if (!window.electronAPI) return;
      for (const tab of tabs) {
        if (tab.content !== tab.savedContent && !tab.externalConflict) {
          const result = await writeTabGuarded(tab, tab.content);
          if (result.status === "written") {
            setTabs((prev) =>
              prev.map((t) =>
                t.filePath === tab.filePath
                  ? { ...t, savedContent: tab.content, externalConflict: false }
                  : t
              )
            );
          } else if (result.status === "conflict") {
            // Only if the tab still has the base this write was checked
            // against: a rename may have rewritten the note's links, and the
            // tab's base with them, while the write was on its way.
            setTabs((prev) => prev.map((t) =>
              t.filePath === tab.filePath && t.savedContent === tab.savedContent
                ? { ...t, externalConflict: true }
                : t
            ));
          }
        }
      }
    }, settings.autoSaveInterval * 1000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [appState, showKnowledgeIngest, tabs, settings.autoSaveInterval]);

  // ============================================================
  // Board auto-save (every 5s for .board.md files)
  // ============================================================

  useEffect(() => {
    if (appState !== "app" || showKnowledgeIngest) return;
    const interval = setInterval(async () => {
      if (!window.electronAPI) return;
      for (const tab of tabs) {
        if (tab.content !== tab.savedContent && !tab.externalConflict && (isBoardFile(tab.filePath) || isBoardContent(tab.content))) {
          const result = await writeTabGuarded(tab, tab.content);
          if (result.status === "written") {
            setTabs((prev) =>
              prev.map((t) =>
                t.filePath === tab.filePath
                  ? { ...t, savedContent: tab.content, externalConflict: false }
                  : t
              )
            );
          } else if (result.status === "conflict") {
            // Only if the tab still has the base this write was checked
            // against: a rename may have rewritten the note's links, and the
            // tab's base with them, while the write was on its way.
            setTabs((prev) => prev.map((t) =>
              t.filePath === tab.filePath && t.savedContent === tab.savedContent
                ? { ...t, externalConflict: true }
                : t
            ));
          }
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [appState, showKnowledgeIngest, tabs]);

  // ============================================================
  // Vault file watcher — react to external changes (e.g. MCP server)
  // ============================================================

  useEffect(() => {
    if (appState !== "app" || !window.electronAPI?.onVaultChanged) return;
    const unsub = window.electronAPI.onVaultChanged((changedPath: string) => {
      invalidateVaultIndex();
      setSidebarRefresh((n) => n + 1);
      setTabs((prev) => {
        const changedIdentity = pathIdentity(changedPath, platform);
        const tab = prev.find((t) => pathIdentity(t.filePath, platform) === changedIdentity);
        if (!tab) return prev;
        (async () => {
          const newContent = await window.electronAPI.readFile(changedPath);
          if (newContent !== null) {
            setTabs((tabs) =>
              tabs.map((t) => {
                if (pathIdentity(t.filePath, platform) !== changedIdentity) return t;
                // The file holds what the tab was last saved as or loaded
                // from: nothing outside changed it. This is the case after a
                // rename has rewritten the note's links and the tab with them.
                if (newContent === t.savedContent) return t;
                // Preserve a local edit that arrived after an external write began.
                return t.content === t.savedContent
                  ? { ...t, content: newContent, savedContent: newContent, externalConflict: false }
                  : { ...t, externalConflict: true };
              })
            );
          }
        })();
        return prev;
      });
    });
    return unsub;
  }, [appState, platform]);

  // ============================================================
  // Git sync
  // ============================================================

  const performSync = useCallback(async (message?: string) => {
    if (!window.electronAPI || !activeVault || showKnowledgeIngest) return;
    // A slow or unreachable remote can take a minute to fail; don't stack syncs.
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncStatus("syncing");
    try {
      await saveWorkspace();

      // Git sync (if configured)
      if (activeVault.gitRemote) {
        const msg = message || formatCommitMessage(settings.commitMessageFormat);
        await window.electronAPI.gitSync(activeVault.path, msg, activeVault.id);
      }

      // Extra sync provider (folder, webdav, s3)
      if (settings.extraSyncProvider !== "none") {
        const config = providerConfig(settings);
        if (config) {
          const vaultPath = activeVault.path;
          const result = await window.electronAPI.syncProviderSync(
            vaultPath,
            settings.extraSyncProvider,
            config
          );
          // Before anything else can fail: these conflicts are resolved on
          // disk now, so no later run will report them again.
          setSyncConflicts((prev) => addConflicts(prev, vaultPath, result?.conflictCopies));
          // Bookmarks, property types and layouts may have arrived from another device.
          if (settings.syncFilter.settings && (result?.pulled ?? 0) > 0) setVaultFilesTick((t) => t + 1);
          // Some files could not be synced. The status bar shows it as before.
          if (result?.error) throw new Error(result.error);
        }
      }

      setLastSyncTime(new Date());
      setSyncStatus("idle");
      setSyncError(null);
      // Refresh change count
      if (activeVault.gitRemote) {
        const status = await window.electronAPI.gitStatus(activeVault.path);
        setGitChanges(status.changes);
      }
    } catch (err) {
      // Keep the failure visible until a sync succeeds; the status bar
      // tooltip carries git's message so a bad URL or token can be diagnosed.
      const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "Sync failed";
      console.warn("[sync]", msg);
      setSyncError(msg);
      setSyncStatus("error");
    } finally {
      syncInFlightRef.current = false;
    }
  }, [activeVault, saveWorkspace, settings.commitMessageFormat, settings.extraSyncProvider, settings.folderSync, settings.webdavSync, settings.syncFilter, showKnowledgeIngest]);

  const handleGitSync = performSync;

  // performSync is recreated whenever the open tabs change, so the timers
  // below call it through a ref; otherwise every keystroke would restart them.
  const performSyncRef = useRef(performSync);
  useEffect(() => { performSyncRef.current = performSync; });

  // ============================================================
  // Auto-sync on the interval set in Settings → Sync (minutes, 0 = off)
  // ============================================================

  const syncVaultPath = activeVault?.path;
  const syncGitRemote = activeVault?.gitRemote;
  useEffect(() => {
    const minutes = settings.gitSyncInterval;
    const hasGit = Boolean(syncGitRemote);
    const hasExtra = settings.extraSyncProvider !== "none";
    if (appState !== "app" || showKnowledgeIngest || !syncVaultPath || minutes <= 0) return;
    if (!autoSyncApplies(syncGitRemote, settings.extraSyncProvider)) return;
    const vaultPath = syncVaultPath;
    const interval = setInterval(async () => {
      if (!window.electronAPI) return;
      let gitReady = false;
      if (hasGit) {
        try {
          const status = await window.electronAPI.gitStatus(vaultPath);
          setGitChanges(status.changes);
          gitReady = status.isRepo && Boolean(status.remote);
        } catch {}
      }
      // A folder or WebDAV provider syncs on the timer whether or not Git is set up.
      if (gitReady || hasExtra) performSyncRef.current();
    }, minutes * 60_000);
    return () => clearInterval(interval);
  }, [appState, syncVaultPath, syncGitRemote, settings.gitSyncInterval, settings.extraSyncProvider, showKnowledgeIngest]);

  // Keep the status bar's change count current between syncs. Local only:
  // `git status` doesn't touch the network.
  useEffect(() => {
    if (appState !== "app" || !activeVault?.gitRemote) return;
    const vaultPath = activeVault.path;
    const interval = setInterval(async () => {
      if (!window.electronAPI) return;
      try {
        const status = await window.electronAPI.gitStatus(vaultPath);
        setGitChanges(status.changes);
      } catch {}
    }, 30_000);
    return () => clearInterval(interval);
  }, [appState, activeVault?.path, activeVault?.gitRemote]);

  // ============================================================
  // Vault operations
  // ============================================================

  const saveDirtyTabs = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI) return false;
    const dirtyTabs = tabs.filter((tab) => !tab.kind && tab.content !== tab.savedContent);
    const savedContents = new Map<string, string>();
    for (const tab of dirtyTabs) {
      if (tab.externalConflict) {
        const overwrite = window.confirm(`The note changed on disk after it was opened:\n\n${tab.filePath}\n\nOverwrite the external version with your unsaved editor content?`);
        if (!overwrite || !await window.electronAPI.writeFile(tab.filePath, tab.content)) return false;
      } else {
        const result = await writeTabGuarded(tab, tab.content);
        if (result.status !== "written") {
          if (result.status === "conflict") {
            setTabs((current) => current.map((item) =>
              item.filePath === tab.filePath ? { ...item, externalConflict: true } : item
            ));
          }
          return false;
        }
      }
      savedContents.set(tab.filePath, tab.content);
    }
    if (dirtyTabs.length > 0) {
      setTabs((current) => current.map((tab) =>
        savedContents.has(tab.filePath)
          ? { ...tab, savedContent: savedContents.get(tab.filePath)!, externalConflict: false }
          : tab
      ));
    }
    return true;
  }, [tabs]);

  const handleSetupComplete = useCallback(async (vault: Vault) => {
    setActiveVault(vault);
    if (window.electronAPI) setVaults(await window.electronAPI.getVaults());
    setShowSetupWizard(false);
    setTabs([]);
    setActiveTab(null);
    setAppState("app");
  }, []);

  const handleSwitchVault = useCallback(async (id: string): Promise<boolean> => {
    if (!window.electronAPI) return false;
    if (!await saveDirtyTabs()) return false;
    // Save current workspace first
    await saveWorkspace();
    const vault = await window.electronAPI.setActiveVault(id);
    if (vault) {
      setActiveVault(vault);
      setTabs([]);
      setActiveTab(null);
      await loadWorkspace(vault);
      return true;
    }
    return false;
  }, [saveDirtyTabs, saveWorkspace, loadWorkspace]);

  const handleOpenFolderAsVault = useCallback(async () => {
    if (!window.electronAPI) return;
    const folder = await window.electronAPI.openFolder();
    if (!folder) return;

    const normalize = (value: string) => value.replace(/[\\/]+$/, "").toLowerCase();
    const existing = vaults.find((vault) => normalize(vault.path) === normalize(folder));
    if (existing) {
      await handleSwitchVault(existing.id);
      return;
    }

    if (!await saveDirtyTabs()) return;
    await saveWorkspace();
    const name = folder.split(/[\\/]/).filter(Boolean).pop() || "Vault";
    const created = await window.electronAPI.createVault({ name, vaultPath: folder });
    const active = await window.electronAPI.setActiveVault(created.id) || created;
    setVaults(await window.electronAPI.getVaults());
    setActiveVault(active);
    setTabs([]);
    setActiveTab(null);
    setExpandedFolders([]);
    setFileOrder({});
    setFileViewModes({});
    setPinnedTabs(new Set());
    setViewMode("live");
    setSidebarWidth(250);
    manualSidebarCollapsedRef.current = false;
    sidebarCollapsedRef.current = false;
    setSidebarCollapsed(false);
    setSidebarRefresh((value) => value + 1);
    setAppState("app");
    await loadWorkspace(active);
  }, [vaults, handleSwitchVault, saveDirtyTabs, saveWorkspace, loadWorkspace]);

  const handleDeleteVault = useCallback(async (id: string) => {
    if (!window.electronAPI) return;
    await window.electronAPI.deleteVault(id);
    const allVaults = await window.electronAPI.getVaults();
    setVaults(allVaults);
    if (activeVault?.id === id) {
      if (allVaults.length > 0) {
        const vault = await window.electronAPI.setActiveVault(allVaults[0].id);
        if (vault) { setActiveVault(vault); await loadWorkspace(vault); }
      } else {
        setActiveVault(null);
        setAppState("setup");
      }
    }
  }, [activeVault, loadWorkspace]);

  // ============================================================
  // Tab / editor operations
  // ============================================================

  const openingFilesRef = useRef(new Set<string>());

  const openFile = useCallback(async (filePath: string) => {
    // Canvas / drawing / PDF open as dedicated-view tabs (no text content;
    // each view manages its own file I/O). This makes them first-class tabs:
    // they show in the tab strip, own the title bar, and gate the export action.
    let kind: TabState["kind"];
    if (isDrawingFile(filePath)) kind = "drawing";
    else if (filePath.endsWith(".canvas")) kind = "canvas";
    else if (isPdfFile(filePath)) kind = "pdf";
    else if (isImageFile(filePath)) kind = "image";
    else if (isBaseFile(filePath)) kind = "base";

    if (kind) {
      setTabs((prev) =>
        prev.some((t) => t.filePath === filePath)
          ? prev
          : [...prev, { filePath, content: "", savedContent: "", kind }]
      );
      setActiveTab(filePath);
      return;
    }

    // Already being opened — block duplicate calls
    if (openingFilesRef.current.has(filePath)) {
      setActiveTab(filePath);
      return;
    }

    // Check current tabs via functional updater (always up to date)
    let found = false;
    setTabs((prev) => {
      found = prev.some((t) => t.filePath === filePath);
      return prev;
    });
    if (found) {
      setActiveTab(filePath);
      return;
    }

    openingFilesRef.current.add(filePath);
    try {
      if (!window.electronAPI) return;
      const fileContent = await window.electronAPI.readFile(filePath);
      if (fileContent === null) return;

      setTabs((prev) => {
        if (prev.some((t) => t.filePath === filePath)) return prev;
        return [...prev, { filePath, content: fileContent, savedContent: fileContent }];
      });
      setActiveTab(filePath);
    } finally {
      openingFilesRef.current.delete(filePath);
    }
  }, []);

  // "Open copy" in the sync conflict notice. The notice tells the user to
  // delete the copy they do not need, so the copy may be gone by the time
  // they click: then its row is dropped, instead of nothing happening (a
  // note) or a tab opening on a missing file (an image or PDF).
  const openConflictCopy = useCallback(async (filePath: string) => {
    if (!window.electronAPI) return;
    const { folder, name } = splitPath(filePath);
    let entries: FileEntry[] = [];
    try {
      entries = await window.electronAPI.readDir(folder);
    } catch {}
    if (entries.some((entry) => entry.name === name && !entry.isDirectory)) {
      await openFile(filePath);
    } else {
      setSyncConflicts((prev) => removeConflictCopy(prev, filePath));
    }
  }, [openFile]);

  // Open a note and, when a line is given, scroll to it. Used by search
  // results and by anything else that knows where in a note it points.
  const openFileAtLine = useCallback((filePath: string, line?: number) => {
    pendingJumpRef.current =
      line !== undefined ? { filePath, line, expires: Date.now() + 3000 } : null;
    void openFile(filePath);
    // The note may already be on screen, in which case nothing else re-renders.
    if (line !== undefined) setJumpTick((t) => t + 1);
  }, [openFile]);

  // Bookmarks live in the vault, so they are loaded when a vault opens and
  // written back whenever they change.
  const bookmarksVault = activeVault?.path ?? null;
  useEffect(() => {
    bookmarksLoadedFor.current = null;
    if (!bookmarksVault || !window.electronAPI) return;
    let cancelled = false;
    window.electronAPI.readFile(`${bookmarksVault}/.noteriv/bookmarks.json`).then((text) => {
      if (cancelled) return;
      const loaded = parseBookmarks(text, bookmarksVault);
      // What the file holds, written the way the app writes it, to tell a real change from none.
      bookmarksOnDisk.current = text === null ? null : serializeBookmarks(loaded, bookmarksVault);
      setBookmarks(loaded);
      bookmarksLoadedFor.current = bookmarksVault;
    });
    return () => { cancelled = true; };
  }, [bookmarksVault, vaultFilesTick]);
  useEffect(() => {
    if (!bookmarksVault || bookmarksLoadedFor.current !== bookmarksVault || !window.electronAPI) return;
    const next = serializeBookmarks(bookmarks, bookmarksVault);
    // Only a change is written. Writing the file again on every start would
    // give it a new date each time, and a file with a new date looks like the
    // newer one to sync, which would then replace another device's bookmarks.
    if (next === bookmarksOnDisk.current) return;
    if (bookmarksOnDisk.current === null && bookmarks.items.length === 0 && bookmarks.groups.length === 0) return;
    const timer = setTimeout(async () => {
      await window.electronAPI.createDir(`${bookmarksVault}/.noteriv`);
      if (await window.electronAPI.writeFile(`${bookmarksVault}/.noteriv/bookmarks.json`, next)) {
        bookmarksOnDisk.current = next;
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [bookmarks, bookmarksVault]);

  // Property types live in the vault too, so every device and every note agrees on them.
  useEffect(() => {
    propertyTypesLoadedFor.current = null;
    if (!bookmarksVault || !window.electronAPI) return;
    let cancelled = false;
    window.electronAPI.readFile(`${bookmarksVault}/.noteriv/types.json`).then((text) => {
      if (cancelled) return;
      setPropertyTypes(parsePropertyTypes(text));
      propertyTypesLoadedFor.current = bookmarksVault;
    });
    return () => { cancelled = true; };
  }, [bookmarksVault, vaultFilesTick]);
  const changePropertyType = useCallback((name: string, type: PropertyType) => {
    const vault = bookmarksVault;
    if (!vault || propertyTypesLoadedFor.current !== vault || !window.electronAPI) return;
    setPropertyTypes((types) => {
      if (types[name] === type) return types;
      const next = { ...types, [name]: type };
      void (async () => {
        await window.electronAPI.createDir(`${vault}/.noteriv`);
        await window.electronAPI.writeFile(`${vault}/.noteriv/types.json`, serializePropertyTypes(next));
      })();
      return next;
    });
  }, [bookmarksVault]);

  // Saved layouts live in the vault as well.
  useEffect(() => {
    layoutsLoadedFor.current = null;
    if (!bookmarksVault || !window.electronAPI) return;
    let cancelled = false;
    window.electronAPI.readFile(`${bookmarksVault}/.noteriv/workspaces.json`).then((text) => {
      if (cancelled) return;
      setLayoutStore(parseLayouts(text));
      layoutsLoadedFor.current = bookmarksVault;
    });
    return () => { cancelled = true; };
  }, [bookmarksVault, vaultFilesTick]);
  const changeLayouts = useCallback((change: (store: LayoutStore) => LayoutStore) => {
    const vault = bookmarksVault;
    if (!vault || layoutsLoadedFor.current !== vault || !window.electronAPI) return;
    setLayoutStore((store) => {
      const next = change(store);
      if (next === store) return store;
      void (async () => {
        await window.electronAPI.createDir(`${vault}/.noteriv`);
        await window.electronAPI.writeFile(`${vault}/.noteriv/workspaces.json`, serializeLayouts(next));
      })();
      return next;
    });
  }, [bookmarksVault]);

  /** What is on screen now, as a layout. */
  const captureLayout = useCallback((): Layout => ({
    openTabs: tabs.map((t) => t.filePath),
    activeTab,
    splitTab,
    pinnedTabs: Array.from(pinnedTabs),
    expandedFolders,
    fileViewModes,
    viewMode,
    sidebarCollapsed: manualSidebarCollapsedRef.current,
    sidebarWidth,
    panels: [
      showOutline ? "outline" : "",
      showBacklinks ? "backlinks" : "",
      showFootnotes ? "footnotes" : "",
      showTagPane ? "tags" : "",
      showAllProperties ? "properties" : "",
      showLintPanel ? "lint" : "",
    ].filter(Boolean),
  }), [tabs, activeTab, splitTab, pinnedTabs, expandedFolders, fileViewModes, viewMode, sidebarWidth, showOutline, showBacklinks, showFootnotes, showTagPane, showAllProperties, showLintPanel]);

  const saveLayoutAs = useCallback((name: string) => {
    if (!bookmarksVault) return;
    const stored = toStoredLayout(captureLayout(), bookmarksVault);
    changeLayouts((store) => putLayout(store, name, stored));
    showStatusNote(`Saved the layout "${name}"`);
  }, [bookmarksVault, captureLayout, changeLayouts, showStatusNote]);

  /** Bring a saved layout back. Unsaved notes are saved first, since their tabs may close. */
  const loadLayout = useCallback(async (name: string) => {
    const stored = layoutStore.layouts[name];
    if (!stored || !bookmarksVault || !window.electronAPI) return;
    if (!await saveDirtyTabs()) return;
    const layout = fromStoredLayout(stored, bookmarksVault);
    const restoredTabs = await readTabs(layout.openTabs);
    const open = new Set(restoredTabs.map((t) => t.filePath));
    manualSidebarCollapsedRef.current = layout.sidebarCollapsed;
    sidebarCollapsedRef.current = layout.sidebarCollapsed;
    responsiveSidebarRef.current = false;
    setSidebarCollapsed(layout.sidebarCollapsed);
    setSidebarWidth(layout.sidebarWidth);
    setViewMode(layout.viewMode);
    setExpandedFolders(layout.expandedFolders);
    setFileViewModes((modes) => ({ ...modes, ...layout.fileViewModes }));
    setPinnedTabs(new Set(layout.pinnedTabs.filter((p) => open.has(p))));
    setTabs(restoredTabs);
    setActiveTab(layout.activeTab && open.has(layout.activeTab) ? layout.activeTab : restoredTabs[0]?.filePath ?? null);
    setSplitTab(layout.splitTab && open.has(layout.splitTab) ? layout.splitTab : null);
    setShowOutline(layout.panels.includes("outline"));
    setShowBacklinks(layout.panels.includes("backlinks"));
    setShowFootnotes(layout.panels.includes("footnotes"));
    setShowTagPane(layout.panels.includes("tags"));
    setShowAllProperties(layout.panels.includes("properties"));
    setShowLintPanel(layout.panels.includes("lint"));
    changeLayouts((store) => (store.active === name ? store : { ...store, active: name }));
    setShowWorkspaces(false);
    const missing = layout.openTabs.length - restoredTabs.length;
    showStatusNote(
      missing > 0
        ? `Loaded the layout "${name}"; ${missing} of its ${missing === 1 ? "notes is" : "notes are"} no longer there`
        : `Loaded the layout "${name}"`
    );
  }, [layoutStore, bookmarksVault, saveDirtyTabs, readTabs, changeLayouts, showStatusNote]);

  const openBookmark = useCallback((bookmark: Bookmark) => {
    if (bookmark.kind === "file") {
      void openFile(bookmark.target);
    } else if (bookmark.kind === "search") {
      setVaultSearchQuery(bookmark.target);
      setShowVaultSearch(true);
    } else if (bookmark.kind === "folder") {
      // Open the folder, and the folders it is inside, in the file list.
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        let path = bookmark.target;
        const root = activeVault?.path ?? "";
        while (path.length > root.length) {
          next.add(path);
          path = path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
        }
        return [...next];
      });
      if (sidebarCollapsed) setSidebarCollapsed(false);
    } else {
      const hash = bookmark.target.indexOf("#");
      const filePath = bookmark.target.slice(0, hash);
      pendingJumpRef.current = {
        filePath,
        anchor: { type: "heading", text: bookmark.target.slice(hash + 1) },
        expires: Date.now() + 3000,
      };
      void openFile(filePath);
      setJumpTick((t) => t + 1);
    }
  }, [openFile, activeVault, sidebarCollapsed]);

  const removeTab = useCallback((filePath: string) => {
    // Pinned tabs cannot be closed
    if (pinnedTabs.has(filePath)) return;
    // Close split if this tab is in the split pane
    if (splitTab === filePath) setSplitTab(null);
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.filePath === filePath);
      const next = prev.filter((t) => t.filePath !== filePath);
      if (activeTab === filePath) {
        // Switch to adjacent tab
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTab(next[newIdx]?.filePath || null);
      }
      return next;
    });
  }, [activeTab, pinnedTabs, splitTab]);

  const closeTab = useCallback(async (filePath: string) => {
    if (pinnedTabs.has(filePath)) return;
    const tab = tabsRef.current.find((t) => t.filePath === filePath);
    if (tab && !(await confirmDiscardUnsaved([tab]))) return;
    removeTab(filePath);
  }, [pinnedTabs, removeTab]);

  const handleTogglePin = useCallback((filePath: string) => {
    setPinnedTabs((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const reorderTabs = useCallback((from: number, to: number) => {
    setTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleFileDelete = useCallback((filePath: string) => {
    // Close tab if the deleted file (or a file inside a deleted folder) is open
    // The file itself, or anything inside it when it is a folder: not a
    // neighbour whose name merely starts the same way.
    const gone = (path: string) =>
      path === filePath || path.startsWith(`${filePath}/`) || path.startsWith(`${filePath}\\`);
    setBookmarks((b) => removeBookmarkPaths(b, filePath));
    setTabs((prev) => {
      const next = prev.filter((t) => !gone(t.filePath));
      if (activeTab && gone(activeTab)) {
        const idx = prev.findIndex((t) => t.filePath === activeTab);
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTab(next[newIdx]?.filePath || null);
      }
      return next;
    });
  }, [activeTab]);

  const handleFileRename = useCallback((oldPath: string, newPath: string) => {
    // Update any open tabs that reference the old path
    setTabs((prev) =>
      prev.map((t) => {
        if (t.filePath === oldPath) {
          return { ...t, filePath: newPath };
        }
        // Handle files inside a renamed folder
        if (t.filePath.startsWith(oldPath + "/")) {
          return { ...t, filePath: t.filePath.replace(oldPath, newPath) };
        }
        return t;
      })
    );
    if (activeTab === oldPath) {
      setActiveTab(newPath);
    } else if (activeTab?.startsWith(oldPath + "/")) {
      setActiveTab(activeTab.replace(oldPath, newPath));
    }
    setBookmarks((b) => renameBookmarkPaths(b, oldPath, newPath));
  }, [activeTab]);

  // Renames and moves run one at a time: each reads the open tabs and scans
  // the vault, and dragging several files to a folder starts one per file.
  const renameQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  // Rename or move a file or folder. With "Update links on rename" on, the
  // links to it are rewritten in every note, and the open tabs are brought
  // in step: their unsaved edits are kept and get the same link changes.
  const renamePath = useCallback((oldPath: string, newPath: string): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      if (!window.electronAPI) return false;
      const vaultPath = activeVault?.path;
      if (!settings.updateLinksOnRename || !vaultPath) {
        return window.electronAPI.rename(oldPath, newPath);
      }

      // The tabs as they are now, after any rename that ran before this one.
      const openTabs = await new Promise<TabState[]>((resolve) => {
        setTabs((prev) => {
          resolve(prev);
          return prev;
        });
      });
      const sent = new Map<string, string | undefined>();
      const open = openTabs
        .filter((t) => !t.kind)
        .map((t) => {
          const unsaved = t.content !== t.savedContent ? t.content : null;
          sent.set(t.filePath, unsaved ?? undefined);
          return { path: t.filePath, unsaved };
        });

      const result = await window.electronAPI.renameUpdatingLinks(vaultPath, oldPath, newPath, open);
      if (!result.ok) {
        if (result.error) showStatusNote(result.error);
        return false;
      }

      // Keyed by the paths the tabs had when they were sent; the caller
      // moves the renamed tab to its new path after this.
      const updates = new Map(result.open.map((u) => [u.path, u]));
      if (updates.size > 0) {
        setTabs((prev) =>
          prev.map((t) => {
            const update = updates.get(t.filePath);
            if (!update || t.kind) return t;
            return { ...t, ...updateOpenNote(t, update, sent.get(t.filePath)), externalConflict: false };
          })
        );
      }
      const message = linkUpdateMessage(result);
      if (message) showStatusNote(message);
      return true;
    };
    const next = renameQueueRef.current.then(run, run);
    renameQueueRef.current = next.catch(() => undefined);
    return next;
  }, [activeVault, settings.updateLinksOnRename, showStatusNote]);

  const handleRenameCurrentFile = useCallback(async (newName: string) => {
    if (!window.electronAPI || !currentTab) return;
    const oldPath = currentTab.filePath;
    const dir = oldPath.substring(0, oldPath.lastIndexOf("/"));
    const oldFileName = oldPath.split("/").pop() || "";
    const ext = oldFileName.match(/\.(md|markdown)$/i)?.[0] || ".md";
    const newFileName = newName + ext;
    const newPath = `${dir}/${newFileName}`;
    if (newPath === oldPath) return;
    const success = await renamePath(oldPath, newPath);
    if (success) {
      handleFileRename(oldPath, newPath);
      // Update file order
      setFileOrder((prev) => {
        if (!prev[dir]) return prev;
        const updated = prev[dir].map((n) => n === oldFileName ? newFileName : n);
        return { ...prev, [dir]: updated };
      });
      setSidebarRefresh((k) => k + 1);
    }
  }, [currentTab, handleFileRename, renamePath]);

  const handleMoveFile = useCallback(async (sourcePath: string, destDir: string) => {
    if (!window.electronAPI) return;
    const name = sourcePath.split("/").pop() || "";
    const newPath = `${destDir}/${name}`;
    if (newPath === sourcePath) return;
    const success = await renamePath(sourcePath, newPath);
    if (success) {
      handleFileRename(sourcePath, newPath);
    }
  }, [handleFileRename, renamePath]);

  const handleContentChange = useCallback((newContent: string) => {
    if (!activeTab) return;
    setTabs((prev) =>
      prev.map((t) =>
        t.filePath === activeTab ? { ...t, content: newContent } : t
      )
    );
  }, [activeTab]);

  // A change to the open note made outside the editor (the properties
  // editor, a Link button). It goes through the editor as an ordinary edit of
  // just the part that differs, so it can be undone and the cursor, the
  // scroll position and the folds stay where they are. Handing the editor a
  // whole new text instead would reset all of that.
  const applyTextEdit = useCallback((next: string) => {
    const view = viewMode === "view" ? null : editorViewRef.current;
    const current = view?.state.doc.toString();
    if (!view || current !== contentRef.current || current === undefined) {
      handleContentChange(next);
      return;
    }
    let start = 0;
    const max = Math.min(current.length, next.length);
    while (start < max && current[start] === next[start]) start++;
    let endA = current.length;
    let endB = next.length;
    while (endA > start && endB > start && current[endA - 1] === next[endB - 1]) {
      endA--;
      endB--;
    }
    if (start === endA && start === endB) return;
    view.dispatch({ changes: { from: start, to: endA, insert: next.slice(start, endB) } });
  }, [handleContentChange, viewMode]);

  const handleSplitContentChange = useCallback((newContent: string) => {
    if (!splitTab) return;
    setTabs((prev) =>
      prev.map((t) =>
        t.filePath === splitTab ? { ...t, content: newContent } : t
      )
    );
  }, [splitTab]);

  const handleSplitRight = useCallback((filePath?: string) => {
    if (filePath) {
      // Open specific file in split
      setSplitTab(filePath);
    } else if (activeTab) {
      // Toggle split with current tab — if already split, close it
      if (splitTab) {
        setSplitTab(null);
      }
    }
  }, [activeTab, splitTab]);

  const handleCloseSplit = useCallback(() => {
    splitEditorViewRef.current = null;
    setSplitTab(null);
  }, []);

  const openKnowledgeIngest = useCallback((source: KnowledgeSourcePreset | null = null) => {
    setKnowledgeSource(source);
    setShowKnowledgeIngest(true);
  }, []);

  const handleAnalyzeSidebarNote = useCallback(async (filePath: string) => {
    if (!activeVault || !window.electronAPI) return;
    const normalizedPath = pathIdentity(filePath, platform);
    const openTab = tabs.find((tab) => (
      !tab.kind && pathIdentity(tab.filePath, platform) === normalizedPath
    ));
    const noteContent = openTab?.content ?? await window.electronAPI.readFile(filePath);
    if (noteContent === null) return;
    openKnowledgeIngest({
      type: "note",
      title: filePath.split(/[\\/]/).pop()?.replace(/\.(md|markdown)$/i, "") || "Untitled note",
      content: noteContent,
      sourceVaultId: activeVault.id,
      sourcePath: relativePathFromVault(activeVault.path, filePath) || undefined,
    });
  }, [activeVault, openKnowledgeIngest, platform, tabs]);

  const isKnowledgeTargetDirty = useCallback((absolutePath: string) => {
    const normalizedTarget = pathIdentity(absolutePath, platform);
    return tabsRef.current.some((tab) => (
      tab.content !== tab.savedContent
      && pathIdentity(tab.filePath, platform) === normalizedTarget
    ));
  }, [platform]);

  const handleKnowledgeApplied = useCallback(async (changedFiles: string[], destinationVaultId: string) => {
    if (!window.electronAPI || changedFiles.length === 0) return;
    if (destinationVaultId !== activeVault?.id) {
      const switched = await handleSwitchVault(destinationVaultId);
      if (!switched) {
        throw new Error("The change was applied, but Noteriv could not switch to the destination vault because an open note could not be saved.");
      }
      setShowKnowledgeIngest(false);
      setKnowledgeSource(null);
      setSidebarRefresh((key) => key + 1);
      await openFile(changedFiles[0]);
      return;
    }
    const dirtyTarget = changedFiles.find(isKnowledgeTargetDirty);
    if (dirtyTarget) {
      setSidebarRefresh((key) => key + 1);
      throw new Error("The change was applied on disk, but the destination editor changed during Apply. Its unsaved buffer was preserved; review it before saving.");
    }
    const refreshed = await Promise.all(changedFiles.map(async (filePath) => ({
      filePath,
      content: await window.electronAPI.readFile(filePath),
    })));
    setTabs((previous) => previous.map((tab) => {
      const tabIdentity = pathIdentity(tab.filePath, platform);
      const match = refreshed.find((item) => (
        pathIdentity(item.filePath, platform) === tabIdentity && item.content !== null
      ));
      return match && tab.content === tab.savedContent
        ? { ...tab, content: match.content!, savedContent: match.content! }
        : tab;
    }));
    setSidebarRefresh((key) => key + 1);
    setShowKnowledgeIngest(false);
    setKnowledgeSource(null);
    const existingTab = tabsRef.current.find((tab) => (
      pathIdentity(tab.filePath, platform) === pathIdentity(changedFiles[0], platform)
    ));
    await openFile(existingTab?.filePath || changedFiles[0]);
  }, [activeVault?.id, handleSwitchVault, isKnowledgeTargetDirty, openFile, platform]);

  const handleEditorContextMenu = (e: React.MouseEvent) => {
    // Only show on right-click in the editor area, not on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest(".md-checkbox") || target.closest(".md-table-checkbox") || target.closest("button") || target.closest("a")) return;
    e.preventDefault();
    const panel = target.closest(".split-pane-panel");
    const panels = panel?.parentElement
      ? Array.from(panel.parentElement.children).filter((child) => child.classList.contains("split-pane-panel"))
      : [];
    const source = panels[1] === panel ? "split" : "main";
    const sourceTab = source === "split" ? splitTabState : currentTab;
    const sourceUsesEditor = Boolean(
      sourceTab
      && !sourceTab.kind
      && viewMode !== "view"
      && !isBoardFile(sourceTab.filePath)
      && !isBoardContent(sourceTab.content)
    );
    const sourceView = sourceUsesEditor
      ? source === "split" ? splitEditorViewRef.current : editorViewRef.current
      : null;
    const noteTitle = sourceTab?.filePath.split(/[\\/]/).pop()?.replace(/\.(md|markdown)$/i, "") || "Untitled note";
    const sourcePath = sourceTab && activeVault
      ? relativePathFromVault(activeVault.path, sourceTab.filePath) || undefined
      : undefined;
    const noteSource = sourceTab && !sourceTab.kind ? {
      type: "note" as const,
      title: noteTitle,
      content: sourceTab.content,
      sourceVaultId: activeVault?.id,
      sourcePath,
    } : null;
    const selection = sourceView?.state.selection.main;
    const selectedText = selection && sourceView
      ? sourceView.state.doc.sliceString(selection.from, selection.to)
      : "";
    const selectionSource = selectedText.trim() && sourceTab && !sourceTab.kind ? {
      type: "selection" as const,
      title: `${noteTitle} selection`,
      content: selectedText,
      sourceVaultId: activeVault?.id,
      sourcePath,
    } : null;
    setEditorContextMenu({
      x: e.clientX,
      y: e.clientY,
      hasSelection: Boolean(selectionSource),
      noteSource,
      selectionSource,
    });
  };

  const getEditorContextMenuItems = (): ContextMenuItem[] => {
    if (!activeTab) return [];
    const currentFileMode = fileViewModes[activeTab];
    const items: ContextMenuItem[] = [
      {
        label: `Default Mode: Live${currentFileMode === "live" ? " ✓" : ""}`,
        onClick: () => {
          setFileViewModes((prev) => ({ ...prev, [activeTab]: "live" }));
          setViewMode("live");
        },
      },
      {
        label: `Default Mode: Source${currentFileMode === "source" ? " ✓" : ""}`,
        onClick: () => {
          setFileViewModes((prev) => ({ ...prev, [activeTab]: "source" }));
          setViewMode("source");
        },
      },
      {
        label: `Default Mode: View${currentFileMode === "view" ? " ✓" : ""}`,
        onClick: () => {
          setFileViewModes((prev) => ({ ...prev, [activeTab]: "view" }));
          setViewMode("view");
        },
      },
      {
        label: "Clear Default Mode",
        onClick: () => {
          setFileViewModes((prev) => {
            const next = { ...prev };
            delete next[activeTab!];
            return next;
          });
        },
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Open in Split",
        onClick: () => handleSplitRight(activeTab),
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Analyze for Knowledge Base",
        onClick: () => {
          if (editorContextMenu?.noteSource) openKnowledgeIngest(editorContextMenu.noteSource);
        },
      },
      ...(editorContextMenu?.hasSelection ? [{
        label: "Add Selection to Knowledge Base",
        onClick: () => {
          if (editorContextMenu.selectionSource) openKnowledgeIngest(editorContextMenu.selectionSource);
        },
      }] : []),
      { label: "", separator: true, onClick: () => {} },
      {
        label: focusMode ? "Exit Focus Mode" : "Focus Mode",
        onClick: () => setFocusMode((f) => !f),
      },
      {
        label: zenMode ? "Exit Zen Mode" : "Zen Mode",
        onClick: () => setZenMode((z) => !z),
      },
    ];
    return items;
  };

  const handleSave = useCallback(async () => {
    if (!window.electronAPI || !currentTab) return;

    // Auto-update TOC blocks before saving
    let contentToSave = currentTab.content;
    if (hasTocBlock(contentToSave)) {
      contentToSave = updateTocBlocks(contentToSave);
      if (contentToSave !== currentTab.content) {
        handleContentChange(contentToSave);
      }
    }

    const overwriteConflict = currentTab.externalConflict
      ? window.confirm(`This note changed on disk after it was opened:\n\n${currentTab.filePath}\n\nOverwrite the external version with your editor content?`)
      : false;
    if (currentTab.externalConflict && !overwriteConflict) return;

    // Save the current disk version for recovery before replacing it.
    if (activeVault) {
      try {
        const snapshotContent = currentTab.externalConflict
          ? await window.electronAPI.readFile(currentTab.filePath)
          : currentTab.savedContent;
        if (snapshotContent !== null) {
          await saveSnapshot(activeVault.path, currentTab.filePath, snapshotContent);
        }
      } catch {}
    }
    const result = overwriteConflict
      ? { status: await window.electronAPI.writeFile(currentTab.filePath, contentToSave) ? "written" : "error" }
      : await writeTabGuarded(currentTab, contentToSave);
    if (result.status === "written") {
      setTabs((prev) =>
        prev.map((t) =>
          t.filePath === currentTab.filePath
            ? { ...t, savedContent: contentToSave, externalConflict: false }
            : t
        )
      );
      // Sync on save if enabled
      if (settings.syncOnSave && autoSyncApplies(activeVault?.gitRemote, settings.extraSyncProvider)) {
        performSync();
      }
    } else if (result.status === "conflict") {
      setTabs((prev) => prev.map((t) =>
        t.filePath === currentTab.filePath && t.savedContent === currentTab.savedContent
          ? { ...t, externalConflict: true }
          : t
      ));
    }
  }, [currentTab, settings.syncOnSave, settings.extraSyncProvider, activeVault, performSync]);

  const handleSaveAs = useCallback(async () => {
    if (!window.electronAPI) return;
    const defaultPath = currentTab?.filePath || (activeVault ? `${activeVault.path}/untitled.md` : "untitled.md");
    const filePath = await window.electronAPI.saveFileDialog(defaultPath);
    if (!filePath) return;

    const contentToSave = currentTab?.content || "";
    const success = await window.electronAPI.writeFile(filePath, contentToSave);
    if (success) {
      // Replace current tab or add new
      if (currentTab) {
        setTabs((prev) =>
          prev.map((t) =>
            t.filePath === currentTab.filePath
              ? { filePath, content: contentToSave, savedContent: contentToSave }
              : t
          )
        );
        setActiveTab(filePath);
      }
    }
  }, [currentTab, activeVault]);

  // Create an empty note where the settings say new notes go, and open it.
  // `pickName` is given the names already in that folder.
  const createNote = useCallback(async (pickName: (taken: (name: string) => boolean) => string) => {
    if (!window.electronAPI || !activeVault) return;
    const folder = newNoteFolder(activeVault.path, settings.newNoteLocation, settings.newNoteFolder, activeTab);
    await window.electronAPI.createDir(folder);
    const existing = new Set((await window.electronAPI.readDir(folder)).map((e) => e.name.toLowerCase()));
    const name = pickName((candidate) => existing.has(`${candidate}.md`.toLowerCase()));
    const filePath = `${folder}/${name}.md`;
    await window.electronAPI.createFile(filePath);
    setTabs((prev) => [...prev, { filePath, content: "", savedContent: "" }]);
    setActiveTab(filePath);
    setSidebarRefresh((k) => k + 1);
  }, [activeVault, activeTab, settings.newNoteLocation, settings.newNoteFolder]);

  const handleNewFile = useCallback(
    () =>
      createNote((taken) => {
        let name = "Untitled";
        for (let counter = 2; taken(name); counter++) name = `Untitled ${counter}`;
        return name;
      }),
    [createNote]
  );

  useEffect(() => {
    openLinksInReaderRef.current = settings.openLinksInReader;
  }, [settings.openLinksInReader]);

  /** Save a page from the reader as a note, where new notes go, under the page's title. */
  const saveWebPage = useCallback(async (markdown: string, title: string): Promise<boolean> => {
    if (!window.electronAPI || !activeVault) return false;
    const folder = newNoteFolder(activeVault.path, settings.newNoteLocation, settings.newNoteFolder, null);
    await window.electronAPI.createDir(folder);
    const existing = new Set((await window.electronAPI.readDir(folder)).map((e) => e.name.toLowerCase()));
    // A title is not always fit to be a file name.
    const clean = title.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Web page";
    const name = freeNoteName(`${clean}.md`, (candidate) => existing.has(candidate.toLowerCase()));
    if (!await window.electronAPI.writeFile(`${folder}/${name}`, markdown)) return false;
    invalidateVaultIndex();
    setSidebarRefresh((k) => k + 1);
    showStatusNote(`Saved the page as "${name.replace(/\.md$/, "")}"`);
    return true;
  }, [activeVault, settings.newNoteLocation, settings.newNoteFolder, showStatusNote]);

  // The open note in a window of its own. Moving it there closes its tab here.
  const openPopout = useCallback(async (move: boolean) => {
    if (!currentTab || currentTab.kind || !window.electronAPI) return;
    const filePath = currentTab.filePath;
    // The new window reads the file, so what is typed here has to be in it first.
    if (currentTab.content !== currentTab.savedContent && !await saveDirtyTabs()) return;
    try {
      await window.electronAPI.openPopout(filePath);
      if (move) removeTab(filePath);
    } catch (err) {
      showStatusNote(typeof err === "string" ? err : "The window could not be opened.");
    }
  }, [currentTab, saveDirtyTabs, removeTab, showStatusNote]);

  // A base that lists every note, as somewhere to start from.
  const handleNewBase = useCallback(async () => {
    if (!window.electronAPI || !activeVault) return;
    const folder = newNoteFolder(activeVault.path, settings.newNoteLocation, settings.newNoteFolder, activeTab);
    await window.electronAPI.createDir(folder);
    const existing = new Set((await window.electronAPI.readDir(folder)).map((e) => e.name.toLowerCase()));
    let name = "Untitled";
    for (let counter = 2; existing.has(`${name}.base`.toLowerCase()); counter++) name = `Untitled ${counter}`;
    const filePath = `${folder}/${name}.base`;
    if (!await window.electronAPI.writeFile(filePath, NEW_BASE)) return;
    setTabs((prev) => [...prev, { filePath, content: "", savedContent: "", kind: "base" }]);
    setActiveTab(filePath);
    setSidebarRefresh((k) => k + 1);
  }, [activeVault, activeTab, settings.newNoteLocation, settings.newNoteFolder]);

  // A note named by the time, to the minute: a Zettelkasten-style id.
  const handleUniqueNote = useCallback(
    () => createNote((taken) => nextTimestampName(new Date(), taken)),
    [createNote]
  );

  // Open the file list at a note: its folders first, then scroll to it.
  const revealInFileList = useCallback((filePath: string) => {
    const root = activeVault?.path;
    if (!root || !filePath.startsWith(root)) return;
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      let folder = filePath.slice(0, Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")));
      while (folder.length > root.length) {
        next.add(folder);
        folder = folder.slice(0, Math.max(folder.lastIndexOf("/"), folder.lastIndexOf("\\")));
      }
      return next.size === prev.length ? prev : [...next];
    });
    setRevealFile({ path: filePath, tick: Date.now() });
  }, [activeVault]);

  // With "reveal the open note" on, the file list follows the open note.
  useEffect(() => {
    if (settings.autoRevealFile && activeTab) revealInFileList(activeTab);
  }, [settings.autoRevealFile, activeTab, revealInFileList]);

  // Settings that code outside React reads: see vault-prefs.ts.
  useEffect(() => {
    setVaultPrefs({ excludedFiles: settings.excludedFiles, attachmentFolder: settings.attachmentFolder });
  }, [settings.excludedFiles, settings.attachmentFolder]);

  // How a new link is written, for the code that writes one: see link-format.ts.
  useEffect(() => {
    setLinkPrefs({ linkFormat: settings.linkFormat, useWikilinks: settings.useWikilinks });
  }, [settings.linkFormat, settings.useWikilinks]);

  const handleNewFolder = useCallback(async () => {
    if (!window.electronAPI || !activeVault) return;
    // Find a unique folder name
    let name = "New Folder";
    let counter = 1;
    const existing = await window.electronAPI.readDir(activeVault.path);
    const existingNames = existing.map((e) => e.name);
    while (existingNames.includes(name)) {
      counter++;
      name = `New Folder ${counter}`;
    }
    const dirPath = `${activeVault.path}/${name}`;
    await window.electronAPI.createDir(dirPath);
    setSidebarRefresh((k) => k + 1);
  }, [activeVault]);

  const handleOpenFile = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openFile();
    if (result) openFile(result.filePath);
  }, [openFile]);

  // ============================================================
  // Additional actions
  // ============================================================

  const handleCloseAllTabs = useCallback(async () => {
    const closing = tabsRef.current.filter((t) => !pinnedTabs.has(t.filePath));
    if (!(await confirmDiscardUnsaved(closing))) return;
    setTabs((prev) => {
      const remaining = prev.filter((t) => pinnedTabs.has(t.filePath));
      if (activeTab && !pinnedTabs.has(activeTab)) {
        setActiveTab(remaining[0]?.filePath || null);
      }
      return remaining;
    });
  }, [pinnedTabs, activeTab]);

  const handleCloseOtherTabs = useCallback(async () => {
    if (!activeTab) return;
    const closing = tabsRef.current.filter((t) => t.filePath !== activeTab && !pinnedTabs.has(t.filePath));
    if (!(await confirmDiscardUnsaved(closing))) return;
    setTabs((prev) => prev.filter((t) => t.filePath === activeTab || pinnedTabs.has(t.filePath)));
  }, [activeTab, pinnedTabs]);

  const trashFromSidebarRef = useRef<(filePath: string) => Promise<void>>(async () => {});
  const handleDeleteFile = useCallback(async () => {
    if (!window.electronAPI || !currentTab || !activeVault) return;
    const name = currentTab.filePath.split(/[\\/]/).pop() || currentTab.filePath;
    const system = settings.deletedFiles === "system";
    const confirmed = await confirmDialog({
      title: system ? `Move "${name}" to the system trash?` : `Move "${name}" to Trash?`,
      message: system ? "You can put it back from your system's trash." : "You can restore it from the Trash for 30 days.",
      confirmLabel: "Move to Trash",
      danger: true,
    });
    if (!confirmed) return;
    // The same way out as a delete from the file list, so the setting holds here too.
    await trashFromSidebarRef.current(currentTab.filePath);
  }, [currentTab, activeVault, settings.deletedFiles]);

  const handleTrashFileFromSidebar = useCallback(async (filePath: string) => {
    if (!activeVault) return;
    let success = false;
    if (settings.deletedFiles === "system") {
      // The system's trash: the file can be put back from there, not from the app.
      try {
        await window.electronAPI.trashSystem(filePath);
        success = true;
      } catch (err) {
        showStatusNote(typeof err === "string" ? err : "The file could not be moved to the system trash.");
      }
    } else {
      success = await trashFile(activeVault.path, filePath);
    }
    if (success) {
      handleFileDelete(filePath);
      setSidebarRefresh((k) => k + 1);
    }
  }, [activeVault, handleFileDelete, settings.deletedFiles, showStatusNote]);
  useEffect(() => {
    trashFromSidebarRef.current = handleTrashFileFromSidebar;
  }, [handleTrashFileFromSidebar]);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const handleZenMode = useCallback(() => {
    setZenMode((z) => !z);
    if (!zenMode) {
      setSidebarCollapsed(true);
    }
  }, [zenMode]);

  const handleEditorViewReady = useCallback((view: EditorView) => {
    editorViewRef.current = view;
    if (pendingJumpRef.current) setJumpTick((t) => t + 1);
  }, []);

  const handleReadViewReady = useCallback((view: EditorView) => {
    readViewRef.current = view;
    if (pendingJumpRef.current) setJumpTick((t) => t + 1);
  }, []);

  // Wiki link click handler — global mousedown capture
  useEffect(() => {
    const handleWikiClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest(".md-wikilink, .wl-link, [data-target], [data-vault-link]") as HTMLElement | null;
      if (!link) return;

      const linkTarget = link.getAttribute("data-target") || link.getAttribute("data-vault-link") || link.textContent?.trim();
      if (!linkTarget || !window.electronAPI || !activeVault) return;

      e.stopImmediatePropagation();
      e.preventDefault();

      const vaultPath = activeVault.path;
      // A markdown link to a note or file, [text](path.md), carries its
      // destination here; a wiki link does not.
      const markdownDest = link.getAttribute("data-vault-link");
      // The note the link is written in: the split pane and an embedded note
      // are not the active tab.
      const linkNote = noteContaining(link) ?? activeTab;
      window.electronAPI.listAllFiles(vaultPath).then(async (files) => {
        // A markdown link, and a wiki link written as a path from its own
        // note ("./", "../"), lead somewhere that depends on that note.
        const placed = await linkPlace(vaultPath, files, linkNote, markdownDest, linkTarget);
        if (placed) {
          if (placed.page) setPdfPageRequest({ filePath: placed.filePath, page: placed.page, tick: Date.now() });
          pendingJumpRef.current = placed.anchor
            ? { filePath: placed.filePath, anchor: placed.anchor, expires: Date.now() + 3000 }
            : null;
          openFile(placed.filePath);
          if (placed.anchor) setJumpTick((t) => t + 1);
        }
        if (placed || markdownDest !== null) return;

        // By name or by path inside the vault. Renaming a note rewrites the
        // links to it by the same rule, so the two stay in one place.
        const byName = (name: string) =>
          findLinkedNote(files, name) ??
          // Dataview results link by the note's full path.
          files.find((f) => linkKey(f.filePath) === linkKey(name));
        // A link may use one of a note's aliases. The index is only read
        // when the name itself matches nothing, so most clicks do not wait for it.
        const needsAliases =
          !byName(linkTarget) && !(linkTarget.includes("#") && byName(splitWikiTarget(linkTarget).file));
        const index = needsAliases ? await loadVaultIndex(vaultPath) : [];
        const findNote = (name: string) => byName(name) ?? findNoteByAlias(index, name);

        // The whole target first, so a note whose name contains "#" still opens.
        let filePath = findNote(linkTarget)?.filePath ?? null;
        let anchor: WikiAnchor | null = null;
        if (!filePath && linkTarget.includes("#")) {
          // [[Note#Heading]], [[Note#^block]] or, within one note, [[#Heading]].
          const split = splitWikiTarget(linkTarget);
          anchor = split.anchor;
          filePath = split.file ? findNote(split.file)?.filePath ?? null : activeTab;
        }
        if (!filePath) {
          // Not a note: a link to a file such as [[paper.pdf#page=3]].
          const filePart = (linkTarget.split("#")[0] || linkTarget).trim();
          if (!/\.[a-z0-9]{1,8}$/i.test(filePart) || /\.(md|markdown)$/i.test(filePart)) return;
          const rel = findLinkedFile(await window.electronAPI.listVaultFiles(vaultPath), filePart);
          if (!rel) return;
          const target = `${vaultPath}/${rel}`;
          const page = pdfPage(linkTarget);
          if (page) setPdfPageRequest({ filePath: target, page, tick: Date.now() });
          openFile(target);
          return;
        }

        pendingJumpRef.current = anchor
          ? { filePath, anchor, expires: Date.now() + 3000 }
          : null;
        openFile(filePath);
        // The note may already be on screen, in which case nothing else re-renders.
        if (anchor) setJumpTick((t) => t + 1);
      });
    };

    document.addEventListener("mousedown", handleWikiClick, true);
    return () => document.removeEventListener("mousedown", handleWikiClick, true);
  }, [activeVault, activeTab, openFile]);

  // Scroll to the heading or block a wiki link pointed at, once its note is
  // the one on screen. Runs again when the tab, its content, the view mode or
  // the editor view changes, because opening a note can do any of those.
  useEffect(() => {
    const pending = pendingJumpRef.current;
    if (!pending) return;
    if (Date.now() > pending.expires) {
      pendingJumpRef.current = null;
      return;
    }
    if (pending.filePath !== activeTab) return;

    const view = viewMode === "view" ? readViewRef.current : editorViewRef.current;
    // Not mounted yet, or still showing the previous note: a later run handles it.
    if (!view || !view.dom.isConnected || view.state.doc.toString() !== content) return;
    // Done on this view already. The request stays until it expires so that a
    // view replaced right after opening (a per-file view mode) gets it too.
    if (pending.appliedTo === view) return;
    pending.appliedTo = view;

    const line = pending.anchor
      ? findAnchorLine(content, pending.anchor)
      : pending.line !== undefined && pending.line >= 1 && pending.line <= view.state.doc.lines
        ? pending.line
        : null;
    if (line === null) return;

    const pos = view.state.doc.line(line).from;
    // EditorView is imported as a type only here; reach the static through the instance.
    const View = view.constructor as typeof EditorView;
    view.dispatch({
      selection: { anchor: pos },
      effects: View.scrollIntoView(pos, { y: "start", yMargin: 24 }),
    });
    if (viewMode !== "view") view.focus();
  }, [activeTab, content, viewMode, jumpTick]);

  // External link click handler — open in system browser
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a.md-link") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        (!href.startsWith("http://") &&
          !href.startsWith("https://") &&
          !href.startsWith("mailto:"))
      )
        return;

      e.preventDefault();
      e.stopImmediatePropagation();
      // A web page can be read in the app when the user has chosen that.
      if (openLinksInReaderRef.current && /^https?:/i.test(href)) setWebReaderUrl(href);
      else window.electronAPI?.openExternal(href);
    };

    // In the editor a press of the button on a link would first move the
    // cursor onto its line, which shows the line as written and takes the
    // link away before the click arrives. Keeping the press from the editor
    // leaves the link where it is; a wiki link is handled the same way.
    const holdLinkPress = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const anchor = (e.target as HTMLElement).closest?.("a.md-link") as HTMLAnchorElement | null;
      const href = anchor?.getAttribute("href");
      if (!href || !/^(https?:|mailto:)/i.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener("mousedown", holdLinkPress, true);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      document.removeEventListener("mousedown", holdLinkPress, true);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [setWebReaderUrl]);

  const handleDailyNote = useCallback(async () => {
    if (!window.electronAPI || !activeVault) return;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const dailyDir = `${activeVault.path}/Daily`;
    const filePath = `${dailyDir}/${dateStr}.md`;

    // Create directory if needed
    await window.electronAPI.createDir(dailyDir);

    // Check if file exists
    const existing = await window.electronAPI.readFile(filePath);
    if (existing === null) {
      // Create with template
      const template = `# ${dateStr}\n\n`;
      await window.electronAPI.writeFile(filePath, template);
    }

    openFile(filePath);
    setSidebarRefresh((k) => k + 1);
  }, [activeVault, openFile]);

  // Create daily note for a specific date (from calendar)
  const handleCreateDailyNote = useCallback(async (dateStr: string) => {
    if (!window.electronAPI || !activeVault) return;
    const dailyDir = `${activeVault.path}/Daily`;
    const filePath = `${dailyDir}/${dateStr}.md`;
    await window.electronAPI.createDir(dailyDir);
    const existing = await window.electronAPI.readFile(filePath);
    if (existing === null) {
      await window.electronAPI.writeFile(filePath, `# ${dateStr}\n\n`);
    }
    openFile(filePath);
    setSidebarRefresh((k) => k + 1);
  }, [activeVault, openFile]);

  // Create new task board
  const handleNewBoard = useCallback(async () => {
    if (!window.electronAPI || !activeVault) return;
    const existing = await window.electronAPI.readDir(activeVault.path);
    const names = existing.map((e) => e.name);
    let name = "Board.board.md";
    let counter = 1;
    while (names.includes(name)) { counter++; name = `Board ${counter}.board.md`; }
    const filePath = `${activeVault.path}/${name}`;
    await window.electronAPI.writeFile(filePath, createBoardContent());
    openFile(filePath);
    setSidebarRefresh((k) => k + 1);
  }, [activeVault, openFile]);

  // Create new canvas/whiteboard
  const handleNewCanvas = useCallback(async () => {
    if (!window.electronAPI || !activeVault) return;
    const existing = await window.electronAPI.readDir(activeVault.path);
    const names = existing.map((e) => e.name);
    let name = "Canvas.canvas";
    let counter = 1;
    while (names.includes(name)) { counter++; name = `Canvas ${counter}.canvas`; }
    const filePath = `${activeVault.path}/${name}`;
    await window.electronAPI.writeFile(filePath, JSON.stringify({ nodes: [], edges: [] }, null, 2));
    openFile(filePath);
    setSidebarRefresh((k) => k + 1);
  }, [activeVault, openFile]);

  // Create new excalidraw drawing
  const handleNewDrawing = useCallback(async () => {
    if (!window.electronAPI || !activeVault) return;
    const existing = await window.electronAPI.readDir(activeVault.path);
    const names = existing.map((e) => e.name);
    const name = generateDrawingName(names);
    const filePath = `${activeVault.path}/${name}`;
    await window.electronAPI.writeFile(filePath, serializeDrawing(createEmptyDrawing()));
    openFile(filePath);
    setSidebarRefresh((k) => k + 1);
  }, [activeVault, openFile]);

  // Insert TOC placeholder
  const handleInsertToc = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    insertAtCursor(view, insertTocPlaceholder());
  }, []);

  // Insert auto-updating TOC block
  const handleInsertTocBlock = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    insertAtCursor(view, generateTocBlock(content));
  }, [content]);

  // Update existing TOC blocks
  const handleUpdateToc = useCallback(() => {
    if (!currentTab || !hasTocBlock(content)) return;
    const updated = updateTocBlocks(content);
    if (updated !== content) {
      handleContentChange(updated);
    }
  }, [content, currentTab, handleContentChange]);

  // Insert dataview query template
  const handleInsertDataview = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    insertAtCursor(view, '```dataview\nTABLE file.name, file.tags FROM "" SORT BY file.modified DESC LIMIT 10\n```');
  }, []);

  // Toggle focus/typewriter mode
  const handleFocusMode = useCallback(() => {
    setFocusMode((f) => !f);
  }, []);

  // Publish note as HTML (show preview first)
  const handlePublish = useCallback(() => {
    if (!currentTab) return;
    setShowPublish(true);
  }, [currentTab]);

  const handleHeadingClick = useCallback((line: number) => {
    const view = editorViewRef.current;
    if (!view) return;
    const docLine = view.state.doc.line(line);
    view.dispatch({
      selection: { anchor: docLine.from },
      scrollIntoView: true,
    });
    view.focus();
  }, []);

  const runPluginCommand = useCallback((cmd: PluginCommand) => {
    Promise.resolve()
      .then(() => cmd.callback())
      .catch((err) => console.error(`[plugin] command "${cmd.id}" failed:`, err));
  }, []);

  const togglePluginPanel = useCallback((id: string) => {
    setOpenPluginPanels((open) =>
      open.includes(id) ? open.filter((p) => p !== id) : [...open, id]
    );
  }, []);

  // What a command line, a second launch or a noteriv:// link asked for.
  // The backend has already checked it; see lib/app-requests.ts.
  const handleAppRequestRef = useRef<(request: AppRequest) => Promise<void>>(async () => {});
  const handleAppRequest = useCallback(async (request: AppRequest) => {
    const api = window.electronAPI;
    if (!api || request.action === "focus") return;
    if (request.action === "error") {
      showStatusNote(request.message || "That could not be done.");
      return;
    }
    // A link can come from anywhere, so it asks before it changes anything.
    if (request.fromLink && request.writes) {
      const question = linkWriteQuestion(request);
      if (!await confirmDialog({ title: question.title, message: question.message, confirmLabel: "Go ahead" })) return;
    }
    if (request.vaultId && request.vaultId !== activeVault?.id) {
      if (!await handleSwitchVault(request.vaultId)) {
        showStatusNote("That vault could not be opened.");
        return;
      }
      // The rest is done once the page has caught up with the new vault.
      const rest = { ...request, vaultId: null, fromLink: false };
      setTimeout(() => { void handleAppRequestRef.current(rest); }, 300);
      return;
    }

    if (request.action === "open") {
      if (!request.filePath) return;
      let line = request.line ?? undefined;
      if (line === undefined && request.heading) {
        const text = await api.readFile(request.filePath);
        line = (text !== null && headingLine(text, request.heading)) || undefined;
      }
      openFileAtLine(request.filePath, line);
      return;
    }
    if (request.action === "search") {
      setVaultSearchQuery(request.query ?? "");
      setShowVaultSearch(true);
      return;
    }
    if (request.action === "daily") {
      handleDailyNote();
      return;
    }

    // "new" and "unique": a note to create, or text to add to one.
    const vaultPath = request.vaultPath ?? activeVault?.path;
    if (!vaultPath) return;
    const namesIn = async (folder: string) => {
      try {
        return new Set((await api.readDir(folder)).map((e) => e.name.toLowerCase()));
      } catch {
        return new Set<string>();
      }
    };
    let relative = request.action === "new" ? request.name ?? null : null;
    // A name with no folder goes where the settings put new notes; "beside
    // the open note" needs that note to be in the vault the request is for.
    const beside = activeVault?.path === vaultPath ? activeTab : null;
    const folder = newNoteFolder(vaultPath, settings.newNoteLocation, settings.newNoteFolder, beside);
    const inFolder = toVaultRelative(folder, vaultPath);
    if (!relative) {
      const existing = await namesIn(folder);
      const base =
        request.action === "unique"
          ? nextTimestampName(new Date(), (name) => existing.has(`${name}.md`.toLowerCase()))
          : freeNoteName("Untitled.md", (name) => existing.has(name.toLowerCase())).replace(/\.md$/, "");
      relative = `${inFolder ? `${inFolder}/` : ""}${base}.md`;
    } else if (!relative.includes("/") && inFolder) {
      relative = `${inFolder}/${relative}`;
    }
    let full = fromVaultRelative(relative, vaultPath);
    if (!full) {
      showStatusNote("That is not a place inside the vault.");
      return;
    }
    const mode = request.action === "unique" ? "create" : request.mode ?? "create";
    const text = request.content ?? "";
    const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
    const openTab = tabs.find((t) => t.filePath === full && !t.kind);
    const existingText = openTab ? openTab.content : await api.readFile(full);

    let next: string;
    if (existingText !== null && (mode === "append" || mode === "prepend")) {
      next = addText(existingText, text, mode);
    } else {
      if (existingText !== null && mode === "create") {
        // Creating never replaces: the new note takes the next free name.
        const taken = await namesIn(parentOf(full));
        const fileName = full.slice(parentOf(full).length + 1);
        full = `${parentOf(full)}/${freeNoteName(fileName, (name) => taken.has(name.toLowerCase()))}`;
      }
      next = text;
    }
    const target = full;
    const tab = tabs.find((t) => t.filePath === target && !t.kind);
    if (tab && tab.content !== tab.savedContent) {
      // The note is open with changes not saved yet: the text joins them.
      setTabs((prev) => prev.map((t) => (t.filePath === target ? { ...t, content: next } : t)));
    } else {
      await api.createDir(parentOf(target));
      if (!await api.writeFile(target, next)) {
        showStatusNote("The note could not be written.");
        return;
      }
      if (tab) setTabs((prev) => prev.map((t) => (t.filePath === target ? { ...t, content: next, savedContent: next } : t)));
    }
    invalidateVaultIndex();
    setSidebarRefresh((k) => k + 1);
    if (!request.silent) void openFile(target);
  }, [activeVault, activeTab, handleSwitchVault, openFileAtLine, openFile, handleDailyNote, showStatusNote, settings.newNoteLocation, settings.newNoteFolder, tabs]);
  useEffect(() => {
    handleAppRequestRef.current = handleAppRequest;
  }, [handleAppRequest]);
  useEffect(() => {
    const api = window.electronAPI;
    if (appState !== "app" || !api?.takeAppRequests) return;
    let busy = false;
    const pull = async () => {
      if (busy) return;
      busy = true;
      try {
        // Until none are left: one may arrive while another is being carried out.
        for (;;) {
          const requests = await api.takeAppRequests();
          if (requests.length === 0) break;
          for (const request of requests) await handleAppRequestRef.current(request);
        }
      } finally {
        busy = false;
      }
    };
    void pull();
    return api.onAppRequest(() => { void pull(); });
  }, [appState]);

  const handleCommandExecute = useCallback((action: HotkeyAction) => {
    const view = editorViewRef.current;
    // The editor on screen: the reading view has its own.
    const shownView = () => (viewMode === "view" ? readViewRef.current : editorViewRef.current);
    const actions: Record<HotkeyAction, () => void> = {
      save: handleSave,
      saveAs: handleSaveAs,
      newFile: handleNewFile,
      newFolder: handleNewFolder,
      openFile: handleOpenFile,
      closeTab: () => { if (activeTab) closeTab(activeTab); },
      closeAllTabs: handleCloseAllTabs,
      closeOtherTabs: handleCloseOtherTabs,
      deleteFile: handleDeleteFile,
      nextTab: () => {
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.filePath === activeTab);
        setActiveTab(tabs[(idx + 1) % tabs.length].filePath);
      },
      prevTab: () => {
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.filePath === activeTab);
        setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].filePath);
      },
      quickOpen: () => setShowQuickOpen(true),
      commandPalette: () => {},
      findInFile: () => {},
      findInVault: () => setShowVaultSearch(true),
      toggleSidebar: handleToggleSidebar,
      toggleViewMode: () => setViewMode((m) => m === "live" ? "view" : m === "view" ? "source" : "live"),
      toggleFullscreen: handleToggleFullscreen,
      zenMode: handleZenMode,
      settings: () => setShowSettings(true),
      undo: () => {},
      redo: () => {},
      toggleBold: () => { if (view) wrapSelection(view, "**", "**"); },
      toggleItalic: () => { if (view) wrapSelection(view, "*", "*"); },
      toggleCode: () => { if (view) wrapSelection(view, "`", "`"); },
      toggleStrikethrough: () => { if (view) wrapSelection(view, "~~", "~~"); },
      insertLink: () => { if (view) editorInsertLink(view); },
      insertImage: () => { if (view) editorInsertImage(view); },
      insertHorizontalRule: () => { if (view) editorInsertHR(view); },
      insertCodeBlock: () => { if (view) editorInsertCodeBlock(view); },
      insertBlockquote: () => { if (view) editorInsertBlockquote(view); },
      insertTaskList: () => { if (view) editorInsertTaskList(view); },
      insertTable: () => { if (view) editorInsertTable(view); },
      gitSync: handleGitSync,
      dailyNote: handleDailyNote,
      toggleOutline: () => setShowOutline((o) => !o),
      graphView: () => { setGraphStartsLocal(false); setShowGraphView(true); },
      localGraph: () => { setGraphStartsLocal(true); setShowGraphView(true); },
      toggleBacklinks: () => setShowBacklinks((b) => !b),
      toggleTags: () => setShowTagPane((t) => !t),
      insertTemplate: () => setShowTemplatePicker(true),
      toggleBookmark: () => { if (activeTab) setBookmarks((b) => toggleBookmarkItem(b, "file", activeTab)); },
      bookmarkHeading: () => {
        // The heading the cursor is under, in the open note.
        if (!view || !activeTab) return;
        const doc = view.state.doc;
        const propertyLines = frontmatterLineCount(doc.toString());
        for (let n = doc.lineAt(view.state.selection.main.head).number; n > propertyLines; n--) {
          const match = doc.line(n).text.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
          if (match) {
            setBookmarks((b) => toggleBookmarkItem(b, "heading", `${activeTab}#${match[1]}`));
            return;
          }
        }
      },
      randomNote: async () => { if (activeVault) { const f = await getRandomNote(activeVault.path); if (f) openFile(f); } },
      noteComposer: () => setShowNoteComposer(true),
      fileRecovery: () => setShowFileRecovery(true),
      exportPDF: () => { if (currentTab && !currentTab.kind) exportToPDF(content, currentTab.filePath.split("/").pop()?.replace(/\.md$/i, "") || "note"); },
      audioRecorder: () => setShowAudioRecorder(true),
      attachments: () => setShowAttachments(true),
      slidePresentation: () => setShowSlidePresentation(true),
      pluginManager: () => setShowPluginManager(true),
      cssSnippets: () => setShowCSSSnippets(true),
      calendarView: () => setShowCalendarView(true),
      vaultInsights: () => setShowVaultInsights(true),
      newBoard: handleNewBoard,
      newCanvas: handleNewCanvas,
      insertDrawing: handleNewDrawing,
      insertToc: handleInsertToc,
      updateToc: handleUpdateToc,
      insertDataview: handleInsertDataview,
      focusMode: handleFocusMode,
      publishNote: handlePublish,
      flashcardReview: () => setShowFlashcards(true),
      startCollab: () => setShowCollab(true),
      openPdfViewer: () => {
        if (activeTab && isPdfFile(activeTab)) openFile(activeTab);
      },
      exportPdfAnnotations: () => {
        if (pdfFile) { /* export handled inside PDFViewer */ }
      },
      openTrash: () => setShowTrash(true),
      togglePinTab: () => { if (activeTab) handleTogglePin(activeTab); },
      noteHistory: () => { if (currentTab) setShowNoteHistory(true); },
      timeScrubber: () => { if (currentTab) setShowTimeScrubber(true); },
      toggleLint: () => setShowLintPanel((l) => !l),
      splitEditor: () => { if (activeTab) handleSplitRight(activeTab); },
      closeSplit: handleCloseSplit,
      knowledgeIngest: () => openKnowledgeIngest(),
      uniqueNote: () => { void handleUniqueNote(); },
      toggleFootnotes: () => setShowFootnotes((f) => !f),
      addProperty: () => {
        if (!currentTab || currentTab.kind) return;
        if (viewMode === "source") setViewMode("live");
        setPropertiesCollapsed(false);
        setAddPropertyFor(currentTab.filePath);
        setAddPropertyRequest((n) => n + 1);
      },
      toggleAllProperties: () => setShowAllProperties((p) => !p),
      newBase: () => { void handleNewBase(); },
      importNotes: () => setShowImport(true),
      openWebReader: () => { if (webReaderUrl === null) setWebReaderUrl(""); },
      openInNewWindow: () => { void openPopout(false); },
      moveToNewWindow: () => { void openPopout(true); },
      manageWorkspaces: () => setShowWorkspaces(true),
      saveWorkspaceLayout: () => {
        // With a layout in use, this saves over it; otherwise it asks for a name.
        if (layoutStore.active) saveLayoutAs(layoutStore.active);
        else setShowWorkspaces(true);
      },
      revealActiveFile: () => { if (activeTab) { if (sidebarCollapsed) handleToggleSidebar(); revealInFileList(activeTab); } },
      collapseAllFolders: () => setExpandedFolders([]),
      foldAll: () => { const v = shownView(); if (v) foldAllHeadingsAndLists(v); },
      unfoldAll: () => { const v = shownView(); if (v) unfoldAll(v); },
    };
    actions[action]?.();
  }, [handleSave, handleSaveAs, handleNewFile, handleNewFolder, handleOpenFile, activeTab, tabs, closeTab, handleCloseAllTabs, handleCloseOtherTabs, handleDeleteFile, handleGitSync, handleToggleFullscreen, handleToggleSidebar, handleZenMode, handleDailyNote, activeVault, openFile, content, currentTab, handleNewBoard, handleNewDrawing, handleInsertToc, handleUpdateToc, handleInsertDataview, handleFocusMode, handlePublish, pdfFile, handleTogglePin, handleSplitRight, handleCloseSplit, openKnowledgeIngest, viewMode, layoutStore, saveLayoutAs, handleNewBase, handleUniqueNote, openPopout, webReaderUrl, setWebReaderUrl]);

  // ============================================================
  // Recent commands handler
  // ============================================================

  const handleRecentCommand = useCallback((action: HotkeyAction) => {
    setRecentCommands((prev) => {
      const filtered = prev.filter((a) => a !== action);
      const updated = [action, ...filtered].slice(0, 5);
      try {
        localStorage.setItem("noteriv-recent-commands", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // ============================================================
  // Hotkey settings persistence
  // ============================================================

  const handleHotkeysChange = useCallback(async (newHotkeys: HotkeyBinding[]) => {
    setHotkeys(newHotkeys);
    if (window.electronAPI) {
      const stored = await window.electronAPI.loadSettings();
      stored.hotkeys = hotkeysToPersist(newHotkeys);
      await window.electronAPI.saveSettings(stored);
    }
  }, []);

  const handleSettingsChange = useCallback(async (newSettings: AppSettings) => {
    settingsRef.current = newSettings;
    setSettings(newSettings);
    applySettings(newSettings);
    // Apply theme if changed
    if (newSettings.theme) {
      const allBuiltIn = BUILT_IN_THEMES;
      const theme = allBuiltIn.find((t) => t.id === newSettings.theme);
      if (theme) applyTheme(theme);
      // Also check custom themes
      if (!theme && activeVault) {
        loadCustomThemes(activeVault.path).then((customs) => {
          const custom = customs.find((t) => t.id === newSettings.theme);
          if (custom) applyTheme(custom);
        });
      }
    }
    if (window.electronAPI) {
      const stored = await window.electronAPI.loadSettings();
      const { ...appFields } = newSettings;
      await window.electronAPI.saveSettings({ ...stored, ...appFields });
    }
  }, [activeVault]);

  const adjustEditorFontSize = useCallback((delta: number) => {
    const currentSettings = settingsRef.current;
    const fontSize = Math.max(11, Math.min(24, currentSettings.fontSize + delta));
    if (fontSize !== currentSettings.fontSize) {
      const nextSettings = { ...currentSettings, fontSize };
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      applySettings(nextSettings);

      if (fontSizeSaveRef.current) clearTimeout(fontSizeSaveRef.current);
      fontSizeSaveRef.current = setTimeout(async () => {
        if (!window.electronAPI) return;
        const stored = await window.electronAPI.loadSettings();
        await window.electronAPI.saveSettings({ ...stored, ...nextSettings });
      }, 250);
    }
  }, []);

  // ============================================================
  // Keyboard shortcuts (driven by configurable hotkeys)
  // ============================================================

  const getKeys = useCallback((action: HotkeyAction): string => {
    return hotkeys.find((h) => h.action === action)?.keys ?? "";
  }, [hotkeys]);

  // The editor checks these so it does not also act on an app shortcut's keys.
  useEffect(() => {
    setActiveHotkeys(hotkeys);
  }, [hotkeys]);

  useEffect(() => {
    if (appState !== "app") return;
    // Don't capture hotkeys when a modal is open (settings handles its own)
    if (showSettings || showKnowledgeIngest) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Support both the main keyboard and numpad variants. Tauri does not
      // provide browser zoom controls, so these adjust the editor font size.
      const primaryModifier = e.ctrlKey || e.metaKey;
      const zoomIn = e.key === "+" || e.key === "=" || e.code === "NumpadAdd";
      const zoomOut = e.key === "-" || e.code === "NumpadSubtract";
      if (primaryModifier && !e.altKey && (zoomIn || zoomOut)) {
        e.preventDefault();
        adjustEditorFontSize(zoomIn ? 1 : -1);
        return;
      }

      // The same handlers the command palette runs, so a shortcut and its
      // command cannot drift apart. Only the palette itself differs: it is
      // already open when it runs a command, and a shortcut has to open it.
      const run = (action: HotkeyAction) => {
        if (action === "commandPalette") setShowCommandPalette(true);
        else handleCommandExecute(action);
      };

      for (const binding of hotkeys) {
        // Skip empty bindings and actions handled by CodeMirror natively
        if (!binding.keys) continue;
        if (EDITOR_NATIVE_ACTIONS.has(binding.action)) continue;

        if (matchesHotkey(e, binding.keys)) {
          e.preventDefault();
          run(binding.action);
          return;
        }
      }

      for (const cmd of pluginManagerRef.current?.getCommands() ?? []) {
        if (cmd.hotkey && matchesHotkey(e, cmd.hotkey)) {
          e.preventDefault();
          runPluginCommand(cmd);
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appState, hotkeys, showSettings, showKnowledgeIngest, handleCommandExecute, adjustEditorFontSize, runPluginCommand]);

  // Electron menu events
  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI || appState !== "app" || showKnowledgeIngest) return;
    const cleanups = [
      window.electronAPI.onMenuSave(handleSave),
      window.electronAPI.onMenuSaveAs(handleSaveAs),
      window.electronAPI.onMenuNewFile(handleNewFile),
      window.electronAPI.onMenuOpenFile(handleOpenFile),
      window.electronAPI.onMenuSettings(() => setShowSettings(true)),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, [appState, handleSave, handleSaveAs, handleNewFile, handleOpenFile, showKnowledgeIngest]);

  // Folder opening must also work before the first vault has been configured.
  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI) return;
    return window.electronAPI.onMenuOpenFolder(handleOpenFolderAsVault);
  }, [handleOpenFolderAsVault]);

  // Web clipper: refresh sidebar when a note is clipped
  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI || appState !== "app") return;
    const cleanup = window.electronAPI.onClipperClipped?.(() => {
      setSidebarRefresh((k) => k + 1);
    });
    return () => cleanup?.();
  }, [appState]);

  // ============================================================
  // Render
  // ============================================================

  if (appState === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[var(--text-muted)]">Loading...</span>
        </div>
      </div>
    );
  }

  if (appState === "setup" || showSetupWizard) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <div className={`flex flex-col h-screen${zenMode ? " zen-mode" : ""}`}>
      {!zenMode && (
        <TitleBar
          tabs={tabInfos}
          activeTab={activeTab}
          vaults={vaults}
          activeVault={activeVault}
          sidebarCollapsed={sidebarCollapsed}
          viewMode={viewMode}
          showViewModes={!currentTab?.kind}
          pinnedTabs={pinnedTabs}
          onTabSelect={setActiveTab}
          onTabClose={closeTab}
          onTabReorder={reorderTabs}
          onToggleSidebar={handleToggleSidebar}
          onViewModeChange={setViewMode}
          onNewFile={handleNewFile}
          onSave={handleSave}
          onOpenSettings={() => setShowSettings(true)}
          onSwitchVault={handleSwitchVault}
          onCreateVault={() => setShowSetupWizard(true)}
          onDeleteVault={handleDeleteVault}
          onTogglePin={handleTogglePin}
          onCloseOtherTabs={handleCloseOtherTabs}
          onCloseAllTabs={handleCloseAllTabs}
          onCloseTabsToRight={async (filePath) => {
            const idx = tabsRef.current.findIndex((t) => t.filePath === filePath);
            const closing = tabsRef.current.filter((t, i) => i > idx && !pinnedTabs.has(t.filePath));
            if (idx === -1 || !(await confirmDiscardUnsaved(closing))) return;
            setTabs((prev) => {
              const idx = prev.findIndex((t) => t.filePath === filePath);
              if (idx === -1) return prev;
              return prev.filter((t, i) => i <= idx || pinnedTabs.has(t.filePath));
            });
          }}
          onRevealInSidebar={(filePath) => {
            // Expand parent folders and scroll to file
            const parts = filePath.split("/");
            const folders: string[] = [];
            for (let i = 1; i < parts.length - 1; i++) {
              folders.push(parts.slice(0, i + 1).join("/"));
            }
            setExpandedFolders((prev) => {
              const next = new Set(prev);
              for (const f of folders) next.add(f);
              return Array.from(next);
            });
            setSidebarCollapsed(false);
            manualSidebarCollapsedRef.current = false;
            sidebarCollapsedRef.current = false;
          }}
          onCopyPath={(filePath) => {
            navigator.clipboard.writeText(filePath);
          }}
          onSplitRight={(filePath) => handleSplitRight(filePath)}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {!zenMode && (
          <div className="ribbon">
            <div className="ribbon-top">
              <button className="ribbon-btn" title="Quick Open" onClick={() => setShowQuickOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <button className="ribbon-btn" title="New note" onClick={handleNewFile}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 2h5l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M8 6v4M6 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <button className="ribbon-btn" title="Daily note" onClick={handleDailyNote}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <button className="ribbon-btn" title="Graph view" onClick={() => { setGraphStartsLocal(false); setShowGraphView(true); }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 7.2l4-2.4M6 8.8l4 2.4" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button className="ribbon-btn" title="Command palette" onClick={() => setShowCommandPalette(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 5l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <button className="ribbon-btn" title="Search in vault" onClick={() => setShowVaultSearch(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M14 13l1 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <button className="ribbon-btn" title="Calendar view" onClick={() => setShowCalendarView(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M2 7h12" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="5.5" cy="10" r="1" fill="currentColor" />
                  <circle cx="8" cy="10" r="1" fill="currentColor" />
                  <circle cx="10.5" cy="10" r="1" fill="currentColor" />
                </svg>
              </button>
              <button className="ribbon-btn" title="Vault insights" onClick={() => setShowVaultInsights(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="9" width="3" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="6.5" y="5" width="3" height="9" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="11" y="2" width="3" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button className="ribbon-btn" title="Presentation" onClick={() => setShowSlidePresentation(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 11v3M5 14h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              {pluginUI.sidebarPanels.map((panel) => (
                <button
                  key={panel.id}
                  className={`ribbon-btn${openPluginPanels.includes(panel.id) ? " ribbon-btn-active" : ""}`}
                  title={panel.title}
                  onClick={() => togglePluginPanel(panel.id)}
                >
                  <PluginPanelIcon icon={panel.icon} />
                </button>
              ))}
            </div>
            <div className="ribbon-bottom">
              <button className="ribbon-btn" title="Settings" onClick={() => setShowSettings(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}
        {!zenMode && (
          <Sidebar
            vault={activeVault}
            currentFile={activeTab}
            onFileSelect={openFile}
            onFileDelete={handleFileDelete}
            onFileRename={handleFileRename}
            onMoveFile={handleMoveFile}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            collapsed={sidebarCollapsed}
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
            onCollapse={handleToggleSidebar}
            expandedFolders={expandedFolders}
            onExpandedFoldersChange={setExpandedFolders}
            fileOrder={fileOrder}
            onFileOrderChange={setFileOrder}
            refreshTrigger={sidebarRefresh}
            onTrashFile={handleTrashFileFromSidebar}
            onAnalyzeNote={handleAnalyzeSidebarNote}
            renamePath={renamePath}
            onToggleBookmark={(path, isDirectory) =>
              setBookmarks((b) => toggleBookmarkItem(b, isDirectory ? "folder" : "file", path))
            }
            deletedFiles={settings.deletedFiles}
            fileSort={settings.fileSort}
            onFileSortChange={(fileSort) => handleSettingsChange({ ...settings, fileSort })}
            reveal={revealFile}
          />
        )}

        {/* Editor */}
        <div className="flex-1 overflow-hidden bg-[var(--bg-primary)] flex flex-col" data-vault-path={activeVault?.path || ""} data-open-file={currentTab?.filePath || ""} onContextMenu={handleEditorContextMenu}>
          {webReaderUrl !== null ? (
            <WebViewer
              // One reader: its name lets it keep its history and its place while another tab is in front.
              tabId="reader"
              url={webReaderUrl}
              onNavigate={setWebReaderUrl}
              onOpenExternal={(url) => { void window.electronAPI?.openExternal(url); }}
              onSaveNote={saveWebPage}
              onClose={() => {
                // Closed for good: its history goes with it. (Loaded this way because the reader is not part of the first page load.)
                void import("@/components/WebViewer").then((m) => m.forgetWebTab("reader"));
                setWebReaderUrl(null);
              }}
            />
          ) : currentTab && !currentTab.kind ? (
            <SplitPane
              left={
                <div className="flex flex-col h-full overflow-hidden">
                  <DocumentTitle
                    filePath={currentTab.filePath}
                    onRename={handleRenameCurrentFile}
                  />
                  {!zenMode &&
                    !isBoardFile(currentTab.filePath) &&
                    !isBoardContent(content) &&
                    viewMode !== "view" && (
                      <FormattingToolbar onAction={handleCommandExecute} />
                    )}
                  {viewMode !== "source" &&
                    !isBoardFile(currentTab.filePath) &&
                    !isBoardContent(content) &&
                    (hasProperties(content) || addPropertyFor === currentTab.filePath) && (
                      <PropertiesEditor
                        content={content}
                        onChange={applyTextEdit}
                        types={propertyTypes}
                        onTypeChange={changePropertyType}
                        vaultPath={activeVault?.path ?? null}
                        collapsed={propertiesCollapsed}
                        onToggleCollapse={() => setPropertiesCollapsed((c) => !c)}
                        addRequest={addPropertyRequest}
                        onDismiss={() => setAddPropertyFor(null)}
                      />
                    )}
                  <div className="flex-1 overflow-hidden">
                    {(isBoardFile(currentTab.filePath) || isBoardContent(content)) && viewMode !== "source" ? (
                      <BoardView content={content} onChange={handleContentChange} />
                    ) : viewMode === "view" ? (
                      <ReadOnlyView content={content} onChange={handleContentChange} onViewReady={handleReadViewReady} notePath={currentTab.filePath} />
                    ) : viewMode === "source" ? (
                      <SourceEditor content={content} onChange={handleContentChange} onViewReady={handleEditorViewReady} vaultPath={activeVault?.path} notePath={currentTab.filePath} />
                    ) : (
                      <Editor content={content} onChange={handleContentChange} onViewReady={handleEditorViewReady} vaultPath={activeVault?.path} notePath={currentTab.filePath} focusMode={focusMode} />
                    )}
                  </div>
                </div>
              }
              right={
                splitTabState ? (
                  <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                      <span className="text-xs text-[var(--text-secondary)] truncate">
                        {splitTabState.filePath.split("/").pop()}
                      </span>
                      <button
                        onClick={handleCloseSplit}
                        className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="Close split"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      {(isBoardFile(splitTabState.filePath) || isBoardContent(splitContent)) && viewMode !== "source" ? (
                        <BoardView content={splitContent} onChange={handleSplitContentChange} />
                      ) : viewMode === "view" ? (
                        <ReadOnlyView content={splitContent} onChange={handleSplitContentChange} notePath={splitTabState.filePath} />
                      ) : viewMode === "source" ? (
                        <SourceEditor content={splitContent} onChange={handleSplitContentChange} onViewReady={(view) => { splitEditorViewRef.current = view; }} vaultPath={activeVault?.path} notePath={splitTabState.filePath} />
                      ) : (
                        <Editor content={splitContent} onChange={handleSplitContentChange} onViewReady={(view) => { splitEditorViewRef.current = view; }} vaultPath={activeVault?.path} notePath={splitTabState.filePath} focusMode={false} />
                      )}
                    </div>
                  </div>
                ) : null
              }
              splitRatio={splitRatio}
              onSplitRatioChange={setSplitRatio}
              direction="horizontal"
            />
          ) : !currentTab ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <p className="text-[var(--text-muted)] text-sm">No file open</p>
                <button
                  onClick={handleNewFile}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Create a new note
                </button>
              </div>
            </div>
          ) : currentTab.kind === "canvas" && activeVault ? (
            <Canvas
              filePath={currentTab.filePath}
              vaultPath={activeVault.path}
              onSave={async (c) => { if (window.electronAPI) await window.electronAPI.writeFile(currentTab.filePath, c); }}
              onFileSelect={(f, page) => {
                // A PDF card that shows a page opens the PDF at that page.
                if (page) setPdfPageRequest({ filePath: f, page, tick: Date.now() });
                void openFile(f);
              }}
              onClose={() => closeTab(currentTab.filePath)}
            />
          ) : currentTab.kind === "base" && activeVault ? (
            <BaseView filePath={currentTab.filePath} vaultPath={activeVault.path} onOpenFile={openFile} />
          ) : currentTab.kind === "image" ? (
            <ImageViewer filePath={currentTab.filePath} />
          ) : currentTab.kind === "pdf" && activeVault ? (
            <PDFViewer
              filePath={currentTab.filePath}
              vaultPath={activeVault.path}
              onExportedNote={(mdPath) => { openFile(mdPath); setSidebarRefresh((k) => k + 1); }}
              onClose={() => closeTab(currentTab.filePath)}
              initialPage={pdfPageRequest?.filePath === currentTab.filePath ? pdfPageRequest.page : undefined}
              pageRequest={pdfPageRequest?.tick}
            />
          ) : null}
        </div>

        {/* Editor context menu */}
        {editorContextMenu && (
          <ContextMenu
            x={editorContextMenu.x}
            y={editorContextMenu.y}
            items={getEditorContextMenuItems()}
            onClose={() => setEditorContextMenu(null)}
          />
        )}

        {/* Right side panels */}
        {showOutline && currentTab && (
          <OutlinePanel
            content={content}
            onHeadingClick={handleHeadingClick}
            onClose={() => setShowOutline(false)}
          />
        )}
        {showFootnotes && currentTab && !currentTab.kind && (
          <FootnotesPanel
            content={content}
            onLineClick={handleHeadingClick}
            onClose={() => setShowFootnotes(false)}
          />
        )}
        {showAllProperties && activeVault && (
          <AllPropertiesPanel
            vaultPath={activeVault.path}
            types={propertyTypes}
            onTypeChange={changePropertyType}
            onSearch={(query) => { setVaultSearchQuery(query); setShowVaultSearch(true); }}
            onClose={() => setShowAllProperties(false)}
          />
        )}
        {showBacklinks && activeVault && currentTab && (
          <BacklinksPanel
            filePath={currentTab.filePath}
            vaultPath={activeVault.path}
            content={currentTab.content}
            onContentChange={applyTextEdit}
            onFileOpen={openFileAtLine}
            onClose={() => setShowBacklinks(false)}
          />
        )}
        {pluginUI.sidebarPanels
          .filter((panel) => openPluginPanels.includes(panel.id))
          .map((panel) => (
            <PluginSidebarPanel
              key={panel.id}
              panel={panel}
              onClose={() => togglePluginPanel(panel.id)}
            />
          ))}
        <TagPane
          vaultPath={activeVault?.path || ""}
          onTagClick={() => {}}
          onFileSelect={openFile}
          visible={showTagPane}
        />
        <BookmarksPanel
          store={bookmarks}
          vaultPath={activeVault?.path || ""}
          currentFile={activeTab}
          onOpen={openBookmark}
          onChange={setBookmarks}
          visible={bookmarks.items.length > 0 || bookmarks.groups.length > 0 || showTagPane}
        />
        {showLintPanel && currentTab && activeVault && (
          <LintPanel
            content={content}
            vaultPath={activeVault.path}
            onLineClick={handleHeadingClick}
            onClose={() => setShowLintPanel(false)}
          />
        )}
      </div>

      {/* Status bar */}
      {!zenMode && (
        <div className="flex items-center justify-between h-6 px-3 bg-[var(--bg-secondary)] border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] select-none shrink-0">
          <div className="flex items-center gap-3">
            <span>{viewMode === "live" ? "Edit" : viewMode === "view" ? "View" : "Source"}</span>
            {activeVault && <span>{activeVault.name}</span>}
            {activeTab && (
              <span className="truncate max-w-md">
                {activeVault ? activeTab.replace(activeVault.path, "~") : activeTab}
              </span>
            )}
            {statusNote && (
              <span className="text-[var(--text-secondary)]" role="status" aria-live="polite">
                {statusNote}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {currentTab && (
              <span
                className={currentTab.externalConflict ? "text-[var(--red)]" : isDirty ? "text-[var(--yellow)]" : "text-[var(--green)]"}
                title={currentTab.externalConflict ? "The file changed on disk. Autosave is paused; saving requires confirmation." : undefined}
              >
                {currentTab.externalConflict ? "external change" : isDirty ? "unsaved" : "saved"}
              </span>
            )}
            {(activeVault?.gitRemote || settings.extraSyncProvider !== "none") && (
              <button
                onClick={() => performSync()}
                className={`statusbar-sync${syncStatus === "syncing" ? " syncing" : ""}${syncStatus === "error" ? " sync-error" : ""}`}
                title={syncStatus === "error" && syncError ? `Sync failed — click to retry.\n${syncError}` : lastSyncTime ? `Last synced: ${lastSyncTime.toLocaleTimeString()}` : "Click to sync"}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className={syncStatus === "syncing" ? "spin" : ""}>
                  <path d="M2 8a6 6 0 0110.5-4M14 8a6 6 0 01-10.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M12 2v3h-3M4 14v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {syncStatus === "syncing" ? "syncing" : syncStatus === "error" ? "sync failed" : gitChanges > 0 ? `${gitChanges} changes` : lastSyncTime ? `synced ${lastSyncTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "sync"}
              </button>
            )}
            {currentTab && !currentTab.kind && (
              <>
                <span>{plural(countWords(content), "word", "words")}</span>
                <span>{content.split("\n").length} lines</span>
                <span>{content.length} chars</span>
              </>
            )}
            {!currentTab?.kind && pluginUI.statusBarItems.map((item) => (
              <span
                key={item.id}
                className={item.onClick ? "cursor-pointer hover:text-[var(--text-secondary)]" : ""}
                onClick={item.onClick}
                title={item.title}
              >
                {item.text}
              </span>
            ))}
          </div>
        </div>
      )}

      <SyncConflictNotice
        conflicts={conflictsFor(syncConflicts, activeVault?.path)}
        onOpen={(filePath) => { void openConflictCopy(filePath); }}
        onDismiss={() => setSyncConflicts((prev) => dismissConflicts(prev, activeVault?.path))}
      />

      {/* Settings */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          hotkeys={hotkeys}
          platform={platform}
          vaultPath={activeVault?.path || ""}
          vault={activeVault}
          onSettingsChange={handleSettingsChange}
          onHotkeysChange={handleHotkeysChange}
          onVaultUpdate={(v) => { setActiveVault(v); setVaults((prev) => prev.map((x) => x.id === v.id ? v : x)); }}
          onOpenPlugins={() => { setShowSettings(false); setShowPluginManager(true); }}
          onOpenSnippets={() => { setShowSettings(false); setShowCSSSnippets(true); }}
          pluginTabs={pluginUI.settingsTabs}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Quick open (Ctrl+P) */}
      {showQuickOpen && activeVault && (
        <QuickOpen
          vaultPath={activeVault.path}
          onSelect={openFile}
          onClose={() => setShowQuickOpen(false)}
        />
      )}

      {/* Vault search (Ctrl+Shift+F) */}
      {showImport && activeVault && (
        <ImportModal
          vaultPath={activeVault.path}
          onImported={(folder) => {
            // New notes: the file list, the index and anything drawn from them start afresh.
            invalidateVaultIndex();
            setSidebarRefresh((k) => k + 1);
            if (folder) {
              const first = folder.split("/")[0];
              setExpandedFolders((open) => {
                const path = `${activeVault.path}/${first}`;
                return open.includes(path) ? open : [...open, path];
              });
            }
          }}
          onClose={() => setShowImport(false)}
        />
      )}
      {showWorkspaces && activeVault && (
        <WorkspacesModal
          store={layoutStore}
          onSave={saveLayoutAs}
          onLoad={(name) => { void loadLayout(name); }}
          onRename={(from, to) => changeLayouts((store) => renameLayout(store, from, to))}
          onDelete={(name) => changeLayouts((store) => removeLayout(store, name))}
          onClose={() => setShowWorkspaces(false)}
        />
      )}
      {showVaultSearch && activeVault && (
        <VaultSearch
          vaultPath={activeVault.path}
          initialQuery={vaultSearchQuery}
          onSelect={openFileAtLine}
          onClose={() => { setShowVaultSearch(false); setVaultSearchQuery(""); }}
          isBookmarked={(q) => bookmarks.items.some((b) => b.kind === "search" && b.target === q)}
          onToggleBookmark={(q) => setBookmarks((b) => toggleBookmarkItem(b, "search", q))}
        />
      )}

      {/* Command palette (Ctrl+Shift+P) */}
      {showCommandPalette && (
        <CommandPalette
          hotkeys={hotkeys}
          platform={platform}
          recentActions={recentCommands}
          pluginCommands={pluginUI.commands}
          onExecute={handleCommandExecute}
          onRunPluginCommand={runPluginCommand}
          onRecent={handleRecentCommand}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {/* Graph view */}
      {showGraphView && activeVault && (
        <GraphView
          vaultPath={activeVault.path}
          currentFile={activeTab}
          startLocal={graphStartsLocal}
          onFileSelect={(f) => { openFile(f); setShowGraphView(false); }}
          onClose={() => setShowGraphView(false)}
        />
      )}

      {/* Template picker */}
      {showTemplatePicker && activeVault && (
        <TemplatePicker
          vaultPath={activeVault.path}
          noteTitle={currentTab?.filePath.split("/").pop()?.replace(/\.md$/i, "") || "Untitled"}
          onInsert={(tpl) => {
            if (editorViewRef.current) {
              const view = editorViewRef.current;
              const pos = view.state.selection.main.head;
              view.dispatch({ changes: { from: pos, insert: tpl } });
            }
            setShowTemplatePicker(false);
          }}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}

      {/* Note composer */}
      {showNoteComposer && activeVault && (
        <NoteComposer
          vaultPath={activeVault.path}
          currentFile={activeTab}
          currentContent={content}
          onClose={() => setShowNoteComposer(false)}
          onFileSelect={openFile}
          onContentChange={handleContentChange}
        />
      )}

      {/* File recovery */}
      {showFileRecovery && activeVault && currentTab && (
        <FileRecovery
          vaultPath={activeVault.path}
          currentFile={currentTab.filePath}
          currentContent={content}
          onRestore={(restored) => { handleContentChange(restored); setShowFileRecovery(false); }}
          onClose={() => setShowFileRecovery(false)}
        />
      )}

      {/* Audio recorder */}
      {showAudioRecorder && activeVault && (
        <AudioRecorder
          vaultPath={activeVault.path}
          notePath={activeTab}
          onInsert={(link) => {
            if (editorViewRef.current) {
              const view = editorViewRef.current;
              const pos = view.state.selection.main.head;
              view.dispatch({ changes: { from: pos, insert: link } });
            }
            setShowAudioRecorder(false);
          }}
          onClose={() => setShowAudioRecorder(false)}
        />
      )}

      {/* Attachment manager */}
      {showAttachments && activeVault && (
        <AttachmentManager
          vaultPath={activeVault.path}
          notePath={activeTab}
          onInsert={(link) => {
            if (editorViewRef.current) {
              const view = editorViewRef.current;
              const pos = view.state.selection.main.head;
              view.dispatch({ changes: { from: pos, insert: link } });
            }
            setShowAttachments(false);
          }}
          onClose={() => setShowAttachments(false)}
        />
      )}

      {/* Slide presentation */}
      {showSlidePresentation && (
        <SlidePresentation
          content={content}
          onClose={() => setShowSlidePresentation(false)}
        />
      )}

      {/* Plugin manager */}
      {showPluginManager && activeVault && (
        <PluginManagerModal
          vaultPath={activeVault.path}
          plugins={pluginInstances}
          onTogglePlugin={async (id, enabled) => {
            const pm = pluginManagerRef.current;
            if (pm) {
              await pm.setPluginEnabled(id, enabled);
              setPluginInstances(pm.getPlugins());
            }
          }}
          onInstallPlugin={async () => {
            if (!window.electronAPI) return;
            const folder = await window.electronAPI.openFolder();
            if (!folder) return;
            const pm = pluginManagerRef.current;
            if (pm) {
              try {
                await pm.installPlugin(folder);
                await pm.loadAllEnabled();
                setPluginInstances(pm.getPlugins());
              } catch {}
            }
          }}
          onUninstallPlugin={async (id) => {
            const pm = pluginManagerRef.current;
            if (pm) {
              await pm.uninstallPlugin(id);
              setPluginInstances(pm.getPlugins());
            }
          }}
          onClose={() => setShowPluginManager(false)}
        />
      )}

      {/* CSS Snippets */}
      {showCSSSnippets && activeVault && (
        <CSSSnippets
          vaultPath={activeVault.path}
          snippets={cssSnippets}
          onSnippetsChange={(snips) => {
            setCSSSnippets(snips);
            refreshSnippets(snips);
          }}
          onClose={() => setShowCSSSnippets(false)}
        />
      )}

      {/* Calendar View */}
      {showCalendarView && activeVault && (
        <CalendarView
          vaultPath={activeVault.path}
          onFileSelect={(f) => { openFile(f); setShowCalendarView(false); }}
          onCreateDailyNote={(date) => { handleCreateDailyNote(date); setShowCalendarView(false); }}
          onClose={() => setShowCalendarView(false)}
        />
      )}

      {/* Drawing Editor */}
      {drawingFile && activeVault && (
        <DrawingEditor
          filePath={drawingFile}
          vaultPath={activeVault.path}
          onSave={() => setSidebarRefresh((k) => k + 1)}
          onClose={() => closeTab(drawingFile)}
        />
      )}


      {/* Publish Preview */}
      {showPublish && currentTab && activeVault && (
        <PublishPreview
          content={content}
          title={currentTab.filePath.split("/").pop()?.replace(/\.(md|markdown)$/i, "") || "note"}
          vaultPath={activeVault.path}
          onClose={() => setShowPublish(false)}
        />
      )}

      {/* Flashcard Review */}
      {showFlashcards && activeVault && (
        <FlashcardReview
          vaultPath={activeVault.path}
          onFileSelect={(f) => { openFile(f); setShowFlashcards(false); }}
          onClose={() => setShowFlashcards(false)}
        />
      )}

      {/* Live Collaboration */}
      {showCollab && (
        <CollabPanel
          content={content}
          onContentChange={handleContentChange}
          onClose={() => setShowCollab(false)}
        />
      )}

      {/* Trash Panel */}
      {showTrash && activeVault && (
        <TrashPanel
          vaultPath={activeVault.path}
          onClose={() => setShowTrash(false)}
          onRestored={() => setSidebarRefresh((k) => k + 1)}
        />
      )}

      {/* Note History */}
      {showNoteHistory && activeVault && currentTab && (
        <NoteHistory
          filePath={currentTab.filePath}
          vaultPath={activeVault.path}
          currentContent={content}
          onRestore={(restored) => { handleContentChange(restored); setShowNoteHistory(false); }}
          onClose={() => setShowNoteHistory(false)}
        />
      )}

      {/* Time Scrubber */}
      {showTimeScrubber && activeVault && currentTab && (
        <TimeScrubber
          filePath={currentTab.filePath}
          vaultPath={activeVault.path}
          currentContent={content}
          onRestore={(restored) => { handleContentChange(restored); setShowTimeScrubber(false); }}
          onClose={() => setShowTimeScrubber(false)}
        />
      )}

      {/* Vault Insights */}
      {showVaultInsights && activeVault && (
        <VaultInsights
          vaultPath={activeVault.path}
          onFileSelect={(f) => { openFile(f); setShowVaultInsights(false); }}
          onClose={() => setShowVaultInsights(false)}
        />
      )}

      {showKnowledgeIngest && activeVault && (
        <KnowledgeIngest
          vaults={vaults}
          activeVaultId={activeVault.id}
          initialSource={knowledgeSource}
          onClose={() => { setShowKnowledgeIngest(false); setKnowledgeSource(null); }}
          onApplied={handleKnowledgeApplied}
          isFileDirty={isKnowledgeTargetDirty}
        />
      )}

      <ConfirmDialogHost />
    </div>
  );
}
