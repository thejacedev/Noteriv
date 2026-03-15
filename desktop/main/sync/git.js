const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Promisified exec helper — runs git commands in a given directory
function git(args, cwd, token = null) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };

    if (token) {
      const askpassScript = path.join(os.tmpdir(), `noteriv-askpass-${process.pid}.sh`);
      const isWin = process.platform === "win32";

      if (isWin) {
        const batPath = askpassScript.replace(".sh", ".bat");
        fs.writeFileSync(batPath, `@echo ${token}\n`, "utf-8");
        env.GIT_ASKPASS = batPath;
      } else {
        fs.writeFileSync(askpassScript, `#!/bin/sh\necho "${token}"\n`, { mode: 0o700 });
        env.GIT_ASKPASS = askpassScript;
      }

      env.GIT_TERMINAL_PROMPT = "0";

      const cleanup = () => {
        try {
          if (isWin) {
            fs.unlinkSync(askpassScript.replace(".sh", ".bat"));
          } else {
            fs.unlinkSync(askpassScript);
          }
        } catch {}
      };

      execFile("git", args, { cwd, timeout: 60000, env }, (error, stdout, stderr) => {
        cleanup();
        if (error) reject(new Error(stderr.trim() || error.message));
        else resolve(stdout.trim());
      });
    } else {
      execFile("git", args, { cwd, timeout: 30000, env }, (error, stdout, stderr) => {
        if (error) reject(new Error(stderr.trim() || error.message));
        else resolve(stdout.trim());
      });
    }
  });
}

function makeAuthUrl(remoteUrl, token) {
  if (!token || !remoteUrl) return remoteUrl;
  try {
    const url = new URL(remoteUrl);
    if (url.protocol === "https:") {
      url.username = "oauth2";
      url.password = token;
      return url.toString();
    }
  } catch {}
  return remoteUrl;
}

