import { readDir, readFile, writeFile, createDir, deleteFile, fileExists } from '@/lib/file-system';

// --- Types ---

export interface CSSSnippet {
  id: string;
  name: string;
  filename: string;
  enabled: boolean;
  content: string;
}

export interface SnippetConfig {
  enabled: string[];
}

export interface CommunitySnippetEntry {
  id: string;
  name: string;
  description: string;
  file: string;
  category: string;
}

// --- Constants ---

const SNIPPETS_DIR = '.noteriv/snippets';
const SNIPPET_CONFIG_FILE = '.noteriv/snippet-config.json';
const COMMUNITY_URL = 'https://raw.githubusercontent.com/thejacedev/NoterivSnippets/master';

// --- Helpers ---

function snippetsPath(vaultPath: string): string {
  return `${vaultPath}/${SNIPPETS_DIR}`;
}

function configPath(vaultPath: string): string {
  return `${vaultPath}/${SNIPPET_CONFIG_FILE}`;
}

function filenameToId(filename: string): string {
  return filename.replace(/\.css$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

function filenameToName(filename: string): string {
  return filename
    .replace(/\.css$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function loadConfig(vaultPath: string): Promise<SnippetConfig> {
  const raw = await readFile(configPath(vaultPath));
  if (!raw) return { enabled: [] };
  try {
    return JSON.parse(raw) as SnippetConfig;
  } catch {
    return { enabled: [] };
  }
}

function saveConfig(vaultPath: string, config: SnippetConfig): void {
  createDir(`${vaultPath}/.noteriv`);
  writeFile(configPath(vaultPath), JSON.stringify(config, null, 2));
}

// --- Public API ---

export async function loadSnippets(vaultPath: string): Promise<CSSSnippet[]> {
  const dir = snippetsPath(vaultPath);
  createDir(dir);

  const config = await loadConfig(vaultPath);
  const entries = readDir(dir);
  const snippets: CSSSnippet[] = [];

  for (const entry of entries) {
    if (entry.isDirectory || !entry.name.endsWith('.css')) continue;

    const id = filenameToId(entry.name);
    const content = await readFile(entry.path);

    snippets.push({
      id,
      name: filenameToName(entry.name),
      filename: entry.name,
      enabled: config.enabled.includes(id),
      content: content ?? '',
    });
  }

  return snippets.sort((a, b) => a.name.localeCompare(b.name));
}

export async function toggleSnippet(
  vaultPath: string,
  snippetId: string,
  enabled: boolean
): Promise<void> {
  const config = await loadConfig(vaultPath);
  if (enabled && !config.enabled.includes(snippetId)) {
    config.enabled.push(snippetId);
  } else if (!enabled) {
    config.enabled = config.enabled.filter((id) => id !== snippetId);
  }
  saveConfig(vaultPath, config);
}

export function createSnippet(
  vaultPath: string,
  name: string,
  content?: string
): CSSSnippet {
  const dir = snippetsPath(vaultPath);
  createDir(dir);

  const filename = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.css';
  const id = filenameToId(filename);
  const filePath = `${dir}/${filename}`;
  const snippetContent = content ?? `/* ${name} */\n`;

  writeFile(filePath, snippetContent);

  return {
    id,
    name,
    filename,
    enabled: false,
    content: snippetContent,
  };
}

export function deleteSnippet(vaultPath: string, snippetId: string): void {
  const dir = snippetsPath(vaultPath);
  const entries = readDir(dir);

  for (const entry of entries) {
    if (!entry.isDirectory && filenameToId(entry.name) === snippetId) {
      deleteFile(entry.path);
      break;
    }
  }

  // Also remove from config
  const configFile = configPath(vaultPath);
  if (fileExists(configFile)) {
    readFile(configFile).then((raw) => {
      if (!raw) return;
      try {
        const config: SnippetConfig = JSON.parse(raw);
        config.enabled = config.enabled.filter((id) => id !== snippetId);
        saveConfig(vaultPath, config);
      } catch {}
    });
  }
}

export function updateSnippetContent(
  vaultPath: string,
  snippetId: string,
  content: string
): void {
  const dir = snippetsPath(vaultPath);
  const entries = readDir(dir);

  for (const entry of entries) {
    if (!entry.isDirectory && filenameToId(entry.name) === snippetId) {
      writeFile(entry.path, content);
      break;
    }
  }
}

// --- Community ---

export async function fetchCommunitySnippets(): Promise<CommunitySnippetEntry[]> {
  try {
    const res = await fetch(`${COMMUNITY_URL}/manifest.json`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.snippets ?? data) as CommunitySnippetEntry[];
  } catch {
    return [];
  }
}

export async function installCommunitySnippet(
  vaultPath: string,
  entry: CommunitySnippetEntry
): Promise<CSSSnippet> {
  const dir = snippetsPath(vaultPath);
  createDir(dir);

  let content = `/* ${entry.name} - ${entry.description} */\n`;
  try {
    const res = await fetch(`${COMMUNITY_URL}/${entry.file}`);
    if (res.ok) {
      content = await res.text();
    }
  } catch {}

  const filename = entry.file.split('/').pop() ?? `${entry.id}.css`;
  const filePath = `${dir}/${filename}`;
  writeFile(filePath, content);

  const id = filenameToId(filename);

  return {
    id,
    name: entry.name,
    filename,
    enabled: false,
    content,
  };
}

export function getEnabledSnippetsCSS(snippets: CSSSnippet[]): string {
  return snippets
    .filter((s) => s.enabled && s.content)
    .map((s) => s.content)
    .join('\n\n');
}
