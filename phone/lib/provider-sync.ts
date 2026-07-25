import { GitProvider } from '@/types';
import * as FS from '@/lib/file-system';
import * as GitHub from '@/lib/github-sync';
import { getItem, KEYS } from '@/lib/storage';

export type SyncProvider = GitProvider;
export type SyncResult = GitHub.SyncResult;

interface Remote {
  provider: SyncProvider;
  baseUrl: string;
  project: string;
}

interface RemoteFile {
  path: string;
  sha?: string;
}

function originFromRemote(remote: string): { origin: string; project: string } | null {
  const trimmed = remote.trim().replace(/\.git\/?$/, '');
  const ssh = trimmed.match(/^(?:ssh:\/\/)?git@([^/:]+)(?::(\d+))?[:/]([^\s]+)$/);
  if (ssh) return { origin: `https://${ssh[1]}${ssh[2] ? `:${ssh[2]}` : ''}`, project: ssh[3] };
  try {
    const url = new URL(trimmed);
    return { origin: url.origin, project: url.pathname.replace(/^\/+|\/+$/g, '') };
  } catch {
    return null;
  }
}

export function detectProvider(remote: string, hint?: SyncProvider): SyncProvider | null {
  if (hint) return hint;
  const host = originFromRemote(remote)?.origin.toLowerCase() ?? '';
  if (host.includes('github.com')) return 'github';
  if (host.includes('gitlab')) return 'gitlab';
  if (host.includes('gitea') || host.includes('forgejo')) return 'gitea';
  return null;
}

function parseRemote(remoteUrl: string, hint?: SyncProvider): Remote | null {
  const parsed = originFromRemote(remoteUrl);
  const provider = detectProvider(remoteUrl, hint);
  if (!parsed || !provider || !parsed.project) return null;
  return { provider, baseUrl: parsed.origin, project: parsed.project };
}

export async function getVaultToken(vaultId: string): Promise<string | null> {
  // Old installs keep working without migrating their GitHub token.
  return (await getItem<string>(KEYS.GIT_TOKEN(vaultId))) ?? await getItem<string>(KEYS.GITHUB_TOKEN(vaultId));
}

function encodeBase64(value: string): string {
  const utf8 = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  if (typeof btoa === 'function') return btoa(utf8);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new TextEncoder().encode(value);
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const first = bytes[i];
    const second = bytes[i + 1] ?? 0;
    const third = bytes[i + 2] ?? 0;
    result += chars[first >> 2];
    result += chars[((first & 3) << 4) | (second >> 4)];
    result += i + 1 < bytes.length ? chars[((second & 15) << 2) | (third >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[third & 63] : '=';
  }
  return result;
}

function decodeBase64(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9+/]/g, '');
  if (typeof atob === 'function') {
    const latin1 = atob(cleaned);
    return decodeURIComponent(latin1.split('').map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    const first = chars.indexOf(cleaned[i]);
    const second = chars.indexOf(cleaned[i + 1]);
    const third = chars.indexOf(cleaned[i + 2]);
    const fourth = chars.indexOf(cleaned[i + 3]);
    bytes.push((first << 2) | (second >> 4));
    if (third !== -1) bytes.push(((second & 15) << 4) | (third >> 2));
    if (fourth !== -1) bytes.push(((third & 3) << 6) | fourth);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function api(remote: Remote, path: string, token: string, options: RequestInit = {}): Promise<Response> {
  const headers = remote.provider === 'gitlab'
    ? { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) }
    : { Authorization: `token ${token}`, 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) };
  const prefix = remote.provider === 'gitlab' ? '/api/v4' : '/api/v1';
  return fetch(`${remote.baseUrl}${prefix}${path}`, { ...options, headers });
}

async function branch(remote: Remote, token: string): Promise<string> {
  const project = encodeURIComponent(remote.project);
  const path = remote.provider === 'gitlab' ? `/projects/${project}` : `/repos/${remote.project}`;
  const response = await api(remote, path, token);
  if (!response.ok) throw new Error(`Failed to get repository info: ${response.status}`);
  return (await response.json()).default_branch ?? 'main';
}

async function listFiles(remote: Remote, token: string, ref: string): Promise<RemoteFile[]> {
  if (remote.provider === 'gitlab') {
    const files: RemoteFile[] = [];
    for (let page = 1; ; page++) {
      const response = await api(remote, `/projects/${encodeURIComponent(remote.project)}/repository/tree?ref=${encodeURIComponent(ref)}&recursive=true&per_page=100&page=${page}`, token);
      if (!response.ok) throw new Error(`Failed to get repository tree: ${response.status}`);
      const items = await response.json();
      files.push(...items.filter((item: { type: string }) => item.type === 'blob').map((item: { path: string; id: string }) => ({ path: item.path, sha: item.id })));
      if (items.length < 100) break;
    }
    return files;
  }
  const response = await api(remote, `/repos/${remote.project}/git/trees/${encodeURIComponent(ref)}?recursive=1`, token);
  if (!response.ok) throw new Error(`Failed to get repository tree: ${response.status}`);
  return ((await response.json()).tree ?? []).filter((item: { type: string }) => item.type === 'blob').map((item: { path: string; sha: string }) => ({ path: item.path, sha: item.sha }));
}

