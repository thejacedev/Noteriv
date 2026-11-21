// WebDAV sync, run whole: one or two phones and a stand-in server. The cases
// are the ones the desktop app's sync is held to against a real server
// (`desktop/src-tauri/src/sync_webdav.rs`, "Tests against a live server"),
// because a phone and a computer share one folder there.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { vaultFileUri } from '@/lib/sync-state';
import * as WebDav from '@/lib/webdav-sync';

import { fakeWebDav } from './fake-webdav.mjs';
import { clock } from './fakes/clock.mjs';
import * as FS from './fakes/file-system.mjs';
import * as Storage from './fakes/storage.mjs';

let server;
let realFetch;

/** One phone: a vault and the phone's own record of its syncs. */
function phone(id) {
  const vault = `file:///data/vaults/${id}/`;
  FS.createDir(vault);
  const cfg = (remotePath) => ({ url: server.url, username: server.user, password: server.password, remotePath });
  const sync = (remotePath = '/Notes') => WebDav.sync(vault, cfg(remotePath), FS.syncRecordUri(id));
  const uri = (rel) => vaultFileUri(vault, rel);
  return {
    vault,
    uri,
    cfg,
    sync,
    /** A run that must report no file it could not sync. */
    async clean(remotePath) {
      const outcome = await sync(remotePath);
      assert.deepEqual(outcome.errors, []);
      return outcome;
    },
    /** Two more runs with nothing to do: the vault has settled. */
    async idle(remotePath) {
      for (let i = 0; i < 2; i++) assert.deepEqual(counts(await this.clean(remotePath)), [0, 0, 0, 0], 'a run with nothing changed did something');
    },
    write: (rel, content) => (typeof content === 'string' ? FS.writeFile(uri(rel), content) : FS.writeBytes(uri(rel), content)),
    text: (rel) => FS.readFile(uri(rel)),
    bytes: (rel) => FS.bytesOf(uri(rel)),
    remove: (rel) => FS.deleteFile(uri(rel)),
    /** Every file in the vault but the trash, as paths inside it. */
    tree: () => Object.keys(FS.snapshot(vault)).filter((rel) => !rel.startsWith('.trash/')).sort(),
    trash: () => Object.keys(FS.snapshot(vault)).filter((rel) => rel.startsWith('.trash/')).map((rel) => rel.replace(/^\.trash\/\d+_/, '')),
  };
}

const counts = (outcome) => [outcome.pushed, outcome.pulled, outcome.deleted, outcome.conflicts];
/** Some servers only tell two versions of a file apart by the second. */
const pause = () => clock.advance(1100);

