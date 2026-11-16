import { GitProvider } from '@/types';
import * as FS from '@/lib/file-system';
import * as GitHub from '@/lib/github-sync';
import { getItem, KEYS } from '@/lib/storage';
import {
  conflictCopyPath,
  contentHash,
  loadSyncBase,
  pullAction,
  saveSyncBase,
  shouldDeleteLocal,
  vaultFileUri,
  vaultRelativePath,
} from '@/lib/sync-state';

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

/** The server's own words for a refusal, when its answer has any. */
function serverMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const text = parsed.message ?? parsed.error_description ?? parsed.error;
    if (typeof text === 'string') return text;
  } catch {}
  return body.trim().slice(0, 200);
}

/** What a refused request most likely means, in words the person holding the phone can act on. */
export function explainStatus(provider: SyncProvider, status: number, body = ''): string {
  if (status === 401) return 'the server rejected the token (401). It may be mistyped, expired or revoked.';
  if (status === 404) return 'repository not found (404). Check the address, and that the token can see this repository.';
  // GitLab names a scope problem; every other 403 is about what the account may do.
  if (status === 403 && provider === 'gitlab' && body.includes('insufficient_scope')) {
    return 'the token is not allowed to do this (403). A GitLab token needs the "api" scope; read_repository and write_repository are not enough for the phone app.';
  }
  const said = serverMessage(body);
  if (status === 403) return `the server refused this (403${said ? `: ${said}` : ''}). The token or its account may not be allowed to read or change this repository.`;
  return `the server answered ${status}${said ? `: ${said}` : ''}.`;
}

async function refusal(remote: Remote, response: Response): Promise<string> {
  return explainStatus(remote.provider, response.status, await response.text().catch(() => ''));
}

function repositoryPath(remote: Remote): string {
  return remote.provider === 'gitlab' ? `/projects/${encodeURIComponent(remote.project)}` : `/repos/${remote.project}`;
}

async function branch(remote: Remote, token: string): Promise<string> {
  const response = await api(remote, repositoryPath(remote), token);
  if (!response.ok) throw new Error(`Could not read the repository: ${await refusal(remote, response)}`);
  return (await response.json()).default_branch ?? 'main';
}

/**
 * A tree request fails the same way for a repository that has no commits yet,
 * for a branch that is not there, and for a repository that is gone (GitLab:
 * 404 for all three; Gitea: "sha not found"). Only the first may be read as
 * "no files", so ask the repository itself which one it is.
 */
async function missingTree(remote: Remote, token: string, ref: string): Promise<null> {
  const response = await api(remote, repositoryPath(remote), token);
  if (!response.ok) throw new Error(`Failed to get repository tree: ${await refusal(remote, response)}`);
  const info = await response.json();
  if (remote.provider === 'gitlab' ? info.empty_repo === true : info.empty === true) return null;
  throw new Error(`Failed to get repository tree: the repository has no branch "${ref}". Disconnect it and connect it again in Settings, so the app picks up its default branch.`);
}

/** The files on the remote, or null when the repository has no commits yet. */
async function listFiles(remote: Remote, token: string, ref: string): Promise<RemoteFile[] | null> {
  if (remote.provider === 'gitlab') {
    const files: RemoteFile[] = [];
    for (let page = 1; ; page++) {
      const response = await api(remote, `/projects/${encodeURIComponent(remote.project)}/repository/tree?ref=${encodeURIComponent(ref)}&recursive=true&per_page=100&page=${page}`, token);
      if (response.status === 404 && page === 1) return missingTree(remote, token, ref);
      if (!response.ok) throw new Error(`Failed to get repository tree: ${await refusal(remote, response)}`);
      const items = await response.json();
      files.push(...items.filter((item: { type: string }) => item.type === 'blob').map((item: { path: string; id: string }) => ({ path: item.path, sha: item.id })));
      if (items.length < 100) break;
    }
    return files;
  }
  const response = await api(remote, `/repos/${remote.project}/git/trees/${encodeURIComponent(ref)}?recursive=1`, token);
  if (response.status === 404 || response.status === 400) return missingTree(remote, token, ref);
  if (!response.ok) throw new Error(`Failed to get repository tree: ${await refusal(remote, response)}`);
  return ((await response.json()).tree ?? []).filter((item: { type: string }) => item.type === 'blob').map((item: { path: string; sha: string }) => ({ path: item.path, sha: item.sha }));
}

