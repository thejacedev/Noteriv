import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppSettings, Vault, WorkspaceState, FileEntry } from '@/types';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import * as VaultOps from '@/lib/vault';
import * as FS from '@/lib/file-system';
import * as GitSync from '@/lib/github-sync';
import { getItem, KEYS } from '@/lib/storage';

interface AppContextType {
  // Vault
  vault: Vault | null;
  vaults: Vault[];
  switchVault: (id: string) => Promise<void>;
  createVault: (name: string) => Promise<Vault>;
  deleteVault: (id: string) => Promise<void>;
  refreshVaults: () => Promise<void>;

  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;

  // Workspace
  workspace: WorkspaceState;
  updateWorkspace: (updates: Partial<WorkspaceState>) => void;

  // File operations
  currentFile: string | null;
  content: string;
  setCurrentFile: (path: string | null) => void;
  setContent: (content: string) => void;
  saveFile: () => Promise<boolean>;
  files: FileEntry[];
  currentDir: string;
  setCurrentDir: (dir: string) => void;
  refreshFiles: () => void;

  // Setup
  setupComplete: boolean;
  completeSetup: () => Promise<void>;

  // State
  isLoading: boolean;
  isDirty: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [vault, setVault] = useState<Vault | null>(null);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [workspace, setWorkspace] = useState<WorkspaceState>({
    openTabs: [],
    activeTab: null,
    expandedFolders: [],
    viewMode: 'edit',
    bookmarks: [],
  });
  const [currentFile, setCurrentFileState] = useState<string | null>(null);
  const [content, setContentState] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentDir, setCurrentDirState] = useState('');
  const [setupComplete, setSetupComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSyncTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasPulledOnOpen = useRef(false);

  // Initialize
  useEffect(() => {
    (async () => {
      const [loadedSettings, complete, loadedVaults] = await Promise.all([
        loadSettings(),
        VaultOps.isSetupComplete(),
        VaultOps.getVaults(),
      ]);
      setSettings(loadedSettings);
      setSetupComplete(complete);
      setVaults(loadedVaults);

      if (complete && loadedVaults.length > 0) {
        const active = await VaultOps.getActiveVault();
        if (active) {
          setVault(active);
          setCurrentDirState(active.path);
          const ws = await VaultOps.loadWorkspace(active.id);
          setWorkspace(ws);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  // Refresh files when vault or currentDir changes
  useEffect(() => {
    if (currentDir) {
      refreshFiles();
    }
  }, [currentDir]);

  // Auto-save
  useEffect(() => {
    if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    if (settings.autoSaveInterval > 0 && currentFile) {
      autoSaveTimer.current = setInterval(() => {
        if (isDirty) saveFile();
      }, settings.autoSaveInterval * 1000);
    }
    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    };
  }, [settings.autoSaveInterval, currentFile, isDirty]);

  // Save workspace on changes
  useEffect(() => {
    if (vault) {
      VaultOps.saveWorkspace(vault.id, workspace);
    }
  }, [workspace, vault]);

  // Auto-pull from GitHub when vault opens
  useEffect(() => {
    if (!vault?.gitRemote || hasPulledOnOpen.current) return;
    hasPulledOnOpen.current = true;

    (async () => {
      try {
        const token = await getItem<string>(KEYS.GITHUB_TOKEN(vault.id));
        if (!token) return;
        console.log('[Noteriv] Auto-pulling from GitHub...');
        const result = await GitSync.pull(vault.path, token, vault.gitRemote!, vault.gitBranch || undefined);
        console.log(`[Noteriv] Pull complete: ${result.pulled} files, ${result.errors.length} errors`);
        if (result.pulled > 0) {
          // Refresh file list after pull
          if (currentDir) {
            const entries = FS.readDir(currentDir);
            setFiles(entries);
          }
        }
      } catch (err) {
        console.warn('[Noteriv] Auto-pull failed:', err);
      }
    })();
  }, [vault?.id, vault?.gitRemote]);

  // Auto-sync timer (if vault has autoSync enabled)
  useEffect(() => {
    if (autoSyncTimer.current) {
      clearInterval(autoSyncTimer.current);
      autoSyncTimer.current = null;
    }

    if (!vault?.gitRemote || !vault?.autoSync) return;

    // Sync every 5 minutes
    const SYNC_INTERVAL_MS = 5 * 60 * 1000;

    autoSyncTimer.current = setInterval(async () => {
      try {
        const token = await getItem<string>(KEYS.GITHUB_TOKEN(vault.id));
        if (!token) return;
        // Save current file before sync
        if (isDirty && currentFile) {
          FS.writeFile(currentFile, content);
          setIsDirty(false);
        }
        console.log('[Noteriv] Auto-syncing...');
        const result = await GitSync.sync(vault.path, token, vault.gitRemote!, vault.gitBranch || undefined);
        console.log(`[Noteriv] Sync: pulled ${result.pulled}, pushed ${result.pushed}`);
        if (result.pulled > 0 && currentDir) {
          const entries = FS.readDir(currentDir);
          setFiles(entries);
        }
      } catch (err) {
        console.warn('[Noteriv] Auto-sync failed:', err);
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      if (autoSyncTimer.current) {
        clearInterval(autoSyncTimer.current);
        autoSyncTimer.current = null;
      }
    };
  }, [vault?.id, vault?.gitRemote, vault?.autoSync]);

  const refreshFiles = useCallback(() => {
    if (!currentDir) return;
    const entries = FS.readDir(currentDir);
    setFiles(entries);
  }, [currentDir]);

  const refreshVaults = useCallback(async () => {
    const v = await VaultOps.getVaults();
    setVaults(v);
  }, []);

  const switchVault = useCallback(async (id: string) => {
    // Save current workspace
    if (vault) {
      await VaultOps.saveWorkspace(vault.id, workspace);
    }
    await VaultOps.setActiveVault(id);
    const v = await VaultOps.getActiveVault();
    if (v) {
      hasPulledOnOpen.current = false; // Reset so new vault triggers pull
      setVault(v);
      setCurrentDirState(v.path);
      setCurrentFileState(null);
      setContentState('');
      setIsDirty(false);
      const ws = await VaultOps.loadWorkspace(v.id);
      setWorkspace(ws);
    }
  }, [vault, workspace]);

  const createVaultFn = useCallback(async (name: string) => {
    const v = await VaultOps.createVault(name);
    await refreshVaults();
    setVault(v);
    setCurrentDirState(v.path);
    const ws = await VaultOps.loadWorkspace(v.id);
    setWorkspace(ws);
    return v;
  }, []);

  const deleteVaultFn = useCallback(async (id: string) => {
    await VaultOps.deleteVault(id);
    await refreshVaults();
    if (vault?.id === id) {
      const remaining = await VaultOps.getVaults();
      if (remaining.length > 0) {
        await switchVault(remaining[0].id);
      } else {
        setVault(null);
        setCurrentDirState('');
      }
    }
  }, [vault]);

  const updateSettingsFn = useCallback(async (updates: Partial<AppSettings>) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    await saveSettings(next);
  }, [settings]);

  const updateWorkspace = useCallback((updates: Partial<WorkspaceState>) => {
    setWorkspace((prev) => ({ ...prev, ...updates }));
  }, []);

  const setCurrentFile = useCallback(async (path: string | null) => {
    // Save current file if dirty
    if (isDirty && currentFile) {
      FS.writeFile(currentFile, content);
      setIsDirty(false);
    }

    setCurrentFileState(path);
    if (path) {
      const fileContent = await FS.readFile(path);
      setContentState(fileContent ?? '');
      setIsDirty(false);
      // Update open tabs
      setWorkspace((prev) => {
        const tabs = prev.openTabs.includes(path)
          ? prev.openTabs
          : [...prev.openTabs, path];
        return { ...prev, openTabs: tabs, activeTab: path };
      });
    } else {
      setContentState('');
      setIsDirty(false);
    }
  }, [currentFile, content, isDirty]);

  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    setIsDirty(true);
  }, []);

  const saveFile = useCallback(async (): Promise<boolean> => {
    if (!currentFile) return false;
    const ok = FS.writeFile(currentFile, content);
    if (ok) setIsDirty(false);
    return ok;
  }, [currentFile, content]);

  const setCurrentDir = useCallback((dir: string) => {
    setCurrentDirState(dir);
  }, []);

  const completeSetup = useCallback(async () => {
    await VaultOps.setSetupComplete();
    setSetupComplete(true);
  }, []);

  return (
    <AppContext.Provider
      value={{
        vault,
        vaults,
        switchVault,
        createVault: createVaultFn,
        deleteVault: deleteVaultFn,
        refreshVaults,
        settings,
        updateSettings: updateSettingsFn,
        workspace,
        updateWorkspace,
        currentFile,
        content,
        setCurrentFile,
        setContent,
        saveFile,
        files,
        currentDir,
        setCurrentDir,
        refreshFiles,
        setupComplete,
        completeSetup,
        isLoading,
        isDirty,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