beforeEach(() => {
  FS.reset();
  server = fakeWebDav();
  realFetch = globalThis.fetch;
  globalThis.fetch = server.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ── Setting up ──

test('the connection check accepts good details and creates the folder', async () => {
  const a = phone('a');
  await WebDav.testConnection(a.cfg('/New Vault/Deep'));
  // The folder is there now: a second check finds it.
  await WebDav.testConnection(a.cfg('/New Vault/Deep'));
  assert.deepEqual(server.tree(), []);
  server.put('New Vault/Deep/x.md', 'x');
  assert.deepEqual(counts(await a.clean('/New Vault/Deep')), [0, 1, 0, 0]);
});

test('the connection check says what is wrong', async () => {
  const a = phone('a');
  await assert.rejects(WebDav.testConnection({ ...a.cfg('/Notes'), password: 'wrong' }), /rejected the username or password/);
  await assert.rejects(WebDav.testConnection({ ...a.cfg('/Notes'), url: 'not an address' }), /not a valid address/);
  await assert.rejects(WebDav.testConnection({ ...a.cfg('/Notes'), url: 'https://nowhere.example/dav' }), /Could not reach the server/);
  // A plain http address cannot work on Android, and the message says so.
  await assert.rejects(WebDav.testConnection({ ...a.cfg('/Notes'), url: 'http://nowhere.example/dav' }), /has to start with https:\/\//);
  assert.equal(await Storage.getItem(Storage.KEYS.WEBDAV_PASSWORD('a')), null);
});

test('a sync with a wrong password changes nothing and says why', async () => {
  const a = phone('a');
  a.write('Note.md', 'mine');
  await assert.rejects(WebDav.sync(a.vault, { ...a.cfg('/Notes'), password: 'wrong' }, FS.syncRecordUri('a')), /username or password/);
  assert.deepEqual(a.tree(), ['Note.md']);
  assert.deepEqual(server.tree(), []);
});

// ── Notes travel ──

test('a vault reaches a second phone and then stays quiet', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Inbox.md', 'hello');
  a.write('Projects/Plan.md', 'plan');
  a.write('Projects/Deep/Sub/Idea.md', 'idea');

  assert.deepEqual(counts(await a.clean()), [3, 0, 0, 0]);
  assert.deepEqual(server.tree('Notes'), ['Inbox.md', 'Projects/Deep/Sub/Idea.md', 'Projects/Plan.md']);
  assert.deepEqual(counts(await b.clean()), [0, 3, 0, 0]);
  assert.deepEqual(b.tree(), a.tree());
  assert.equal(await b.text('Projects/Deep/Sub/Idea.md'), 'idea');

  await a.idle();
  await b.idle();
  // A run with nothing to do only lists: one request for each folder.
  server.requests();
  await a.clean();
  assert.deepEqual(server.log.map((r) => r.method), ['PROPFIND', 'PROPFIND', 'PROPFIND', 'PROPFIND']);
});

test('edits travel in both directions', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Note.md', 'one');
  await a.clean();
  await b.clean();

  pause();
  b.write('Note.md', 'two, from b');
  assert.deepEqual(counts(await b.clean()), [1, 0, 0, 0]);
  assert.deepEqual(counts(await a.clean()), [0, 1, 0, 0]);
  assert.equal(await a.text('Note.md'), 'two, from b');

  pause();
  a.write('Note.md', 'three, from a');
  assert.deepEqual(counts(await a.clean()), [1, 0, 0, 0]);
  assert.deepEqual(counts(await b.clean()), [0, 1, 0, 0]);
  assert.equal(await b.text('Note.md'), 'three, from a');
  await a.idle();
  await b.idle();
});

test('names with special characters keep their names', async () => {
  const a = phone('a');
  const b = phone('b');
  const names = ['C# basics.md', 'What now?.md', '100% done.md', 'Café/Résumé.md', 'Daily Notes/2026-11-21.md', "It's (new) & *shiny*!.md", '日本語/ノート.md', 'a+b=c;d,e@f.md'];
  for (const name of names) a.write(name, `this is ${name}`);

  assert.deepEqual(counts(await a.clean()), [names.length, 0, 0, 0]);
  assert.deepEqual(server.tree('Notes'), [...names].sort());
  assert.deepEqual(counts(await b.clean()), [0, names.length, 0, 0]);
  for (const name of names) assert.equal(await b.text(name), `this is ${name}`);
  await a.idle();
  await b.idle();

  // The address of each upload is the one the desktop app would use.
  const sent = server.log.filter((r) => r.method === 'PUT').map((r) => r.raw);
  assert.ok(sent.includes('/dav/Notes/C%23%20basics.md'));
  assert.ok(sent.includes('/dav/Notes/It%27s%20%28new%29%20%26%20%2Ashiny%2A%21.md'));
  assert.ok(sent.includes('/dav/Notes/a%2Bb%3Dc%3Bd%2Ce%40f.md'));
});

test('attachments arrive byte for byte', async () => {
  const a = phone('a');
  const b = phone('b');
  const every = new Uint8Array(4096).map((_, i) => (i * 7 + (i >> 8)) & 0xff);
  a.write('attachments/picture.png', every);
  a.write('attachments/empty.png', new Uint8Array(0));
  a.write('Paper.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 255, 254, 10, 13, 10]));
  // Looks like text that is not valid UTF-8: it must not be "repaired" on the way.
  a.write('odd.md', new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xc3, 0x28]));

  assert.deepEqual(counts(await a.clean()), [4, 0, 0, 0]);
  assert.deepEqual(server.bytes('Notes/attachments/picture.png'), every);
  assert.deepEqual(counts(await b.clean()), [0, 4, 0, 0]);
  for (const rel of ['attachments/picture.png', 'attachments/empty.png', 'Paper.pdf', 'odd.md']) {
    assert.deepEqual(b.bytes(rel), a.bytes(rel), rel);
  }
  // Nothing is left behind from the download.
  assert.deepEqual(b.tree(), a.tree());
  await a.idle();
  await b.idle();
});

test('a remote path with spaces and several levels works', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Note.md', 'deep');
  assert.deepEqual(counts(await a.clean('/My Notes/Deep Vault/')), [1, 0, 0, 0]);
  assert.deepEqual(server.tree('My Notes/Deep Vault'), ['Note.md']);
  assert.deepEqual(counts(await b.clean('My Notes/Deep Vault')), [0, 1, 0, 0]);
  await a.idle('/My Notes/Deep Vault/');
});