/** GitLab's files API takes the path as one encoded segment; Gitea's contents API takes it as segments. */
function encodeFilePath(remote: Remote, path: string): string {
  return remote.provider === 'gitlab' ? encodeURIComponent(path) : path.split('/').map(encodeURIComponent).join('/');
}

async function readRemoteFile(remote: Remote, token: string, ref: string, path: string): Promise<{ content: string; sha?: string }> {
  const encodedPath = encodeFilePath(remote, path);
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
  const encodedPath = encodeFilePath(remote, path);
  const message = 'Sync from Noteriv Mobile';
  if (remote.provider === 'gitlab') {
    const response = await api(remote, `/projects/${encodeURIComponent(remote.project)}/repository/files/${encodedPath}`, token, {
      method: sha ? 'PUT' : 'POST',
      body: JSON.stringify({ branch: ref, content, commit_message: message, encoding: 'text' }),
    });
    if (!response.ok) throw new Error(`Failed to write file ${path}: ${await refusal(remote, response)}`);
    return;
  }
  // Gitea/Forgejo create with POST and update with PUT (which requires the sha).
  const response = await api(remote, `/repos/${remote.project}/contents/${encodedPath}`, token, {
    method: sha ? 'PUT' : 'POST',
    body: JSON.stringify({ branch: ref, content: encodeBase64(content), message, ...(sha ? { sha } : {}) }),
  });
  if (!response.ok) throw new Error(`Failed to write file ${path}: ${await refusal(remote, response)}`);
}

export type RemoteCheck = { ok: true; branch: string } | { ok: false; problem: string };

/**
 * Asks the server about a GitLab or Gitea/Forgejo repository before anything
 * is saved. A remote that works comes back with its default branch, which is
 * the one to sync (not every repository calls it "main"). One that does not
 * comes back with what is wrong in a sentence. Without this a wrong address, a
 * wrong token and a token with too little scope all looked the same:
 * "connected", and nothing synced.
 */
export async function checkRemote(remoteUrl: string, token: string, hint?: SyncProvider): Promise<RemoteCheck> {
  const no = (problem: string): RemoteCheck => ({ ok: false, problem });
  if (hint === 'github' || detectProvider(remoteUrl) === 'github') return no('This is a GitHub address. Use "Connect GitHub" for it.');
  const remote = parseRemote(remoteUrl, hint);
  if (!remote) return no('That does not look like a repository address. Use the HTTPS clone URL, for example https://gitlab.com/you/notes.git');
  try {
    if (remote.provider === 'gitlab') {
      // Any GitLab token may read its own description, whatever its scopes.
      const self = await api(remote, '/personal_access_tokens/self', token);
      if (self.status === 401) return no(`Could not sign in: ${explainStatus('gitlab', 401)}`);
      if (self.ok) {
        const info = await self.json();
        if (!info.granular && Array.isArray(info.scopes) && !info.scopes.includes('api')) {
          return no(`This token has the scope${info.scopes.length === 1 ? '' : 's'} ${info.scopes.join(', ')}. The phone app talks to the GitLab API and needs a token with the "api" scope.`);
        }
      }
    }
    return { ok: true, branch: await branch(remote, token) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('Could not read the repository')) return no(message);
    const plainHttp = remote.baseUrl.startsWith('http://') ? ' The address should start with https://.' : '';
    return no(`Could not reach ${remote.baseUrl} (${message}).${plainHttp} Check the address and the connection. If the server uses a certificate from a private authority, install that CA certificate on the phone first.`);
  }
}

