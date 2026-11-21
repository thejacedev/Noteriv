// WebDAV sync against a real server, and beside the desktop app's own sync.
//
// Not part of `npm test`: it needs a WebDAV server.
//
//   NOTERIV_WEBDAV_URL=http://127.0.0.1:8099 NOTERIV_WEBDAV_USER=... NOTERIV_WEBDAV_PASS=... \
//   npm run test:live
//
// The variables are the ones the desktop's live tests use
// (`desktop/src-tauri/src/sync_webdav.rs`). Every run works in a folder of
// its own on the server, so runs do not collide.
//
// The second half puts the phone's sync and the desktop's on one remote
// folder. It needs the desktop's test program and is skipped without it:
//
//   cd desktop/src-tauri && cargo test --lib --locked --no-run   # prints the program's path
//   NOTERIV_DESKTOP_TEST_BIN=<that path> ... npm run test:live
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import * as FS from '@/lib/file-system';
import { DEFAULT_FILTER } from '@/lib/sync-plan';
import * as Dav from '@/lib/webdav-client';
import * as WebDav from '@/lib/webdav-sync';

const need = (name) => {
  const value = process.env[name];
  assert.ok(value, `${name} is not set`);
  return value;
};

const SERVER = { url: need('NOTERIV_WEBDAV_URL'), username: need('NOTERIV_WEBDAV_USER'), password: need('NOTERIV_WEBDAV_PASS') };
const DESKTOP_BIN = process.env.NOTERIV_DESKTOP_TEST_BIN ?? '';
/** A folder on the server that only this run uses. */
const PREFIX = `noteriv-phone-live-${Date.now()}`;
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'noteriv-phone-live-'));
process.env.NOTERIV_LIVE_RECORDS = path.join(BASE, 'phone-records');

after(() => fs.rmSync(BASE, { recursive: true, force: true }));

const cfg = (remote) => ({ ...SERVER, remotePath: `/${PREFIX}/${remote}` });
const counts = (outcome) => [outcome.pushed, outcome.pulled, outcome.deleted, outcome.conflicts];
/** Some servers only tell two versions of a file apart by the second. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 1100));

let made = 0;

/** A vault folder on this computer, with what both kinds of device need. */
class Device {
  constructor(kind) {
    made += 1;
    this.id = `${kind}-${made}`;
    this.dir = path.join(BASE, this.id, 'vault');
    fs.mkdirSync(this.dir, { recursive: true });
    this.vault = `${pathToFileURL(this.dir).href}/`;
  }

  /** A run that must report no file it could not sync. */
  async clean(remote) {
    const outcome = await this.sync(remote);
    assert.deepEqual(outcome.errors, [], `${this.id} reported errors`);
    return outcome;
  }

  /** Two more runs with nothing to do: the vault has settled. */
  async idle(remote) {
    for (let i = 0; i < 2; i++) assert.deepEqual(counts(await this.clean(remote)), [0, 0, 0, 0], `${this.id}: a run with nothing changed did something`);
  }

  write(rel, content) {
    const file = path.join(this.dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  bytes(rel) {
    return new Uint8Array(fs.readFileSync(path.join(this.dir, ...rel.split('/'))));
  }

  text(rel) {
    return fs.readFileSync(path.join(this.dir, ...rel.split('/')), 'utf8');
  }

  has(rel) {
    return fs.existsSync(path.join(this.dir, ...rel.split('/')));
  }

  remove(rel) {
    fs.rmSync(path.join(this.dir, ...rel.split('/')));
  }

  /** Every synced file in the vault, as paths inside it. */
  tree() {
    return [...WebDav.listLocal(this.vault, DEFAULT_FILTER).keys()].sort();
  }

  /** Every file of any kind in the vault, hidden ones too. */
  everything() {
    const out = [];
    const walk = (dir, prefix) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix === '' ? item.name : `${prefix}/${item.name}`;
        if (item.isDirectory()) walk(path.join(dir, item.name), rel);
        else out.push(rel);
      }
    };
    walk(this.dir, '');
    return out.sort();
  }
}

