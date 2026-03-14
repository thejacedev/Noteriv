// ─── Plugin System for Noteriv ───
// Plugins live in {vaultPath}/.noteriv/plugins/{plugin-id}/
// Each plugin has a manifest.json and a main.js entry file.
// Plugin config (enabled/disabled) stored in {vaultPath}/.noteriv/plugin-config.json

// ─── Types ───

export interface PluginManifest {
  id: string;           // unique plugin id (e.g., "daily-stats")
  name: string;         // display name
  version: string;      // semver
  description: string;  // what the plugin does
  author: string;
  minAppVersion?: string;
  main: string;         // entry JS file relative to plugin dir
}

export interface PluginInstance {
  manifest: PluginManifest;
  enabled: boolean;
  loaded: boolean;
  error?: string;
  onLoad?: () => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
}

export interface PluginAPI {
  vault: {
    read: (path: string) => Promise<string | null>;
    write: (path: string, content: string) => Promise<boolean>;
    list: (dir?: string) => Promise<{ path: string; name: string; isDir: boolean }[]>;
    exists: (path: string) => Promise<boolean>;
    delete: (path: string) => Promise<boolean>;
  };
  ui: {
    addCommand: (cmd: PluginCommand) => void;
    removeCommand: (id: string) => void;
    addStatusBarItem: (item: StatusBarItem) => void;
    removeStatusBarItem: (id: string) => void;
    addSidebarPanel: (panel: SidebarPanel) => void;
    removeSidebarPanel: (id: string) => void;
    addSettingsTab: (tab: SettingsTab) => void;
    removeSettingsTab: (id: string) => void;
    showNotice: (message: string, duration?: number) => void;
  };
  events: {
    on: (event: PluginEvent, handler: (...args: any[]) => void) => void;
    off: (event: PluginEvent, handler: (...args: any[]) => void) => void;
    emit: (event: PluginEvent, ...args: any[]) => void;
  };
  editor: {
    getContent: () => string | null;
    setContent: (content: string) => void;
    insertAtCursor: (text: string) => void;
    getSelection: () => string;
    replaceSelection: (text: string) => void;
    getCursorPosition: () => { line: number; ch: number };
  };
  app: {
    version: string;
    vaultPath: string | null;
    currentFile: string | null;
  };
}

export interface PluginCommand {
  id: string;
  name: string;
  icon?: string;
  hotkey?: string;
  callback: () => void | Promise<void>;
}

export interface StatusBarItem {
  id: string;
  text: string;
  title?: string;
  onClick?: () => void;
}

export interface SidebarPanel {
  id: string;
  title: string;
  icon: string;
  render: (container: HTMLElement) => void | (() => void);
}

export interface SettingsTab {
  id: string;
  name: string;
  render: (container: HTMLElement) => void | (() => void);
}

export type PluginEvent =
  | "file-open"
  | "file-save"
  | "file-create"
  | "file-delete"
  | "editor-change"
  | "vault-change"
  | "layout-change"
  | "plugin-loaded"
  | "plugin-unloaded";

export interface EditorState {
  content: string | null;
  currentFile: string | null;
  insertAtCursor: (text: string) => void;
  getSelection: () => string;
  replaceSelection: (text: string) => void;
  getCursorPosition: () => { line: number; ch: number };
  setContent: (content: string) => void;
}

// ─── Plugin Config ───

interface PluginConfig {
  enabled: string[];
}

const APP_VERSION = "1.0.0";
const PLUGINS_DIR = ".noteriv/plugins";
const CONFIG_FILE = ".noteriv/plugin-config.json";

// ─── Plugin Manager ───

