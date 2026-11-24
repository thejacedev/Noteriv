// Client certificates for WebDAV sync (issue 57): a vault can name a
// certificate from the phone's own store, and its WebDAV requests then go
// over connections that show it to the vault's server and to nobody else.
//
// The phone's store and the connections themselves are native code that only
// exists on Android; here a stand-in takes their place
// (tests/fakes/client-certificate-native.mjs). What runs for real is
// everything around it: which requests take which road, what a failure is
// called, and the whole of sync on top.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import * as Certificates from '@/lib/client-certificate';
import { vaultFileUri } from '@/lib/sync-state';
import { buildClient } from '@/lib/webdav-client';
import * as WebDav from '@/lib/webdav-sync';

import { fakeWebDav } from './fake-webdav.mjs';
import { phone, reset as resetPhone, SHOWN } from './fakes/client-certificate-native.mjs';
import * as FS from './fakes/file-system.mjs';
import * as Storage from './fakes/storage.mjs';

const VAULT = 'file:///data/vaults/a/';
const ALIAS = 'maya-phone';

let server;
let realFetch;
/** What reached the network: { url, method, shown } for each request. */
let wire;
/** How a server that wants a certificate treats a visitor without one: 'hang-up', a status, or null for a server that wants none. */
let demand;

const cfg = (extra = {}) => ({ url: server.url, username: server.user, password: server.password, remotePath: '/Notes', ...extra });
const sync = (extra) => WebDav.sync(VAULT, cfg(extra), FS.syncRecordUri('a'));
const write = (rel, content) => (typeof content === 'string' ? FS.writeFile(vaultFileUri(VAULT, rel), content) : FS.writeBytes(vaultFileUri(VAULT, rel), content));
const message = async (work) => {
  try {
    await work();
  } catch (error) {
    return error.message;
  }
  assert.fail('nothing was thrown');
};