/** The phone app's sync. */
class Phone extends Device {
  constructor() {
    super('phone');
  }

  sync(remote) {
    return WebDav.sync(this.vault, cfg(remote), FS.syncRecordUri(this.id));
  }

  /** The names of the notes in the phone's trash. */
  trash() {
    const dir = path.join(this.dir, '.trash');
    return fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => name.replace(/^\d+_/, '')).sort() : [];
  }
}

/** The desktop app's sync, run through its own test program. */
class Desktop extends Device {
  constructor() {
    super('desktop');
    this.records = path.join(BASE, this.id, 'records');
    this.encryption = '';
  }

  /** The run's outcome, or an error with the reason the desktop gave for not syncing. */
  async sync(remote) {
    const run = spawnSync(DESKTOP_BIN, ['sync_webdav::live::one_run_for_another_program', '--ignored', '--exact', '--nocapture', '--test-threads=1'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NOTERIV_WEBDAV_VAULT: this.dir,
        NOTERIV_WEBDAV_RECORDS: this.records,
        NOTERIV_WEBDAV_REMOTE: cfg(remote).remotePath,
        NOTERIV_WEBDAV_ENCRYPTION: this.encryption,
      },
    });
    const line = run.stdout.split('\n').find((text) => text.includes('NOTERIV_OUTCOME '));
    assert.ok(line, `the desktop's test program printed no outcome:\n${run.stdout}\n${run.stderr}`);
    const outcome = JSON.parse(line.slice(line.indexOf('NOTERIV_OUTCOME ') + 'NOTERIV_OUTCOME '.length));
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome;
  }

  /** The names of the notes in the desktop's trash. */
  trash() {
    const dir = path.join(this.dir, '.noteriv', 'trash');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((name) => !name.endsWith('.meta.json')).map((name) => name.replace(/^\d+-/, '')).sort();
  }
}

// ── The server, looked at and changed directly ──

const client = Dav.buildClient(SERVER);
const root = (remote) => Dav.rootUrl(cfg(remote));

/** Every file of any kind in a remote folder. */
async function serverEverything(remote) {
  const out = [];
  const walk = async (dir) => {
    const url = Dav.dirUrl(root(remote), dir);
    const { status, entries } = await Dav.propfind(client, url, 1);
    assert.ok(status >= 200 && status < 300, `listing the server answered ${status}`);
    for (const entry of entries) {
      const child = Dav.relUnder(entry.path, Dav.decodedPath(url));
      if (!child || child.includes('/')) continue;
      const rel = dir === '' ? child : `${dir}/${child}`;
      if (entry.isDir) await walk(rel);
      else out.push(rel);
    }
  };
  await walk('');
  return out.sort();
}

async function serverPut(remote, rel, content) {
  await Dav.ensureRoot(client, cfg(remote));
  let folder = '';
  for (const part of rel.split('/').slice(0, -1)) {
    folder = folder === '' ? part : `${folder}/${part}`;
    await Dav.mkcol(client, Dav.dirUrl(root(remote), folder)).catch(() => {});
  }
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  assert.ok(await Dav.put(client, Dav.fileUrl(root(remote), rel), bytes, { kind: 'anything' }));
}

const serverText = async (remote, rel) => new TextDecoder().decode(await Dav.get(client, Dav.fileUrl(root(remote), rel)));
const serverBytes = (remote, rel) => Dav.get(client, Dav.fileUrl(root(remote), rel));

/** Run something once, just before the next upload of this file leaves. */
function beforeUpload(remote, rel, run) {
  const real = globalThis.fetch;
  const target = Dav.fileUrl(root(remote), rel);
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'PUT' && String(input) === target) {
      globalThis.fetch = real;
      await run();
    }
    return real(input, init);
  };
}

const every256 = new Uint8Array(70_000).map((_, i) => (i * 31 + (i >> 8)) & 0xff);
const NAMES = ['C# basics.md', 'What now?.md', '100% done.md', 'Café/Résumé.md', 'Daily Notes/2026-11-21.md', "It's (new) & shiny!.md", '日本語/ノート.md', 'a+b=c;d,e@f.md'];

// ============================================================
// Phones and a real server
// ============================================================

