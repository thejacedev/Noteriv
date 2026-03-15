import { readDir, readFile, writeFile, createDir, deleteDir, fileExists } from '@/lib/file-system';

// --- Types ---

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
}

export interface PluginInstance {
  manifest: PluginManifest;
  enabled: boolean;
  loaded: boolean;
  error?: string;
}

export interface PluginConfig {
  enabled: string[];
}

export interface CommunityPluginEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  dir: string;
}

// --- Constants ---

const PLUGINS_DIR = '.noteriv/plugins';
const PLUGIN_CONFIG_FILE = '.noteriv/plugin-config.json';
const COMMUNITY_URL = 'https://raw.githubusercontent.com/thejacedev/NoterivPlugins/master';

// --- Helpers ---

function pluginsPath(vaultPath: string): string {
  return `${vaultPath}/${PLUGINS_DIR}`;
}

function configPath(vaultPath: string): string {
  return `${vaultPath}/${PLUGIN_CONFIG_FILE}`;
}

async function loadConfig(vaultPath: string): Promise<PluginConfig> {
  const raw = await readFile(configPath(vaultPath));
  if (!raw) return { enabled: [] };
  try {
    return JSON.parse(raw) as PluginConfig;
  } catch {
    return { enabled: [] };
  }
}

function saveConfig(vaultPath: string, config: PluginConfig): void {
  createDir(`${vaultPath}/.noteriv`);
  writeFile(configPath(vaultPath), JSON.stringify(config, null, 2));
}

// --- Public API ---

export async function getInstalledPlugins(vaultPath: string): Promise<PluginManifest[]> {
  const dir = pluginsPath(vaultPath);
  createDir(dir);

  const entries = readDir(dir);
  const plugins: PluginManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory) continue;

    const manifestPath = `${entry.path}/manifest.json`;
    if (!fileExists(manifestPath)) continue;

    const raw = await readFile(manifestPath);
    if (!raw) continue;

    try {
      const manifest = JSON.parse(raw) as PluginManifest;
      plugins.push(manifest);
    } catch {
      // Skip malformed manifests
    }
  }

  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getEnabledPluginIds(vaultPath: string): Promise<string[]> {
  const config = await loadConfig(vaultPath);
  return config.enabled;
}

export async function setPluginEnabled(
  vaultPath: string,
  id: string,
  enabled: boolean
): Promise<void> {
  const config = await loadConfig(vaultPath);
  if (enabled && !config.enabled.includes(id)) {
    config.enabled.push(id);
  } else if (!enabled) {
    config.enabled = config.enabled.filter((pid) => pid !== id);
  }
  saveConfig(vaultPath, config);
}

export function uninstallPlugin(vaultPath: string, id: string): void {
  const dir = `${pluginsPath(vaultPath)}/${id}`;
  deleteDir(dir);

  // Also remove from config
  const cfgPath = configPath(vaultPath);
  if (fileExists(cfgPath)) {
    readFile(cfgPath).then((raw) => {
      if (!raw) return;
      try {
        const config: PluginConfig = JSON.parse(raw);
        config.enabled = config.enabled.filter((pid) => pid !== id);
        saveConfig(vaultPath, config);
      } catch {}
    });
  }
}

// --- Community ---

export async function fetchCommunityPlugins(): Promise<CommunityPluginEntry[]> {
  try {
    const res = await fetch(`${COMMUNITY_URL}/manifest.json`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.plugins ?? data) as CommunityPluginEntry[];
  } catch {
    return [];
  }
}

export async function installCommunityPlugin(
  vaultPath: string,
  entry: CommunityPluginEntry
): Promise<boolean> {
  const pluginDir = `${pluginsPath(vaultPath)}/${entry.id}`;
  createDir(pluginDir);

  // Write manifest
  const manifest: PluginManifest = {
    id: entry.id,
    name: entry.name,
    version: entry.version,
    description: entry.description,
    author: entry.author,
    main: 'main.js',
  };
  writeFile(`${pluginDir}/manifest.json`, JSON.stringify(manifest, null, 2));

  // Fetch main.js from community repo
  try {
    const res = await fetch(`${COMMUNITY_URL}/${entry.dir}/main.js`);
    if (res.ok) {
      const mainContent = await res.text();
      writeFile(`${pluginDir}/main.js`, mainContent);
    } else {
      writeFile(`${pluginDir}/main.js`, '// Plugin placeholder\n');
    }
  } catch {
    writeFile(`${pluginDir}/main.js`, '// Plugin placeholder\n');
  }

  return true;
}
