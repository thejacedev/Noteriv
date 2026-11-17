// What the properties screen does to a note when Save is tapped.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyRows, newRow, toRows } from '@/lib/property-edits';

// A note as the desktop writes it: a list over several lines, a list on one
// line with a comma inside an item, a comment, text over several lines.
const note = [
  '---',
  'title: "Meeting: Q1 plan"',
  'tags:',
  '  - work',
  '  - planning',
  'aliases: [Q1, "plan, first"]',
  '# reviewed by Sam',
  'due: 2026-11-20',
  'done: false',
  'rating: 4',
  'zip: "0123"',
  'related:',
  '  - "[[Roadmap]]"',
  '  - "[[Budget 2027]]"',
  'summary: |',
  '  Two lines',
  '  of text',
  'place:',
  '  city: Lyon',
  '---',
  'Body',
  '',
].join('\n');

/** The rows and the removed key after a row was deleted on the screen. */
function without(content, key) {
  return [toRows(content).filter((row) => row.key !== key), { removed: [key] }];
}

/** The rows after one of them was given another value, as typing into its field does. */
function retyped(content, key, value) {
  return toRows(content).map((row) => (row.key === key ? { ...row, value } : row));
}

describe('saving the properties screen', () => {
  it('with nothing changed leaves the note as it was', () => {
    assert.equal(applyRows(note, toRows(note)), note);
  });

  it('changes only the line of the value that was changed', () => {
    const saved = applyRows(note, retyped(note, 'due', '2026-12-01'));
    assert.equal(saved, note.replace('due: 2026-11-20', 'due: 2026-12-01'));
  });

  it('keeps a list over several lines when an item is added', () => {
    const saved = applyRows(note, retyped(note, 'tags', 'work, planning, q1'));
    assert.equal(saved, note.replace('  - planning\n', '  - planning\n  - q1\n'));
  });

  it('keeps a list a list when one item is left', () => {
    const saved = applyRows(note, retyped(note, 'tags', 'work'));
    assert.equal(saved, note.replace('  - work\n  - planning\n', '  - work\n'));
  });

  it('removes only the property whose row was deleted', () => {
    const saved = applyRows(note, ...without(note, 'rating'));
    assert.equal(saved, note.replace('rating: 4\n', ''));
  });

  it('removes a comment with the property it is written above, as the desktop does', () => {
    const saved = applyRows(note, ...without(note, 'due'));
    assert.equal(saved, note.replace('# reviewed by Sam\ndue: 2026-11-20\n', ''));
  });

  it('renames a property where it stands, with its value', () => {
    const rows = toRows(note).map((row) => (row.key === 'tags' ? { ...row, key: 'topics' } : row));
    assert.equal(applyRows(note, rows), note.replace('tags:', 'topics:'));
  });

  it('keeps a property whose key was emptied under the key it had', () => {
    const rows = toRows(note).map((row) => (row.key === 'due' ? { ...row, key: '  ' } : row));
    assert.equal(applyRows(note, rows), note);
  });

  it('keeps a number a number and a checkbox a checkbox', () => {
    const saved = applyRows(applyRows(note, retyped(note, 'rating', '5')), retyped(note, 'done', 'true'));
    assert.equal(saved, note.replace('rating: 4', 'rating: 5').replace('done: false', 'done: true'));
  });

  it('keeps text that looks like a number as text', () => {
    const saved = applyRows(note, retyped(note, 'zip', '0124'));
    assert.equal(saved, note.replace('zip: "0123"', 'zip: "0124"'));
  });

  it('keeps what was typed when it does not fit the kind of value', () => {
    const saved = applyRows(note, retyped(note, 'rating', 'four'));
    assert.equal(saved, note.replace('rating: 4', 'rating: four'));
    const date = applyRows(note, retyped(note, 'due', 'next week'));
    assert.equal(date, note.replace('due: 2026-11-20', 'due: next week'));
  });
});

