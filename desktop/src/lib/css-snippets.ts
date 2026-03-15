export interface CSSSnippet {
  id: string;
  name: string;
  filename: string;
  enabled: boolean;
  content: string;
}

const SNIPPETS_DIR = ".noteriv/snippets";
const CONFIG_FILE = ".noteriv/snippet-config.json";

export async function loadSnippets(vaultPath: string): Promise<CSSSnippet[]> {
  if (!window.electronAPI) return [];
  const dir = `${vaultPath}/${SNIPPETS_DIR}`;

  // Ensure directory exists
  await window.electronAPI.createDir(dir);

  let entries: { name: string; path: string; isDirectory: boolean }[];
  try {
    entries = await window.electronAPI.readDir(dir);
  } catch {
    return [];
  }

  const enabledIds = await getEnabledSnippetIds(vaultPath);
  const snippets: CSSSnippet[] = [];

  for (const entry of entries) {
    if (entry.isDirectory || !entry.name.endsWith(".css")) continue;
    const content = await window.electronAPI.readFile(entry.path);
    if (content === null) continue;
    const id = entry.name.replace(/\.css$/, "");
    snippets.push({
      id,
      name: id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      filename: entry.name,
      enabled: enabledIds.includes(id),
      content,
    });
  }

  return snippets.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getEnabledSnippetIds(vaultPath: string): Promise<string[]> {
  if (!window.electronAPI) return [];
  const configPath = `${vaultPath}/${CONFIG_FILE}`;
  try {
    const raw = await window.electronAPI.readFile(configPath);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.enabled) ? data.enabled : [];
  } catch {
    return [];
  }
}

export async function setEnabledSnippetIds(vaultPath: string, ids: string[]): Promise<void> {
  if (!window.electronAPI) return;
  const configPath = `${vaultPath}/${CONFIG_FILE}`;
  await window.electronAPI.writeFile(configPath, JSON.stringify({ enabled: ids }, null, 2));
}

export async function toggleSnippet(vaultPath: string, snippetId: string, enabled: boolean): Promise<void> {
  const ids = await getEnabledSnippetIds(vaultPath);
  const next = enabled ? [...ids.filter((id) => id !== snippetId), snippetId] : ids.filter((id) => id !== snippetId);
  await setEnabledSnippetIds(vaultPath, next);
}

export async function createSnippet(vaultPath: string, name: string, content: string = ""): Promise<CSSSnippet> {
  if (!window.electronAPI) throw new Error("No API");
  const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const filename = `${id}.css`;
  const dir = `${vaultPath}/${SNIPPETS_DIR}`;
  await window.electronAPI.createDir(dir);
  await window.electronAPI.writeFile(`${dir}/${filename}`, content);
  return { id, name, filename, enabled: false, content };
}

export async function deleteSnippet(vaultPath: string, snippetId: string): Promise<boolean> {
  if (!window.electronAPI) return false;
  const filePath = `${vaultPath}/${SNIPPETS_DIR}/${snippetId}.css`;
  const deleted = await window.electronAPI.deleteFile(filePath);
  if (deleted) {
    // Remove from enabled list
    const ids = await getEnabledSnippetIds(vaultPath);
    await setEnabledSnippetIds(vaultPath, ids.filter((id) => id !== snippetId));
  }
  return deleted;
}

export async function updateSnippetContent(vaultPath: string, snippetId: string, content: string): Promise<boolean> {
  if (!window.electronAPI) return false;
  const filePath = `${vaultPath}/${SNIPPETS_DIR}/${snippetId}.css`;
  return await window.electronAPI.writeFile(filePath, content);
}

export function applySnippets(snippets: CSSSnippet[]): void {
  // Remove existing injected snippets first
  removeAllSnippets();
  // Inject enabled snippets
  for (const snippet of snippets) {
    if (!snippet.enabled) continue;
    const style = document.createElement("style");
    style.setAttribute("data-snippet-id", snippet.id);
    style.textContent = snippet.content;
    document.head.appendChild(style);
  }
}

export function removeAllSnippets(): void {
  const existing = document.querySelectorAll("style[data-snippet-id]");
  existing.forEach((el) => el.remove());
}

export function refreshSnippets(snippets: CSSSnippet[]): void {
  removeAllSnippets();
  applySnippets(snippets);
}

// ── Community snippets ──

const COMMUNITY_SNIPPETS_BASE =
  "https://raw.githubusercontent.com/thejacedev/NoterivSnippets/master";

export interface CommunitySnippetEntry {
  id: string;
  name: string;
  description: string;
  file: string;
  category: string;
}

export interface CommunitySnippetManifest {
  name: string;
  description: string;
  version: string;
  snippets: CommunitySnippetEntry[];
}

export async function fetchSnippetManifest(): Promise<CommunitySnippetManifest | null> {
  try {
    const res = await fetch(`${COMMUNITY_SNIPPETS_BASE}/manifest.json`);
    if (!res.ok) return null;
    return (await res.json()) as CommunitySnippetManifest;
  } catch {
    return null;
  }
}

export async function fetchCommunitySnippetContent(file: string): Promise<string | null> {
  try {
    const res = await fetch(`${COMMUNITY_SNIPPETS_BASE}/${file}`);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function installCommunitySnippet(
  vaultPath: string,
  entry: CommunitySnippetEntry,
  content: string
): Promise<CSSSnippet> {
  const dir = `${vaultPath}/${SNIPPETS_DIR}`;
  if (window.electronAPI) {
    await window.electronAPI.createDir(dir);
    await window.electronAPI.writeFile(`${dir}/${entry.id}.css`, content);
  }
  return {
    id: entry.id,
    name: entry.name,
    filename: `${entry.id}.css`,
    enabled: false,
    content,
  };
}