export class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map();
  private commands: Map<string, PluginCommand> = new Map();
  private statusBarItems: Map<string, StatusBarItem> = new Map();
  private sidebarPanels: Map<string, SidebarPanel> = new Map();
  private settingsTabs: Map<string, SettingsTab> = new Map();
  private eventHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();
  private noticeHandler: ((msg: string, dur?: number) => void) | null = null;
  private uiChangeHandler: (() => void) | null = null;

  constructor(
    private vaultPath: string,
    private getEditorState: () => EditorState | null
  ) {}

  setUIChangeHandler(handler: () => void): void {
    this.uiChangeHandler = handler;
  }

  private notifyUIChange(): void {
    if (this.uiChangeHandler) this.uiChangeHandler();
  }

  // ── Installed plugins ──

  async getInstalledPlugins(): Promise<PluginManifest[]> {
    if (!window.electronAPI) return [];
    const pluginsDir = `${this.vaultPath}/${PLUGINS_DIR}`;

    try {
      const entries = await window.electronAPI.readDir(pluginsDir);
      const manifests: PluginManifest[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory) continue;
        try {
          const manifestPath = `${pluginsDir}/${entry.name}/manifest.json`;
          const raw = await window.electronAPI.readFile(manifestPath);
          if (raw) {
            const manifest: PluginManifest = JSON.parse(raw);
            // Ensure the ID matches the folder name for consistency
            manifest.id = entry.name;
            manifests.push(manifest);
          }
        } catch {
          // Skip plugins with invalid manifests
        }
      }

      return manifests;
    } catch {
      // plugins directory doesn't exist yet
      return [];
    }
  }

  // ── Enabled plugin IDs ──

  async getEnabledPluginIds(): Promise<string[]> {
    if (!window.electronAPI) return [];
    try {
      const configPath = `${this.vaultPath}/${CONFIG_FILE}`;
      const raw = await window.electronAPI.readFile(configPath);
      if (!raw) return [];
      const config: PluginConfig = JSON.parse(raw);
      return config.enabled || [];
    } catch {
      return [];
    }
  }

  private async saveEnabledPluginIds(ids: string[]): Promise<void> {
    if (!window.electronAPI) return;
    const configPath = `${this.vaultPath}/${CONFIG_FILE}`;
    const config: PluginConfig = { enabled: ids };
    // Ensure .noteriv directory exists
    await window.electronAPI.createDir(`${this.vaultPath}/.noteriv`);
    await window.electronAPI.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  // ── Enable / Disable ──

  async setPluginEnabled(id: string, enabled: boolean): Promise<void> {
    const enabledIds = await this.getEnabledPluginIds();
    const idx = enabledIds.indexOf(id);

    if (enabled && idx === -1) {
      enabledIds.push(id);
    } else if (!enabled && idx !== -1) {
      enabledIds.splice(idx, 1);
    }

    await this.saveEnabledPluginIds(enabledIds);

    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.enabled = enabled;
    }

    if (enabled) {
      await this.loadPlugin(id);
    } else {
      await this.unloadPlugin(id);
    }
  }

  // ── Load plugin ──

  async loadPlugin(id: string): Promise<void> {
    if (!window.electronAPI) return;
    const pluginDir = `${this.vaultPath}/${PLUGINS_DIR}/${id}`;

    try {
      // Read manifest
      const manifestRaw = await window.electronAPI.readFile(`${pluginDir}/manifest.json`);
      if (!manifestRaw) {
        throw new Error(`Manifest not found for plugin "${id}"`);
      }
      const manifest: PluginManifest = JSON.parse(manifestRaw);
      manifest.id = id;

      // Read main JS file
      const mainPath = `${pluginDir}/${manifest.main}`;
      const mainCode = await window.electronAPI.readFile(mainPath);
      if (!mainCode) {
        throw new Error(`Main file "${manifest.main}" not found for plugin "${id}"`);
      }

      // Create the API for this plugin
      const api = this.createAPI(id);

      // Execute in sandboxed context using Function constructor.
      // The plugin code should assign onLoad and onUnload to module.exports or exports.
      const wrappedCode = [
        '"use strict";',
        "var module = { exports: {} };",
        "var exports = module.exports;",
        mainCode,
        "return module.exports;",
      ].join("\n");

      let pluginExports: any;
      try {
        const factory = new Function(wrappedCode);
        pluginExports = factory();
      } catch (execError: any) {
        throw new Error(`Failed to execute plugin "${id}": ${execError.message}`);
      }

      // Build plugin instance
      const instance: PluginInstance = {
        manifest,
        enabled: true,
        loaded: true,
        onLoad: pluginExports.onLoad ? () => pluginExports.onLoad(api) : undefined,
        onUnload: pluginExports.onUnload ? () => pluginExports.onUnload() : undefined,
      };

      this.plugins.set(id, instance);

      // Call onLoad
      if (instance.onLoad) {
        await instance.onLoad();
      }

      this.emit("plugin-loaded", id);
    } catch (err: any) {
      // Store a failed instance with the error
      const existing = this.plugins.get(id);
      const manifest = existing?.manifest || {
        id,
        name: id,
        version: "0.0.0",
        description: "",
        author: "",
        main: "main.js",
      };
      this.plugins.set(id, {
        manifest,
        enabled: true,
        loaded: false,
        error: err.message || "Unknown error loading plugin",
      });
    }
  }

  // ── Unload plugin ──

  async unloadPlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;

    try {
      if (plugin.loaded && plugin.onUnload) {
        await plugin.onUnload();
      }
    } catch {
      // Ignore errors during unload
    }

    // Remove all registrations from this plugin (prefixed with pluginId)
    const prefix = `${id}:`;
    for (const [cmdId] of this.commands) {
      if (cmdId.startsWith(prefix)) this.commands.delete(cmdId);
    }
    for (const [itemId] of this.statusBarItems) {
      if (itemId.startsWith(prefix)) this.statusBarItems.delete(itemId);
    }
    for (const [panelId] of this.sidebarPanels) {
      if (panelId.startsWith(prefix)) this.sidebarPanels.delete(panelId);
    }
    for (const [tabId] of this.settingsTabs) {
      if (tabId.startsWith(prefix)) this.settingsTabs.delete(tabId);
    }

    // Remove event handlers registered by this plugin (tracked under prefixed keys)
    for (const [eventKey, handlers] of this.eventHandlers) {
      if (eventKey.startsWith(prefix)) {
        // Also remove these handlers from the unprefixed event set
        const eventName = eventKey.slice(prefix.length);
        const mainSet = this.eventHandlers.get(eventName);
        if (mainSet) {
          for (const h of handlers) {
            mainSet.delete(h);
          }
        }
        this.eventHandlers.delete(eventKey);
      }
    }

    plugin.loaded = false;
    plugin.onLoad = undefined;
    plugin.onUnload = undefined;
    plugin.error = undefined;

    this.emit("plugin-unloaded", id);
  }

  // ── Install plugin ──

  async installPlugin(sourcePath: string): Promise<PluginManifest> {
    if (!window.electronAPI) {
      throw new Error("Electron API not available");
    }

    // Read manifest from source
    const manifestRaw = await window.electronAPI.readFile(`${sourcePath}/manifest.json`);
    if (!manifestRaw) {
      throw new Error("No manifest.json found in the selected folder");
    }
    const manifest: PluginManifest = JSON.parse(manifestRaw);
    if (!manifest.id || !manifest.name || !manifest.main) {
      throw new Error("Invalid manifest: missing required fields (id, name, main)");
    }

    const destDir = `${this.vaultPath}/${PLUGINS_DIR}/${manifest.id}`;

    // Ensure directories exist
    await window.electronAPI.createDir(`${this.vaultPath}/.noteriv`);
    await window.electronAPI.createDir(`${this.vaultPath}/${PLUGINS_DIR}`);
    await window.electronAPI.createDir(destDir);

    // Copy all files from source to dest
    const entries = await window.electronAPI.readDir(sourcePath);
    for (const entry of entries) {
      if (entry.isDirectory) continue; // Only copy top-level files
      const content = await window.electronAPI.readFile(`${sourcePath}/${entry.name}`);
      if (content !== null) {
        await window.electronAPI.writeFile(`${destDir}/${entry.name}`, content);
      }
    }

    return manifest;
  }

  // ── Uninstall plugin ──

  async uninstallPlugin(id: string): Promise<void> {
    // Unload first
    await this.unloadPlugin(id);

    // Remove from enabled list
    const enabledIds = await this.getEnabledPluginIds();
    const filtered = enabledIds.filter((eid) => eid !== id);
    await this.saveEnabledPluginIds(filtered);

    // Remove plugin directory
    if (window.electronAPI) {
      const pluginDir = `${this.vaultPath}/${PLUGINS_DIR}/${id}`;
      await window.electronAPI.deleteDir(pluginDir);
    }

    this.plugins.delete(id);
  }

  // ── Create Plugin API ──

  private createAPI(pluginId: string): PluginAPI {
    const manager = this;
    const prefix = `${pluginId}:`;

    return {
      vault: {
        read: async (path: string): Promise<string | null> => {
          if (!window.electronAPI) return null;
          const fullPath = `${manager.vaultPath}/${path}`;
          return window.electronAPI.readFile(fullPath);
        },
        write: async (path: string, content: string): Promise<boolean> => {
          if (!window.electronAPI) return false;
          const fullPath = `${manager.vaultPath}/${path}`;
          return window.electronAPI.writeFile(fullPath, content);
        },
        list: async (dir?: string): Promise<{ path: string; name: string; isDir: boolean }[]> => {
          if (!window.electronAPI) return [];
          const fullPath = dir ? `${manager.vaultPath}/${dir}` : manager.vaultPath;
          try {
            const entries = await window.electronAPI.readDir(fullPath);
            return entries.map((e) => ({
              path: dir ? `${dir}/${e.name}` : e.name,
              name: e.name,
              isDir: e.isDirectory,
            }));
          } catch {
            return [];
          }
        },
        exists: async (path: string): Promise<boolean> => {
          if (!window.electronAPI) return false;
          const fullPath = `${manager.vaultPath}/${path}`;
          const content = await window.electronAPI.readFile(fullPath);
          return content !== null;
        },
        delete: async (path: string): Promise<boolean> => {
          if (!window.electronAPI) return false;
          const fullPath = `${manager.vaultPath}/${path}`;
          return window.electronAPI.deleteFile(fullPath);
        },
      },

      ui: {
        addCommand: (cmd: PluginCommand) => {
          const fullId = `${prefix}${cmd.id}`;
          manager.commands.set(fullId, { ...cmd, id: fullId });
        },
        removeCommand: (id: string) => {
          manager.commands.delete(`${prefix}${id}`);
        },
        addStatusBarItem: (item: StatusBarItem) => {
          const fullId = `${prefix}${item.id}`;
          manager.statusBarItems.set(fullId, { ...item, id: fullId });
          manager.notifyUIChange();
        },
        removeStatusBarItem: (id: string) => {
          manager.statusBarItems.delete(`${prefix}${id}`);
          manager.notifyUIChange();
        },
        addSidebarPanel: (panel: SidebarPanel) => {
          const fullId = `${prefix}${panel.id}`;
          manager.sidebarPanels.set(fullId, { ...panel, id: fullId });
        },
        removeSidebarPanel: (id: string) => {
          manager.sidebarPanels.delete(`${prefix}${id}`);
        },
        addSettingsTab: (tab: SettingsTab) => {
          const fullId = `${prefix}${tab.id}`;
          manager.settingsTabs.set(fullId, { ...tab, id: fullId });
        },
        removeSettingsTab: (id: string) => {
          manager.settingsTabs.delete(`${prefix}${id}`);
        },
        showNotice: (message: string, duration?: number) => {
          if (manager.noticeHandler) {
            manager.noticeHandler(message, duration);
          }
        },
      },

      events: {
        on: (event: PluginEvent, handler: (...args: any[]) => void) => {
          const key = `${prefix}${event}`;
          if (!manager.eventHandlers.has(event)) {
            manager.eventHandlers.set(event, new Set());
          }
          manager.eventHandlers.get(event)!.add(handler);
          // Also track under prefixed key for cleanup on unload
          if (!manager.eventHandlers.has(key)) {
            manager.eventHandlers.set(key, new Set());
          }
          manager.eventHandlers.get(key)!.add(handler);
        },
        off: (event: PluginEvent, handler: (...args: any[]) => void) => {
          const key = `${prefix}${event}`;
          manager.eventHandlers.get(event)?.delete(handler);
          manager.eventHandlers.get(key)?.delete(handler);
        },
        emit: (event: PluginEvent, ...args: any[]) => {
          manager.emit(event, ...args);
        },
      },

      editor: {
        getContent: (): string | null => {
          const state = manager.getEditorState();
          return state?.content ?? null;
        },
        setContent: (content: string) => {
          const state = manager.getEditorState();
          state?.setContent(content);
        },
        insertAtCursor: (text: string) => {
          const state = manager.getEditorState();
          state?.insertAtCursor(text);
        },
        getSelection: (): string => {
          const state = manager.getEditorState();
          return state?.getSelection() ?? "";
        },
        replaceSelection: (text: string) => {
          const state = manager.getEditorState();
          state?.replaceSelection(text);
        },
        getCursorPosition: (): { line: number; ch: number } => {
          const state = manager.getEditorState();
          return state?.getCursorPosition() ?? { line: 0, ch: 0 };
        },
      },

      app: {
        version: APP_VERSION,
        vaultPath: manager.vaultPath,
        currentFile: manager.getEditorState()?.currentFile ?? null,
      },
    };
  }

  // ── Accessors for registered items ──

  getCommands(): PluginCommand[] {
    return Array.from(this.commands.values());
  }

  getStatusBarItems(): StatusBarItem[] {
    return Array.from(this.statusBarItems.values());
  }

  getSidebarPanels(): SidebarPanel[] {
    return Array.from(this.sidebarPanels.values());
  }

  getSettingsTabs(): SettingsTab[] {
    return Array.from(this.settingsTabs.values());
  }

  getPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(id: string): PluginInstance | undefined {
    return this.plugins.get(id);
  }

  // ── Events ──

  emit(event: PluginEvent, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch {
        // Don't let a plugin error crash the event bus
      }
    }
  }

  // ── Notice handler ──

  setNoticeHandler(handler: (msg: string, dur?: number) => void): void {
    this.noticeHandler = handler;
  }

  // ── Initialize all enabled plugins ──

  async loadAllEnabled(): Promise<void> {
    const manifests = await this.getInstalledPlugins();
    const enabledIds = await this.getEnabledPluginIds();

    // Pre-populate the plugins map with all installed plugins
    for (const manifest of manifests) {
      const isEnabled = enabledIds.includes(manifest.id);
      this.plugins.set(manifest.id, {
        manifest,
        enabled: isEnabled,
        loaded: false,
      });
    }

    // Load enabled plugins
    for (const id of enabledIds) {
      if (manifests.some((m) => m.id === id)) {
        await this.loadPlugin(id);
      }
    }
  }

  // ── Unload all ──

  async unloadAll(): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      if (plugin.loaded) {
        await this.unloadPlugin(id);
      }
    }
  }
}