test('a server that answers with full addresses is read the same', async () => {
  server = fakeWebDav({ fullAddresses: true });
  globalThis.fetch = server.fetch;
  const a = phone('a');
  const b = phone('b');
  a.write('Daily Notes/One.md', '1');
  await a.clean();
  assert.deepEqual(counts(await b.clean()), [0, 1, 0, 0]);
  await a.idle();
});

// ── Deleting ──

test('a deleted note stays deleted everywhere', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Keep.md', 'keep');
  a.write('Gone.md', 'gone');
  await a.clean();
  await b.clean();

  a.remove('Gone.md');
  assert.deepEqual(counts(await a.clean()), [0, 0, 1, 0]);
  assert.deepEqual(server.tree('Notes'), ['Keep.md']);
  // On the other phone it goes to the trash, where it can be restored.
  assert.deepEqual(counts(await b.clean()), [0, 0, 1, 0]);
  assert.deepEqual(b.tree(), ['Keep.md']);
  assert.deepEqual(b.trash(), ['Gone.md']);
  // And it does not come back from there.
  await a.idle();
  await b.idle();
  assert.deepEqual(server.tree('Notes'), ['Keep.md']);
});

test('an edit on one phone survives a deletion on another', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Keep.md', 'keep');
  a.write('Note.md', 'first');
  await a.clean();
  await b.clean();

  a.remove('Note.md');
  await a.clean();
  pause();
  b.write('Note.md', 'edited on b after a deleted it');
  assert.deepEqual(counts(await b.clean()), [1, 0, 0, 0]);
  assert.deepEqual(counts(await a.clean()), [0, 1, 0, 0]);
  assert.equal(await a.text('Note.md'), 'edited on b after a deleted it');
  assert.deepEqual(b.trash(), []);
});

test('an emptied vault gets its notes back instead of wiping the server', async () => {
  const a = phone('a');
  a.write('One.md', '1');
  a.write('Two.md', '2');
  await a.clean();

  a.remove('One.md');
  a.remove('Two.md');
  assert.deepEqual(counts(await a.clean()), [0, 2, 0, 0]);
  assert.deepEqual(server.tree('Notes'), ['One.md', 'Two.md']);
  assert.deepEqual(a.tree(), ['One.md', 'Two.md']);
});

test('an emptied server gets its notes back and nothing is trashed', async () => {
  const a = phone('a');
  a.write('One.md', '1');
  a.write('Two.md', '2');
  await a.clean();

  server.remove('Notes/One.md');
  server.remove('Notes/Two.md');
  assert.deepEqual(counts(await a.clean()), [2, 0, 0, 0]);
  assert.deepEqual(a.trash(), []);
  assert.deepEqual(server.tree('Notes'), ['One.md', 'Two.md']);
});

// ── The same note changed in two places ──

test('the same note edited on two phones keeps both versions', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Note.md', 'start');
  await a.clean();
  await b.clean();

  pause();
  a.write('Note.md', 'a wrote this');
  pause();
  b.write('Note.md', 'b wrote this before a synced');
  // A server gives a file's time to the second, so a's upload has to be more
  // than a second after b's edit to count as the newer of the two.
  pause();
  await a.clean();
  pause();
  // b's edit is older than a's upload: the server's version keeps the name.
  const outcome = await b.clean();
  assert.equal(outcome.conflicts, 1);
  const [{ note, copy }] = outcome.conflictCopies;
  assert.equal(note, 'Note.md');
  assert.match(copy, /^Note \(conflict \d{4}-\d\d-\d\d \d\d-\d\d-\d\d\)\.md$/);
  assert.equal(await b.text('Note.md'), 'a wrote this');
  assert.equal(await b.text(copy), 'b wrote this before a synced');

  // Both versions reach the server and the other phone.
  assert.deepEqual(server.tree('Notes'), ['Note.md', copy].sort());
  assert.deepEqual(counts(await a.clean()), [0, 1, 0, 0]);
  assert.equal(await a.text(copy), 'b wrote this before a synced');
  assert.equal(await a.text('Note.md'), 'a wrote this');
  await a.idle();
  await b.idle();
});

test('when the phone\'s edit is the newer one it keeps the name and the server\'s version becomes the copy', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Note.md', 'start');
  await a.clean();
  await b.clean();

  pause();
  a.write('Note.md', 'a wrote this');
  await a.clean();
  pause();
  b.write('Note.md', 'b wrote this after a uploaded');
  const outcome = await b.clean();
  assert.equal(outcome.conflicts, 1);
  const copy = outcome.conflictCopies[0].copy;
  assert.equal(await b.text('Note.md'), 'b wrote this after a uploaded');
  assert.equal(await b.text(copy), 'a wrote this');
  assert.equal(server.text('Notes/Note.md'), 'b wrote this after a uploaded');
  assert.equal(server.text(`Notes/${copy}`), 'a wrote this');
  await b.idle();
});

