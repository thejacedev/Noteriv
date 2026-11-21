/**
 * Talking to a WebDAV server: addresses, the handful of requests sync needs,
 * and reading the server's listings.
 *
 * The phone's copy of the server side of `desktop/src-tauri/src/sync_webdav.rs`.
 * Addresses are built exactly as the desktop app builds them, so both reach
 * the same files in the same folder.
 */
import { fetch } from '@/lib/http';
import { allows, enters, KEY_FILE, RemoteFile, safeRel, SyncFilter } from '@/lib/sync-plan';

export interface WebDavConfig {
  /** The server's WebDAV address, for example `https://cloud.example.com/remote.php/dav/files/me`. */
  url: string;
  username: string;
  password: string;
  /** The folder on the server the vault syncs with, for example `/Noteriv`. */
  remotePath: string;
}

// ============================================================
// Paths and addresses
// ============================================================

/**
 * Percent-encode each part of a path, so `#`, `?`, `%`, spaces and accented
 * letters in a note's name reach the server as part of the name. Everything
 * but letters, digits and `-_.~` is encoded, as the desktop app does.
 */
export function encodeRel(rel: string): string {
  return rel
    .split('/')
    .filter((part) => part !== '')
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

/** The address of the remote folder, without a trailing slash. Throws when the server address cannot be used. */
export function rootUrl(cfg: Pick<WebDavConfig, 'url' | 'remotePath'>): string {
  let parsed: URL;
  try {
    parsed = new URL(cfg.url.trim());
  } catch {
    throw new Error('The server URL is not a valid address. It has to start with https://.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('The server URL must start with https://.');
  }
  // Anything after a "?" or "#" is not part of the folder's address. Cut from
  // the text rather than set on the object: not every URL the app can be
  // given on a phone lets its parts be changed.
  const href = parsed.href;
  const end = href.search(/[?#]/);
  const base = (end === -1 ? href : href.slice(0, end)).replace(/\/+$/, '');
  const path = encodeRel(cfg.remotePath);
  return path === '' ? base : `${base}/${path}`;
}

export function fileUrl(root: string, rel: string): string {
  return `${root}/${encodeRel(rel)}`;
}

export function dirUrl(root: string, rel: string): string {
  const encoded = encodeRel(rel);
  return encoded === '' ? `${root}/` : `${root}/${encoded}/`;
}

/** The decoded path part of an address the server gave or was asked for. */
export function decodedPath(href: string): string {
  const trimmed = href.trim();
  const rest = /^https?:\/\//.exec(trimmed) ? trimmed.replace(/^https?:\/\//, '') : null;
  const path = rest === null ? trimmed : rest.includes('/') ? rest.slice(rest.indexOf('/')) : '/';
  // Each run of escapes is decoded on its own, so one that is not valid text
  // is left as it is without spoiling the rest of the name.
  return path.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

/** `path` relative to `base`: empty for the folder itself, null if it is not inside it. */
export function relUnder(path: string, base: string): string | null {
  const folder = base.replace(/\/+$/, '');
  const inside = path.replace(/\/+$/, '');
  if (inside === folder) return '';
  return inside.startsWith(`${folder}/`) ? inside.slice(folder.length + 1) : null;
}

/**
 * Whether two remote folders are the same one, or one holds the other. Two
 * vaults that sync into overlapping folders would be mixed into each other,
 * and from there onto every device that syncs with them.
 */
export function foldersOverlap(rootA: string, rootB: string): boolean {
  const a = decodedPath(rootA).replace(/\/+$/, '');
  const b = decodedPath(rootB).replace(/\/+$/, '');
  const host = (root: string) => (/^https?:\/\/[^/]+/i.exec(root.trim())?.[0] ?? '').toLowerCase();
  if (host(rootA) !== host(rootB)) return false;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

// ============================================================
// Reading the server's listings
// ============================================================

export interface PropEntry {
  /** Decoded path on the server. */
  path: string;
  isDir: boolean;
  lastModified: string;
  etag: string;
  size: string;
}

/**
 * The tag in the form an `If-Match` header takes. A weak tag (`W/...`) can
 * never match there, so it is not used.
 */
export function strongEtag(raw: string): string | null {
  const tag = raw.trim();
  if (tag === '' || tag.startsWith('W/')) return null;
  return tag.startsWith('"') ? tag : `"${tag}"`;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A server's modification time in milliseconds, or null when it is in
 * neither of the two forms servers use. Read by hand, so the answer does not
 * depend on which dates the phone's JavaScript engine happens to understand.
 */
export function parseWebdavDate(text: string): number | null {
  const s = text.trim();
  // "Tue, 01 Apr 2025 12:00:00 GMT" (most servers)
  const http = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(GMT|UTC?|Z|[+-]\d{4})$/i.exec(s);
  if (http) {
    const month = MONTHS.indexOf(http[2].toLowerCase());
    if (month < 0) return null;
    const zone = /^[+-]/.test(http[7]) ? offsetMs(http[7][0], http[7].slice(1, 3), http[7].slice(3, 5)) : 0;
    const ms = Date.UTC(+http[3], month, +http[1], +http[4], +http[5], +(http[6] ?? 0)) - zone;
    return ms >= 0 ? ms : null;
  }
  // "2025-04-01T12:00:00Z"
  const iso = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|z|[+-]\d{2}:\d{2})$/.exec(s);
  if (iso) {
    const zone = /^[+-]/.test(iso[8]) ? offsetMs(iso[8][0], iso[8].slice(1, 3), iso[8].slice(4, 6)) : 0;
    const fraction = iso[7] ? Math.floor(Number(`0.${iso[7]}`) * 1000) : 0;
    const ms = Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +iso[6]) + fraction - zone;
    return ms >= 0 ? ms : null;
  }
  return null;
}

function offsetMs(sign: string, hours: string, minutes: string): number {
  return (sign === '-' ? -1 : 1) * (+hours * 60 + +minutes) * 60_000;
}

export function toRemoteFile(entry: PropEntry): RemoteFile {
  return {
    sig: entry.etag === '' ? `lm:${entry.lastModified}|${entry.size}` : `etag:${entry.etag}`,
    mtimeMs: parseWebdavDate(entry.lastModified) ?? 0,
    etag: strongEtag(entry.etag),
  };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9A-Fa-f]+|#\d+|[A-Za-z]+);/g, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10));
    return ENTITIES[name] ?? whole;
  });
}

/** Where a tag that opened before `from` closes: the first `>` outside a quoted attribute. -1 if it never does. */
function tagEnd(xml: string, from: number): number {
  let quote = '';
  for (let i = from; i < xml.length; i++) {
    const c = xml[i];
    if (quote !== '') {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

/** A tag's own name in lower case, without the prefix servers put in front (`d:href`, `D:href`, `lp1:href`). */
function localName(tag: string): string {
  const name = /^[^\s/>]*/.exec(tag)?.[0] ?? '';
  return name.slice(name.indexOf(':') + 1).toLowerCase();
}

/**
 * Read the entries out of a PROPFIND answer. An answer that breaks off in
 * the middle gives the entries that were complete.
 */
export function parsePropfind(xml: string): PropEntry[] {
  type Field = 'path' | 'lastModified' | 'etag' | 'size';
  const blank = (): PropEntry => ({ path: '', isDir: false, lastModified: '', etag: '', size: '' });

  const out: PropEntry[] = [];
  let current = blank();
  let haveHref = false;
  let inResponse = false;
  let inResourceType = false;
  let capture: Field | null = null;

  const text = (value: string) => {
    if (capture !== null) current[capture] += value;
  };

  const open = (name: string, hasContent: boolean) => {
    if (name === 'response') {
      if (!hasContent) return;
      inResponse = true;
      current = blank();
      haveHref = false;
    } else if (name === 'collection') {
      // Servers write the folder marker as `<collection/>` or as an opening
      // and a closing tag. Both mean the same thing.
      if (inResourceType) current.isDir = true;
    } else if (inResponse && hasContent) {
      // Only the first address in a response names the entry itself.
      if (name === 'href' && !haveHref) capture = 'path';
      else if (name === 'getlastmodified') capture = 'lastModified';
      else if (name === 'getetag') capture = 'etag';
      else if (name === 'getcontentlength') capture = 'size';
      else if (name === 'resourcetype') inResourceType = true;
    }
  };

  const close = (name: string) => {
    if (name === 'href') {
      if (capture === 'path') haveHref = true;
      capture = null;
    } else if (name === 'getlastmodified' || name === 'getetag' || name === 'getcontentlength') {
      capture = null;
    } else if (name === 'resourcetype') {
      inResourceType = false;
    } else if (name === 'response') {
      if (inResponse && haveHref) {
        current.path = decodedPath(current.path);
        out.push(current);
        current = blank();
      }
      inResponse = false;
    }
  };

  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const textEnd = lt === -1 ? xml.length : lt;
    if (textEnd > i) text(unescapeXml(xml.slice(i, textEnd).trim()));
    if (lt === -1) break;

    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end === -1) break;
      i = end + 3;
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end === -1) break;
      text(xml.slice(lt + 9, end));
      i = end + 3;
    } else if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end === -1) break;
      i = end + 2;
    } else if (xml.startsWith('<!', lt)) {
      const end = tagEnd(xml, lt + 2);
      if (end === -1) break;
      i = end + 1;
    } else {
      const end = tagEnd(xml, lt + 1);
      if (end === -1) break;
      const inner = xml.slice(lt + 1, end);
      i = end + 1;
      if (inner.startsWith('/')) close(localName(inner.slice(1)));
      else open(localName(inner), !inner.endsWith('/'));
    }
  }
  return out;
}