// ── Community plugins ──

const COMMUNITY_PLUGINS_BASE =
  "https://raw.githubusercontent.com/thejacedev/NoterivPlugins/master";

export interface CommunityPluginEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  dir: string;
}

export interface CommunityPluginManifest {
  name: string;
  description: string;
  version: string;
  plugins: CommunityPluginEntry[];
}

export async function fetchCommunityPluginManifest(): Promise<CommunityPluginManifest | null> {
  try {
    const res = await fetch(`${COMMUNITY_PLUGINS_BASE}/manifest.json`);
    if (!res.ok) return null;
    return (await res.json()) as CommunityPluginManifest;
  } catch {
    return null;
  }
}

export async function fetchCommunityPluginFile(filePath: string): Promise<string | null> {
  try {
    const res = await fetch(`${COMMUNITY_PLUGINS_BASE}/${filePath}`);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function installCommunityPlugin(
  vaultPath: string,
  entry: CommunityPluginEntry
): Promise<boolean> {
  if (!window.electronAPI) return false;

  // Fetch manifest.json and main.js from the community repo
  const manifestContent = await fetchCommunityPluginFile(`${entry.dir}/manifest.json`);
  const mainContent = await fetchCommunityPluginFile(`${entry.dir}/main.js`);

  if (!manifestContent || !mainContent) return false;

  const pluginDir = `${vaultPath}/${PLUGINS_DIR}/${entry.id}`;
  await window.electronAPI.createDir(`${vaultPath}/.noteriv`);
  await window.electronAPI.createDir(`${vaultPath}/${PLUGINS_DIR}`);
  await window.electronAPI.createDir(pluginDir);

  await window.electronAPI.writeFile(`${pluginDir}/manifest.json`, manifestContent);
  await window.electronAPI.writeFile(`${pluginDir}/main.js`, mainContent);

  return true;
}