describe('a value one line of text cannot hold', () => {
  it('is shown but cannot be edited', () => {
    const rows = Object.fromEntries(toRows(note).map((row) => [row.key, row]));
    assert.equal(rows.tags.editable, true);
    assert.equal(rows.tags.value, 'work, planning');
    assert.equal(rows.aliases.editable, false);
    assert.equal(rows.summary.editable, false);
    assert.equal(rows.summary.value, 'Two lines …');
    assert.equal(rows.place.editable, false);
    assert.equal(rows.place.value, '{"city":"Lyon"}');
  });

  it('is left alone even if its row was changed', () => {
    assert.equal(applyRows(note, retyped(note, 'summary', 'gone')), note);
    assert.equal(applyRows(note, retyped(note, 'place', 'gone')), note);
    assert.equal(applyRows(note, retyped(note, 'aliases', 'gone')), note);
  });

  it('can still be removed or renamed', () => {
    const removed = applyRows(note, ...without(note, 'place'));
    assert.equal(removed, note.replace('place:\n  city: Lyon\n', ''));
    const rows = toRows(note).map((row) => (row.key === 'summary' ? { ...row, key: 'abstract' } : row));
    assert.equal(applyRows(note, rows), note.replace('summary: |', 'abstract: |'));
  });
});

describe('a new row', () => {
  const plain = 'Body\n';
  const added = (key, value, known) => applyRows(plain, [{ ...newRow(key), value }], { known });

  it('gives a note without properties a block', () => {
    assert.equal(added('title', 'Plan'), '---\ntitle: Plan\n---\nBody\n');
  });

  it('goes after the properties the note has', () => {
    const saved = applyRows(note, [...toRows(note), { ...newRow('status'), value: 'open' }]);
    assert.equal(saved, note.replace('  city: Lyon\n', '  city: Lyon\nstatus: open\n'));
  });

  it('is a checkbox, a number or a list when it looks like one', () => {
    assert.equal(added('draft', 'true'), '---\ndraft: true\n---\nBody\n');
    assert.equal(added('rating', '4.5'), '---\nrating: 4.5\n---\nBody\n');
    assert.equal(added('people', 'Ann, Bob'), '---\npeople: [Ann, Bob]\n---\nBody\n');
    assert.equal(added('zip', '0123'), '---\nzip: "0123"\n---\nBody\n');
  });

  it('is a list for tags and aliases, even with one item', () => {
    assert.equal(added('tags', 'work'), '---\ntags: [work]\n---\nBody\n');
    assert.equal(added('aliases', 'Plan'), '---\naliases: [Plan]\n---\nBody\n');
  });

  it('takes the type the vault has recorded for its name', () => {
    assert.equal(added('people', 'Ann', { people: 'list' }), '---\npeople: [Ann]\n---\nBody\n');
    assert.equal(added('code', '42', { code: 'text' }), '---\ncode: "42"\n---\nBody\n');
  });

  it('without a key is not added', () => {
    assert.equal(added('  ', 'lost'), plain);
  });
});

describe('a note the screen must not rewrite', () => {
  it('with properties that cannot be read is returned as it is', () => {
    const broken = '---\ntitle: [unclosed\ntags: a\n---\nBody\n';
    assert.deepEqual(toRows(broken), []);
    assert.equal(applyRows(broken, [{ ...newRow('status'), value: 'open' }]), broken);
  });

  it('keeps a property that came into the note after the screen read it', () => {
    const rows = retyped(note, 'due', '2026-12-01');
    const newer = note.replace('rating: 4\n', 'rating: 4\nstatus: open\n');
    assert.equal(applyRows(newer, rows), newer.replace('due: 2026-11-20', 'due: 2026-12-01'));
  });

  it('with Windows line endings keeps them', () => {
    const windows = note.replace(/\n/g, '\r\n');
    assert.equal(applyRows(windows, toRows(windows)), windows);
    const saved = applyRows(windows, retyped(windows, 'due', '2026-12-01'));
    assert.equal(saved, windows.replace('due: 2026-11-20', 'due: 2026-12-01'));
  });
});