test('the first run adopts files that already match without copying them', async () => {
  // A vault and a server that were filled the same way before sync was set up.
  const a = phone('a');
  a.write('Same.md', 'identical');
  a.write('Folder/Also.md', 'identical too');
  server.put('Notes/Same.md', 'identical');
  server.put('Notes/Folder/Also.md', 'identical too');

  assert.deepEqual(counts(await a.clean()), [0, 0, 0, 0]);
  assert.equal(server.log.filter((r) => r.method === 'PUT').length, 0);
  await a.idle();
});

test('the first run keeps both versions of a file that differs', async () => {
  const a = phone('a');
  server.put('Notes/Note.md', 'what the server has');
  pause();
  a.write('Note.md', 'what the phone has');

  const outcome = await a.clean();
  assert.equal(outcome.conflicts, 1);
  const copy = outcome.conflictCopies[0].copy;
  const texts = [await a.text('Note.md'), await a.text(copy)].sort();
  assert.deepEqual(texts, ['what the phone has', 'what the server has']);
  assert.deepEqual([server.text('Notes/Note.md'), server.text(`Notes/${copy}`)].sort(), texts);
  await a.idle();
});

test('an edit is not lost when the server clock runs ahead', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Note.md', 'first');
  await a.clean();
  await b.clean();

  // Everything on the server looks an hour newer than anything the phone writes.
  clock.advance(3_600_000);
  server.put('Notes/Other.md', 'keeps the server ahead');
  clock.advance(-3_600_000);
  a.write('Note.md', 'edited on a phone whose clock is behind');
  assert.deepEqual(counts(await a.clean()), [1, 1, 0, 0]);
  await b.clean();
  assert.equal(await b.text('Note.md'), 'edited on a phone whose clock is behind');
});

test('a note saved again with the same text is not sent again', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Note.md', 'same');
  await a.clean();
  await b.clean();

  // The editor writes the note on every save, changed or not.
  a.write('Note.md', 'same');
  assert.deepEqual(counts(await a.clean()), [0, 0, 0, 0]);
  assert.equal(server.log.filter((r) => r.method === 'PUT').length, 1);

  // Saved again with the same text while another phone edits it: no conflict, the edit just arrives.
  FS.touch(a.uri('Note.md'));
  pause();
  b.write('Note.md', 'edit');
  await b.clean();
  assert.deepEqual(counts(await a.clean()), [0, 1, 0, 0]);
  assert.equal(await a.text('Note.md'), 'edit');
});

test('a same-length edit made straight after an upload still reaches other phones', async () => {
  // A server that tells versions apart only by the second and the size.
  server = fakeWebDav({ etags: false });
  globalThis.fetch = server.fetch;
  const a = phone('a');
  const b = phone('b');
  a.write('Note.md', 'aaaa');
  await a.clean();
  await b.clean();

  // Same second, same length: to the server the new upload looks like the old one.
  a.write('Note.md', 'bbbb');
  // The phone notices and sends it once more a moment later; let that moment pass on the server's clock.
  server.before('PUT', 'Notes/Note.md', () => server.before('PUT', 'Notes/Note.md', pause));
  assert.deepEqual(counts(await a.clean()), [1, 0, 0, 0]);
  assert.equal(server.log.filter((r) => r.method === 'PUT' && r.path.endsWith('Note.md')).length, 3);
  assert.deepEqual(counts(await b.clean()), [0, 1, 0, 0]);
  assert.equal(await b.text('Note.md'), 'bbbb');
  await a.idle();
});

test('a note another device changes mid-sync is not overwritten', async () => {
  const a = phone('a');
  a.write('Note.md', 'start');
  await a.clean();

  pause();
  a.write('Note.md', 'the phone edits');
  // Between the phone's listing and its upload, a computer uploads its own edit.
  server.before('PUT', 'Notes/Note.md', () => server.put('Notes/Note.md', 'the computer got there first'));
  const first = await a.clean();
  assert.deepEqual(counts(first), [0, 0, 0, 0]);
  assert.equal(server.text('Notes/Note.md'), 'the computer got there first');

  // The next run sees both versions and keeps both.
  const second = await a.clean();
  assert.equal(second.conflicts, 1);
  const copy = second.conflictCopies[0].copy;
  assert.deepEqual([await a.text('Note.md'), await a.text(copy)].sort(), ['the computer got there first', 'the phone edits']);
  await a.idle();
});

