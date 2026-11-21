// The app's state with a vault that syncs over WebDAV: when a sync runs, and
// what it does to the note that is open. Real React, the real sync code, a
// stand-in server.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { fakeWebDav } from './fake-webdav.mjs';
import { clock } from './fakes/clock.mjs';
import { container } from './fakes/page.mjs';
import * as FS from './fakes/file-system.mjs';
import * as Storage from './fakes/storage.mjs';

const { default: React, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { AppProvider, useApp } = await import('@/context/AppContext');
const { vaultFileUri } = await import('@/lib/sync-state');

const VAULT = 'file:///data/vaults/Notes/';
const NOTE = vaultFileUri(VAULT, 'Note.md');

let app;
let root;
let server;
let realFetch;
let warnings;
let realWarn;

function Probe() {
  app = useApp();
  return null;
}

async function type(text) {
  for (const letter of text) await act(async () => { app.setContent(app.content + letter); });
}

/** Let everything that is already under way run to its end. */
async function settle() {
  for (let i = 0; i < 80; i++) await act(async () => { await new Promise((done) => setImmediate(done)); });
}

/** Let the sync timer tick this many times, five seconds each. */
async function ticks(count) {
  for (let i = 0; i < count; i++) {
    await act(async () => { mock.timers.tick(5_000); });
    await settle();
  }
}

/** A minute passes: the vault's turn to sync comes round. */
const minute = () => ticks(12);

/** The note is changed on a computer and synced from there. */
function desktopWrites(text) {
  clock.advance(2_000);
  server.put('Notes/Note.md', text);
}

const uploads = () => server.log.filter((r) => r.method === 'PUT').length;
const listings = () => server.log.filter((r) => r.method === 'PROPFIND' && r.headers.depth === '1').length;
const notes = () => Object.fromEntries(Object.entries(FS.snapshot(VAULT)).filter(([path]) => !path.startsWith('.')));

async function open(vaultChanges = {}) {
  const vault = { id: 'v1', name: 'Notes', path: VAULT, gitRemote: null, gitBranch: 'main', autoSync: false, lastOpened: 0, webdav: { url: server.url, username: server.user, remotePath: '/Notes' }, ...vaultChanges };
  await Storage.setItem(Storage.KEYS.VAULTS, [vault]);
  await Storage.setItem(Storage.KEYS.ACTIVE_VAULT, vault.id);
  await Storage.setItem(Storage.KEYS.SETUP_COMPLETE, true);
  root = createRoot(container());
  await act(async () => { root.render(React.createElement(AppProvider, null, React.createElement(Probe))); });
  await settle();
  return vault;
}

beforeEach(async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  FS.reset();
  FS.createDir(VAULT);
  server = fakeWebDav();
  realFetch = globalThis.fetch;
  globalThis.fetch = server.fetch;
  realWarn = console.warn;
  warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  server.put('Notes/Note.md', 'first version');
  await Storage.setItem(Storage.KEYS.WEBDAV_PASSWORD('v1'), server.password);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  mock.timers.reset();
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  await Storage.removeItem(Storage.KEYS.WEBDAV_PASSWORD('v1'));
});

test('a vault syncs when it opens, then once a minute and not in between', async () => {
  await open();
  // The sync that runs when the vault opens brings the note down.
  assert.equal(await FS.readFile(NOTE), 'first version');
  assert.equal(listings(), 1);

  await ticks(11);
  assert.equal(listings(), 1);
  await ticks(1);
  assert.equal(listings(), 2);
  await minute();
  assert.equal(listings(), 3);
  assert.equal(uploads(), 0);
});

test('a newer version pulled by sync shows in the open note', async () => {
  await open();
  await act(async () => { await app.setCurrentFile(NOTE); });
  assert.equal(app.content, 'first version');

  desktopWrites('changed on the desktop');
  await minute();
  assert.equal(app.content, 'changed on the desktop');
  assert.equal(app.isDirty, false);
});

test('sync uploads what is in the editor, not what was last saved', async () => {
  await open();
  await act(async () => { await app.setCurrentFile(NOTE); });
  clock.advance(2_000);
  await type(' typed and not saved yet');
  await minute();
  assert.equal(server.text('Notes/Note.md'), 'first version typed and not saved yet');
  assert.equal(app.isDirty, false);
});

test('the next edit builds on the pulled version, so the desktop change survives', async () => {
  await open();
  await act(async () => { await app.setCurrentFile(NOTE); });
  desktopWrites('changed on the desktop');
  await minute();
  clock.advance(2_000);
  await type(' and on the phone');
  await minute();
  assert.equal(server.text('Notes/Note.md'), 'changed on the desktop and on the phone');
  assert.deepEqual(Object.keys(notes()), ['Note.md']);
});

test('unsaved text meets a change from another device: both are kept, here and on the server', async () => {
  await open();
  await act(async () => { await app.setCurrentFile(NOTE); });
  clock.advance(2_000);
  await type(' typed on the phone');
  desktopWrites('changed on the desktop');
  await minute();

  const kept = Object.values(notes()).sort();
  assert.deepEqual(kept, ['changed on the desktop', 'first version typed on the phone']);
  assert.deepEqual(server.tree('Notes').map((rel) => server.text(`Notes/${rel}`)).sort(), kept);
  // The editor shows what the note's own file now holds.
  assert.equal(app.content, await FS.readFile(NOTE));
  assert.equal(app.isDirty, false);
});

test('a sync can be asked for ahead of its turn, as leaving the app does', async () => {
  await open();
  await act(async () => { await app.setCurrentFile(NOTE); });
  clock.advance(2_000);
  await type(' written just before leaving');
  await act(async () => { app.flushFile(); app.requestWebDavSync(); });
  await settle();
  assert.equal(server.text('Notes/Note.md'), 'first version written just before leaving');
});

test('a server that cannot be reached is asked again a minute later, not every few seconds', async () => {
  globalThis.fetch = async () => { throw new TypeError('Network request failed'); };
  let asked = 0;
  const failing = globalThis.fetch;
  globalThis.fetch = (...args) => { asked += 1; return failing(...args); };
  await open();
  assert.equal(asked, 1);
  assert.match(warnings.join('\n'), /WebDAV sync failed: Error: Could not reach the server/);

  await ticks(11);
  assert.equal(asked, 1);
  await ticks(1);
  assert.equal(asked, 2);

  // The server comes back: the next turn syncs as if nothing had happened.
  globalThis.fetch = server.fetch;
  await minute();
  assert.equal(await FS.readFile(NOTE), 'first version');
});

test('a vault without a stored password does not sync and does not fail', async () => {
  await Storage.removeItem(Storage.KEYS.WEBDAV_PASSWORD('v1'));
  await open();
  await minute();
  assert.equal(server.log.length, 0);
  assert.deepEqual(warnings, []);
});

test('a vault with no WebDAV folder makes no requests', async () => {
  await open({ webdav: null });
  await minute();
  assert.equal(server.log.length, 0);
});

test('a sync asked for from the settings screen takes its turn and reports what it did', async () => {
  const vault = await open();
  FS.writeFile(vaultFileUri(VAULT, 'New.md'), 'made on the phone');
  let outcome;
  await act(async () => {
    outcome = await app.syncWebDav(vault, { url: server.url, username: server.user, password: server.password, remotePath: '/Notes' });
  });
  assert.equal(outcome.pushed, 1);
  assert.equal(server.text('Notes/New.md'), 'made on the phone');
  await assert.rejects(app.syncWebDav(vault, { url: server.url, username: server.user, password: 'wrong', remotePath: '/Notes' }), /username or password/);
});
