// Addresses and the server's listings, held to the same cases as the desktop
// app's (`desktop/src-tauri/src/sync_webdav.rs`): both have to name the same
// file on the server the same way.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decodedPath,
  dirUrl,
  explainStatus,
  fileUrl,
  foldersOverlap,
  parsePropfind,
  parseWebdavDate,
  relUnder,
  rootUrl,
  strongEtag,
  toRemoteFile,
} from '@/lib/webdav-client';

// ── Reading the server's answers ──

test('a self-closing collection tag marks a folder', () => {
  // The shape Nextcloud, Apache and the standard's own examples use.
  const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/alice/Noteriv/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/Noteriv/Daily%20Notes/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection /></d:resourcetype><d:getetag>"abc"</d:getetag></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/Noteriv/Inbox.md</d:href>
    <d:propstat><d:prop><d:resourcetype/><d:getlastmodified>Thu, 12 Nov 2026 19:35:45 GMT</d:getlastmodified><d:getetag>"e1"</d:getetag><d:getcontentlength>8</d:getcontentlength></d:prop></d:propstat>
  </d:response>
</d:multistatus>`;
  const entries = parsePropfind(xml);
  assert.equal(entries.length, 3);
  assert.ok(entries[0].isDir);
  assert.ok(entries[1].isDir);
  assert.equal(entries[1].path, '/remote.php/dav/files/alice/Noteriv/Daily Notes/');
  assert.ok(!entries[2].isDir);
  assert.equal(toRemoteFile(entries[2]).sig, 'etag:"e1"');
  assert.equal(toRemoteFile(entries[2]).mtimeMs, Date.UTC(2026, 10, 12, 19, 35, 45));
  assert.equal(toRemoteFile(entries[2]).etag, '"e1"');
});

test('a collection written as an open and close tag also marks a folder', () => {
  const xml = `<D:multistatus xmlns:D="DAV:"><D:response><D:href>/dav/x/</D:href>
<D:propstat><D:prop><D:resourcetype><D:collection></D:collection></D:resourcetype></D:prop></D:propstat>
</D:response></D:multistatus>`;
  assert.ok(parsePropfind(xml)[0].isDir);
});

test('full addresses are reduced to a decoded path', () => {
  const xml = `<D:multistatus xmlns:D="DAV:"><D:response>
<D:href>https://cloud.example.com/dav/Caf%C3%A9/C%23%20basics.md</D:href>
<D:propstat><D:prop><D:getlastmodified>2026-11-12T19:35:45Z</D:getlastmodified><D:getcontentlength>4</D:getcontentlength></D:prop></D:propstat>
</D:response></D:multistatus>`;
  const entries = parsePropfind(xml);
  assert.equal(entries[0].path, '/dav/Café/C# basics.md');
  // No ETag: the time and size stand in for it.
  assert.equal(toRemoteFile(entries[0]).sig, 'lm:2026-11-12T19:35:45Z|4');
  assert.equal(toRemoteFile(entries[0]).etag, null);
});

test('only the first address in a response names the entry', () => {
  const xml = `<D:multistatus xmlns:D="DAV:"><D:response><D:href>/dav/a.md</D:href>
<D:propstat><D:prop><D:owner><D:href>/principals/alice</D:href></D:owner></D:prop></D:propstat>
</D:response></D:multistatus>`;
  assert.equal(parsePropfind(xml)[0].path, '/dav/a.md');
});

test('a listing is read whatever the server calls its tags, and whatever else it puts in', () => {
  // Apache names its own properties "lp1:", escapes "&" in a name, and may
  // send comments, a doctype and a ">" inside an attribute.
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE multistatus>
<!-- a comment with <d:response> in it -->
<D:multistatus xmlns:D="DAV:" xmlns:ns0="DAV:">
<D:response xmlns:lp1="DAV:" note="a > b">
<D:href>/dav/R&amp;D%20notes.md</D:href>
<D:propstat><D:prop>
<lp1:resourcetype/>
<lp1:getlastmodified>Sat, 21 Nov 2026 08:00:00 GMT</lp1:getlastmodified>
<lp1:getetag><![CDATA["6f-5d2a"]]></lp1:getetag>
<lp1:getcontentlength>111</lp1:getcontentlength>
</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
</D:response>
</D:multistatus>`;
  const [entry] = parsePropfind(xml);
  assert.deepEqual(entry, { path: '/dav/R&D notes.md', isDir: false, lastModified: 'Sat, 21 Nov 2026 08:00:00 GMT', etag: '"6f-5d2a"', size: '111' });
});

test('a listing that breaks off gives the entries that were complete', () => {
  const xml = `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/a.md</d:href></d:response><d:response><d:href>/dav/b.m`;
  assert.deepEqual(parsePropfind(xml).map((entry) => entry.path), ['/dav/a.md']);
  assert.deepEqual(parsePropfind(''), []);
  assert.deepEqual(parsePropfind('not xml at all'), []);
});

test('only a strong ETag is used to guard an upload', () => {
  assert.equal(strongEtag('"abc"'), '"abc"');
  assert.equal(strongEtag('abc'), '"abc"');
  assert.equal(strongEtag('W/"abc"'), null);
  assert.equal(strongEtag('  '), null);
});

