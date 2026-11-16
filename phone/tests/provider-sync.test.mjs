import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import * as GitSync from '@/lib/provider-sync';
import { vaultFileUri } from '@/lib/sync-state';

import { fakeGitea } from './fake-gitea.mjs';
import { fakeGitLab } from './fake-gitlab.mjs';
import * as FS from './fakes/file-system.mjs';

const VAULT = 'file:///data/vaults/Notes/';
const PROJECT = 'me/notes';

let gitlab;
let api;
let realFetch;

const note = (path, content) => FS.writeFile(vaultFileUri(VAULT, path), content);
/** The vault's notes, without the sync bookkeeping file. */
const notes = () => Object.fromEntries(Object.entries(FS.snapshot(VAULT)).filter(([path]) => !path.startsWith('.noteriv/')));
// The app always passes a branch: "main" for a new vault, or the one the check found.
const sync = (token = api, branch = 'main') => GitSync.sync(VAULT, token, gitlab.url(PROJECT), branch, 'gitlab');
const check = (url, token = api) => GitSync.checkRemote(url, token, 'gitlab');
const problem = async (url, token = api) => {
  const result = await check(url, token);
  assert.equal(result.ok, false);
  return result.problem;
};

beforeEach(() => {
  FS.reset();
  gitlab = fakeGitLab();
  api = gitlab.token('glpat-api', ['api']);
  realFetch = globalThis.fetch;
  globalThis.fetch = gitlab.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('the provider is read from the host name, and a hint settles a host that does not say', () => {
  assert.equal(GitSync.detectProvider('https://gitlab.com/me/notes.git'), 'gitlab');
  assert.equal(GitSync.detectProvider('git@gitlab.com:me/notes.git'), 'gitlab');
  assert.equal(GitSync.detectProvider('https://gitlab.mycorp.example/team/notes'), 'gitlab');
  assert.equal(GitSync.detectProvider('https://github.com/me/notes'), 'github');
  assert.equal(GitSync.detectProvider('https://git.mycorp.example/team/notes.git'), null);
  assert.equal(GitSync.detectProvider('https://git.mycorp.example/team/notes.git', 'gitlab'), 'gitlab');
});

test('a self-hosted address without a hint is refused instead of guessed', async () => {
  const result = await GitSync.sync(VAULT, api, 'https://git.mycorp.example/team/notes.git', 'main');
  assert.equal(result.pulled + result.pushed, 0);
  assert.match(result.errors[0], /Unknown Git provider/);
});

test('the check passes an address and token that work', async () => {
  gitlab.project(PROJECT, { 'README.md': '# notes\n' });
  assert.deepEqual(await check(gitlab.url(PROJECT)), { ok: true, branch: 'main' });
});

test('the check passes a project with no commits yet', async () => {
  gitlab.project(PROJECT);
  assert.deepEqual(await check(gitlab.url(PROJECT)), { ok: true, branch: 'main' });
});

test('the check finds the default branch, and syncing it works when it is not "main"', async () => {
  const project = gitlab.project(PROJECT, { 'README.md': '# notes\n' }, 'master');
  note('Inbox.md', 'from the phone\n');

  const found = await check(gitlab.url(PROJECT));
  assert.deepEqual(found, { ok: true, branch: 'master' });
  assert.deepEqual(await sync(api, found.branch), { pulled: 1, pushed: 1, errors: [] });
  assert.equal(project.files.get('Inbox.md'), 'from the phone\n');
});

test('a branch that is not there is named, and no note is touched', async () => {
  gitlab.project(PROJECT, { 'README.md': '# notes\n' }, 'master');
  note('Inbox.md', 'from the phone\n');

  const result = await sync(api, 'main');
  assert.equal(result.pulled + result.pushed, 0);
  assert.match(result.errors[0], /has no branch "main"/);
  assert.deepEqual(notes(), { 'Inbox.md': 'from the phone\n' });
});

test('the check names the scopes of a token that cannot use the API', async () => {
  gitlab.project(PROJECT, { 'README.md': '# notes\n' });
  // The scopes the desktop guide asks for: right for git over HTTPS, refused by the API.
  const desktop = gitlab.token('glpat-desktop', ['read_repository', 'write_repository']);
  const refused = await problem(gitlab.url(PROJECT), desktop);
  assert.match(refused, /read_repository, write_repository/);
  assert.match(refused, /"api" scope/);

  // read_api can pull but never push, so it is refused up front as well.
  const readOnly = gitlab.token('glpat-read', ['read_api']);
  assert.match(await problem(gitlab.url(PROJECT), readOnly), /scope read_api\b.*"api" scope/);
});

test('the check tells a wrong token from a wrong address', async () => {
  gitlab.project(PROJECT, { 'README.md': '# notes\n' });
  assert.match(await problem(gitlab.url(PROJECT), 'glpat-mistyped'), /rejected the token \(401\)/);
  assert.match(await problem(gitlab.url('me/other')), /repository not found \(404\)/);
  assert.match(await problem('my notes repo'), /does not look like a repository address/);
  assert.match(await problem('https://gitlab.example'), /does not look like a repository address/);
  assert.match(await problem('https://github.com/me/notes.git'), /GitHub address/);
});

test('the check explains a server that cannot be reached', async () => {
  // What fetch does on a phone for a refused connection, plain http on Android,
  // or a certificate the phone does not trust.
  const https = await problem('https://git.unreachable.example/me/notes.git');
  assert.match(https, /Could not reach https:\/\/git\.unreachable\.example/);
  assert.match(https, /CA certificate/);
  assert.doesNotMatch(https, /should start with https/);

  const http = await problem('http://git.unreachable.example/me/notes.git');
  assert.match(http, /should start with https:\/\//);
});

test('the status line leads with the first error in full', () => {
  assert.equal(GitSync.describeResult({ pulled: 2, pushed: 1, errors: [] }), 'Pulled: 2, Pushed: 1');
  assert.equal(
    GitSync.describeResult({ pulled: 0, pushed: 0, errors: ['Pull failed: Could not read the repository: nope.', 'Push failed: Could not read the repository: nope.'] }),
    'Sync failed: Could not read the repository: nope (and 1 more). Pulled: 0, Pushed: 0',
  );
  assert.equal(
    GitSync.describeResult({ pulled: 3, pushed: 0, errors: ['Push a.md: Failed to write file a.md: no'] }),
    'Sync failed: Push a.md: Failed to write file a.md: no. Pulled: 3, Pushed: 0',
  );
});

test('a refused token is explained with the scope GitLab wants', async () => {
  const project = gitlab.project(PROJECT, { 'README.md': '# notes\n' });
  note('Inbox.md', 'from the phone\n');

  const desktop = gitlab.token('glpat-desktop', ['read_repository', 'write_repository']);
  const refused = await sync(desktop);
  assert.equal(refused.pulled + refused.pushed, 0);
  assert.match(GitSync.describeResult(refused), /^Sync failed: Failed to get repository tree: .*\(403\).*"api" scope/);

  const readOnly = gitlab.token('glpat-read', ['read_api']);
  const half = await sync(readOnly);
  assert.equal(half.pulled, 1);
  assert.equal(half.pushed, 0);
  assert.match(half.errors[0], /Push Inbox\.md: Failed to write file Inbox\.md: .*"api" scope/);
  assert.equal(project.files.has('Inbox.md'), false);
});

test('a refusal that is not about scope keeps the reason the server gave', async () => {
  const project = gitlab.project(PROJECT, { 'README.md': '# notes\n' });
  // A Developer on a project whose default branch only Maintainers may push to.
  const developer = gitlab.token('glpat-developer', ['api']);
  project.protectedFrom = [developer];
  note('Inbox.md', 'from the phone\n');

  assert.equal((await check(gitlab.url(PROJECT), developer)).ok, true);
  const result = await sync(developer);
  assert.equal(result.pulled, 1);
  assert.equal(result.pushed, 0);
  assert.match(result.errors[0], /You are not allowed to push into this branch/);
  assert.doesNotMatch(result.errors[0], /"api" scope/);
  assert.equal(notes()['Inbox.md'], 'from the phone\n');
});

test('notes sync both ways with a project that has commits', async () => {
  const project = gitlab.project(PROJECT, { 'README.md': '# notes\n', 'Projects/Plan 2026.md': 'plan\n' });
  note('Inbox.md', 'from the phone\n');
  note('Ünïcode/Café notes.md', 'é ü 日本語\n');

  const first = await sync();
  assert.deepEqual(first, { pulled: 2, pushed: 2, errors: [] });
  assert.deepEqual(notes(), {
    'Inbox.md': 'from the phone\n',
    'Projects/Plan 2026.md': 'plan\n',
    'README.md': '# notes\n',
    'Ünïcode/Café notes.md': 'é ü 日本語\n',
  });
  assert.equal(project.files.get('Ünïcode/Café notes.md'), 'é ü 日本語\n');

  assert.deepEqual(await sync(), { pulled: 0, pushed: 0, errors: [] });

  // A note deleted on the server is removed here, because this copy was synced and not edited since.
  project.files.delete('Projects/Plan 2026.md');
  const afterDelete = await sync();
  assert.equal(afterDelete.pulled, 1);
  assert.equal('Projects/Plan 2026.md' in notes(), false);
});

test('more notes than one page of the tree are all pulled', async () => {
  const files = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`notes/n${String(i).padStart(3, '0')}.md`, `note ${i}\n`]));
  gitlab.project(PROJECT, files);
  const result = await sync();
  assert.equal(result.pulled, 120);
  assert.deepEqual(result.errors, []);
  assert.equal(Object.keys(notes()).length, 120);
});