async function readRemoteFile(remote: Remote, token: string, ref: string, path: string): Promise<{ content: string; sha?: string }> {
  const encodedPath = encodeURIComponent(path);
  if (remote.provider === 'gitlab') {
    const response = await api(remote, `/projects/${encodeURIComponent(remote.project)}/repository/files/${encodedPath}/raw?ref=${encodeURIComponent(ref)}`, token);
    if (!response.ok) throw new Error(`Failed to get file ${path}: ${response.status}`);
    return { content: await response.text() };
  }
  const response = await api(remote, `/repos/${remote.project}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`, token);
  if (!response.ok) throw new Error(`Failed to get file ${path}: ${response.status}`);
  const data = await response.json();
  return { content: decodeBase64(data.content), sha: data.sha };
}

async function writeRemoteFile(remote: Remote, token: string, ref: string, path: string, content: string, sha?: string): Promise<void> {
  const encodedPath = encodeURIComponent(path);
  const message = 'Sync from Noteriv Mobile';
  if (remote.provider === 'gitlab') {
    const response = await api(remote, `/projects/${encodeURIComponent(remote.project)}/repository/files/${encodedPath}`, token, {
      method: sha ? 'PUT' : 'POST',
      body: JSON.stringify({ branch: ref, content, commit_message: message, encoding: 'text' }),
    });
    if (!response.ok) throw new Error(`Failed to write file ${path}: ${response.status} ${await response.text()}`);
    return;
  }
  const response = await api(remote, `/repos/${remote.project}/contents/${encodedPath}`, token, {
    method: 'PUT',
    body: JSON.stringify({ branch: ref, content: encodeBase64(content), message, ...(sha ? { sha } : {}) }),
  });
  if (!response.ok) throw new Error(`Failed to write file ${path}: ${response.status} ${await response.text()}`);
}

const markdown = (path: string) => /\.(md|markdown)$/i.test(path) && !path.startsWith('.noteriv/');
const fullPath = (vaultPath: string, path: string) => `${vaultPath.endsWith('/') ? vaultPath : `${vaultPath}/`}${path}`;
const relative = (vaultPath: string, path: string) => path.slice((vaultPath.endsWith('/') ? vaultPath : `${vaultPath}/`).length).replace(/^\//, '');

export async function pull(vaultPath: string, token: string, remoteUrl: string, branchName?: string, hint?: SyncProvider): Promise<SyncResult> {
  const remote = parseRemote(remoteUrl, hint);
  if (!remote) return { pulled: 0, pushed: 0, errors: ['Unknown Git provider. Choose GitLab or Gitea/Forgejo for self-hosted remotes.'] };
  if (remote.provider === 'github') return GitHub.pull(vaultPath, token, remoteUrl, branchName);
  const result: SyncResult = { pulled: 0, pushed: 0, errors: [] };
  try {
    const ref = branchName || await branch(remote, token);
    const files = (await listFiles(remote, token, ref)).filter((file) => markdown(file.path));
    const paths = new Set(files.map((file) => file.path));
    for (const file of await FS.listAllMarkdownFiles(vaultPath)) {
      const path = relative(vaultPath, file.filePath);
      if (!path.startsWith('.trash/') && markdown(path) && !paths.has(path)) FS.deleteFile(file.filePath);
    }
    for (const file of files) {
      try {
        const remoteFile = await readRemoteFile(remote, token, ref, file.path);
        if (await FS.readFile(fullPath(vaultPath, file.path)) !== remoteFile.content) {
          FS.writeFile(fullPath(vaultPath, file.path), remoteFile.content);
          result.pulled++;
        }
      } catch (error) { result.errors.push(`Pull ${file.path}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  } catch (error) { result.errors.push(`Pull failed: ${error instanceof Error ? error.message : String(error)}`); }
  return result;
}

export async function push(vaultPath: string, token: string, remoteUrl: string, branchName?: string, hint?: SyncProvider): Promise<SyncResult> {
  const remote = parseRemote(remoteUrl, hint);
  if (!remote) return { pulled: 0, pushed: 0, errors: ['Unknown Git provider. Choose GitLab or Gitea/Forgejo for self-hosted remotes.'] };
  if (remote.provider === 'github') return GitHub.push(vaultPath, token, remoteUrl, branchName);
  const result: SyncResult = { pulled: 0, pushed: 0, errors: [] };
  try {
    const ref = branchName || await branch(remote, token);
    const files = new Map((await listFiles(remote, token, ref)).map((file) => [file.path, file]));
    for (const file of await FS.listAllMarkdownFiles(vaultPath)) {
      const path = relative(vaultPath, file.filePath);
      if (!markdown(path)) continue;
      try {
        const content = await FS.readFile(file.filePath);
        if (content === null) continue;
        const existing = files.get(path);
        if (existing && (await readRemoteFile(remote, token, ref, path)).content === content) continue;
        await writeRemoteFile(remote, token, ref, path, content, existing?.sha);
        result.pushed++;
      } catch (error) { result.errors.push(`Push ${path}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  } catch (error) { result.errors.push(`Push failed: ${error instanceof Error ? error.message : String(error)}`); }
  return result;
}

export async function sync(vaultPath: string, token: string, remote: string, branch?: string, hint?: SyncProvider): Promise<SyncResult> {
  const pulled = await pull(vaultPath, token, remote, branch, hint);
  const pushed = await push(vaultPath, token, remote, branch, hint);
  return { pulled: pulled.pulled, pushed: pushed.pushed, errors: [...pulled.errors, ...pushed.errors] };
}

export async function freshClone(vaultPath: string, token: string, remoteUrl: string, branch?: string, hint?: SyncProvider): Promise<SyncResult> {
  const remote = parseRemote(remoteUrl, hint);
  if (remote?.provider === 'github') return GitHub.freshClone(vaultPath, token, remoteUrl, branch);
  return { pulled: 0, pushed: 0, errors: ['Fresh Clone is currently available for GitHub remotes only. Use Sync Now for this provider.'] };
}
