import { Buffer } from 'node:buffer';

// A Gitea that lives in memory, for the endpoints the phone app calls. The
// statuses and bodies are the ones a real Gitea 28.4 gave when the same
// requests were sent to it on 2026-11-16:
//   - an unknown token is 401;
//   - a repository with no commits reports "empty", and its tree is refused
//     with 400 "sha not found", the answer a missing branch gets too;
//   - a repository that is not there is 404;
//   - files are created with POST and updated with PUT plus the old sha, and
//     a file can be created in a repository that has no commits yet.
export function fakeGitea(origin = 'https://gitea.example') {
  const tokens = new Set();
  const repos = new Map();

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const encode = (text) => Buffer.from(text, 'utf8').toString('base64');
  const decode = (text) => Buffer.from(text, 'base64').toString('utf8');

  async function fetch(input, options = {}) {
    const url = new URL(String(input));
    const method = options.method ?? 'GET';
    if (url.origin !== origin) throw new TypeError('Network request failed');
    const token = (options.headers?.Authorization ?? '').replace(/^token /, '');
    if (!tokens.has(token)) return json(401, { message: 'invalid username, password or token' });

    const match = url.pathname.match(/^\/api\/v1\/repos\/([^/]+\/[^/]+)(\/.*)?$/);
    if (!match) return json(404, { message: 'not found' });
    const repo = repos.get(match[1]);
    if (!repo) return json(404, { message: 'The target couldn\'t be found.' });
    const rest = match[2] ?? '';
    const empty = repo.files.size === 0 && !repo.committed;

    if (rest === '') return json(200, { default_branch: repo.branch, empty });

    const tree = rest.match(/^\/git\/trees\/([^/]+)$/);
    if (tree) {
      const ref = decodeURIComponent(tree[1]);
      if (empty || ref !== repo.branch) return json(400, { message: `sha not found [${ref}]` });
      return json(200, { tree: [...repo.files.keys()].sort().map((path) => ({ path, type: 'blob', sha: `sha-of-${path}` })) });
    }

    const contents = rest.match(/^\/contents\/(.+)$/);
    if (!contents) return json(404, { message: 'not found' });
    const path = contents[1].split('/').map(decodeURIComponent).join('/');
    if (method === 'GET') {
      return repo.files.has(path) ? json(200, { content: encode(repo.files.get(path)), sha: `sha-of-${path}` }) : json(404, { message: 'not found' });
    }
    const body = JSON.parse(options.body);
    if (method === 'POST' && repo.files.has(path)) return json(422, { message: 'repository file already exists' });
    if (method === 'PUT' && body.sha !== `sha-of-${path}`) return json(422, { message: 'sha does not match' });
    repo.files.set(path, decode(body.content));
    repo.committed = true;
    return json(method === 'POST' ? 201 : 200, { content: { path } });
  }

  return {
    fetch,
    token(name) {
      tokens.add(name);
      return name;
    },
    /** Creates a repository; pass files to give it a first commit, or nothing for one with no commits. */
    repo(path, files, branch = 'main') {
      const repo = { files: new Map(Object.entries(files ?? {})), committed: Boolean(files), branch };
      repos.set(path, repo);
      return repo;
    },
    remove(path) {
      repos.delete(path);
    },
    url: (path) => `${origin}/${path}.git`,
  };
}