test('a note edited on the phone while its download is on the way is left alone', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Note.md', 'start');
  await a.clean();
  await b.clean();

  pause();
  b.write('Note.md', 'from the other phone');
  await b.clean();
  // The auto-save writes the open note while the new version is being fetched.
  server.before('GET', 'Notes/Note.md', () => a.write('Note.md', 'typed during the sync'));
  assert.deepEqual(counts(await a.clean()), [0, 0, 0, 0]);
  assert.equal(await a.text('Note.md'), 'typed during the sync');
  assert.deepEqual(a.tree(), ['Note.md']);

  const next = await a.clean();
  assert.equal(next.conflicts, 1);
  const copy = next.conflictCopies[0].copy;
  assert.deepEqual([await a.text('Note.md'), await a.text(copy)].sort(), ['from the other phone', 'typed during the sync']);
});

test('a note saved on the phone at the last moment before a download lands is left alone', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Note.md', 'start');
  await a.clean();
  await b.clean();

  pause();
  b.write('Note.md', 'from the other phone');
  await b.clean();
  // The new version is already on the phone, beside the note, when the auto-save writes the note.
  FS.duringDigest(a.uri('.Note.md.noteriv-part'), () => a.write('Note.md', 'saved at the last moment'));
  assert.deepEqual(counts(await a.clean()), [0, 0, 0, 0]);
  assert.equal(await a.text('Note.md'), 'saved at the last moment');
  // Nothing half-done is left beside it.
  assert.deepEqual(a.tree(), ['Note.md']);

  const next = await a.clean();
  assert.equal(next.conflicts, 1);
  assert.deepEqual([await a.text('Note.md'), await a.text(next.conflictCopies[0].copy)].sort(), ['from the other phone', 'saved at the last moment']);
});

test('a new note does not replace one another device made under the same name meanwhile', async () => {
  const a = phone('a');
  a.write('Keep.md', 'keep');
  await a.clean();

  a.write('Ideas.md', 'the phone\'s ideas');
  // Between the phone's listing and its upload, a computer uploads a note of the same name.
  server.before('PUT', 'Notes/Ideas.md', () => server.put('Notes/Ideas.md', 'the computer\'s ideas'));
  assert.deepEqual(counts(await a.clean()), [0, 0, 0, 0]);
  assert.equal(server.text('Notes/Ideas.md'), 'the computer\'s ideas');

  const next = await a.clean();
  assert.equal(next.conflicts, 1);
  const copy = next.conflictCopies[0].copy;
  assert.deepEqual([await a.text('Ideas.md'), await a.text(copy)].sort(), ['the computer\'s ideas', 'the phone\'s ideas']);
  assert.deepEqual([server.text('Notes/Ideas.md'), server.text(`Notes/${copy}`)].sort(), ['the computer\'s ideas', 'the phone\'s ideas']);
});

test('a note deleted elsewhere is kept if it is edited here before it would go to the trash', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('A first.md', 'first');
  a.write('Gone.md', 'start');
  await a.clean();
  await b.clean();

  b.remove('Gone.md');
  pause();
  b.write('A first.md', 'changed, so the phone has something to fetch first');
  await b.clean();
  // While the phone fetches the other note, the user writes in the one about to be trashed.
  server.before('GET', 'Notes/A first.md', () => a.write('Gone.md', 'edited just in time'));
  assert.deepEqual(counts(await a.clean()), [0, 1, 0, 0]);
  assert.equal(await a.text('Gone.md'), 'edited just in time');
  assert.deepEqual(a.trash(), []);

  // The edit outranks the deletion: the note goes back to the server.
  assert.deepEqual(counts(await a.clean()), [1, 0, 0, 0]);
  assert.equal(server.text('Notes/Gone.md'), 'edited just in time');
});

test('a name from the server that could not be a file in the vault is left on the server', async () => {
  const a = phone('a');
  server.put('Notes/Good.md', 'good');
  server.put('Notes/back\\slash.md', 'a name with a backslash in it');
  // A server that lists the folder above as if it were inside.
  const real = server.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await real(input, init);
    if (init?.method !== 'PROPFIND') return response;
    const extra = '<d:response><d:href>/dav/Notes/..</d:href><d:propstat><d:prop><d:resourcetype/><d:getetag>"x"</d:getetag></d:prop></d:propstat></d:response>';
    return new Response((await response.text()).replace('</d:multistatus>', `${extra}</d:multistatus>`), { status: response.status });
  };

  assert.deepEqual(counts(await a.clean()), [0, 1, 0, 0]);
  assert.deepEqual(a.tree(), ['Good.md']);
  await a.idle();
  assert.equal(server.log.filter((r) => r.method === 'DELETE').length, 0);
  assert.ok(server.has('Notes/back\\slash.md'));
});