// ============================================================
// Requests
// ============================================================

/** A message for a request the server turned down. `doing` reads like "Uploading". */
export function explainStatus(status: number, doing: string): string {
  if (status === 401) return 'The server rejected the username or password (HTTP 401).';
  if (status === 403) return `${doing} was refused (HTTP 403). The account may not have permission.`;
  if (status === 507) return 'The server is out of storage space (HTTP 507).';
  return `${doing} failed: the server answered HTTP ${status}.`;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Text as base64 of its UTF-8 bytes, for the sign-in header. */
function base64OfText(text: string): string {
  const bytes: number[] = [];
  const escaped = encodeURIComponent(text);
  for (let i = 0; i < escaped.length; i++) {
    if (escaped[i] === '%') {
      bytes.push(parseInt(escaped.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(escaped.charCodeAt(i));
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const first = bytes[i];
    const second = bytes[i + 1] ?? 0;
    const third = bytes[i + 2] ?? 0;
    out += BASE64[first >> 2];
    out += BASE64[((first & 3) << 4) | (second >> 4)];
    out += i + 1 < bytes.length ? BASE64[((second & 15) << 2) | (third >> 6)] : '=';
    out += i + 2 < bytes.length ? BASE64[third & 63] : '=';
  }
  return out;
}

/** How long a request that only asks or changes a name may take. */
const SHORT_TIMEOUT_MS = 60_000;
/** Long enough for a large attachment on a slow connection. */
const TRANSFER_TIMEOUT_MS = 300_000;

export interface Client {
  authorization: string;
}

export function buildClient(cfg: Pick<WebDavConfig, 'username' | 'password'>): Client {
  return { authorization: `Basic ${base64OfText(`${cfg.username}:${cfg.password}`)}` };
}

interface Answer {
  status: number;
  text: string;
  bytes: Uint8Array;
}

/**
 * The server answered with a redirect. It is never followed: on the way to
 * the new address an upload, a deletion or a new folder would be turned into
 * a plain download, which then "succeeds" without having changed anything.
 */
export class ServerMoved extends Error {
  constructor(status: number, location: string) {
    super(
      /^https?:\/\//i.test(location)
        ? `The server sent the request on to another address (HTTP ${status}): ${location} Enter that address as the server URL.`
        : `The server answered with a redirect (HTTP ${status}) instead of the folder. The server URL has to be the WebDAV address itself.`,
    );
  }
}

async function send(
  client: Client,
  method: string,
  url: string,
  options: { headers?: Record<string, string>; body?: string | Uint8Array; want?: 'text' | 'bytes'; timeoutMs?: number } = {},
): Promise<Answer> {
  const abort = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = abort ? setTimeout(() => abort.abort(), options.timeoutMs ?? SHORT_TIMEOUT_MS) : null;
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: client.authorization,
        'User-Agent': 'Noteriv',
        // A copy kept by the phone must never stand in for what the server holds now.
        'Cache-Control': 'no-cache',
        ...options.headers,
      },
      // Bytes are sent as they are; the type only lacks a name for them.
      body: options.body as BodyInit | undefined,
      // No cookies: every request signs in by itself, so a session the
      // server started for another account can never be used by mistake.
      credentials: 'omit',
      redirect: 'manual',
      signal: abort?.signal,
    });
    const status = response.status;
    if (status >= 300 && status < 400) {
      await response.text().catch(() => '');
      throw new ServerMoved(status, response.headers?.get('location')?.trim() ?? '');
    }
    const ok = status >= 200 && status < 300;
    if (ok && options.want === 'bytes') {
      return { status, text: '', bytes: new Uint8Array(await response.arrayBuffer()) };
    }
    // The answer is read to its end even when it is not needed, so the
    // connection is free for the next request.
    const text = await response.text().catch(() => '');
    return { status, text: ok && options.want === 'text' ? text : '', bytes: new Uint8Array(0) };
  } catch (error) {
    if (error instanceof ServerMoved) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    const timedOut = abort?.signal.aborted === true;
    const plain = /^http:\/\//i.test(url)
      ? ' The Android app does not make plain http:// connections: the address has to start with https://.'
      : '';
    throw new Error(timedOut ? `The server did not answer in time.${plain}` : `Could not reach the server: ${reason}.${plain}`);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:getlastmodified/>
    <D:getetag/>
    <D:getcontentlength/>
  </D:prop>
</D:propfind>`;

/** The HTTP status and, for a successful answer, the entries. */
export async function propfind(client: Client, url: string, depth: 0 | 1): Promise<{ status: number; entries: PropEntry[] }> {
  const answer = await send(client, 'PROPFIND', url, {
    headers: { Depth: String(depth), 'Content-Type': 'application/xml' },
    body: PROPFIND_BODY,
    want: 'text',
  });
  const ok = answer.status >= 200 && answer.status < 300;
  return { status: answer.status, entries: ok ? parsePropfind(answer.text) : [] };
}

export async function mkcol(client: Client, url: string): Promise<void> {
  const { status } = await send(client, 'MKCOL', url);
  // 405: the folder is already there.
  if ((status >= 200 && status < 300) || status === 405) return;
  throw new Error(explainStatus(status, 'Creating a folder'));
}

/** Create the remote folder and every folder above it that the remote path names. */
export async function ensureRoot(client: Client, cfg: Pick<WebDavConfig, 'url' | 'remotePath'>): Promise<void> {
  const base = rootUrl({ url: cfg.url, remotePath: '' });
  let soFar = '';
  for (const part of cfg.remotePath.split('/').filter((p) => p !== '')) {
    soFar = soFar === '' ? part : `${soFar}/${part}`;
    // A folder above may be one this account cannot create but can use.
    await mkcol(client, dirUrl(base, soFar)).catch(() => {});
  }
}

export interface RemoteListing {
  files: Map<string, RemoteFile>;
  dirs: Set<string>;
  /** Whether the folder holds the desktop app's encryption key file. */
  encrypted: boolean;
}

/** Thrown by `listRemote` when the remote folder itself is not on the server. */
export class RemoteFolderMissing extends Error {
  constructor() {
    super('The remote folder was not found on the server (HTTP 404).');
  }
}

/**
 * List every synced file under the remote folder. Any failure stops it: a
 * partial listing would make files that are merely unlisted look deleted.
 */
export async function listRemote(client: Client, root: string, filter: SyncFilter): Promise<RemoteListing> {
  const files = new Map<string, RemoteFile>();
  const dirs = new Set<string>();
  let encrypted = false;
  const queue = [''];

  while (queue.length > 0) {
    const dir = queue.pop() as string;
    const url = dirUrl(root, dir);
    const { status, entries } = await propfind(client, url, 1);
    if (status === 404) {
      if (dir === '') throw new RemoteFolderMissing();
      throw new Error('A folder on the server disappeared while it was being listed, so nothing was synced.');
    }
    if (status < 200 || status >= 300) throw new Error(explainStatus(status, 'Listing the remote folder'));

    const base = decodedPath(url);
    let matched = 0;
    for (const entry of entries) {
      const child = relUnder(entry.path, base);
      if (child === null) continue;
      matched += 1;
      if (child === '' || child.includes('/')) continue;
      const rel = dir === '' ? child : `${dir}/${child}`;
      if (!safeRel(rel)) continue;
      if (entry.isDir) {
        if (enters(filter, rel, child) && !dirs.has(rel)) {
          dirs.add(rel);
          queue.push(rel);
        }
      } else {
        if (rel === KEY_FILE) encrypted = true;
        if (allows(filter, rel)) files.set(rel, toRemoteFile(entry));
      }
    }
    if (entries.length > 0 && matched === 0) {
      throw new Error('The server listed a different folder than the one asked for, so nothing was synced.');
    }
  }
  return { files, dirs, encrypted };
}

export async function statRemote(client: Client, root: string, rel: string): Promise<RemoteFile | null> {
  const { status, entries } = await propfind(client, fileUrl(root, rel), 0);
  if (status === 404) return null;
  if (status < 200 || status >= 300) throw new Error(explainStatus(status, 'Checking an uploaded file'));
  return entries.length > 0 ? toRemoteFile(entries[0]) : null;
}

/** What the server must still hold for an upload to go ahead. */
export type Expect =
  /** No condition. */
  | { kind: 'anything' }
  /** No file under this name yet. */
  | { kind: 'absent' }
  /** The version with this tag. */
  | { kind: 'version'; tag: string };

/**
 * Upload a file. False means the server turned it down because the
 * condition no longer holds: someone else got there first.
 */
export async function put(client: Client, url: string, bytes: Uint8Array, expect: Expect): Promise<boolean> {
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
  if (expect.kind === 'absent') headers['If-None-Match'] = '*';
  if (expect.kind === 'version') headers['If-Match'] = expect.tag;
  const { status } = await send(client, 'PUT', url, { headers, body: bytes, timeoutMs: TRANSFER_TIMEOUT_MS });
  if (status >= 200 && status < 300) return true;
  if (status === 412 && expect.kind !== 'anything') return false;
  throw new Error(explainStatus(status, 'Uploading'));
}

export async function get(client: Client, url: string): Promise<Uint8Array> {
  const answer = await send(client, 'GET', url, { want: 'bytes', timeoutMs: TRANSFER_TIMEOUT_MS });
  if (answer.status < 200 || answer.status >= 300) throw new Error(explainStatus(answer.status, 'Downloading'));
  return answer.bytes;
}

export async function remove(client: Client, url: string): Promise<void> {
  const { status } = await send(client, 'DELETE', url);
  // 404: it is already gone, which is what was wanted.
  if ((status >= 200 && status < 300) || status === 404) return;
  throw new Error(explainStatus(status, 'Deleting'));
}
