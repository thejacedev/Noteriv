"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import TitleBar from "@/components/TitleBar";
import SetupWizard from "@/components/SetupWizard";
import DocumentTitle from "@/components/DocumentTitle";
import SettingsModal from "@/components/SettingsModal";
import QuickOpen from "@/components/QuickOpen";
import VaultSearch from "@/components/VaultSearch";
import CommandPalette from "@/components/CommandPalette";
import OutlinePanel from "@/components/OutlinePanel";
import BacklinksPanel from "@/components/BacklinksPanel";
import TagPane from "@/components/TagPane";
import TemplatePicker from "@/components/TemplatePicker";
import BookmarksPanel from "@/components/BookmarksPanel";
import FrontmatterEditor from "@/components/FrontmatterEditor";
import NoteComposer from "@/components/NoteComposer";
import FileRecovery from "@/components/FileRecovery";
import AudioRecorder from "@/components/AudioRecorder";
import AttachmentManager from "@/components/AttachmentManager";
import PluginManagerModal from "@/components/PluginManager";
import CSSSnippets from "@/components/CSSSnippets";
import {
  HotkeyBinding,
  HotkeyAction,
  DEFAULT_HOTKEYS,
  matchesHotkey,
  mergeHotkeys,
  hotkeysToPersist,
} from "@/lib/hotkeys";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  mergeSettings,
  applySettings,
  formatCommitMessage,
} from "@/lib/settings";
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
import { toggleBookmark, isBookmarked } from "@/lib/bookmark-utils";
import { getRandomNote } from "@/lib/random-note";
import { exportToPDF } from "@/lib/pdf-export";
import { saveSnapshot } from "@/lib/file-recovery";
import { PluginManager, type PluginInstance } from "@/lib/plugin-api";
import { BUILT_IN_THEMES, applyTheme, loadCustomThemes } from "@/lib/theme-utils";
import { loadSnippets, refreshSnippets, type CSSSnippet } from "@/lib/css-snippets";
import type { EditorView } from "@codemirror/view";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });
const SourceEditor = dynamic(() => import("@/components/SourceEditor"), { ssr: false });
const ReadOnlyView = dynamic(() => import("@/components/ReadOnlyView"), { ssr: false });
const GraphView = dynamic(() => import("@/components/GraphView"), { ssr: false });
const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });
const SlidePresentation = dynamic(() => import("@/components/SlidePresentation"), { ssr: false });

type ViewMode = "live" | "source" | "view";
type AppState = "loading" | "setup" | "app";

interface TabState {
  filePath: string;
  content: string;
  savedContent: string;
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  // Vault
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [activeVault, setActiveVault] = useState<Vault | null>(null);

