// The app's state with a vault that syncs: what the 5-second sync does to
// the note that is open. Real React, the real sync code, a stand-in GitLab.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { fakeGitLab } from './fake-gitlab.mjs';
import { container } from './fakes/page.mjs';
import * as FS from './fakes/file-system.mjs';
import * as Storage from './fakes/storage.mjs';

const { default: React, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { AppProvider, useApp } = await import('@/context/AppContext');
const { vaultFileUri } = await import('@/lib/sync-state');

const VAULT = 'file:///data/vaults/Notes/';
const PROJECT = 'me/notes';
const NOTE = vaultFileUri(VAULT, 'Note.md');

let app;
let root;
let gitlab;
let project;
let realFetch;

function Probe() {
  app = useApp();
  return null;
}

async function type(text) {
  for (const letter of text) await act(async () => { app.setContent(app.content + letter); });
}

/** Let the 5-second sync fire and run to its end. */
async function sync() {
  await act(async () => { mock.timers.tick(5_000); });
  for (let i = 0; i < 50; i++) await act(async () => { await new Promise((done) => setImmediate(done)); });
}

/** The note is changed on another device and pushed. */
function desktopWrites(text) {
  project.files.set('Note.md', text);
  project.commits++;
}

const notes = () => Object.fromEntries(Object.entries(FS.snapshot(VAULT)).filter(([path]) => !path.startsWith('.noteriv/')));

beforeEach(async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  FS.reset();
  gitlab = fakeGitLab();
  const token = gitlab.token('glpat-api', ['api']);
  realFetch = globalThis.fetch;
  globalThis.fetch = gitlab.fetch;
  project = gitlab.project(PROJECT, { 'Note.md': 'first version' });

  const vault = { id: 'v1', name: 'Notes', path: VAULT, gitRemote: gitlab.url(PROJECT), gitProvider: 'gitlab', gitBranch: 'main', autoSync: true, lastOpened: 0 };
  await Storage.setItem(Storage.KEYS.VAULTS, [vault]);
  await Storage.setItem(Storage.KEYS.ACTIVE_VAULT, vault.id);
  await Storage.setItem(Storage.KEYS.SETUP_COMPLETE, true);
  await Storage.setItem(Storage.KEYS.GIT_TOKEN(vault.id), token);

  root = createRoot(container());
  await act(async () => { root.render(React.createElement(AppProvider, null, React.createElement(Probe))); });
  // The pull that runs when the vault opens brings the note down.
  for (let i = 0; i < 50; i++) await act(async () => { await new Promise((done) => setImmediate(done)); });
  assert.equal(await FS.readFile(NOTE), 'first version');
  await act(async () => { await app.setCurrentFile(NOTE); });
  assert.equal(app.content, 'first version');
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  mock.timers.reset();
  globalThis.fetch = realFetch;
});

test('a newer version pulled by sync shows in the open note', async () => {
  desktopWrites('changed on the desktop');
  await sync();
  assert.equal(app.content, 'changed on the desktop');
  assert.equal(app.isDirty, false);
});

test('the next edit builds on the pulled version, so the desktop change survives', async () => {
  desktopWrites('changed on the desktop');
  await sync();
  await type(' and on the phone');
  await sync();
  assert.equal(project.files.get('Note.md'), 'changed on the desktop and on the phone');
});

test('sync uploads what is in the editor, not what was last saved', async () => {
  await type(' typed and not saved yet');
  await sync();
  assert.equal(project.files.get('Note.md'), 'first version typed and not saved yet');
  assert.equal(app.isDirty, false);
});

test('unsaved text meets a remote change: both are kept', async () => {
  await type(' typed on the phone');
  desktopWrites('changed on the desktop');
  await sync();
  assert.equal(app.content, 'first version typed on the phone');
  const kept = Object.values(notes());
  assert.ok(kept.includes('first version typed on the phone'), JSON.stringify(notes()));
  assert.ok(kept.includes('changed on the desktop'), JSON.stringify(notes()));
});