test('a project with no commits takes the first notes instead of failing', async () => {
  const project = gitlab.project(PROJECT);
  note('First note.md', 'hello\n');
  note('Folder/Second note.md', 'second\n');

  assert.deepEqual(await sync(), { pulled: 0, pushed: 2, errors: [] });
  assert.deepEqual(Object.fromEntries(project.files), { 'First note.md': 'hello\n', 'Folder/Second note.md': 'second\n' });
  assert.deepEqual(notes(), { 'First note.md': 'hello\n', 'Folder/Second note.md': 'second\n' });
  assert.deepEqual(await sync(), { pulled: 0, pushed: 0, errors: [] });
});

test('a project made again, empty, at the same address does not wipe the phone', async () => {
  gitlab.project(PROJECT, { 'README.md': '# notes\n' });
  note('Keep me.md', 'synced once\n');
  await sync();

  // Same address, no commits: the notes here were all synced and are unchanged,
  // which is exactly what pull deletes when the remote "no longer has" them.
  const reborn = gitlab.project(PROJECT);
  const result = await sync();
  assert.deepEqual(result.errors, []);
  assert.equal(notes()['Keep me.md'], 'synced once\n');
  assert.equal(reborn.files.get('Keep me.md'), 'synced once\n');
});

test('a tree that is missing for any other reason is an error, never "no files"', async () => {
  gitlab.project(PROJECT, { 'README.md': '# notes\n' });
  note('Keep me.md', 'synced once\n');
  await sync();

  // The project is gone (deleted, moved, or the token lost access). With the
  // branch already known, the tree request is the first to see the 404.
  gitlab.remove(PROJECT);
  const result = await GitSync.pull(VAULT, api, gitlab.url(PROJECT), 'main', 'gitlab');
  assert.equal(result.pulled, 0);
  assert.match(result.errors[0], /Pull failed: Failed to get repository tree: repository not found \(404\)/);
  assert.deepEqual(notes(), { 'Keep me.md': 'synced once\n', 'README.md': '# notes\n' });
});