describe('phones and a real server', () => {
  test('the connection check accepts good details, creates the folder, and names a wrong password', async () => {
    await WebDav.testConnection(cfg('connect/Deep Folder'));
    await WebDav.testConnection(cfg('connect/Deep Folder'));
    assert.deepEqual(await serverEverything('connect/Deep Folder'), []);
    await assert.rejects(WebDav.testConnection({ ...cfg('connect'), password: 'not the password' }), /rejected the username or password/);
  });

  test('a vault reaches a second phone and then stays quiet', async () => {
    const a = new Phone();
    const b = new Phone();
    a.write('Inbox.md', 'hello');
    a.write('Projects/Plan.md', 'plan');
    a.write('Projects/Deep/Sub/Idea.md', 'idea');
    assert.deepEqual(counts(await a.clean('reach')), [3, 0, 0, 0]);
    assert.deepEqual(counts(await b.clean('reach')), [0, 3, 0, 0]);
    assert.deepEqual(b.tree(), a.tree());
    assert.equal(b.text('Projects/Deep/Sub/Idea.md'), 'idea');
    await a.idle('reach');
    await b.idle('reach');
    // Nothing but the notes: no record, no half-written file.
    assert.deepEqual(b.everything(), b.tree());
    assert.deepEqual(await serverEverything('reach'), a.tree());
  });

  test('edits travel in both directions', async () => {
    const a = new Phone();
    const b = new Phone();
    a.write('Note.md', 'one');
    await a.clean('edits');
    await b.clean('edits');
    await pause();
    b.write('Note.md', 'two, from b');
    assert.deepEqual(counts(await b.clean('edits')), [1, 0, 0, 0]);
    assert.deepEqual(counts(await a.clean('edits')), [0, 1, 0, 0]);
    assert.equal(a.text('Note.md'), 'two, from b');
    await pause();
    a.write('Note.md', 'three, from a');
    assert.deepEqual(counts(await a.clean('edits')), [1, 0, 0, 0]);
    assert.deepEqual(counts(await b.clean('edits')), [0, 1, 0, 0]);
    assert.equal(b.text('Note.md'), 'three, from a');
    await a.idle('edits');
    await b.idle('edits');
  });

  test('names with special characters keep their names', async () => {
    const a = new Phone();
    const b = new Phone();
    for (const name of NAMES) a.write(name, `this is ${name}`);
    assert.deepEqual(counts(await a.clean('names')), [NAMES.length, 0, 0, 0]);
    assert.deepEqual(await serverEverything('names'), [...NAMES].sort());
    assert.deepEqual(counts(await b.clean('names')), [0, NAMES.length, 0, 0]);
    for (const name of NAMES) assert.equal(b.text(name), `this is ${name}`);
    await a.idle('names');
    await b.idle('names');
  });

  test('attachments arrive byte for byte', async () => {
    const a = new Phone();
    const b = new Phone();
    a.write('attachments/picture.png', every256);
    a.write('attachments/empty.png', new Uint8Array(0));
    a.write('odd.md', new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xc3, 0x28, 0x0d, 0x0a]));
    assert.deepEqual(counts(await a.clean('bytes')), [3, 0, 0, 0]);
    assert.deepEqual(await serverBytes('bytes', 'attachments/picture.png'), every256);
    assert.deepEqual(counts(await b.clean('bytes')), [0, 3, 0, 0]);
    for (const rel of ['attachments/picture.png', 'attachments/empty.png', 'odd.md']) assert.deepEqual(b.bytes(rel), a.bytes(rel), rel);
    await a.idle('bytes');
    await b.idle('bytes');
  });

  test('a deleted note stays deleted everywhere, and waits in the other phone\'s trash', async () => {
    const a = new Phone();
    const b = new Phone();
    a.write('Keep.md', 'keep');
    a.write('Gone.md', 'gone');
    await a.clean('delete');
    await b.clean('delete');
    a.remove('Gone.md');
    assert.deepEqual(counts(await a.clean('delete')), [0, 0, 1, 0]);
    assert.deepEqual(await serverEverything('delete'), ['Keep.md']);
    assert.deepEqual(counts(await b.clean('delete')), [0, 0, 1, 0]);
    assert.deepEqual(b.tree(), ['Keep.md']);
    assert.deepEqual(b.trash(), ['Gone.md']);
    await a.idle('delete');
    await b.idle('delete');
    assert.deepEqual(await serverEverything('delete'), ['Keep.md']);
  });

  test('an edit on one phone survives a deletion on another', async () => {
    const a = new Phone();
    const b = new Phone();
    a.write('Keep.md', 'keep');
    a.write('Note.md', 'first');
    await a.clean('survive');
    await b.clean('survive');
    a.remove('Note.md');
    await a.clean('survive');
    await pause();
    b.write('Note.md', 'edited on b after a deleted it');
    assert.deepEqual(counts(await b.clean('survive')), [1, 0, 0, 0]);
    assert.deepEqual(counts(await a.clean('survive')), [0, 1, 0, 0]);
    assert.equal(a.text('Note.md'), 'edited on b after a deleted it');
  });

  test('the same note edited on two phones keeps both versions', async () => {
    const a = new Phone();
    const b = new Phone();
    a.write('Note.md', 'start');
    await a.clean('conflict');
    await b.clean('conflict');
    await pause();
    a.write('Note.md', 'a wrote this');
    b.write('Note.md', 'b wrote this');
    await a.clean('conflict');
    const outcome = await b.clean('conflict');
    assert.equal(outcome.conflicts, 1);
    const copy = outcome.conflictCopies[0].copy;
    assert.match(copy, /^Note \(conflict \d{4}-\d\d-\d\d \d\d-\d\d-\d\d\)\.md$/);
    assert.deepEqual([b.text('Note.md'), b.text(copy)].sort(), ['a wrote this', 'b wrote this']);
    assert.deepEqual(counts(await a.clean('conflict')).slice(2), [0, 0]);
    assert.deepEqual([a.text('Note.md'), a.text(copy)].sort(), ['a wrote this', 'b wrote this']);
    assert.equal(a.text('Note.md'), b.text('Note.md'));
    await a.idle('conflict');
    await b.idle('conflict');
    assert.deepEqual(await serverEverything('conflict'), ['Note.md', copy].sort());
  });

  test('the first run adopts files that already match and keeps both versions of one that differs', async () => {
    const a = new Phone();
    await serverPut('adopt', 'Same.md', 'identical');
    await serverPut('adopt', 'Folder/Differs.md', 'what the server has');
    await pause();
    a.write('Same.md', 'identical');
    a.write('Folder/Differs.md', 'what the phone has');
    const outcome = await a.clean('adopt');
    assert.equal(outcome.conflicts, 1);
    const copy = outcome.conflictCopies[0].copy;
    assert.deepEqual([a.text('Folder/Differs.md'), a.text(copy)].sort(), ['what the phone has', 'what the server has']);
    assert.deepEqual([await serverText('adopt', 'Folder/Differs.md'), await serverText('adopt', copy)].sort(), ['what the phone has', 'what the server has']);
    assert.equal(await serverText('adopt', 'Same.md'), 'identical');
    await a.idle('adopt');
  });

  test('a note saved again with the same text is not sent again', async () => {
    const a = new Phone();
    a.write('Note.md', 'same');
    await a.clean('touched');
    await pause();
    a.write('Note.md', 'same');
    assert.deepEqual(counts(await a.clean('touched')), [0, 0, 0, 0]);
  });

  test('a same-length edit made straight after an upload still reaches other phones', async () => {
    const a = new Phone();
    const b = new Phone();
    a.write('Note.md', 'aaaa');
    await a.clean('same-second');
    await b.clean('same-second');
    // No pause: on a server that tells versions apart by the second and the
    // size, this upload looks like the one before it.
    a.write('Note.md', 'bbbb');
    assert.deepEqual(counts(await a.clean('same-second')), [1, 0, 0, 0]);
    assert.deepEqual(counts(await b.clean('same-second')), [0, 1, 0, 0]);
    assert.equal(b.text('Note.md'), 'bbbb');
    await a.idle('same-second');
    await b.idle('same-second');
  });

  test('a note another device changes mid-sync is not overwritten', async () => {
    const a = new Phone();
    a.write('Note.md', 'start');
    await a.clean('mid-sync');
    await pause();
    a.write('Note.md', 'the phone edits');
    // Between the phone's listing and its upload, a computer uploads its own edit.
    beforeUpload('mid-sync', 'Note.md', async () => {
      await serverPut('mid-sync', 'Note.md', 'the computer got there first!');
      await pause();
    });
    const first = await a.sync('mid-sync');
    const second = first.conflicts === 1 ? first : await a.clean('mid-sync');
    // A server with version tags refuses the upload and the next run keeps
    // both. One without them cannot refuse; then the run itself must have
    // noticed. Either way no version is lost.
    const all = a.tree().map((rel) => a.text(rel)).sort();
    if (all.length === 2) {
      assert.deepEqual(all, ['the computer got there first!', 'the phone edits']);
      assert.equal(second.conflicts, 1);
    } else {
      assert.deepEqual(first.errors, []);
      console.log('    (this server has no version tags: an upload cannot be made conditional on it)');
    }
    await a.idle('mid-sync');
  });

  test('an emptied vault gets its notes back instead of wiping the server', async () => {
    const a = new Phone();
    a.write('One.md', '1');
    a.write('Two.md', '2');
    await a.clean('emptied');
    a.remove('One.md');
    a.remove('Two.md');
    assert.deepEqual(counts(await a.clean('emptied')), [0, 2, 0, 0]);
    assert.deepEqual(await serverEverything('emptied'), ['One.md', 'Two.md']);
  });

  test('a remote path with spaces and several levels works', async () => {
    const a = new Phone();
    const b = new Phone();
    a.write('Note.md', 'deep');
    assert.deepEqual(counts(await a.clean('My Notes/Deep Vault')), [1, 0, 0, 0]);
    assert.deepEqual(counts(await b.clean('My Notes/Deep Vault')), [0, 1, 0, 0]);
    await a.idle('My Notes/Deep Vault');
  });

  test('files on the server that are not notes or attachments are left alone', async () => {
    const a = new Phone();
    const strangers = ['.DS_Store', 'archive.zip', 'noext', 'x.noteriv-part', '.obsidian/app.json', '.noteriv/workspace.json', 'movie.mp4'];
    for (const rel of strangers) await serverPut('strangers', rel, 'left by something else');
    await serverPut('strangers', 'Note.md', 'a note');
    assert.deepEqual(counts(await a.clean('strangers')), [0, 1, 0, 0]);
    assert.deepEqual(a.everything(), ['Note.md']);
    await a.idle('strangers');
    assert.deepEqual(await serverEverything('strangers'), [...strangers, 'Note.md'].sort());
  });
});

