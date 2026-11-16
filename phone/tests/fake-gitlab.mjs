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

    const scopes = tokens.get(options.headers?.['PRIVATE-TOKEN']);
    if (!scopes) return json(401, { message: '401 Unauthorized' });
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

    if (rest === '') return json(200, { default_branch: project.branch, empty_repo: project.commits === 0 });

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
    if (project.protectedFrom?.includes(options.headers?.['PRIVATE-TOKEN'])) return json(403, { message: '403 Forbidden - You are not allowed to push into this branch' });
    if (method === 'POST' && project.files.has(path)) return json(400, { message: 'A file with this name already exists' });
    if (method === 'PUT' && !project.files.has(path)) return json(400, { message: "A file with this name doesn't exist" });
    project.files.set(path, JSON.parse(options.body).content);
    project.commits++;
    return json(method === 'POST' ? 201 : 200, { file_path: path, branch: 'main' });
  }

  return {
    fetch,
    requests,
    /** Registers a token and returns it. */
    token(name, scopes) {
      tokens.set(name, scopes);
      return name;
    },
    /** Creates a project; pass files to give it a first commit, or nothing for a project with no commits. */
    project(path, files, branch = 'main') {
      const project = { files: new Map(Object.entries(files ?? {})), commits: files ? 1 : 0, branch };
      projects.set(path, project);
      return project;
    },
    remove(path) {
      projects.delete(path);
    },
    url: (path) => `${origin}/${path}.git`,
  };
}