// Gitea and Forgejo go through the same pull and push, with their own API underneath.

function gitea() {
  const server = fakeGitea();
  const token = server.token('gitea-token');
  globalThis.fetch = server.fetch;
  const url = server.url(PROJECT);
  return { server, token, url, sync: (branch = 'main') => GitSync.sync(VAULT, token, url, branch, 'gitea') };
}

test('Gitea: the check finds the default branch and notes sync both ways', async () => {
  const { server, token, url, sync: syncGitea } = gitea();
  const repo = server.repo(PROJECT, { 'README.md': '# notes\n' }, 'trunk');
  note('Projects/Plan 2026.md', 'plan\n');

  const found = await GitSync.checkRemote(url, token, 'gitea');
  assert.deepEqual(found, { ok: true, branch: 'trunk' });
  assert.deepEqual(await syncGitea(found.branch), { pulled: 1, pushed: 1, errors: [] });
  assert.equal(repo.files.get('Projects/Plan 2026.md'), 'plan\n');

  note('Projects/Plan 2026.md', 'plan v2\n');
  assert.deepEqual(await syncGitea(found.branch), { pulled: 0, pushed: 1, errors: [] });
  assert.equal(repo.files.get('Projects/Plan 2026.md'), 'plan v2\n');
});

test('Gitea: a repository with no commits takes the first notes', async () => {
  const { server, sync: syncGitea } = gitea();
  const repo = server.repo(PROJECT);
  note('First note.md', 'hello\n');

  assert.deepEqual(await syncGitea(), { pulled: 0, pushed: 1, errors: [] });
  assert.equal(repo.files.get('First note.md'), 'hello\n');
  assert.deepEqual(notes(), { 'First note.md': 'hello\n' });
});

test('Gitea: a missing branch or repository is an error, never "no files"', async () => {
  const { server, sync: syncGitea } = gitea();
  server.repo(PROJECT, { 'README.md': '# notes\n' });
  note('Keep me.md', 'synced once\n');
  await syncGitea();
  const synced = { 'Keep me.md': 'synced once\n', 'README.md': '# notes\n' };

  const wrongBranch = await syncGitea('trunk');
  assert.match(wrongBranch.errors[0], /has no branch "trunk"/);
  assert.deepEqual(notes(), synced);

  server.remove(PROJECT);
  const gone = await syncGitea();
  assert.match(gone.errors[0], /repository not found \(404\)/);
  assert.deepEqual(notes(), synced);
});
