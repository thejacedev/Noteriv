// A GitLab that lives in memory, for the endpoints the phone app calls. The
// statuses and bodies are the ones a real GitLab 19.5 gave when the same
// requests were sent to it on 2026-11-16:
//   - an unknown token is 401 everywhere;
//   - a token may always read its own description, whatever its scopes;
//   - reading needs the api or read_api scope, writing needs api, and the
//     refusal is 403 "insufficient_scope" (read_repository and
//     write_repository open git over HTTPS, not this API);
//   - an account without push rights on a protected branch gets 403
//     "You are not allowed to push into this branch", with the api scope or not;
//   - a token also has a role in the project (asked again of GitLab 19.6 on
//     2026-11-24, with project access tokens of every role): the project's
//     description is readable by all of them and carries the role as
//     permissions.project_access.access_level; Guest (10) gets a bare
//     403 "403 Forbidden" for the branch, the tree and the files of a private
//     project; Reporter (20) reads and never writes; Developer (30) writes
//     unless the branch is protected, which a new project's default branch
//     is; Maintainer (40) writes. A branch says so itself in can_push. A
//     project with no commits has no branch (404 "Branch Not Found") and
//     takes its first file from a Maintainer only;
//   - a project with no commits reports empty_repo and answers 404
//     "Tree Not Found" for its tree, the status it also gives for a branch
//     that does not exist and that a missing project gives too.
export function fakeGitLab(origin = 'https://gitlab.example') {
  const tokens = new Map();
  const projects = new Map();
  const requests = [];

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const insufficient = () => json(403, { error: 'insufficient_scope', error_description: 'The request requires higher privileges than provided by the access token.', scope: 'api' });

  async function fetch(input, options = {}) {
    const url = new URL(String(input));
    const method = options.method ?? 'GET';
    requests.push(`${method} ${url.pathname}${url.search}`);
    if (url.origin !== origin) throw new TypeError('Network request failed');
    if (!url.pathname.startsWith('/api/v4/')) return json(404, { error: '404 Not Found' });

    const held = tokens.get(options.headers?.['PRIVATE-TOKEN']);
    if (!held) return json(401, { message: '401 Unauthorized' });
    const { scopes, role } = held;
    const route = url.pathname.slice('/api/v4'.length);
    if (route === '/personal_access_tokens/self') return json(200, { scopes, granular: false, active: true });

    const canRead = scopes.includes('api') || scopes.includes('read_api');
    const canWrite = scopes.includes('api');
    const match = route.match(/^\/projects\/([^/]+)(\/.*)?$/);
    if (!match) return json(404, { error: '404 Not Found' });
    if (!canRead) return insufficient();
    const project = projects.get(decodeURIComponent(match[1]));
    if (!project) return json(404, { message: '404 Project Not Found' });
    const rest = match[2] ?? '';

    if (rest === '') {
      return json(200, { default_branch: project.branch, empty_repo: project.commits === 0, permissions: { project_access: { access_level: role }, group_access: null } });
    }

    // Everything below is the repository itself, which Guest may not see in a private project.
    if (role < 20 && !project.public) return json(403, { message: '403 Forbidden' });
    const mayPush = role >= 40 || (role >= 30 && !project.protected && project.commits > 0);

    const asked = rest.match(/^\/repository\/branches\/([^/]+)$/);
    if (asked) {
      if (project.commits === 0 || decodeURIComponent(asked[1]) !== project.branch) return json(404, { message: '404 Branch Not Found' });
      return json(200, { name: project.branch, default: true, protected: project.protected, can_push: mayPush });
    }

    if (rest === '/repository/tree') {
      if (project.commits === 0 || url.searchParams.get('ref') !== project.branch) return json(404, { message: '404 Tree Not Found' });
      const perPage = Number(url.searchParams.get('per_page') ?? 20);
      const page = Number(url.searchParams.get('page') ?? 1);
      const all = [...project.files.keys()].sort().map((path) => ({ id: `sha-of-${path}`, path, type: 'blob' }));
      return json(200, all.slice((page - 1) * perPage, page * perPage));
    }

    const file = rest.match(/^\/repository\/files\/([^/]+)(\/raw)?$/);
    if (!file) return json(404, { error: '404 Not Found' });
    const path = decodeURIComponent(file[1]);
    if (file[2]) {
      return project.files.has(path) ? new Response(project.files.get(path), { status: 200 }) : json(404, { message: '404 File Not Found' });
    }
    if (method !== 'POST' && method !== 'PUT') return json(405, { message: '405 Method Not Allowed' });
    if (!canWrite) return insufficient();
    if (!mayPush) return json(403, { message: '403 Forbidden - You are not allowed to push into this branch' });
    if (method === 'POST' && project.files.has(path)) return json(400, { message: 'A file with this name already exists' });
    if (method === 'PUT' && !project.files.has(path)) return json(400, { message: "A file with this name doesn't exist" });
    project.files.set(path, JSON.parse(options.body).content);
    project.commits++;
    return json(method === 'POST' ? 201 : 200, { file_path: path, branch: 'main' });
  }

  return {
    fetch,
    requests,
    /**
     * Registers a token and returns it. The role is the access level it has
     * in every project here: 10 Guest, 20 Reporter, 30 Developer,
     * 40 Maintainer, 50 Owner (a personal token on one's own project).
     */
    token(name, scopes, role = 50) {
      tokens.set(name, { scopes, role });
      return name;
    },
    /**
     * Creates a private project whose default branch is protected, as GitLab
     * makes them; pass files to give it a first commit, or nothing for a
     * project with no commits. Set `protected` or `public` on the result to
     * change that.
     */
    project(path, files, branch = 'main') {
      const project = { files: new Map(Object.entries(files ?? {})), commits: files ? 1 : 0, branch, protected: true, public: false };
      projects.set(path, project);
      return project;
    },
    remove(path) {
      projects.delete(path);
    },
    url: (path) => `${origin}/${path}.git`,
  };
}
