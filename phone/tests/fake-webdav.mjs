// A stand-in WebDAV server, as much of one as sync talks to: PROPFIND with
// depth 0 and 1, MKCOL, PUT with its two conditions, GET and DELETE, behind
// a username and password. It answers the way real servers do where that
// matters to sync: an upload into a folder that does not exist is refused,
// a folder that exists cannot be made again, and a listing names each entry
// by its encoded address.
//
// `etags: false` makes it a server that tells two versions of a file apart
// only by the second and the size, like WsgiDAV.
import { clock } from './fakes/clock.mjs';

const xml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function fakeWebDav({ user = 'me', password = 'secret', etags = true, origin = 'https://dav.example', base = '/dav', fullAddresses = false } = {}) {
  /** decoded path -> { bytes: Buffer, etag, mtimeMs } */
  const files = new Map();
  /** Decoded paths of the folders, without a slash at the end. */
  const folders = new Set([base]);
  /** Every request, in order: { method, path, headers }. */
  const log = [];
  /** One-shot hooks run before a request is answered: { method, path, run }. */
  const hooks = [];
  /** Answers forced for a request: { method, path, status }. */
  const failures = [];
  let version = 0;

  const authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  const full = (rel) => (rel === '' ? base : `${base}/${rel}`);
  const parentOf = (path) => path.slice(0, path.lastIndexOf('/'));
  const href = (path, isFolder) => {
    const encoded = path.split('/').map(encodeURIComponent).join('/') + (isFolder ? '/' : '');
    return fullAddresses ? `${origin}${encoded}` : encoded;
  };

  function store(path, bytes) {
    version += 1;
    files.set(path, { bytes: Buffer.from(bytes), etag: `"v${version}"`, mtimeMs: clock.tick() });
  }

  function entry(path) {
    if (folders.has(path)) {
      return `<d:response><d:href>${xml(href(path, true))}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
    }
    const file = files.get(path);
    const tag = etags ? `<d:getetag>${xml(file.etag)}</d:getetag>` : '';
    return `<d:response><d:href>${xml(href(path, false))}</d:href><d:propstat><d:prop><d:resourcetype/><d:getlastmodified>${new Date(file.mtimeMs).toUTCString()}</d:getlastmodified>${tag}<d:getcontentlength>${file.bytes.length}</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
  }

  const answer = (status, body = null, headers = {}) => new Response(status === 204 || status === 304 ? null : body, { status, headers });

  async function fetch(input, init = {}) {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, '');
    log.push({ method, path, raw: url.pathname, headers });

    if (url.origin !== origin) throw new TypeError('fetch failed');
    if (headers.authorization !== authorization) return answer(401, 'Unauthorized');

    const hook = hooks.findIndex((h) => h.method === method && h.path === path);
    if (hook >= 0) hooks.splice(hook, 1)[0].run();
    const failure = failures.find((f) => f.method === method && f.path === path);
    if (failure) return answer(failure.status, 'refused');

    if (method === 'PROPFIND') {
      if (!folders.has(path) && !files.has(path)) return answer(404, 'Not Found');
      const paths = [path];
      if (folders.has(path) && headers.depth !== '0') {
        for (const other of [...folders, ...files.keys()]) if (other !== path && parentOf(other) === path) paths.push(other);
      }
      return answer(207, `<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:">${paths.map(entry).join('')}</d:multistatus>`, { 'Content-Type': 'application/xml; charset=utf-8' });
    }

    if (method === 'MKCOL') {
      if (folders.has(path) || files.has(path)) return answer(405, 'Method Not Allowed');
      if (!folders.has(parentOf(path))) return answer(409, 'Conflict');
      folders.add(path);
      return answer(201, 'Created');
    }

    if (method === 'PUT') {
      if (folders.has(path)) return answer(405, 'Method Not Allowed');
      if (!folders.has(parentOf(path))) return answer(409, 'Conflict');
      const existing = files.get(path);
      if (headers['if-none-match'] === '*' && existing) return answer(412, 'Precondition Failed');
      if (headers['if-match'] !== undefined && (!existing || existing.etag !== headers['if-match'])) return answer(412, 'Precondition Failed');
      const body = init.body ?? '';
      store(path, typeof body === 'string' ? body : Buffer.from(body.buffer, body.byteOffset, body.byteLength));
      return existing ? answer(204) : answer(201, 'Created');
    }

    if (method === 'GET') {
      const file = files.get(path);
      return file ? answer(200, file.bytes, { 'Content-Type': 'application/octet-stream' }) : answer(404, 'Not Found');
    }

    if (method === 'DELETE') {
      if (files.delete(path)) return answer(204);
      if (!folders.has(path)) return answer(404, 'Not Found');
      for (const other of [...folders]) if (other === path || other.startsWith(`${path}/`)) folders.delete(other);
      for (const other of [...files.keys()]) if (other.startsWith(`${path}/`)) files.delete(other);
      return answer(204);
    }

    return answer(405, 'Method Not Allowed');
  }

  return {
    fetch,
    /** The address a vault is pointed at. */
    url: `${origin}${base}`,
    user,
    password,
    log,
    /** What another device does: put a file on the server, making the folders above it. */
    put(rel, content) {
      const path = full(rel);
      let folder = base;
      for (const part of rel.split('/').slice(0, -1)) {
        folder = `${folder}/${part}`;
        folders.add(folder);
      }
      store(path, content);
    },
    remove(rel) {
      files.delete(full(rel));
    },
    has: (rel) => files.has(full(rel)),
    text: (rel) => (files.has(full(rel)) ? files.get(full(rel)).bytes.toString('utf8') : null),
    bytes: (rel) => (files.has(full(rel)) ? new Uint8Array(files.get(full(rel)).bytes) : null),
    /** Every file under a remote folder, as paths inside it. */
    tree(remote = '') {
      const prefix = remote === '' ? `${base}/` : `${base}/${remote}/`;
      return [...files.keys()].filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length)).sort();
    },
    /** Run something once, just before the next request of this kind for this file is answered. */
    before(method, rel, run) {
      hooks.push({ method, path: full(rel), run });
    },
    /** Answer every request of this kind for this file with a status. */
    fail(method, rel, status) {
      failures.push({ method, path: full(rel), status });
    },
    heal() {
      failures.length = 0;
    },
    /** How many requests were made since the count was last taken. */
    requests(method) {
      const taken = log.splice(0);
      return method ? taken.filter((r) => r.method === method).length : taken.length;
    },
  };
}