// ── When something cannot be read ──

test('one file the server will not give does not stop the others', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Good.md', 'good');
  a.write('Bad.md', 'bad');
  a.write('Also good.md', 'also');
  await a.clean();

  server.fail('GET', 'Notes/Bad.md', 500);
  const outcome = await b.sync();
  assert.deepEqual(counts(outcome), [0, 2, 0, 0]);
  assert.deepEqual(outcome.errors, ['Bad.md: Downloading failed: the server answered HTTP 500.']);
  assert.deepEqual(b.tree(), ['Also good.md', 'Good.md']);
  // Nothing is deleted on the server because of it, and it arrives once the server recovers.
  assert.deepEqual(server.tree('Notes'), ['Also good.md', 'Bad.md', 'Good.md']);
  server.heal();
  assert.deepEqual(counts(await b.clean()), [0, 1, 0, 0]);
});

test('an unreadable folder stops the sync instead of deleting its notes', async () => {
  const a = phone('a');
  a.write('Open.md', 'open');
  a.write('Locked/Inside.md', 'inside');
  await a.clean();

  FS.makeUnreadable(`${a.vault}Locked`);
  server.requests();
  await assert.rejects(a.sync(), /"Locked" could not be read .* nothing was synced/);
  // Skipping the folder would have made Locked/Inside.md look deleted.
  assert.deepEqual(server.tree('Notes'), ['Locked/Inside.md', 'Open.md']);
  assert.equal(server.log.filter((r) => r.method !== 'PROPFIND').length, 0);
});

test('a listing of another folder than the one asked for stops the sync', async () => {
  const a = phone('a');
  a.write('Note.md', 'mine');
  await a.clean();
  // A server behind a proxy that rewrites the path it lists.
  const real = server.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await real(input, init);
    if (init?.method !== 'PROPFIND') return response;
    return new Response((await response.text()).replaceAll('/dav/Notes', '/elsewhere'), { status: response.status });
  };
  await assert.rejects(a.sync(), /listed a different folder/);
  assert.deepEqual(a.tree(), ['Note.md']);
});

test('a server that sends requests on to another address is not followed', async () => {
  const a = phone('a');
  a.write('Note.md', 'start');
  await a.clean();
  pause();
  a.write('Note.md', 'edited');

  // Followed, the upload would arrive at the new address as a download of
  // the old note, and look as if it had worked.
  const real = server.fetch;
  let moved = (init) => init?.method === 'PUT';
  globalThis.fetch = async (input, init) =>
    moved(init) ? new Response(null, { status: 301, headers: { Location: String(input).replace('/dav/', '/moved/') } }) : real(input, init);

  const outcome = await a.sync();
  assert.deepEqual(counts(outcome), [0, 0, 0, 0]);
  assert.match(outcome.errors[0], /^Note\.md: The server sent the request on to another address \(HTTP 301\): https:\/\/dav\.example\/moved\/Notes\/Note\.md/);
  assert.equal(server.text('Notes/Note.md'), 'start');

  // The whole server moved: nothing is synced, and the message names the new address.
  moved = () => true;
  await assert.rejects(a.sync(), /another address \(HTTP 301\): https:\/\/dav\.example\/moved\/Notes\/ Enter that address as the server URL/);
  await assert.rejects(WebDav.testConnection(a.cfg('/Notes')), /another address/);

  // Once the address is right again, the edit that was held back goes up.
  globalThis.fetch = real;
  assert.deepEqual(counts(await a.clean()), [1, 0, 0, 0]);
  assert.equal(server.text('Notes/Note.md'), 'edited');
});

test('a vault folder that is missing stops the sync', async () => {
  phone('a');
  await assert.rejects(
    WebDav.sync('file:///data/vaults/never-made/', { url: server.url, username: server.user, password: server.password, remotePath: '/Notes' }, FS.syncRecordUri('x')),
    /vault folder is missing/,
  );
  assert.equal(server.log.length, 0);
});

test('a download that was cut off leaves nothing behind for long', async () => {
  const a = phone('a');
  const b = phone('b');
  a.write('Folder/Note.md', 'whole');
  await a.clean();
  await b.clean();
  // The app was closed while a new version of the note was being written beside it.
  b.write('Folder/.Note.md.noteriv-part', 'half of a downlo');
  assert.deepEqual(b.tree(), ['Folder/.Note.md.noteriv-part', 'Folder/Note.md']);
  // The next sync has nothing to fetch, and still clears it away.
  assert.deepEqual(counts(await b.clean()), [0, 0, 0, 0]);
  assert.deepEqual(b.tree(), ['Folder/Note.md']);
  assert.equal(await b.text('Folder/Note.md'), 'whole');
  assert.deepEqual(server.tree('Notes'), ['Folder/Note.md']);
});