test('a sync a screen asks for and the 5-second sync never run at the same moment', async () => {
  // Three notes that only the phone has, and a server slow enough that the
  // screen's sync is still uploading when the timer fires. Two syncs side by
  // side would each create the same files, and GitLab turns the second down:
  // "A file with this name already exists", shown as "Sync failed" right
  // after a remote was connected.
  const GitSync = await import('@/lib/provider-sync');
  for (const name of ['One.md', 'Two.md', 'Three.md']) FS.writeFile(vaultFileUri(VAULT, name), `# ${name}\n`);

  let open;
  const gate = new Promise((resolve) => { open = resolve; });
  const plain = gitlab.fetch;
  globalThis.fetch = async (input, options = {}) => {
    if (options.method === 'POST' || options.method === 'PUT') await gate;
    return plain(input, options);
  };
  const settle = async () => {
    for (let i = 0; i < 50; i++) await act(async () => { await new Promise((done) => setImmediate(done)); });
  };

  let pending;
  await act(async () => {
    pending = app.syncGit(() => GitSync.sync(VAULT, 'glpat-api', gitlab.url(PROJECT), 'main', 'gitlab'));
  });
  await settle();
  // The timer fires twice while the first upload is still on its way.
  await act(async () => { mock.timers.tick(5_000); });
  await settle();
  await act(async () => { mock.timers.tick(5_000); });
  await settle();
  open();
  let result;
  await act(async () => { result = await pending; });
  await settle();

  assert.deepEqual(result.errors, []);
  assert.equal(result.pushed, 3);
  const created = gitlab.requests.filter((request) => request.startsWith('POST '));
  assert.equal(created.length, 3, created.join('\n'));
  for (const name of ['One.md', 'Two.md', 'Three.md']) assert.equal(project.files.get(name), `# ${name}\n`);

  // And the timer syncs again afterwards, with nothing left to do.
  await sync();
  assert.equal(gitlab.requests.filter((request) => request.startsWith('POST ')).length, 3);
});

test('the pull of a vault that just got its remote waits for the sync that connected it', async () => {
  // What the settings screen does when a remote is saved: the vault gets its
  // remote and is synced in one turn. A vault that gets a remote also sets
  // off a pull of its own, and until 1.2.0 that pull ran beside the sync, so
  // the screen reported part of the notes ("Pulled: 1" for three).
  const GitSync = await import('@/lib/provider-sync');
  const { updateVault } = await import('@/lib/vault');
  const settle = async () => {
    for (let i = 0; i < 50; i++) await act(async () => { await new Promise((done) => setImmediate(done)); });
  };
  // The app opens on a vault that has no remote yet.
  await act(async () => { root.unmount(); });
  FS.reset();
  await Storage.setItem(Storage.KEYS.VAULTS, [{ id: 'v1', name: 'Notes', path: VAULT, autoSync: true, lastOpened: 0 }]);
  root = createRoot(container());
  await act(async () => { root.render(React.createElement(AppProvider, null, React.createElement(Probe))); });
  await settle();
  assert.equal(app.vault.gitRemote ?? null, null);
  project.files.set('Second.md', 'another note');
  project.files.set('Third.md', 'and one more');
  project.commits++;
  gitlab.requests.length = 0;

  // The screen saves the remote and starts its sync; the app draws again and
  // sets off the vault's own pull while that sync is still on the network.
  let reachServer;
  let pending;
  await act(async () => {
    pending = app.syncGit(async () => {
      await updateVault('v1', { gitRemote: gitlab.url(PROJECT), gitProvider: 'gitlab', gitBranch: 'main' });
      await app.refreshVaults();
      await new Promise((resolve) => { reachServer = resolve; });
      return GitSync.sync(VAULT, 'glpat-api', gitlab.url(PROJECT), 'main', 'gitlab');
    });
  });
  await settle();
  assert.equal(app.vault.gitRemote, gitlab.url(PROJECT));
  reachServer();
  let result;
  await act(async () => { result = await pending; });
  await settle();

  assert.deepEqual(result.errors, []);
  assert.equal(result.pulled, 3);
  assert.deepEqual(Object.keys(notes()).sort(), ['Note.md', 'Second.md', 'Third.md']);
  // One sync reads each note twice (once to pull it, once to see it needs no
  // upload). A pull running beside it would read them a third time.
  const reads = gitlab.requests.filter((request) => request.startsWith('GET ') && request.includes('/raw'));
  assert.equal(reads.length, 6, reads.join('\n'));
});