/**
 * One line for the sync status row. With errors it leads with the first one
 * in full, because a bare count ("Errors: 2") gave nothing to act on.
 */
export function describeResult(result: SyncResult): string {
  const counts = `Pulled: ${result.pulled}, Pushed: ${result.pushed}`;
  if (result.errors.length === 0) return counts;
  const first = result.errors[0].replace(/^(Pull|Push) failed: /, '').replace(/\.$/, '');
  const more = result.errors.length > 1 ? ` (and ${result.errors.length - 1} more)` : '';
  return `Sync failed: ${first}${more}. ${counts}`;
}

const markdown = (path: string) => /\.(md|markdown)$/i.test(path) && !path.startsWith('.noteriv/');

export async function pull(vaultPath: string, token: string, remoteUrl: string, branchName?: string, hint?: SyncProvider): Promise<SyncResult> {
  const remote = parseRemote(remoteUrl, hint);
  if (!remote) return { pulled: 0, pushed: 0, errors: ['Unknown Git provider. Choose GitLab or Gitea/Forgejo for self-hosted remotes.'] };
  if (remote.provider === 'github') return GitHub.pull(vaultPath, token, remoteUrl, branchName);
  const result: SyncResult = { pulled: 0, pushed: 0, errors: [] };
  try {
    const ref = branchName || await branch(remote, token);
    const base = await loadSyncBase(vaultPath, remoteUrl, branchName);
    const listed = await listFiles(remote, token, ref);
    // A repository with no commits has nothing to give and has deleted nothing:
    // leave every local note alone and let push fill it.
    if (listed === null) return result;
    const files = listed.filter((file) => markdown(file.path));
    const paths = new Set(files.map((file) => file.path));
    // Apply remote deletions only to notes that haven't changed here since the last sync.
    for (const file of await FS.listAllMarkdownFiles(vaultPath)) {
      const path = vaultRelativePath(vaultPath, file.filePath);
      if (path.startsWith('.trash/') || !markdown(path) || paths.has(path)) continue;
      if (shouldDeleteLocal(await FS.readFile(file.filePath), base[path])) {
        FS.deleteFile(file.filePath);
        delete base[path];
        result.pulled++;
      }
    }
    for (const file of files) {
      try {
        const remoteFile = await readRemoteFile(remote, token, ref, file.path);
        const localPath = vaultFileUri(vaultPath, file.path);
        switch (pullAction(await FS.readFile(localPath), remoteFile.content, base[file.path])) {
          case 'skip':
            base[file.path] = contentHash(remoteFile.content);
            break;
          case 'take-remote':
            FS.writeFile(localPath, remoteFile.content);
            base[file.path] = contentHash(remoteFile.content);
            result.pulled++;
            break;
          case 'keep-local':
            break;
          case 'conflict': {
            const copy = vaultFileUri(vaultPath, conflictCopyPath(file.path));
            if ((await FS.readFile(copy)) === null) {
              FS.writeFile(copy, remoteFile.content);
              result.pulled++;
            }
            break;
          }
        }
      } catch (error) { result.errors.push(`Pull ${file.path}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    saveSyncBase(vaultPath, remoteUrl, branchName, base);
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
    const base = await loadSyncBase(vaultPath, remoteUrl, branchName);
    const files = new Map(((await listFiles(remote, token, ref)) ?? []).map((file) => [file.path, file]));
    for (const file of await FS.listAllMarkdownFiles(vaultPath)) {
      const path = vaultRelativePath(vaultPath, file.filePath);
      if (!markdown(path)) continue;
      try {
        const content = await FS.readFile(file.filePath);
        if (content === null) continue;
        const existing = files.get(path);
        if (existing && (await readRemoteFile(remote, token, ref, path)).content === content) {
          base[path] = contentHash(content);
          continue;
        }
        await writeRemoteFile(remote, token, ref, path, content, existing?.sha);
        base[path] = contentHash(content);
        result.pushed++;
      } catch (error) { result.errors.push(`Push ${path}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    saveSyncBase(vaultPath, remoteUrl, branchName, base);
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
