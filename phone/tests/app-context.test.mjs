// The app's state (context/AppContext.tsx) run with real React, a stand-in
// file system and a mocked clock. Every way a note gets saved has to write
// the text that is in the editor: a timer or a handler made by an older
// render must not save that render's text.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { container } from './fakes/page.mjs';
import * as FS from './fakes/file-system.mjs';

const { default: React, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { AppProvider, useApp } = await import('@/context/AppContext');

const NOTE = 'file:///data/vaults/Notes/Note.md';

let app;
let root;

function Probe() {
  app = useApp();
  return null;
}

/** Type a text one letter at a time, as the editor does: every keystroke is a setContent. */
async function type(text) {
  for (const letter of text) await act(async () => { app.setContent(app.content + letter); });
}

beforeEach(async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  FS.reset();
  FS.writeFile(NOTE, 'old text');
  root = createRoot(container());
  await act(async () => { root.render(React.createElement(AppProvider, null, React.createElement(Probe))); });
  await act(async () => { await app.setCurrentFile(NOTE); });
  assert.equal(app.content, 'old text');
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  mock.timers.reset();
});

test('auto-save writes everything that was typed, not only the first keystroke', async () => {
  await type(' and a new line');
  await act(async () => { mock.timers.tick(30_000); });
  assert.equal(await FS.readFile(NOTE), 'old text and a new line');
  assert.equal(app.isDirty, false);
});

test('auto-save keeps saving what is typed after it', async () => {
  await type(' one');
  await act(async () => { mock.timers.tick(30_000); });
  await type(' two');
  assert.equal(app.isDirty, true);
  await act(async () => { mock.timers.tick(30_000); });
  assert.equal(await FS.readFile(NOTE), 'old text one two');
});

test('leaving a note saves what was typed', async () => {
  await type(' typed just before leaving');
  await act(async () => { await app.setCurrentFile(null); });
  assert.equal(await FS.readFile(NOTE), 'old text typed just before leaving');
});

test('opening another note saves the one being left', async () => {
  const other = 'file:///data/vaults/Notes/Other.md';
  FS.writeFile(other, 'other');
  await type('!');
  await act(async () => { await app.setCurrentFile(other); });
  assert.equal(await FS.readFile(NOTE), 'old text!');
  assert.equal(app.content, 'other');
  assert.equal(app.isDirty, false);
});

test('a save made by an older render still writes the latest text', async () => {
  await type('1');
  // What a handler set up at the first keystroke holds, such as the back button's.
  const { saveFile, flushFile } = app;
  await type('23');
  await act(async () => { await saveFile(); });
  assert.equal(await FS.readFile(NOTE), 'old text123');
  assert.equal(app.isDirty, false);
  await type('4');
  await act(async () => { flushFile(); });
  assert.equal(await FS.readFile(NOTE), 'old text1234');
});

test('opening the open note again reads the file and drops unsaved text', async () => {
  // The recovery screen restores a snapshot over the file, then opens it.
  await type(' unsaved');
  FS.writeFile(NOTE, 'restored snapshot');
  await act(async () => { await app.setCurrentFile(NOTE); });
  assert.equal(app.content, 'restored snapshot');
  assert.equal(await FS.readFile(NOTE), 'restored snapshot');
});