test('a folder on the phone is never replaced by a file of the same name', async () => {
  const a = phone('a');
  a.write('Plans.md/Inside.md', 'a note in a folder with an odd name');
  server.put('Notes/Plans.md', 'a note of that name, made elsewhere');
  server.put('Notes/Other.md', 'another note');

  const outcome = await a.sync();
  assert.deepEqual(counts(outcome), [0, 1, 0, 0]);
  // Neither can go where the other is: both stay where they are, and both are named.
  assert.deepEqual(outcome.errors, [
    'Plans.md: A folder on the phone has the same name, so the file was left on the server.',
    'Plans.md/Inside.md: Uploading failed: the server answered HTTP 409.',
  ]);
  assert.equal(await a.text('Plans.md/Inside.md'), 'a note in a folder with an odd name');
  assert.deepEqual(a.tree(), ['Other.md', 'Plans.md/Inside.md']);
  assert.equal(server.text('Notes/Plans.md'), 'a note of that name, made elsewhere');
  assert.deepEqual(server.tree('Notes'), ['Other.md', 'Plans.md']);
});

// ── What is not synced ──

test('files on the server that are not notes or attachments are left alone', async () => {
  const a = phone('a');
  for (const rel of ['.DS_Store', 'Thumbs.db', 'archive.zip', 'noext', 'x.noteriv-part', '.obsidian/app.json', '.noteriv/workspace.json', 'movie.mp4']) {
    server.put(`Notes/${rel}`, 'left by something else');
  }
  server.put('Notes/Note.md', 'a note');
  a.write('.noteriv/sync-state.json', '{}');
  a.write('.trash/123_Old.md', 'trashed earlier');
  a.write('song.mp3', 'not synced by default');

  assert.deepEqual(counts(await a.clean()), [0, 1, 0, 0]);
  assert.deepEqual(a.tree(), ['.noteriv/sync-state.json', 'Note.md', 'song.mp3']);
  assert.equal(server.tree('Notes').length, 9);
  await a.idle();
  assert.equal(server.log.filter((r) => r.method === 'DELETE' || r.method === 'PUT').length, 0);
});

// ── A folder the desktop app encrypted ──

test('an encrypted folder is refused before anything is read or written', async () => {
  const a = phone('a');
  a.write('Mine.md', 'readable');
  server.put('Notes/noteriv-encryption.key', '{"version":1,"kdf":"argon2id"}');
  server.put('Notes/Secret.md', Buffer.concat([Buffer.from('NRVE\x01'), Buffer.alloc(60, 7)]));

  await assert.rejects(a.sync(), /This remote folder is encrypted/);
  await assert.rejects(WebDav.testConnection(a.cfg('/Notes')), /This remote folder is encrypted/);
  // No readable note went up beside the encrypted ones, and no encrypted bytes came down.
  assert.deepEqual(server.tree('Notes'), ['Secret.md', 'noteriv-encryption.key']);
  assert.deepEqual(a.tree(), ['Mine.md']);
  assert.equal(server.log.filter((r) => r.method !== 'PROPFIND').length, 0);
});

test('an encrypted file whose key file went missing is not taken into the vault', async () => {
  const a = phone('a');
  server.put('Notes/Secret.md', Buffer.concat([Buffer.from('NRVE\x01'), Buffer.alloc(60, 7)]));
  server.put('Notes/Plain.md', 'NRVE is how this ordinary note begins');

  const outcome = await a.sync();
  assert.deepEqual(counts(outcome), [0, 1, 0, 0]);
  assert.equal(outcome.errors.length, 1);
  assert.match(outcome.errors[0], /^Secret\.md: The copy on the server is encrypted/);
  assert.deepEqual(a.tree(), ['Plain.md']);
});

// ── The record ──

test('the record of a sync is kept outside the vault', async () => {
  const a = phone('a');
  a.write('Note.md', 'x');
  await a.clean();
  assert.deepEqual(a.tree(), ['Note.md']);
  const record = JSON.parse(await FS.readFile(FS.syncRecordUri('a')));
  assert.equal(record.vault, a.vault);
  assert.deepEqual(Object.keys(record.files), ['Note.md']);
  // The password is not in it.
  assert.ok(!JSON.stringify(record).includes(server.password));
});