async function currentBranch(dir) {
  try {
    const branch = await git(["branch", "--show-current"], dir);
    if (branch) return branch;
  } catch {}
  // Fallback: check HEAD ref for initial commits or detached state
  try {
    const ref = await git(["symbolic-ref", "--short", "HEAD"], dir);
    if (ref) return ref;
  } catch {}
  // Last resort: check what the remote default branch is
  try {
    const remoteInfo = await git(["remote", "show", "origin"], dir);
    const match = remoteInfo.match(/HEAD branch:\s*(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return "main";
}

async function isGitInstalled() {
  try {
    await git(["--version"], process.cwd());
    return true;
  } catch {
    return false;
  }
}

async function isGitRepo(dir) {
  try {
    await git(["rev-parse", "--is-inside-work-tree"], dir);
    return true;
  } catch {
    return false;
  }
}

async function initRepo(dir) {
  if (!(await isGitRepo(dir))) {
    await git(["init"], dir);
  }

  const gitignorePath = path.join(dir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(
      gitignorePath,
      [".DS_Store", "Thumbs.db", ".trash/", "*.tmp", ""].join("\n"),
      "utf-8"
    );
  }

  return true;
}

async function setRemote(dir, remoteUrl) {
  try {
    const existing = await git(["remote", "get-url", "origin"], dir);
    if (existing !== remoteUrl) {
      await git(["remote", "set-url", "origin", remoteUrl], dir);
    }
  } catch {
    await git(["remote", "add", "origin", remoteUrl], dir);
  }
  return true;
}

async function getStatus(dir) {
  try {
    const repo = await isGitRepo(dir);
    if (!repo) return { isRepo: false, changes: 0, branch: null, remote: null, ahead: 0, behind: 0 };

    const branch = await currentBranch(dir);

    let remote = null;
    try {
      remote = await git(["remote", "get-url", "origin"], dir);
    } catch {}

    const statusOutput = await git(["status", "--porcelain"], dir).catch(() => "");
    const changes = statusOutput ? statusOutput.split("\n").filter(Boolean).length : 0;

    let ahead = 0;
    let behind = 0;
    if (remote) {
      try {
        const logAhead = await git(["rev-list", "--count", `origin/${branch}..HEAD`], dir).catch(() => "0");
        const logBehind = await git(["rev-list", "--count", `HEAD..origin/${branch}`], dir).catch(() => "0");
        ahead = parseInt(logAhead, 10) || 0;
        behind = parseInt(logBehind, 10) || 0;
      } catch {}
    }

    return { isRepo: true, changes, branch, remote, ahead, behind };
  } catch {
    return { isRepo: false, changes: 0, branch: null, remote: null, ahead: 0, behind: 0 };
  }
}

async function sync(dir, commitMessage, token = null) {
  const msg = commitMessage || `Sync notes ${new Date().toISOString().split("T")[0]}`;

  let remote = null;
  let branch = await currentBranch(dir);
  try {
    remote = await git(["remote", "get-url", "origin"], dir);
  } catch {}

  if (remote) {
    try {
      if (token) {
        const authUrl = makeAuthUrl(remote, token);
        const hasChanges = await git(["status", "--porcelain"], dir);
        if (hasChanges) {
          await git(["stash", "push", "-m", "noteriv-sync-stash"], dir);
          try {
            await git(["pull", "--rebase", authUrl, branch], dir, token);
          } catch {}
          await git(["stash", "pop"], dir).catch(() => {});
        } else {
          try {
            await git(["pull", "--rebase", authUrl, branch], dir, token);
          } catch {}
        }
      } else {
        const hasChanges = await git(["status", "--porcelain"], dir);
        if (hasChanges) {
          await git(["stash", "push", "-m", "noteriv-sync-stash"], dir);
          try {
            await git(["pull", "--rebase", "origin", branch], dir);
          } catch {}
          await git(["stash", "pop"], dir).catch(() => {});
        } else {
          try {
            await git(["pull", "--rebase", "origin", branch], dir);
          } catch {}
        }
      }
    } catch {}
  }

  await git(["add", "-A"], dir);

  const status = await git(["status", "--porcelain"], dir);
  if (status) {
    await git(["commit", "-m", msg], dir);
  }

  if (remote) {
    try {
      if (token) {
        const authUrl = makeAuthUrl(remote, token);
        await git(["push", "-u", authUrl, branch], dir, token);
      } else {
        await git(["push", "-u", "origin", branch], dir);
      }
    } catch {}
  }

  return true;
}

async function pull(dir, token = null) {
  const branch = await currentBranch(dir);
  const hasChanges = await git(["status", "--porcelain"], dir).catch(() => "");
  const needsStash = !!hasChanges;

  if (needsStash) {
    await git(["stash", "push", "-m", "noteriv-pull-stash"], dir);
  }

  try {
    if (token) {
      const remote = await git(["remote", "get-url", "origin"], dir);
      const authUrl = makeAuthUrl(remote, token);
      await git(["pull", authUrl, branch, "--rebase"], dir, token);
    } else {
      await git(["pull", "origin", branch, "--rebase"], dir);
    }
  } finally {
    if (needsStash) {
      await git(["stash", "pop"], dir).catch(() => {});
    }
  }
  return true;
}

async function fetch(dir, token = null) {
  if (token) {
    const remote = await git(["remote", "get-url", "origin"], dir);
    const authUrl = makeAuthUrl(remote, token);
    await git(["fetch", authUrl], dir, token);
  } else {
    await git(["fetch", "origin"], dir);
  }
  return true;
}

async function getLog(dir, count = 20) {
  try {
    const log = await git(
      ["log", `--max-count=${count}`, "--pretty=format:%H||%an||%ar||%s"],
      dir
    );
    if (!log) return [];
    return log.split("\n").map((line) => {
      const [hash, author, date, message] = line.split("||");
      return { hash, author, date, message };
    });
  } catch {
    return [];
  }
}

async function cloneRepo(remoteUrl, dir, token = null) {
  const parent = path.dirname(dir);
  const folderName = path.basename(dir);

  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }

  if (token) {
    const authUrl = makeAuthUrl(remoteUrl, token);
    await git(["clone", authUrl, folderName], parent, token);
    await git(["remote", "set-url", "origin", remoteUrl], dir);
  } else {
    await git(["clone", remoteUrl, folderName], parent);
  }
  return true;
}

module.exports = {
  isGitInstalled,
  isGitRepo,
  initRepo,
  setRemote,
  getStatus,
  sync,
  pull,
  fetch,
  getLog,
  cloneRepo,
};