test('a server\'s time is read in both forms servers use, and nothing else', () => {
  const noon = Date.UTC(2025, 3, 1, 12, 0, 0);
  assert.equal(parseWebdavDate('Tue, 01 Apr 2025 12:00:00 GMT'), noon);
  assert.equal(parseWebdavDate('Tue, 1 Apr 2025 12:00:00 GMT'), noon);
  assert.equal(parseWebdavDate('01 Apr 2025 14:00:00 +0200'), noon);
  assert.equal(parseWebdavDate('2025-04-01T12:00:00Z'), noon);
  assert.equal(parseWebdavDate('2025-04-01T12:00:00.250Z'), noon + 250);
  assert.equal(parseWebdavDate('2025-04-01T07:00:00-05:00'), noon);
  for (const no of ['', 'yesterday', '2025-04-01', 'Tue, 01 Foo 2025 12:00:00 GMT']) assert.equal(parseWebdavDate(no), null, no);
});

// ── Paths and addresses ──

test('special characters in names are sent as part of the name', () => {
  const root = 'http://host/dav/Noteriv';
  assert.equal(fileUrl(root, 'C# basics.md'), 'http://host/dav/Noteriv/C%23%20basics.md');
  assert.equal(fileUrl(root, 'What now?.md'), 'http://host/dav/Noteriv/What%20now%3F.md');
  assert.equal(fileUrl(root, '100% done.md'), 'http://host/dav/Noteriv/100%25%20done.md');
  assert.equal(fileUrl(root, 'Café/Résumé.md'), 'http://host/dav/Noteriv/Caf%C3%A9/R%C3%A9sum%C3%A9.md');
  assert.equal(dirUrl(root, 'Daily Notes'), 'http://host/dav/Noteriv/Daily%20Notes/');
  assert.equal(dirUrl(root, ''), 'http://host/dav/Noteriv/');
  // What the server sends back decodes to the same name.
  assert.equal(decodedPath(fileUrl(root, 'C# basics.md')), '/dav/Noteriv/C# basics.md');
});

test('a conflict copy has the address the desktop app gives it', () => {
  // The desktop encodes everything but letters, digits and -_.~
  assert.equal(
    fileUrl('https://h/dav', "Note (conflict 2026-11-12 14-30-05).md"),
    'https://h/dav/Note%20%28conflict%202026-11-12%2014-30-05%29.md',
  );
  assert.equal(fileUrl('https://h/dav', "It's *new*!.md"), 'https://h/dav/It%27s%20%2Anew%2A%21.md');
  assert.equal(fileUrl('https://h/dav', 'a-b_c.d~e.md'), 'https://h/dav/a-b_c.d~e.md');
});

test('a name with a stray percent sign is still read', () => {
  assert.equal(decodedPath('/dav/100% done%20today.md'), '/dav/100% done today.md');
  assert.equal(decodedPath('/dav/bad%FFbytes/ok%20name.md'), '/dav/bad%FFbytes/ok name.md');
  assert.equal(decodedPath('https://cloud.example.com'), '/');
});

test('the remote path becomes part of the address', () => {
  const root = (url, remotePath) => rootUrl({ url, remotePath });
  assert.equal(root('https://c.example/dav/', '/Noteriv'), 'https://c.example/dav/Noteriv');
  assert.equal(root('https://c.example/dav', 'Noteriv/'), 'https://c.example/dav/Noteriv');
  assert.equal(root('https://c.example/dav', '/'), 'https://c.example/dav');
  assert.equal(root('https://c.example/dav', '/My Notes/Deep Vault'), 'https://c.example/dav/My%20Notes/Deep%20Vault');
  assert.equal(root('  https://c.example/dav?x=1#top  ', '/N'), 'https://c.example/dav/N');
  assert.throws(() => root('not an address', '/'), /not a valid address/);
  assert.throws(() => root('ftp://c.example/dav', '/'), /https:\/\//);
});

test('a path is made relative by removing the folder once', () => {
  assert.equal(relUnder('/dav/My Notes/', '/dav/My Notes'), '');
  assert.equal(relUnder('/dav/My Notes/One.md', '/dav/My Notes/'), 'One.md');
  // A folder that repeats its parent's name keeps its own.
  assert.equal(relUnder('/a/a/x.md', '/a'), 'a/x.md');
  assert.equal(relUnder('/elsewhere/x.md', '/dav'), null);
  assert.equal(relUnder('/davinci/x.md', '/dav'), null);
});

test('two remote folders overlap when they are the same or one holds the other', () => {
  const a = 'https://c.example/dav/Notes';
  assert.ok(foldersOverlap(a, 'https://c.example/dav/Notes'));
  assert.ok(foldersOverlap(a, 'https://C.EXAMPLE/dav/Notes/'));
  assert.ok(foldersOverlap(a, 'https://c.example/dav/Notes/Work'));
  assert.ok(foldersOverlap(a, 'https://c.example/dav'));
  assert.ok(foldersOverlap('https://c.example/dav/My%20Notes', 'https://c.example/dav/My Notes/x'));
  assert.ok(!foldersOverlap(a, 'https://c.example/dav/Notes2'));
  assert.ok(!foldersOverlap(a, 'https://other.example/dav/Notes'));
  assert.ok(!foldersOverlap(a, 'https://c.example/dav/Other'));
});

test('a refusal is put in words', () => {
  assert.match(explainStatus(401, 'Uploading'), /username or password/);
  assert.match(explainStatus(403, 'Uploading'), /Uploading was refused/);
  assert.match(explainStatus(507, 'Uploading'), /out of storage/);
  assert.equal(explainStatus(500, 'Uploading'), 'Uploading failed: the server answered HTTP 500.');
});
