import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppSettings, Vault, WorkspaceState, FileEntry } from '@/types';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import * as VaultOps from '@/lib/vault';
import * as FS from '@/lib/file-system';
import * as GitSync from '@/lib/provider-sync';
import { NoteSession } from '@/lib/note-session';
import { conflictCopyPath, vaultFileUri, vaultRelativePath } from '@/lib/sync-state';
import * as WebDav from '@/lib/webdav-sync';

/** The sync timers tick this often. */
const SYNC_TICK_MS = 5_000;
/** A vault syncs with its WebDAV folder every this many ticks: once a minute. */
const WEBDAV_EVERY_TICKS = 12;

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
  /** Write the open note if it has unsaved text. True when nothing is left unsaved. */
  flushFile: () => boolean;
  files: FileEntry[];
  currentDir: string;
  setCurrentDir: (dir: string) => void;
  refreshFiles: () => void;

  /**
   * Run a Git sync that a screen asks for (connecting a remote, "Sync Now"),
   * after any sync that is already running and with the automatic ones held
   * off until it ends.
   */
  syncGit: (work: () => Promise<GitSync.SyncResult>) => Promise<GitSync.SyncResult>;

  // WebDAV sync
  /** Sync a vault with a WebDAV folder now, after any sync that is already running. Throws when the server cannot be used. */
  syncWebDav: (vault: WebDav.SyncedVault, cfg: WebDav.WebDavConfig) => Promise<WebDav.Outcome>;
  /** Ask for the open vault's WebDAV sync to run soon instead of at its next turn. */
  requestWebDavSync: () => void;

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
  // A sync downloads every note and can outlast the 5s tick; never run two at once.
  const syncInFlight = useRef(false);
  // The sync timers outlive renders, so they read the open folder through a ref.
  const currentDirRef = useRef(currentDir);
  currentDirRef.current = currentDir;
  const vaultIdRef = useRef<string | null>(null);
  const vaultPathRef = useRef<string | null>(null);
  useEffect(() => {
    vaultIdRef.current = vault?.id ?? null;
    vaultPathRef.current = vault?.path ?? null;
  }, [vault?.id, vault?.path]);
  /** Set while the open vault syncs over WebDAV: makes its next sync due at once. */
  const wakeWebDav = useRef<(() => void) | null>(null);

  // The open note's latest text lives outside React state. A timer, the back
  // button or a sync runs with the state of an older render, and used to save
  // the text of that render: auto-save wrote the note as it was after the
  // first keystroke and then marked it saved. Every save goes through here.
  const [note] = useState(() => new NoteSession(FS.writeFile));

  const flushFile = useCallback((): boolean => {
    const ok = note.flush();
    setIsDirty(note.dirty);
    return ok;
  }, [note]);

  /**
   * After a sync pulled: if it replaced the open note's file, show the new
   * text. If the editor has unsaved text by then, that text stays and the
   * pulled version is kept beside the note as a conflict copy, the way sync
   * itself keeps both.
   */
  const takeOpenNoteFromDisk = useCallback(async (vaultPath: string) => {
    const file = note.file;
    if (!file) return;
    const onDisk = await FS.readFile(file);
    if (note.file !== file) return; // another note was opened meanwhile
    const change = note.reconcile(onDisk);
    if (change === 'reloaded') {
      setContentState(note.content);
      setIsDirty(false);
    } else if (change === 'conflict' && onDisk !== null) {
      const copyPath = conflictCopyPath(vaultRelativePath(vaultPath, file));
      const copy = vaultFileUri(vaultPath, copyPath);
      const existing = await FS.readFile(copy);
      if (existing === null) {
        FS.writeFile(copy, onDisk);
      } else if (existing !== onDisk) {
        // A copy from earlier today holds something else: keep both.
        const time = new Date().toISOString().slice(11, 19).replace(/:/g, '');
        FS.writeFile(vaultFileUri(vaultPath, copyPath.replace(/\)(\.[a-z]+)?$/i, ` ${time})$1`)), onDisk);
      }
    }
  }, [note]);

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
        flushFile();
      }, settings.autoSaveInterval * 1000);
    }
    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    };
  }, [settings.autoSaveInterval, currentFile, flushFile]);

  // Save workspace on changes
  useEffect(() => {
    if (vault) {
      VaultOps.saveWorkspace(vault.id, workspace);
    }
  }, [workspace, vault]);

  // Auto-pull from the configured forge when vault opens.
  useEffect(() => {
    if (!vault?.gitRemote || hasPulledOnOpen.current) return;
    hasPulledOnOpen.current = true;

    (async () => {
      if (syncInFlight.current) return;
      syncInFlight.current = true;
      try {
        const token = await GitSync.getVaultToken(vault.id);
        if (!token) return;
        console.log('[Noteriv] Auto-pulling from remote...');
        const result = await GitSync.pull(vault.path, token, vault.gitRemote!, vault.gitBranch || undefined, vault.gitProvider);
        console.log(`[Noteriv] Pull complete: ${result.pulled} files, ${result.errors.length} errors`);
        if (result.pulled > 0) {
          await takeOpenNoteFromDisk(vault.path);
          if (currentDirRef.current) setFiles(FS.readDir(currentDirRef.current));
        }
      } catch (err) {
        console.warn('[Noteriv] Auto-pull failed:', err);
      } finally {
        syncInFlight.current = false;
      }
    })();
  }, [vault?.id, vault?.gitRemote, vault?.gitBranch]);

  // Auto-sync every 5 seconds (pull + push if changes)
  useEffect(() => {
    if (autoSyncTimer.current) {
      clearInterval(autoSyncTimer.current);
      autoSyncTimer.current = null;
    }

    if (!vault?.gitRemote) return;

    autoSyncTimer.current = setInterval(async () => {
      if (syncInFlight.current) return;
      syncInFlight.current = true;
      try {
        const token = await GitSync.getVaultToken(vault.id);
        if (!token) return;
        // Sync compares what is on disk, so the open note's latest text goes
        // there first.
        flushFile();
        const result = await GitSync.sync(vault.path, token, vault.gitRemote!, vault.gitBranch || undefined, vault.gitProvider);
        if (result.errors.length > 0) {
          console.warn('[Noteriv] Sync errors:', result.errors);
        }
        // Pulled changes include notes deleted on the remote; refresh so the
        // list doesn't keep offering a note that no longer exists. A newer
        // version of the open note has to reach the editor too, or the next
        // edit would write the old text back over it.
        if (result.pulled > 0) {
          await takeOpenNoteFromDisk(vault.path);
          if (currentDirRef.current) setFiles(FS.readDir(currentDirRef.current));
        }
      } catch {
      } finally {
        syncInFlight.current = false;
      }
    }, SYNC_TICK_MS);

    return () => {
      if (autoSyncTimer.current) {
        clearInterval(autoSyncTimer.current);
        autoSyncTimer.current = null;
      }
    };
  }, [vault?.id, vault?.gitRemote, vault?.gitBranch]);

  /**
   * A Git sync that a screen asks for. It takes its turn like every other
   * sync. Until 1.2.0 the settings screen synced on its own while the pull of
   * a vault that had just got its remote, and then the 5-second sync, ran
   * beside it: two syncs of one vault each uploaded the notes the other was
   * uploading, the server turned one of them down ("A file with this name
   * already exists"), and the screen read "Sync failed" right after a remote
   * was connected, though every note had arrived.
   *
   * `work` may also save the remote on the vault first: the automatic syncs
   * it sets off then find this one running and leave the vault alone.
   */
  const syncGit = useCallback(async (work: () => Promise<GitSync.SyncResult>): Promise<GitSync.SyncResult> => {
    while (syncInFlight.current) await new Promise((resolve) => setTimeout(resolve, 250));
    syncInFlight.current = true;
    try {
      // Sync compares what is on disk, so the open note's latest text goes there first.
      flushFile();
      const result = await work();
      const path = vaultPathRef.current;
      if (result.pulled > 0 && path) {
        await takeOpenNoteFromDisk(path);
        if (currentDirRef.current) setFiles(FS.readDir(currentDirRef.current));
      }
      return result;
    } finally {
      syncInFlight.current = false;
    }
  }, [flushFile, takeOpenNoteFromDisk]);

  /**
   * One WebDAV sync of a vault. Only one sync of any kind runs at a time:
   * with `wait` this one takes its turn after the one that is running, and
   * without it gives up (null) so a timer can try again at its next tick.
   */
  const runWebDav = useCallback(async (target: WebDav.SyncedVault, cfg: WebDav.WebDavConfig, wait: boolean): Promise<WebDav.Outcome | null> => {
    while (syncInFlight.current) {
      if (!wait) return null;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    syncInFlight.current = true;
    try {
      // Sync compares what is on disk, so the open note's latest text goes there first.
      flushFile();
      const outcome = await WebDav.syncVault(target, cfg);
      // A note that was replaced, trashed or copied may be the one that is
      // open, or one the list shows.
      if (vaultIdRef.current === target.id && outcome.pulled + outcome.deleted + outcome.conflicts > 0) {
        await takeOpenNoteFromDisk(target.path);
        if (currentDirRef.current) setFiles(FS.readDir(currentDirRef.current));
      }
      return outcome;
    } finally {
      syncInFlight.current = false;
    }
  }, [flushFile, takeOpenNoteFromDisk]);

  // WebDAV sync: when the vault opens, then once a minute while the app is open.
  const davVaultId = vault?.id;
  const davVaultPath = vault?.path;
  const davUrl = vault?.webdav?.url;
  const davUsername = vault?.webdav?.username;
  const davRemotePath = vault?.webdav?.remotePath;
  const davCertificate = vault?.webdav?.clientCertificate ?? null;
  useEffect(() => {
    if (!davVaultId || !davVaultPath || !davUrl) return;
    const target: WebDav.SyncedVault = {
      id: davVaultId,
      path: davVaultPath,
      webdav: {
        url: davUrl,
        username: davUsername ?? '',
        remotePath: davRemotePath ?? '/',
        ...(davCertificate ? { clientCertificate: davCertificate } : {}),
      },
    };
    let due = true;
    let ticks = 0;
    let stopped = false;

    const attempt = async () => {
      if (stopped || !due) return;
      try {
        // Read each time, so a changed password is used from the next sync on.
        const cfg = await WebDav.vaultConfig(target);
        if (stopped || !cfg || syncInFlight.current) return;
        // Whatever happens next, the following try is a full turn away: a
        // server that cannot be reached is not asked again every few seconds.
        due = false;
        ticks = 0;
        const outcome = await runWebDav(target, cfg, false);
        if (outcome === null) due = true;
        else if (outcome.errors.length > 0) console.warn('[Noteriv] WebDAV sync errors:', outcome.errors);
      } catch (err) {
        console.warn('[Noteriv] WebDAV sync failed:', err);
      }
    };

    attempt();
    const timer = setInterval(() => {
      ticks += 1;
      if (ticks >= WEBDAV_EVERY_TICKS) due = true;
      attempt();
    }, SYNC_TICK_MS);
    wakeWebDav.current = () => {
      due = true;
      attempt();
    };

    return () => {
      stopped = true;
      clearInterval(timer);
      wakeWebDav.current = null;
    };
  }, [davVaultId, davVaultPath, davUrl, davUsername, davRemotePath, davCertificate, runWebDav]);

  const syncWebDav = useCallback(async (target: WebDav.SyncedVault, cfg: WebDav.WebDavConfig): Promise<WebDav.Outcome> => {
    return (await runWebDav(target, cfg, true)) as WebDav.Outcome;
  }, [runWebDav]);

  const requestWebDavSync = useCallback(() => {
    wakeWebDav.current?.();
  }, []);

  const refreshFiles = useCallback(() => {
    if (!currentDir) return;
    const entries = FS.readDir(currentDir);
    setFiles(entries);
  }, [currentDir]);

  const refreshVaults = useCallback(async () => {
    const v = await VaultOps.getVaults();
    setVaults(v);
    // Also refresh the active vault in case its properties changed
    const active = await VaultOps.getActiveVault();
    if (active) setVault(active);
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
      flushFile();
      note.open(null, '');
      setVault(v);
      setCurrentDirState(v.path);
      setCurrentFileState(null);
      setContentState('');
      setIsDirty(false);
      const ws = await VaultOps.loadWorkspace(v.id);
      setWorkspace(ws);
    }
  }, [vault, workspace, note, flushFile]);

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
    // The note being left is saved first. Opening the note that is already
    // open means "read it again" (a snapshot was just restored over it), so
    // its unsaved text must not be written back over the file.
    if (path !== note.file) flushFile();

    setCurrentFileState(path);
    if (path) {
      const fileContent = await FS.readFile(path);
      note.open(path, fileContent ?? '');
      setContentState(note.content);
      setIsDirty(false);
      // Update open tabs
      setWorkspace((prev) => {
        const tabs = prev.openTabs.includes(path)
          ? prev.openTabs
          : [...prev.openTabs, path];
        return { ...prev, openTabs: tabs, activeTab: path };
      });
    } else {
      note.open(null, '');
      setContentState('');
      setIsDirty(false);
    }
  }, [note, flushFile]);

  const setContent = useCallback((newContent: string) => {
    note.edit(newContent);
    setContentState(newContent);
    setIsDirty(true);
  }, [note]);

  const saveFile = useCallback(async (): Promise<boolean> => {
    const ok = note.save();
    setIsDirty(note.dirty);
    return ok;
  }, [note]);

  const setCurrentDir = useCallback((dir: string) => {
    setCurrentDirState(dir);
  }, []);

  const completeSetup = useCallback(async () => {
    await VaultOps.setSetupComplete();
    setSetupComplete(true);
    // Re-read vault from storage so gitRemote etc. are picked up
    const active = await VaultOps.getActiveVault();
    if (active) setVault(active);
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
        flushFile,
        files,
        currentDir,
        setCurrentDir,
        refreshFiles,
        syncGit,
        syncWebDav,
        requestWebDavSync,
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