  // Tabs
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // UI
  const [viewMode, setViewMode] = useState<ViewMode>("live");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
  const [showGraphView, setShowGraphView] = useState(false);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [showTagPane, setShowTagPane] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [showFileRecovery, setShowFileRecovery] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showSlidePresentation, setShowSlidePresentation] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [frontmatterCollapsed, setFrontmatterCollapsed] = useState(true);

  // Ecosystem
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showCSSSnippets, setShowCSSSnippets] = useState(false);
  const [pluginInstances, setPluginInstances] = useState<PluginInstance[]>([]);
  const [cssSnippets, setCSSSnippets] = useState<CSSSnippet[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [pluginUITick, setPluginUITick] = useState(0);
  const pluginManagerRef = useRef<PluginManager | null>(null);

  // Editor view ref (for formatting commands)
  const editorViewRef = useRef<EditorView | null>(null);
  const contentRef = useRef<string>("");
  const activeTabRef = useRef<string | null>(null);

  // Sync status
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [gitChanges, setGitChanges] = useState(0);

  // Hotkeys
  const [hotkeys, setHotkeys] = useState<HotkeyBinding[]>(DEFAULT_HOTKEYS.map((d) => ({ ...d })));

  // App settings
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS });

  // Timers
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gitPushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workspaceSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Current tab helpers
  const currentTab = tabs.find((t) => t.filePath === activeTab) || null;
  const content = currentTab?.content || "";
  const isDirty = currentTab ? currentTab.content !== currentTab.savedContent : false;

  useEffect(() => {
    contentRef.current = content;
    activeTabRef.current = activeTab;
  });

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
      sidebarCollapsed,
      viewMode,
      fileOrder,
    };
    await window.electronAPI.saveWorkspace(activeVault.path, state);
  }, [activeVault, tabs, activeTab, expandedFolders, sidebarCollapsed, viewMode, fileOrder]);

  // Debounced workspace save
  const debounceSaveWorkspace = useCallback(() => {
    if (workspaceSaveRef.current) clearTimeout(workspaceSaveRef.current);
    workspaceSaveRef.current = setTimeout(saveWorkspace, 1000);
  }, [saveWorkspace]);

  // Save workspace when state changes
  useEffect(() => {
    if (appState === "app") debounceSaveWorkspace();
  }, [appState, tabs.length, activeTab, expandedFolders, sidebarCollapsed, viewMode, fileOrder, debounceSaveWorkspace]);

  const loadWorkspace = useCallback(async (vault: Vault) => {
    if (!window.electronAPI) return;
    const ws = await window.electronAPI.loadWorkspace(vault.path);
    if (!ws) return;

    // Restore UI state
    setSidebarCollapsed(ws.sidebarCollapsed ?? false);
    setViewMode(ws.viewMode ?? "live");
    setExpandedFolders(ws.expandedFolders ?? []);
    setFileOrder(ws.fileOrder ?? {});

    // Restore tabs
    const restoredTabs: TabState[] = [];
    for (const filePath of ws.openTabs || []) {
      const fileContent = await window.electronAPI.readFile(filePath);
      if (fileContent !== null) {
        restoredTabs.push({ filePath, content: fileContent, savedContent: fileContent });
      }
    }
    setTabs(restoredTabs);
    setActiveTab(ws.activeTab && restoredTabs.some((t) => t.filePath === ws.activeTab) ? ws.activeTab : restoredTabs[0]?.filePath || null);
  }, []);

  // ============================================================
  // Initialization
  // ============================================================

  useEffect(() => {
    async function init() {
      if (!window.electronAPI) { setAppState("setup"); return; }

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
          } catch {}
        }

        await loadWorkspace(vault);

        // Fetch initial git status
        if (vault.gitRemote) {
          try {
            const status = await window.electronAPI.gitStatus(vault.path);
            setGitChanges(status.changes);
          } catch {}
        }

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
          pm.setUIChangeHandler(() => setPluginUITick((t) => t + 1));
          pluginManagerRef.current = pm;
          await pm.loadAllEnabled();
          setPluginInstances(pm.getPlugins());
        } catch {}

        // Load custom themes (for theme picker)
        try {
          await loadCustomThemes(vault.path);
        } catch {}

        setAppState("app");
      } else {
        setAppState("setup");
      }
    }
    init();
  }, [loadWorkspace]);

  // ============================================================
  // Auto-save every 30s
  // ============================================================

  useEffect(() => {
    if (appState !== "app" || settings.autoSaveInterval <= 0) return;
    autoSaveRef.current = setInterval(async () => {
      if (!window.electronAPI) return;
      for (const tab of tabs) {
        if (tab.content !== tab.savedContent) {
          const success = await window.electronAPI.writeFile(tab.filePath, tab.content);
          if (success) {
            setTabs((prev) =>
              prev.map((t) =>
                t.filePath === tab.filePath ? { ...t, savedContent: t.content } : t
              )
            );
          }
        }
      }
    }, settings.autoSaveInterval * 1000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [appState, tabs, settings.autoSaveInterval]);

  // ============================================================
  // Git sync
  // ============================================================

  const performSync = useCallback(async (message?: string) => {
    if (!window.electronAPI || !activeVault) return;
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
        const config =
          settings.extraSyncProvider === "folder" ? settings.folderSync :
          settings.extraSyncProvider === "webdav" ? settings.webdavSync : null;
        if (config) {
          await window.electronAPI.syncProviderSync(
            activeVault.path,
            settings.extraSyncProvider,
            config
          );
        }
      }

      setLastSyncTime(new Date());
      setSyncStatus("idle");
      // Refresh change count
      if (activeVault.gitRemote) {
        const status = await window.electronAPI.gitStatus(activeVault.path);
        setGitChanges(status.changes);
      }
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 3000);
    }
  }, [activeVault, saveWorkspace, settings.commitMessageFormat, settings.extraSyncProvider, settings.folderSync, settings.webdavSync]);

  const handleGitSync = performSync;

  // ============================================================
  // Git auto-sync interval
  // ============================================================

  useEffect(() => {
    if (appState !== "app" || settings.gitSyncInterval <= 0) return;
    gitPushRef.current = setInterval(() => {
      performSync();
    }, settings.gitSyncInterval * 60_000);
    return () => { if (gitPushRef.current) clearInterval(gitPushRef.current); };
  }, [appState, settings.gitSyncInterval, performSync]);

  // ============================================================
  // Periodic git status check (every 30s)
  // ============================================================

  useEffect(() => {
    if (appState !== "app" || !activeVault?.gitRemote) return;
    const interval = setInterval(async () => {
      if (!window.electronAPI) return;
      try {
        const status = await window.electronAPI.gitStatus(activeVault.path);
        setGitChanges(status.changes);
      } catch {}
    }, 30_000);
    return () => clearInterval(interval);
  }, [appState, activeVault]);

  // ============================================================
  // Vault operations
  // ============================================================

  const handleSetupComplete = useCallback(async (vault: Vault) => {
    setActiveVault(vault);
    if (window.electronAPI) setVaults(await window.electronAPI.getVaults());
    setShowSetupWizard(false);
    setTabs([]);
    setActiveTab(null);
    setAppState("app");
  }, []);

  const handleSwitchVault = useCallback(async (id: string) => {
    if (!window.electronAPI) return;
    // Save current workspace first
    await saveWorkspace();
    const vault = await window.electronAPI.setActiveVault(id);
    if (vault) {
      setActiveVault(vault);
      setTabs([]);
      setActiveTab(null);
      await loadWorkspace(vault);
    }
  }, [saveWorkspace, loadWorkspace]);

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

  const openFile = useCallback(async (filePath: string) => {
    // Check if already open using current state via ref
    let alreadyOpen = false;
    setTabs((prev) => {
      if (prev.some((t) => t.filePath === filePath)) {
        alreadyOpen = true;
        return prev; // no change
      }
      return prev; // will add below after reading
    });

    if (alreadyOpen) {
      setActiveTab(filePath);
      return;
    }

    if (!window.electronAPI) return;
    const fileContent = await window.electronAPI.readFile(filePath);
    if (fileContent === null) return;

    setTabs((prev) => {
      // Double-check to prevent race conditions
      if (prev.some((t) => t.filePath === filePath)) return prev;
      return [...prev, { filePath, content: fileContent, savedContent: fileContent }];
    });
    setActiveTab(filePath);
  }, []);

  const closeTab = useCallback((filePath: string) => {
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
  }, [activeTab]);

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
    setTabs((prev) => {
      const next = prev.filter((t) => !t.filePath.startsWith(filePath));
      if (activeTab && activeTab.startsWith(filePath)) {
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
  }, [activeTab]);

  const handleRenameCurrentFile = useCallback(async (newName: string) => {
    if (!window.electronAPI || !currentTab) return;
    const oldPath = currentTab.filePath;
    const dir = oldPath.substring(0, oldPath.lastIndexOf("/"));
    const oldFileName = oldPath.split("/").pop() || "";
    const ext = oldFileName.match(/\.(md|markdown)$/i)?.[0] || ".md";
    const newFileName = newName + ext;
    const newPath = `${dir}/${newFileName}`;
    if (newPath === oldPath) return;
    const success = await window.electronAPI.rename(oldPath, newPath);
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
  }, [currentTab, handleFileRename]);

  const handleMoveFile = useCallback(async (sourcePath: string, destDir: string) => {
    if (!window.electronAPI) return;
    const name = sourcePath.split("/").pop() || "";
    const newPath = `${destDir}/${name}`;
    if (newPath === sourcePath) return;
    const success = await window.electronAPI.rename(sourcePath, newPath);
    if (success) {
      handleFileRename(sourcePath, newPath);
    }
  }, [handleFileRename]);

  const handleContentChange = useCallback((newContent: string) => {
    if (!activeTab) return;
    setTabs((prev) =>
      prev.map((t) =>
        t.filePath === activeTab ? { ...t, content: newContent } : t
      )
    );
  }, [activeTab]);

  const handleSave = useCallback(async () => {
    if (!window.electronAPI || !currentTab) return;

    // Save snapshot for file recovery
    if (activeVault) {
      try { saveSnapshot(activeVault.path, currentTab.filePath, currentTab.content); } catch {}
    }
    const success = await window.electronAPI.writeFile(currentTab.filePath, currentTab.content);
    if (success) {
      setTabs((prev) =>
        prev.map((t) =>
          t.filePath === currentTab.filePath ? { ...t, savedContent: t.content } : t
        )
      );
      // Sync on save if enabled
      if (settings.syncOnSave && activeVault?.gitRemote) {
        performSync();
      }
    }
  }, [currentTab, settings.syncOnSave, activeVault, performSync]);

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

  const handleNewFile = useCallback(async () => {
    if (!window.electronAPI || !activeVault) return;
    // Find a unique filename
    let name = "Untitled.md";
    let counter = 1;
    const existing = await window.electronAPI.readDir(activeVault.path);
    const existingNames = existing.map((e) => e.name);
    while (existingNames.includes(name)) {
      counter++;
      name = `Untitled ${counter}.md`;
    }
    const filePath = `${activeVault.path}/${name}`;
    await window.electronAPI.createFile(filePath);
    setTabs((prev) => [...prev, { filePath, content: "", savedContent: "" }]);
    setActiveTab(filePath);
    setSidebarRefresh((k) => k + 1);
  }, [activeVault]);

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

  const handleCloseAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTab(null);
  }, []);

  const handleCloseOtherTabs = useCallback(() => {
    if (!activeTab) return;
    setTabs((prev) => prev.filter((t) => t.filePath === activeTab));
  }, [activeTab]);

  const handleDeleteFile = useCallback(async () => {
    if (!window.electronAPI || !currentTab) return;
    const success = await window.electronAPI.deleteFile(currentTab.filePath);
    if (success) {
      closeTab(currentTab.filePath);
    }
  }, [currentTab, closeTab]);

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
  }, []);

  // Wiki link click handler — global mousedown capture
  useEffect(() => {
    const handleWikiClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest(".md-wikilink, .wl-link, [data-target]") as HTMLElement | null;
      if (!link) return;

      const linkTarget = link.getAttribute("data-target") || link.textContent?.trim();
      if (!linkTarget || !window.electronAPI || !activeVault) return;

      e.stopImmediatePropagation();
      e.preventDefault();

      const normalized = linkTarget.replace(/\.md$/i, "").toLowerCase();
      window.electronAPI.listAllFiles(activeVault.path).then((files) => {
        const match = files.find((f) => {
          const rel = f.relativePath.replace(/\.(md|markdown)$/i, "").toLowerCase();
          const name = (f.filePath.split("/").pop() || "").replace(/\.(md|markdown)$/i, "").toLowerCase();
          return name === normalized || rel === normalized;
        });
        if (match) openFile(match.filePath);
      });
    };

    document.addEventListener("mousedown", handleWikiClick, true);
    return () => document.removeEventListener("mousedown", handleWikiClick, true);
  }, [activeVault, openFile]);

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

  const handleCommandExecute = useCallback((action: HotkeyAction) => {
    const view = editorViewRef.current;
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
      toggleSidebar: () => setSidebarCollapsed((c) => !c),
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
      graphView: () => setShowGraphView(true),
      toggleBacklinks: () => setShowBacklinks((b) => !b),
      toggleTags: () => setShowTagPane((t) => !t),
      insertTemplate: () => setShowTemplatePicker(true),
      toggleBookmark: () => { if (activeTab) setBookmarks((b) => toggleBookmark(b, activeTab)); },
      randomNote: async () => { if (activeVault) { const f = await getRandomNote(activeVault.path); if (f) openFile(f); } },
      noteComposer: () => setShowNoteComposer(true),
      fileRecovery: () => setShowFileRecovery(true),
      exportPDF: () => { if (currentTab) exportToPDF(content, currentTab.filePath.split("/").pop()?.replace(/\.md$/i, "") || "note"); },
      audioRecorder: () => setShowAudioRecorder(true),
      attachments: () => setShowAttachments(true),
      slidePresentation: () => setShowSlidePresentation(true),
      pluginManager: () => setShowPluginManager(true),
      cssSnippets: () => setShowCSSSnippets(true),
    };
    actions[action]?.();
  }, [handleSave, handleSaveAs, handleNewFile, handleNewFolder, handleOpenFile, activeTab, tabs, closeTab, handleCloseAllTabs, handleCloseOtherTabs, handleDeleteFile, handleGitSync, handleToggleFullscreen, handleZenMode, handleDailyNote, activeVault, openFile, content, currentTab]);

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

  // ============================================================
  // Keyboard shortcuts (driven by configurable hotkeys)
  // ============================================================

  const getKeys = useCallback((action: HotkeyAction): string => {
    return hotkeys.find((h) => h.action === action)?.keys ?? "";
  }, [hotkeys]);

  useEffect(() => {
    if (appState !== "app") return;
    // Don't capture hotkeys when a modal is open (settings handles its own)
    if (showSettings) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const view = editorViewRef.current;

      // Map actions to handlers
      const actions: Record<HotkeyAction, () => void> = {
        // File
        save: handleSave,
        saveAs: handleSaveAs,
        newFile: handleNewFile,
        newFolder: handleNewFolder,
        openFile: handleOpenFile,
        closeTab: () => { if (activeTab) closeTab(activeTab); },
        closeAllTabs: handleCloseAllTabs,
        closeOtherTabs: handleCloseOtherTabs,
        deleteFile: handleDeleteFile,
        // Navigation
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
        commandPalette: () => setShowCommandPalette(true),
        // Search
        findInFile: () => {}, // Handled by CodeMirror
        findInVault: () => setShowVaultSearch(true),
        // View
        toggleSidebar: () => setSidebarCollapsed((c) => !c),
        toggleViewMode: () => setViewMode((m) => m === "live" ? "view" : m === "view" ? "source" : "live"),
        toggleFullscreen: handleToggleFullscreen,
        zenMode: handleZenMode,
        settings: () => setShowSettings(true),
        // Edit
        undo: () => {}, // Handled by CodeMirror
        redo: () => {}, // Handled by CodeMirror
        // Formatting
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
        // Sync
        gitSync: handleGitSync,
        // Daily notes
        dailyNote: handleDailyNote,
        // Outline
        toggleOutline: () => setShowOutline((o) => !o),
        // New features
        graphView: () => setShowGraphView(true),
        toggleBacklinks: () => setShowBacklinks((b) => !b),
        toggleTags: () => setShowTagPane((t) => !t),
        insertTemplate: () => setShowTemplatePicker(true),
        toggleBookmark: () => { if (activeTab) setBookmarks((b) => toggleBookmark(b, activeTab)); },
        randomNote: async () => { if (activeVault) { const f = await getRandomNote(activeVault.path); if (f) openFile(f); } },
        noteComposer: () => setShowNoteComposer(true),
        fileRecovery: () => setShowFileRecovery(true),
        exportPDF: () => { if (currentTab) exportToPDF(content, currentTab.filePath.split("/").pop()?.replace(/\.md$/i, "") || "note"); },
        audioRecorder: () => setShowAudioRecorder(true),
        attachments: () => setShowAttachments(true),
        slidePresentation: () => setShowSlidePresentation(true),
        pluginManager: () => setShowPluginManager(true),
        cssSnippets: () => setShowCSSSnippets(true),
      };

      for (const binding of hotkeys) {
        // Skip empty bindings and actions handled by CodeMirror natively
        if (!binding.keys) continue;
        if (binding.action === "findInFile" || binding.action === "undo" || binding.action === "redo") continue;

        if (matchesHotkey(e, binding.keys)) {
          e.preventDefault();
          actions[binding.action]?.();
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appState, hotkeys, handleSave, handleSaveAs, handleNewFile, handleNewFolder, handleOpenFile, activeTab, tabs, closeTab, showSettings, handleCloseAllTabs, handleCloseOtherTabs, handleDeleteFile, handleGitSync, handleToggleFullscreen, handleZenMode, handleDailyNote, activeVault, openFile, content, currentTab]);

  // Electron menu events
  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI || appState !== "app") return;
    const cleanups = [
      window.electronAPI.onMenuSave(handleSave),
      window.electronAPI.onMenuSaveAs(handleSaveAs),
      window.electronAPI.onMenuNewFile(handleNewFile),
      window.electronAPI.onMenuOpenFile(handleOpenFile),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, [appState, handleSave, handleSaveAs, handleNewFile, handleOpenFile]);

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
          onTabSelect={setActiveTab}
          onTabClose={closeTab}
          onTabReorder={reorderTabs}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          onViewModeChange={setViewMode}
          onNewFile={handleNewFile}
          onSave={handleSave}
          onOpenSettings={() => setShowSettings(true)}
          onSwitchVault={handleSwitchVault}
          onCreateVault={() => setShowSetupWizard(true)}
          onDeleteVault={handleDeleteVault}
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
              <button className="ribbon-btn" title="Graph view" onClick={() => setShowGraphView(true)}>
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
              <button className="ribbon-btn" title="Presentation" onClick={() => setShowSlidePresentation(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 11v3M5 14h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
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
            expandedFolders={expandedFolders}
            onExpandedFoldersChange={setExpandedFolders}
            fileOrder={fileOrder}
            onFileOrderChange={setFileOrder}
            refreshTrigger={sidebarRefresh}
          />
        )}

        {/* Editor */}
        <div className="flex-1 overflow-hidden bg-[var(--bg-primary)] flex flex-col">
          {currentTab ? (
            <>
              <DocumentTitle
                filePath={currentTab.filePath}
                onRename={handleRenameCurrentFile}
              />
              <div className="flex-1 overflow-hidden">
                {viewMode === "view" ? (
                  <ReadOnlyView content={content} />
                ) : viewMode === "source" ? (
                  <SourceEditor content={content} onChange={handleContentChange} onViewReady={handleEditorViewReady} vaultPath={activeVault?.path} />
                ) : (
                  <Editor content={content} onChange={handleContentChange} onViewReady={handleEditorViewReady} vaultPath={activeVault?.path} />
                )}
              </div>
            </>
          ) : (
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
          )}
        </div>

        {/* Right side panels */}
        {showOutline && currentTab && (
          <OutlinePanel
            content={content}
            onHeadingClick={handleHeadingClick}
            onClose={() => setShowOutline(false)}
          />
        )}
        {showBacklinks && activeVault && currentTab && (
          <BacklinksPanel
            filePath={currentTab.filePath}
            vaultPath={activeVault.path}
            onFileOpen={openFile}
            onClose={() => setShowBacklinks(false)}
          />
        )}
        <TagPane
          vaultPath={activeVault?.path || ""}
          onTagClick={() => {}}
          onFileSelect={openFile}
          visible={showTagPane}
        />
        <BookmarksPanel
          bookmarks={bookmarks}
          vaultPath={activeVault?.path || ""}
          currentFile={activeTab}
          onFileSelect={openFile}
          onBookmarkRemove={(f) => setBookmarks((b) => b.filter((x) => x !== f))}
          visible={bookmarks.length > 0 || showTagPane}
        />
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
          </div>
          <div className="flex items-center gap-3">
            {currentTab && (
              <span className={isDirty ? "text-[var(--yellow)]" : "text-[var(--green)]"}>
                {isDirty ? "unsaved" : "saved"}
              </span>
            )}
            {(activeVault?.gitRemote || settings.extraSyncProvider !== "none") && (
              <button
                onClick={() => performSync()}
                className={`statusbar-sync${syncStatus === "syncing" ? " syncing" : ""}${syncStatus === "error" ? " sync-error" : ""}`}
                title={lastSyncTime ? `Last synced: ${lastSyncTime.toLocaleTimeString()}` : "Click to sync"}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className={syncStatus === "syncing" ? "spin" : ""}>
                  <path d="M2 8a6 6 0 0110.5-4M14 8a6 6 0 01-10.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M12 2v3h-3M4 14v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {syncStatus === "syncing" ? "syncing" : syncStatus === "error" ? "sync failed" : gitChanges > 0 ? `${gitChanges} changes` : lastSyncTime ? `synced ${lastSyncTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "sync"}
              </button>
            )}
            <span>{content.split("\n").length} lines</span>
            <span>{content.length} chars</span>
            {pluginManagerRef.current?.getStatusBarItems().map((item) => (
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

      {/* Settings */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          hotkeys={hotkeys}
          platform={platform}
          vaultPath={activeVault?.path || ""}
          onSettingsChange={handleSettingsChange}
          onHotkeysChange={handleHotkeysChange}
          onOpenPlugins={() => { setShowSettings(false); setShowPluginManager(true); }}
          onOpenSnippets={() => { setShowSettings(false); setShowCSSSnippets(true); }}
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
      {showVaultSearch && activeVault && (
        <VaultSearch
          vaultPath={activeVault.path}
          onSelect={openFile}
          onClose={() => setShowVaultSearch(false)}
        />
      )}

      {/* Command palette (Ctrl+Shift+P) */}
      {showCommandPalette && (
        <CommandPalette
          hotkeys={hotkeys}
          platform={platform}
          onExecute={handleCommandExecute}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {/* Graph view */}
      {showGraphView && activeVault && (
        <GraphView
          vaultPath={activeVault.path}
          currentFile={activeTab}
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
    </div>
  );
}
