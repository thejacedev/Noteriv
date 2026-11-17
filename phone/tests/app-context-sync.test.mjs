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
