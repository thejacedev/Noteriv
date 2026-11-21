// The rules a sync follows, held to the same cases as the desktop app's
// (`desktop/src-tauri/src/sync_webdav.rs`, "Tests that need no server"). A
// phone and a computer share one folder on the server, so a case that passes
// there has to pass here with the same answer.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  allows,
  conflictRel,
  conflictStamp,
  DEFAULT_FILTER,
  enters,
  KEY_FILE,
  plan,
  RECORD_VERSION,
  safeRel,
} from '@/lib/sync-plan';

const filter = (changes) => ({ ...DEFAULT_FILTER, ...changes });

const locals = (items) => new Map(items.map(([name, mtimeMs, size]) => [name, { mtimeMs, size }]));
const remotes = (items) => new Map(items.map(([name, sig]) => [name, { sig, mtimeMs: 0, etag: null }]));
const record = (items) => ({
  version: RECORD_VERSION,
  vault: '/vault',
  remote: 'server',
  files: Object.fromEntries(items.map(([name, localMtimeMs, localSize, remoteSig]) => [name, { localMtimeMs, localSize, remoteSig, hash: '' }])),
});
/** The plan as "kind name" lines. */
const planned = (l, r, rec) => plan(locals(l), remotes(r), rec).map((action) => `${action.kind} ${action.rel}`);

// ── What is synced ──

test('the filter chooses by kind and folder and keeps the app\'s own folder private', () => {
  const plain = DEFAULT_FILTER;
  for (const yes of ['Note.md', 'a/b.canvas', 'Projects.base', 'pic.PNG', 'paper.pdf']) assert.ok(allows(plain, yes), yes);
  for (const no of ['song.mp3', 'clip.mp4', 'archive.zip', 'noext', '.noteriv/bookmarks.json', '.noteriv/workspace.json', KEY_FILE]) {
    assert.ok(!allows(plain, no), no);
  }

  const all = filter({ audio: true, video: true, settings: true });
  for (const yes of ['song.mp3', 'clip.mp4', '.noteriv/bookmarks.json', '.noteriv/types.json', '.noteriv/workspaces.json']) {
    assert.ok(allows(all, yes), yes);
  }
  // Even with settings on, only the three settings files leave the app's folder.
  for (const priv of ['.noteriv/workspace.json', '.noteriv/trash/Note.md', '.noteriv/plugins/x/main.js', '.noteriv/bookmarks (conflict).json', '.noteriv', KEY_FILE]) {
    assert.ok(!allows(all, priv), priv);
  }

  const lean = filter({ images: false, pdfs: false, excludeFolders: ['Archive', '/Work/Private/', '  '] });
  assert.ok(!allows(lean, 'pic.png') && !allows(lean, 'paper.pdf') && allows(lean, 'Note.md'));
  // A recording made in the desktop app is a .webm: it travels with sound or with video.
  const sound = filter({ audio: true });
  const film = filter({ video: true });
  assert.ok(allows(sound, 'recording.webm') && allows(film, 'recording.webm'));
  assert.ok(!allows(plain, 'recording.webm') && !allows(sound, 'clip.mp4') && allows(film, 'clip.mp4'));
  assert.ok(!allows(lean, 'Archive/Old.md') && !allows(lean, 'Work/Private/x.md'));
  // A name that only starts the same way is another folder, or a file.
  assert.ok(allows(lean, 'Archive2/Note.md') && allows(lean, 'Work/Public/x.md'));
  assert.ok(allows(lean, 'Archive.md'));

  assert.ok(!enters(plain, '.noteriv', '.noteriv'));
  assert.ok(enters(all, '.noteriv', '.noteriv') && !enters(all, '.noteriv/trash', 'trash'));
  assert.ok(!enters(plain, '.git', '.git') && !enters(plain, 'a/node_modules', 'node_modules'));
  assert.ok(!enters(lean, 'Archive', 'Archive') && enters(lean, 'Archive2', 'Archive2'));
  assert.ok(!enters(lean, 'Work/Private', 'Private') && enters(lean, 'Work', 'Work'));
});

test('notes and attachments are synced but not everything', () => {
  for (const yes of ['a.md', 'a.MD', 'x/board.canvas', 's.drawing', 'p.png', 'p.JPG', 'd.pdf', 't.txt', 'c.css']) {
    assert.ok(allows(DEFAULT_FILTER, yes), yes);
  }
  for (const no of ['C', 'Meeting ', 'a.tmp', 'movie.mp4', 'x.noteriv-part', '.DS_Store', 'ends-with-a-dot.', 'folder.md/noext']) {
    assert.ok(!allows(DEFAULT_FILTER, no), no);
  }
});

test('the phone\'s own trash is never synced', () => {
  assert.ok(!enters(DEFAULT_FILTER, '.trash', '.trash'));
});

test('names that could leave the vault are refused', () => {
  for (const bad of ['', '../x.md', 'a/../b.md', 'a/./b.md', 'a//b.md', 'a\\b.md', '/abs.md']) assert.ok(!safeRel(bad), JSON.stringify(bad));
  for (const good of ['x.md', 'a/b.md', 'C# basics.md', 'Café/Résumé.md', '..hidden/x.md']) assert.ok(safeRel(good), good);
});