beforeEach(() => {
  FS.reset();
  resetPhone();
  FS.createDir(VAULT);
  server = fakeWebDav();
  wire = [];
  demand = null;
  realFetch = globalThis.fetch;
  // The server, behind a front door that may ask every visitor for a certificate.
  globalThis.fetch = async (input, init = {}) => {
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
    const shown = headers[SHOWN] ?? null;
    wire.push({ url: String(input), method: (init.method ?? 'GET').toUpperCase(), shown });
    if (demand !== null && shown !== ALIAS) {
      if (demand === 'hang-up') throw new TypeError('Read error: ssl=0x7b: Failure in SSL library, usually a protocol error');
      return new Response('<html><head><title>400 No required SSL certificate was sent</title></head></html>', { status: demand });
    }
    return server.fetch(input, init);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A phone that has the module, with the certificate installed and the server asking for one. */
function android({ installed = true, asks = true } = {}) {
  phone.supported = true;
  if (installed) phone.installed.add(ALIAS);
  if (asks) {
    demand = 'hang-up';
    phone.asking.add('dav.example:443');
  }
}

// ── Which server a certificate is for ──

test('the server of an address is its name and port, and only https has one', () => {
  assert.deepEqual(Certificates.endpointOf('https://cloud.example.com/remote.php/dav/files/me'), { host: 'cloud.example.com', port: 443 });
  assert.deepEqual(Certificates.endpointOf('  https://Cloud.Example.com:8443/dav  '), { host: 'cloud.example.com', port: 8443 });
  assert.equal(Certificates.endpointOf('http://cloud.example.com/dav'), null);
  assert.equal(Certificates.endpointOf('cloud.example.com'), null);
  assert.equal(Certificates.endpointOf(''), null);
});

// ── A vault without a certificate ──

test('a vault without a certificate never touches the certificate connections', async () => {
  android({ asks: false });
  write('note.md', 'hello');
  const outcome = await sync();
  assert.deepEqual([outcome.pushed, outcome.errors], [1, []]);
  assert.equal(phone.requests.length, 0);
  assert.ok(wire.length > 0 && wire.every((request) => request.shown === null));
  assert.equal(buildClient(cfg()).fetch, undefined);
});

test('a device that cannot show certificates syncs the ordinary way, whatever the vault says', async () => {
  // An iPhone: no module. A certificate name left in a vault's settings is not an error there.
  phone.supported = false;
  write('note.md', 'hello');
  const outcome = await sync({ clientCertificate: ALIAS });
  assert.deepEqual([outcome.pushed, outcome.errors], [1, []]);
  assert.equal(phone.requests.length, 0);
  assert.equal(Certificates.supported(), false);
});

// ── A vault with a certificate ──

test('with a certificate, every request of a sync shows it, and the files arrive whole', async () => {
  android();
  const picture = new Uint8Array([0, 255, 137, 80, 78, 71, 13, 10, 26, 10, 0, 128, 200]);
  write('note.md', 'héllo wörld\n');
  write('Deep/Folder/picture.png', picture);
  server.put('Notes/from-desktop.md', 'written elsewhere');
  server.put('Notes/Deep/scan.pdf', new Uint8Array([37, 80, 68, 70, 0, 1, 2, 250, 251]));

  const first = await sync({ clientCertificate: ALIAS });
  assert.deepEqual([first.pushed, first.pulled, first.errors], [2, 2, []]);
  assert.equal(server.text('Notes/note.md'), 'héllo wörld\n');
  assert.deepEqual(server.bytes('Notes/Deep/Folder/picture.png'), picture);
  assert.equal(await FS.readFile(vaultFileUri(VAULT, 'from-desktop.md')), 'written elsewhere');
  assert.deepEqual(FS.bytesOf(vaultFileUri(VAULT, 'Deep/scan.pdf')), new Uint8Array([37, 80, 68, 70, 0, 1, 2, 250, 251]));

  // A deletion on the server reaches the phone the same way.
  server.remove('Notes/from-desktop.md');
  const second = await sync({ clientCertificate: ALIAS });
  assert.deepEqual([second.deleted, second.errors], [1, []]);

  // Not one request went out without the certificate, and each named the one server.
  assert.ok(wire.length > 10);
  assert.ok(wire.every((request) => request.shown === ALIAS), 'a request left without the certificate');
  assert.ok(phone.requests.every((request) => request.host === 'dav.example' && request.port === 443 && request.alias === ALIAS));
  const methods = new Set(phone.requests.map((request) => request.method));
  for (const method of ['PROPFIND', 'MKCOL', 'PUT', 'GET']) assert.ok(methods.has(method), `${method} did not go through the certificate connections`);
});

test('the connection check uses the certificate too', async () => {
  android();
  await WebDav.testConnection(cfg({ clientCertificate: ALIAS }));
  assert.ok(wire.length > 0 && wire.every((request) => request.shown === ALIAS));
});

test('a certificate is shown to the server it was chosen for and to no other', async () => {
  android({ asks: false });
  const fetchWith = Certificates.certificateFetch('https://dav.example/dav', ALIAS);
  for (const elsewhere of ['https://other.example/dav/x', 'https://dav.example:8443/dav/x', 'http://dav.example/dav/x', 'https://dav.example.evil.test/dav/x']) {
    await assert.rejects(fetchWith(elsewhere, { method: 'GET' }), (error) => error instanceof Certificates.ClientCertificateProblem && /another server/.test(error.message));
  }
  // Refused before anything was handed to the phone's network code.
  assert.equal(phone.requests.length, 0);
  assert.equal(wire.length, 0);
  // The right server still works, spelled differently or not.
  const answer = await fetchWith('https://DAV.example:443/dav/', { method: 'PROPFIND', headers: { Depth: '0', Authorization: buildClient(cfg()).authorization } });
  assert.equal(answer.status, 207);
});

test('an address without https, or no certificate, gives no certificate connections', () => {
  android({ asks: false });
  assert.equal(Certificates.certificateFetch('http://dav.example/dav', ALIAS), null);
  assert.equal(Certificates.certificateFetch('https://dav.example/dav', null), null);
  assert.equal(Certificates.certificateFetch('https://dav.example/dav', ''), null);
  assert.equal(typeof Certificates.certificateFetch('https://dav.example/dav', ALIAS), 'function');
});

test('a vault hands its certificate to sync, and a vault without one hands none', async () => {
  await Storage.setItem(Storage.KEYS.WEBDAV_PASSWORD('a'), 'secret');
  const webdav = { url: 'https://dav.example/dav', username: 'me', remotePath: '/Notes' };
  assert.equal((await WebDav.vaultConfig({ id: 'a', path: VAULT, webdav: { ...webdav, clientCertificate: ALIAS } })).clientCertificate, ALIAS);
  assert.equal('clientCertificate' in (await WebDav.vaultConfig({ id: 'a', path: VAULT, webdav })), false);
});

// ── When the certificate is the problem ──

test('a server that hangs up for want of a certificate is named as such', async () => {
  android({ installed: false });
  write('note.md', 'hello');
  assert.equal(await message(() => sync()), Certificates.NONE_CHOSEN);
  assert.match(Certificates.NONE_CHOSEN, /asks for a client certificate.*none is chosen.*Settings > WebDAV Sync > Client certificate/);
  // It was asked once, at the vault's own address.
  assert.deepEqual(phone.probes, ['dav.example:443']);
  assert.equal(await message(() => WebDav.testConnection(cfg())), Certificates.NONE_CHOSEN);
});

test('a server that answers 400 for want of a certificate is named as such', async () => {
  android({ installed: false });
  demand = 400;
  const text = await message(() => sync());
  assert.match(text, /^Listing the remote folder failed: the server answered HTTP 400\. The server asks for a client certificate, and none is chosen/);
});

test('a failure that has nothing to do with certificates keeps its own words', async () => {
  // The server breaks the connection but does not ask for a certificate.
  android({ installed: false, asks: false });
  demand = 'hang-up';
  assert.match(await message(() => sync()), /^Could not reach the server: Read error/);
  assert.deepEqual(phone.probes, ['dav.example:443']);

  // A wrong password: the server is not even asked about certificates.
  phone.probes.length = 0;
  demand = null;
  assert.match(await message(() => WebDav.sync(VAULT, cfg({ password: 'wrong' }), FS.syncRecordUri('a'))), /rejected the username or password/);
  assert.deepEqual(phone.probes, []);
});

test('a server that does not answer in time is not asked about certificates', async (t) => {
  android({ installed: false });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = (input, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const failed = message(() => WebDav.testConnection(cfg()));
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(60_000);
  assert.match(await failed, /did not answer in time/);
  assert.deepEqual(phone.probes, []);
});

test('on a device without certificates a broken connection is reported as it is', async () => {
  phone.supported = false;
  demand = 'hang-up';
  assert.match(await message(() => sync()), /^Could not reach the server: Read error/);
  assert.deepEqual(phone.probes, []);
});

test('a certificate that is gone from the phone stops the sync before it starts', async () => {
  android({ installed: false });
  write('note.md', 'hello');
  const text = await message(() => sync({ clientCertificate: ALIAS }));
  assert.equal(text, Certificates.goneMessage(ALIAS));
  assert.match(text, /"maya-phone" is no longer on this phone.*Choose it again/);
  assert.equal(wire.length, 0, 'the server was contacted');
  assert.equal(phone.requests.length, 0);
  assert.equal(phone.forgotten, 1);
});

test('a certificate that disappears during a sync is named too', async () => {
  android();
  phone.failNext = Object.assign(new Error('The certificate "maya-phone" could not be read from this phone.'), { code: 'ERR_CLIENT_CERT_UNAVAILABLE' });
  assert.equal(await message(() => sync({ clientCertificate: ALIAS })), Certificates.goneMessage(ALIAS));
});

test('a certificate the server does not accept is named, with the reason', async () => {
  android();
  phone.failNext = Object.assign(new Error('Read error: ssl=0x7b: SSLV3_ALERT_CERTIFICATE_UNKNOWN'), { code: 'ERR_CLIENT_CERT_REFUSED' });
  const text = await message(() => sync({ clientCertificate: ALIAS }));
  assert.match(text, /^The server did not accept the client certificate "maya-phone" \(Read error: ssl=0x7b: SSLV3_ALERT_CERTIFICATE_UNKNOWN\)\./);
});

test('a 400 while a certificate is shown points at the certificate', async () => {
  android();
  server.fail('PROPFIND', 'Notes', 400);
  const text = await message(() => sync({ clientCertificate: ALIAS }));
  assert.match(text, /HTTP 400\. The server may not accept the client certificate "maya-phone"\.$/);
  // No second question to the server: the certificate was already shown.
  assert.deepEqual(phone.probes, []);
});

test('any other failure of a certificate connection reads like every unreachable server', async () => {
  android();
  phone.failNext = Object.assign(new Error('Unable to resolve host "dav.example": No address associated with hostname'), { code: 'ERR_REQUEST_FAILED' });
  assert.equal(await message(() => sync({ clientCertificate: ALIAS })), 'Could not reach the server: Unable to resolve host "dav.example": No address associated with hostname.');
});

// ── Giving up on a request ──

test('a request that is given up is cancelled on the phone', async () => {
  android({ asks: false });
  const fetchWith = Certificates.certificateFetch('https://dav.example/dav', ALIAS);

  const before = new AbortController();
  before.abort();
  await assert.rejects(fetchWith('https://dav.example/dav/', { method: 'GET', signal: before.signal }), { name: 'AbortError' });
  assert.equal(phone.requests.length, 0);

  let open;
  phone.gate = new Promise((resolve) => {
    open = resolve;
  });
  const during = new AbortController();
  const pending = fetchWith('https://dav.example/dav/', { method: 'GET', signal: during.signal });
  await new Promise((resolve) => setImmediate(resolve));
  during.abort();
  phone.failNext = Object.assign(new Error('The request was cancelled.'), { code: 'ERR_REQUEST_CANCELED' });
  open();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(phone.cancelled, [phone.requests[0].id]);
});

// ── Choosing ──

test('the list of certificates is opened for the server of the address', async () => {
  android({ asks: false });
  phone.nextChoice = ALIAS;
  assert.equal(await Certificates.choose('https://cloud.example.com:8443/remote.php/dav/files/me', null), ALIAS);
  // Closed without a choice, and an address that is not filled in yet.
  phone.nextChoice = null;
  assert.equal(await Certificates.choose('', 'old-one'), null);
  assert.deepEqual(phone.chooserOpened, [
    { host: 'cloud.example.com', port: 8443, current: null },
    { host: null, port: -1, current: 'old-one' },
  ]);
});