// ============================================================
// A phone and a computer in one folder
// ============================================================

describe('a phone and the desktop app in one remote folder', { skip: DESKTOP_BIN === '' ? 'NOTERIV_DESKTOP_TEST_BIN is not set' : false }, () => {
  test('notes made on the computer reach the phone, and edits go back', async () => {
    const desktop = new Desktop();
    const phone = new Phone();
    desktop.write('Inbox.md', 'from the computer');
    desktop.write('Projects/Deep/Plan.md', 'plan');
    assert.deepEqual(counts(await desktop.clean('both')), [2, 0, 0, 0]);
    assert.deepEqual(counts(await phone.clean('both')), [0, 2, 0, 0]);
    assert.deepEqual(phone.tree(), desktop.tree());
    await desktop.idle('both');
    await phone.idle('both');

    await pause();
    phone.write('Inbox.md', 'edited on the phone');
    phone.write('New on phone.md', 'made on the phone');
    assert.deepEqual(counts(await phone.clean('both')), [2, 0, 0, 0]);
    assert.deepEqual(counts(await desktop.clean('both')), [0, 2, 0, 0]);
    assert.equal(desktop.text('Inbox.md'), 'edited on the phone');
    assert.equal(desktop.text('New on phone.md'), 'made on the phone');

    await pause();
    desktop.write('Projects/Deep/Plan.md', 'edited on the computer');
    assert.deepEqual(counts(await desktop.clean('both')), [1, 0, 0, 0]);
    assert.deepEqual(counts(await phone.clean('both')), [0, 1, 0, 0]);
    assert.equal(phone.text('Projects/Deep/Plan.md'), 'edited on the computer');
    await desktop.idle('both');
    await phone.idle('both');
    assert.deepEqual(phone.tree(), desktop.tree());
  });

  test('both name a file with special characters the same way', async () => {
    const desktop = new Desktop();
    const phone = new Phone();
    // Half made on each side: each has to find the other's under the same name.
    NAMES.forEach((name, i) => (i % 2 === 0 ? desktop : phone).write(name, `this is ${name}`));
    await desktop.clean('both-names');
    await phone.clean('both-names');
    await desktop.clean('both-names');
    assert.deepEqual(phone.tree(), [...NAMES].sort());
    assert.deepEqual(desktop.tree(), [...NAMES].sort());
    for (const name of NAMES) assert.equal(desktop.text(name), phone.text(name), name);
    // If one read the other's names differently, it would upload or fetch again here.
    await desktop.idle('both-names');
    await phone.idle('both-names');
    assert.deepEqual(await serverEverything('both-names'), [...NAMES].sort());
  });

  test('attachments cross byte for byte in both directions', async () => {
    const desktop = new Desktop();
    const phone = new Phone();
    desktop.write('attachments/from-computer.png', every256);
    phone.write('attachments/from-phone.png', every256.slice().reverse());
    phone.write('empty.png', new Uint8Array(0));
    await desktop.clean('both-bytes');
    await phone.clean('both-bytes');
    await desktop.clean('both-bytes');
    for (const rel of ['attachments/from-computer.png', 'attachments/from-phone.png', 'empty.png']) {
      assert.deepEqual(desktop.bytes(rel), phone.bytes(rel), rel);
    }
    await desktop.idle('both-bytes');
    await phone.idle('both-bytes');
  });

  test('a note deleted on one is trashed on the other, and neither trash is synced', async () => {
    const desktop = new Desktop();
    const phone = new Phone();
    for (const rel of ['Keep.md', 'Phone deletes.md', 'Computer deletes.md']) desktop.write(rel, rel);
    await desktop.clean('both-delete');
    await phone.clean('both-delete');

    phone.remove('Phone deletes.md');
    desktop.remove('Computer deletes.md');
    assert.deepEqual(counts(await phone.clean('both-delete')), [0, 0, 1, 0]);
    // The desktop removes its own from the server and trashes the phone's.
    assert.deepEqual(counts(await desktop.clean('both-delete')), [0, 0, 2, 0]);
    assert.deepEqual(counts(await phone.clean('both-delete')), [0, 0, 1, 0]);
    assert.deepEqual(desktop.tree(), ['Keep.md']);
    assert.deepEqual(phone.tree(), ['Keep.md']);
    assert.deepEqual(desktop.trash(), ['Phone deletes.md']);
    assert.deepEqual(phone.trash(), ['Computer deletes.md']);
    await desktop.idle('both-delete');
    await phone.idle('both-delete');
    assert.deepEqual(await serverEverything('both-delete'), ['Keep.md']);
  });

  test('the same note edited on both keeps both versions on both, once', async () => {
    const desktop = new Desktop();
    const phone = new Phone();
    desktop.write('Note.md', 'start');
    await desktop.clean('both-conflict');
    await phone.clean('both-conflict');

    await pause();
    desktop.write('Note.md', 'the computer wrote this');
    phone.write('Note.md', 'the phone wrote this');
    await desktop.clean('both-conflict');
    const outcome = await phone.clean('both-conflict');
    assert.equal(outcome.conflicts, 1);
    const copy = outcome.conflictCopies[0].copy;
    await desktop.clean('both-conflict');
    for (const device of [desktop, phone]) {
      assert.deepEqual(device.tree(), ['Note.md', copy].sort(), device.id);
      assert.deepEqual([device.text('Note.md'), device.text(copy)].sort(), ['the computer wrote this', 'the phone wrote this'], device.id);
    }
    assert.equal(desktop.text('Note.md'), phone.text('Note.md'));
    // No copy of a copy.
    await desktop.idle('both-conflict');
    await phone.idle('both-conflict');

    // And the other way round: the phone syncs first, the computer finds the conflict.
    await pause();
    desktop.write('Note.md', 'second round, computer');
    phone.write('Note.md', 'second round, phone');
    await phone.clean('both-conflict');
    const found = await desktop.clean('both-conflict');
    assert.equal(found.conflicts, 1);
    await phone.clean('both-conflict');
    assert.deepEqual(phone.tree(), desktop.tree());
    assert.equal(phone.tree().length, 3);
    for (const rel of phone.tree()) assert.equal(phone.text(rel), desktop.text(rel), rel);
    await desktop.idle('both-conflict');
    await phone.idle('both-conflict');
  });

  test('a phone that already holds the notes joins a folder the computer filled', async () => {
    const desktop = new Desktop();
    const phone = new Phone();
    desktop.write('Same.md', 'identical');
    desktop.write('Differs.md', 'what the computer has');
    await desktop.clean('both-join');
    await pause();
    phone.write('Same.md', 'identical');
    phone.write('Differs.md', 'what the phone has');
    phone.write('Only phone.md', 'only on the phone');

    const outcome = await phone.clean('both-join');
    assert.equal(outcome.conflicts, 1);
    await desktop.clean('both-join');
    assert.deepEqual(desktop.tree(), phone.tree());
    assert.equal(desktop.tree().length, 4);
    for (const rel of phone.tree()) assert.equal(phone.text(rel), desktop.text(rel), rel);
    assert.deepEqual(desktop.trash(), []);
    assert.deepEqual(phone.trash(), []);
    await desktop.idle('both-join');
    await phone.idle('both-join');
  });

  test('what each app keeps for itself stays on its own device', async () => {
    const desktop = new Desktop();
    const phone = new Phone();
    desktop.write('Note.md', 'a note');
    desktop.write('.noteriv/workspace.json', '{"openTabs":[]}');
    desktop.write('.noteriv/bookmarks.json', '[]');
    phone.write('.noteriv/sync-state.json', '{}');
    phone.write('.trash/1795000000000_Old.md', 'trashed on the phone earlier');
    await desktop.clean('both-private');
    await phone.clean('both-private');
    await desktop.clean('both-private');
    assert.deepEqual(await serverEverything('both-private'), ['Note.md']);
    assert.deepEqual(phone.everything(), ['.noteriv/sync-state.json', '.trash/1795000000000_Old.md', 'Note.md']);
    assert.deepEqual(desktop.everything(), ['.noteriv/bookmarks.json', '.noteriv/workspace.json', 'Note.md']);
  });

  test('a folder the computer encrypted is refused by the phone, and nothing in it changes', async () => {
    const desktop = new Desktop();
    desktop.encryption = 'a password only the computer knows';
    const phone = new Phone();
    desktop.write('Secret.md', 'only for those with the password');
    assert.deepEqual(counts(await desktop.clean('both-encrypted')), [1, 0, 0, 0]);
    const before = await serverEverything('both-encrypted');
    assert.deepEqual(before, ['Secret.md', 'noteriv-encryption.key']);
    const sealed = await serverBytes('both-encrypted', 'Secret.md');
    assert.equal(new TextDecoder().decode(sealed.slice(0, 4)), 'NRVE');

    phone.write('Mine.md', 'readable, and it must not go up beside the encrypted notes');
    await assert.rejects(phone.sync('both-encrypted'), /This remote folder is encrypted/);
    await assert.rejects(WebDav.testConnection(cfg('both-encrypted')), /This remote folder is encrypted/);
    assert.deepEqual(await serverEverything('both-encrypted'), before);
    assert.deepEqual(await serverBytes('both-encrypted', 'Secret.md'), sealed);
    assert.deepEqual(phone.everything(), ['Mine.md']);
    // The computer is not disturbed by the attempt.
    await desktop.idle('both-encrypted');
  });
});