// ── Deciding what to do ──

test('nothing changed means nothing to do', () => {
  const rec = record([['a.md', 10, 5, 's1'], ['d/b.md', 20, 7, 's2']]);
  assert.deepEqual(planned([['a.md', 10, 5], ['d/b.md', 20, 7]], [['a.md', 's1'], ['d/b.md', 's2']], rec), []);
});

test('the server clock plays no part in spotting a change', () => {
  // The local file is "older" than anything the server could report, and
  // still counts as changed, because it differs from the record.
  assert.deepEqual(planned([['a.md', 1, 9]], [['a.md', 's1']], record([['a.md', 10, 5, 's1']])), ['upload a.md']);
});

test('an edit on one side goes to the other', () => {
  const rec = record([['a.md', 10, 5, 's1'], ['b.md', 10, 5, 's1']]);
  assert.deepEqual(planned([['a.md', 11, 5], ['b.md', 10, 5]], [['a.md', 's1'], ['b.md', 's2']], rec), ['upload a.md', 'download b.md']);
});

test('an edit on both sides is a conflict', () => {
  assert.deepEqual(planned([['a.md', 11, 6]], [['a.md', 's2']], record([['a.md', 10, 5, 's1']])), ['conflict a.md']);
});

test('new files are copied across', () => {
  const rec = record([['old.md', 1, 1, 's']]);
  assert.deepEqual(planned([['old.md', 1, 1], ['mine.md', 5, 5]], [['old.md', 's'], ['theirs.md', 't']], rec), ['upload mine.md', 'download theirs.md']);
});

test('without a record nothing is deleted and shared files are compared', () => {
  assert.deepEqual(planned([['both.md', 1, 1], ['mine.md', 1, 1]], [['both.md', 's'], ['theirs.md', 't']], null), [
    'compare both.md',
    'upload mine.md',
    'download theirs.md',
  ]);
});

test('a note deleted here is removed from the server', () => {
  const rec = record([['keep.md', 1, 1, 'k'], ['gone.md', 1, 1, 'g']]);
  assert.deepEqual(planned([['keep.md', 1, 1]], [['keep.md', 'k'], ['gone.md', 'g']], rec), ['deleteRemote gone.md']);
});

test('a note deleted on the server goes to the trash here', () => {
  const rec = record([['keep.md', 1, 1, 'k'], ['gone.md', 1, 1, 'g']]);
  assert.deepEqual(planned([['keep.md', 1, 1], ['gone.md', 1, 1]], [['keep.md', 'k']], rec), ['trashLocal gone.md']);
});

test('an edit outranks a deletion on the other side', () => {
  const rec = record([['keep.md', 1, 1, 'k'], ['a.md', 1, 1, 'a'], ['b.md', 1, 1, 'b']]);
  // a.md: deleted on the server, edited here. b.md: deleted here, edited on the server.
  assert.deepEqual(planned([['keep.md', 1, 1], ['a.md', 2, 2]], [['keep.md', 'k'], ['b.md', 'b2']], rec), ['upload a.md', 'download b.md']);
});

test('an empty vault never deletes from the server', () => {
  // Looks like "everything was deleted here", but is far more likely a vault that could not be read.
  const rec = record([['a.md', 1, 1, 'a'], ['b.md', 1, 1, 'b']]);
  assert.deepEqual(planned([], [['a.md', 'a'], ['b.md', 'b']], rec), ['download a.md', 'download b.md']);
});

test('an empty server gets everything again and nothing is trashed', () => {
  const rec = record([['a.md', 1, 1, 'a'], ['b.md', 1, 1, 'b']]);
  assert.deepEqual(planned([['a.md', 1, 1], ['b.md', 1, 1]], [], rec), ['upload a.md', 'upload b.md']);
});

test('a file gone from both sides is forgotten', () => {
  const rec = record([['keep.md', 1, 1, 'k'], ['gone.md', 1, 1, 'g']]);
  assert.deepEqual(planned([['keep.md', 1, 1]], [['keep.md', 'k']], rec), ['forget gone.md']);
});

// ── Conflict copies ──

test('conflict copies get a name next to the note', () => {
  const free = () => false;
  assert.equal(conflictRel('Note.md', '2026-11-12 14-30-05', free), 'Note (conflict 2026-11-12 14-30-05).md');
  assert.equal(conflictRel('Daily Notes/v1.2 plan.md', 'S', free), 'Daily Notes/v1.2 plan (conflict S).md');
  assert.equal(conflictRel('noext', 'S', free), 'noext (conflict S)');
  assert.equal(conflictRel('Note.md', 'S', (name) => name === 'Note (conflict S).md'), 'Note (conflict S 2).md');
  assert.ok(allows(DEFAULT_FILTER, conflictRel('Note.md', 'S', free)));
});

test('a conflict copy is named after the phone\'s own time, as the desktop names its copies', () => {
  assert.equal(conflictStamp(new Date(2026, 10, 2, 4, 5, 6)), '2026-11-02 04-05-06');
});