test('a record is only used for the server and folder it was written for', async () => {
  const a = phone('a');
  a.write('One.md', '1');
  a.write('Two.md', '2');
  await a.clean('/Notes');

  // Pointed at another folder that holds only one of the notes: with the old
  // record, Two.md would look deleted on the server and go to the trash.
  server.put('Other/One.md', '1');
  assert.deepEqual(counts(await a.clean('/Other')), [1, 0, 0, 0]);
  assert.deepEqual(a.tree(), ['One.md', 'Two.md']);
  assert.deepEqual(a.trash(), []);
  assert.deepEqual(server.tree('Other'), ['One.md', 'Two.md']);
  // The first folder is untouched.
  assert.deepEqual(server.tree('Notes'), ['One.md', 'Two.md']);
});

test('a record that cannot be read counts as none', async () => {
  const a = phone('a');
  a.write('One.md', '1');
  await a.clean();
  FS.writeFile(FS.syncRecordUri('a'), '{ not json');
  server.remove('Notes/One.md');
  server.put('Notes/Two.md', '2');
  // With a record, One.md would go to the trash. Without one it is sent again.
  assert.deepEqual(counts(await a.clean()), [1, 1, 0, 0]);
  assert.deepEqual(a.trash(), []);
});

test('many changes in one run are all recorded', async () => {
  const a = phone('a');
  for (let i = 0; i < 45; i++) a.write(`Note ${i}.md`, `note ${i}`);
  assert.deepEqual(counts(await a.clean()), [45, 0, 0, 0]);
  await a.idle();
});

// ── A vault's own settings ──

test('a vault syncs with the details saved for it, and not without its password', async () => {
  const vault = { id: 'v1', name: 'Notes', path: 'file:///data/vaults/v1/', gitRemote: null, gitBranch: 'main', autoSync: false, lastOpened: 0 };
  assert.equal(await WebDav.vaultConfig(vault), null);

  const withServer = { ...vault, webdav: { url: server.url, username: server.user, remotePath: '/Notes' } };
  assert.equal(await WebDav.vaultConfig(withServer), null);
  await Storage.setItem(Storage.KEYS.WEBDAV_PASSWORD('v1'), server.password);
  const cfg = await WebDav.vaultConfig(withServer);
  assert.deepEqual(cfg, { url: server.url, username: server.user, remotePath: '/Notes', password: server.password });

  FS.createDir(vault.path);
  FS.writeFile(vaultFileUri(vault.path, 'Note.md'), 'x');
  assert.deepEqual(counts(await WebDav.syncVault(withServer, cfg)), [1, 0, 0, 0]);
  await Storage.removeItem(Storage.KEYS.WEBDAV_PASSWORD('v1'));
});

test('a second vault is not pointed at a folder another vault syncs with', () => {
  const vault = (id, name, remotePath) => ({ id, name, path: `file:///data/vaults/${id}/`, gitRemote: null, gitBranch: 'main', autoSync: false, lastOpened: 0, webdav: remotePath ? { url: 'https://c.example/dav', username: 'me', remotePath } : null });
  const vaults = [vault('1', 'Work', '/Notes/Work'), vault('2', 'Home', null), vault('3', 'Recipes', '/Recipes')];
  const sharing = (id, remotePath, url = 'https://c.example/dav') => WebDav.vaultSharingFolder(vaults, id, { url, remotePath });

  assert.equal(sharing('2', '/Notes/Work'), 'Work');
  assert.equal(sharing('2', '/Notes'), 'Work');
  assert.equal(sharing('2', '/Notes/Work/Sub'), 'Work');
  assert.equal(sharing('2', 'Recipes/'), 'Recipes');
  assert.equal(sharing('2', '/Notes/Home'), null);
  assert.equal(sharing('2', '/Notes/Work', 'https://other.example/dav'), null);
  // A vault may keep the folder it already has.
  assert.equal(sharing('1', '/Notes/Work'), null);
});

test('the outcome of a sync is put in one line', () => {
  const outcome = (changes) => ({ pushed: 0, pulled: 0, deleted: 0, conflicts: 0, conflictCopies: [], errors: [], ...changes });
  assert.equal(WebDav.describeOutcome(outcome({})), 'Up to date');
  assert.equal(WebDav.describeOutcome(outcome({ pushed: 2, pulled: 1 })), 'Synced: 2 uploaded, 1 downloaded');
  assert.equal(WebDav.describeOutcome(outcome({ deleted: 1, conflicts: 1 })), 'Synced: 1 deleted, 1 conflict copy kept');
  assert.equal(
    WebDav.describeOutcome(outcome({ pulled: 3, errors: ['Bad.md: Downloading failed: the server answered HTTP 500.', 'x'] })),
    'Synced: 3 downloaded. 2 files could not be synced: Bad.md: Downloading failed: the server answered HTTP 500.',
  );
});
