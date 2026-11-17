// The open note: every save must write the text that is in the editor.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NoteSession } from '@/lib/note-session';

const NOTE = 'file:///vault/Note.md';

/** A session over an in-memory disk, with a switch to make writes fail. */
function setup() {
  const disk = new Map();
  const state = { failing: false, writes: 0 };
  const session = new NoteSession((path, content) => {
    if (state.failing) return false;
    state.writes++;
    disk.set(path, content);
    return true;
  });
  return { disk, state, session };
}

/** Type a text one letter at a time, as the editor does. */
function type(session, text) {
  for (const letter of text) session.edit(session.content + letter);
}

describe('saving the open note', () => {
  it('writes everything that was typed, not only the first keystroke', () => {
    const { disk, session } = setup();
    session.open(NOTE, 'old text');
    type(session, ' and a new line');
    assert.equal(session.flush(), true);
    assert.equal(disk.get(NOTE), 'old text and a new line');
    assert.equal(session.dirty, false);
  });

  it('writes nothing when nothing was typed', () => {
    const { state, session } = setup();
    session.open(NOTE, 'old text');
    assert.equal(session.flush(), true);
    assert.equal(state.writes, 0);
  });

  it('keeps the text unsaved when the write fails, and writes it the next time', () => {
    const { disk, state, session } = setup();
    session.open(NOTE, 'old text');
    type(session, '!');
    state.failing = true;
    assert.equal(session.flush(), false);
    assert.equal(session.dirty, true);
    state.failing = false;
    assert.equal(session.flush(), true);
    assert.equal(disk.get(NOTE), 'old text!');
  });

  it('writes on a manual save even when nothing is unsaved', () => {
    const { disk, session } = setup();
    session.open(NOTE, 'old text');
    assert.equal(session.save(), true);
    assert.equal(disk.get(NOTE), 'old text');
  });

  it('does not save when no note is open', () => {
    const { state, session } = setup();
    session.edit('lost');
    assert.equal(session.save(), false);
    assert.equal(state.writes, 0);
  });

  it('keeps typing that came after a save as unsaved', () => {
    const { disk, session } = setup();
    session.open(NOTE, 'a');
    type(session, 'b');
    session.flush();
    type(session, 'c');
    assert.equal(session.dirty, true);
    assert.equal(disk.get(NOTE), 'ab');
    session.flush();
    assert.equal(disk.get(NOTE), 'abc');
  });

  it('starts clean on another note', () => {
    const { session } = setup();
    session.open(NOTE, 'a');
    type(session, 'b');
    session.open('file:///vault/Other.md', 'other');
    assert.equal(session.dirty, false);
    assert.equal(session.content, 'other');
  });
});

describe('a file that something else changed', () => {
  it('is shown in the editor when nothing is unsaved', () => {
    const { session } = setup();
    session.open(NOTE, 'old text');
    assert.equal(session.reconcile('text from the desktop'), 'reloaded');
    assert.equal(session.content, 'text from the desktop');
    assert.equal(session.dirty, false);
  });

  it('does not replace unsaved text', () => {
    const { session } = setup();
    session.open(NOTE, 'old text');
    type(session, ' typed here');
    assert.equal(session.reconcile('text from the desktop'), 'conflict');
    assert.equal(session.content, 'old text typed here');
    assert.equal(session.dirty, true);
  });

  it('is a conflict once, not at every check', () => {
    const { session } = setup();
    session.open(NOTE, 'old text');
    type(session, '!');
    assert.equal(session.reconcile('text from the desktop'), 'conflict');
    assert.equal(session.reconcile('text from the desktop'), 'unchanged');
  });

  it('is left alone when it holds what the editor wrote', () => {
    const { session } = setup();
    session.open(NOTE, 'old text');
    type(session, '!');
    session.flush();
    assert.equal(session.reconcile('old text!'), 'unchanged');
    type(session, '?');
    assert.equal(session.reconcile('old text!'), 'unchanged');
    assert.equal(session.content, 'old text!?');
  });

  it('that is gone leaves the text in the editor', () => {
    const { session } = setup();
    session.open(NOTE, 'old text');
    assert.equal(session.reconcile(null), 'gone');
    assert.equal(session.content, 'old text');
  });

  it('means nothing when no note is open', () => {
    const { session } = setup();
    assert.equal(session.reconcile('anything'), 'unchanged');
  });
});
