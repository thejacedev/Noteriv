import * as FS from '@/lib/file-system';

// --- Types ---

export interface SyncResult {
  pulled: number;
  pushed: number;
  errors: string[];
}

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
}

// Cache of remote file shas keyed by "owner/repo:path"
const shaCache = new Map<string, string>();

function shaCacheKey(owner: string, repo: string, path: string): string {
  return `${owner}/${repo}:${path}`;
}

// --- Base64 helpers for React Native ---

function base64Encode(str: string): string {
  // Works in RN / Hermes via global btoa polyfill or manual encoding
  if (typeof btoa === 'function') {
    // btoa works on latin1, so encode UTF-8 manually
    const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    );
    return btoa(utf8);
  }
  // Fallback: manual base64
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new TextEncoder().encode(str);
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[b2 & 63] : '=';
  }
  return result;
}

function base64Decode(b64: string): string {
  if (typeof atob === 'function') {
    const latin1 = atob(b64);
    return decodeURIComponent(
      latin1
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  }
  // Fallback
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    const a = chars.indexOf(cleaned[i]);
    const b = chars.indexOf(cleaned[i + 1]);
    const c = chars.indexOf(cleaned[i + 2]);
    const d = chars.indexOf(cleaned[i + 3]);
    bytes.push((a << 2) | (b >> 4));
    if (c !== -1) bytes.push(((b & 15) << 4) | (c >> 2));
    if (d !== -1) bytes.push(((c & 3) << 6) | d);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// --- Remote URL parsing ---

export function parseRemote(url: string): { owner: string; repo: string } | null {
  // Handle HTTPS: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  // Handle SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  return null;
}

// --- GitHub API helpers ---

const API_BASE = 'https://api.github.com';

async function ghFetch(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
}

async function getDefaultBranch(
  owner: string,
  repo: string,
  token: string
): Promise<string> {
  const res = await ghFetch(`/repos/${owner}/${repo}`, token);
  if (!res.ok) throw new Error(`Failed to get repo info: ${res.status}`);
  const data = await res.json();
  return data.default_branch ?? 'main';
}

async function getTree(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<GitHubTreeItem[]> {
  const res = await ghFetch(
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    token
  );
  if (!res.ok) throw new Error(`Failed to get tree: ${res.status}`);
  const data = await res.json();
  return data.tree ?? [];
}

async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  token: string,
  ref?: string
): Promise<GitHubFileContent> {
  const query = ref ? `?ref=${ref}` : '';
  const res = await ghFetch(
    `/repos/${owner}/${repo}/contents/${path}${query}`,
    token
  );
  if (!res.ok) throw new Error(`Failed to get file ${path}: ${res.status}`);
  return res.json();
}

async function putFileContent(
  owner: string,
  repo: string,
  path: string,
  content: string,
  token: string,
  sha?: string,
  message?: string
): Promise<{ sha: string }> {
  const body: Record<string, string> = {
    message: message ?? 'Sync from Noteriv Mobile',
    content: base64Encode(content),
  };
  if (sha) body.sha = sha;

  const res = await ghFetch(
    `/repos/${owner}/${repo}/contents/${path}`,
    token,
    { method: 'PUT', body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to put file ${path}: ${res.status} ${err}`);
  }
  const data = await res.json();
  return { sha: data.content?.sha ?? '' };
}

// --- Helpers ---

function isMarkdownFile(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

function shouldSkipPath(path: string): boolean {
  return path.startsWith('.noteriv/') || path.startsWith('.noteriv\\');
}

/** Normalize vault path to ensure trailing separator, then build full path. */
function localFilePath(vaultPath: string, relativePath: string): string {
  const base = vaultPath.endsWith('/') ? vaultPath : vaultPath + '/';
  return base + relativePath;
}

/** Get relative path of a file within the vault. */
function relativePath(vaultPath: string, filePath: string): string {
  const base = vaultPath.endsWith('/') ? vaultPath : vaultPath + '/';
  return filePath.startsWith(base) ? filePath.slice(base.length) : filePath;
}

// --- Pull ---

export async function pull(
  vaultPath: string,
  token: string,
  remote: string,
  branch?: string
): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, errors: [] };
  const parsed = parseRemote(remote);
  if (!parsed) {
    result.errors.push('Invalid GitHub remote URL');
    return result;
  }
  const { owner, repo } = parsed;

  try {
    const branchName = branch ?? (await getDefaultBranch(owner, repo, token));
    const tree = await getTree(owner, repo, branchName, token);

    // Filter to markdown files only, skip .noteriv/
    const remoteFiles = tree.filter(
      (item) =>
        item.type === 'blob' &&
        isMarkdownFile(item.path) &&
        !shouldSkipPath(item.path)
    );

    // Update sha cache
    for (const item of remoteFiles) {
      shaCache.set(shaCacheKey(owner, repo, item.path), item.sha);
    }

    // Download each file
    for (const item of remoteFiles) {
      try {
        const localPath = localFilePath(vaultPath, item.path);
        const localContent = await FS.readFile(localPath);

        // If file exists locally, check if remote is different by comparing sha
        // For simplicity, download if local doesn't exist or content differs
        if (localContent !== null) {
          // Compare by encoding local and checking sha would be ideal,
          // but we can just compare content directly after download
          const remoteFile = await getFileContent(
            owner,
            repo,
            item.path,
            token,
            branchName
          );
          const remoteContent = base64Decode(remoteFile.content.replace(/\n/g, ''));
          if (remoteContent === localContent) {
            continue; // Same content, skip
          }
          // Remote has changed, update local
          FS.writeFile(localPath, remoteContent);
          result.pulled++;
        } else {
          // File doesn't exist locally, download it
          const remoteFile = await getFileContent(
            owner,
            repo,
            item.path,
            token,
            branchName
          );
          const remoteContent = base64Decode(remoteFile.content.replace(/\n/g, ''));
          FS.writeFile(localPath, remoteContent);
          result.pulled++;
        }
      } catch (err) {
        result.errors.push(
          `Pull ${item.path}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `Pull failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return result;
}

// --- Push ---

export async function push(
  vaultPath: string,
  token: string,
  remote: string,
  branch?: string
): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, errors: [] };
  const parsed = parseRemote(remote);
  if (!parsed) {
    result.errors.push('Invalid GitHub remote URL');
    return result;
  }
  const { owner, repo } = parsed;

  try {
    const branchName = branch ?? (await getDefaultBranch(owner, repo, token));

    // Get the remote tree to know current shas
    const tree = await getTree(owner, repo, branchName, token);
    const remoteFileMap = new Map<string, string>(); // path -> sha
    for (const item of tree) {
      if (item.type === 'blob') {
        remoteFileMap.set(item.path, item.sha);
        shaCache.set(shaCacheKey(owner, repo, item.path), item.sha);
      }
    }

    // List all local markdown files
    const localFiles = await FS.listAllMarkdownFiles(vaultPath);

    for (const file of localFiles) {
      try {
        // Normalize relative path (remove leading /)
        let relPath = relativePath(vaultPath, file.filePath);
        if (relPath.startsWith('/')) relPath = relPath.slice(1);

        if (shouldSkipPath(relPath)) continue;

        const localContent = await FS.readFile(file.filePath);
        if (localContent === null) continue;

        const remoteSha = remoteFileMap.get(relPath) ??
          shaCache.get(shaCacheKey(owner, repo, relPath));

        if (remoteSha) {
          // File exists on remote - check if content differs
          try {
            const remoteFile = await getFileContent(
              owner,
              repo,
              relPath,
              token,
              branchName
            );
            const remoteContent = base64Decode(
              remoteFile.content.replace(/\n/g, '')
            );
            if (remoteContent === localContent) {
              continue; // Same content, skip
            }
            // Update remote file
            const { sha } = await putFileContent(
              owner,
              repo,
              relPath,
              localContent,
              token,
              remoteFile.sha,
              'Sync from Noteriv Mobile'
            );
            shaCache.set(shaCacheKey(owner, repo, relPath), sha);
            result.pushed++;
          } catch (err) {
            result.errors.push(
              `Push update ${relPath}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        } else {
          // File doesn't exist on remote - create it
          try {
            const { sha } = await putFileContent(
              owner,
              repo,
              relPath,
              localContent,
              token,
              undefined,
              'Sync from Noteriv Mobile'
            );
            shaCache.set(shaCacheKey(owner, repo, relPath), sha);
            result.pushed++;
          } catch (err) {
            result.errors.push(
              `Push create ${relPath}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      } catch (err) {
        result.errors.push(
          `Push ${file.filePath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `Push failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return result;
}

// --- Full Sync ---

export async function sync(
  vaultPath: string,
  token: string,
  remote: string,
  branch?: string
): Promise<SyncResult> {
  const pullResult = await pull(vaultPath, token, remote, branch);
  const pushResult = await push(vaultPath, token, remote, branch);

  return {
    pulled: pullResult.pulled,
    pushed: pushResult.pushed,
    errors: [...pullResult.errors, ...pushResult.errors],
  };
}
