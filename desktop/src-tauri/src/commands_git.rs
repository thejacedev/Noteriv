// Shells out to the `git` binary. Mirrors desktop/main/sync/git.js exactly.

use crate::auth::credentials_for_vault;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[derive(Debug, Serialize, Default)]
pub struct GitStatus {
    #[serde(rename = "isRepo")]
    pub is_repo: bool,
    pub changes: usize,
    pub branch: Option<String>,
    pub remote: Option<String>,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Debug, Serialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

struct GitRunResult {
    stdout: String,
    success: bool,
    stderr: String,
}

/// Run `git <args>` in `cwd`. If `token` is given, uses GIT_ASKPASS so push/pull/clone
/// can authenticate over HTTPS without leaking the token to the URL or process tree.
fn run_git(args: &[&str], cwd: &Path, token: Option<&str>) -> GitRunResult {
    let mut cmd = Command::new("git");

    // Disable every credential helper (libsecret, manager, store, gnome-keyring,
    // etc.) and any custom askpass for THIS invocation. We pass auth via
    // GIT_ASKPASS + URL when we have a token; if we don't, git must fail fast
    // instead of popping the system credential helper's GUI prompt.
    cmd.args(&["-c", "credential.helper="]);
    cmd.args(&["-c", "core.askPass="]);
    cmd.args(&["-c", "credential.modalPrompt=false"]);
    cmd.args(args).current_dir(cwd);

    let mut env_overrides: Vec<(String, String)> = Vec::new();
    let mut askpass_to_clean: Option<PathBuf> = None;

    // Disable interactive SSH/terminal prompts. Also blank SSH_ASKPASS so any
    // SSH-based fallback can't pop ssh-askpass either.
    cmd.env(
        "GIT_SSH_COMMAND",
        "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
    );
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("SSH_ASKPASS", "");
    cmd.env("DISPLAY", std::env::var("DISPLAY").unwrap_or_default());
    // Some GNOME setups inject `seahorse` as the default SSH askpass; clear it.
    cmd.env_remove("SSH_ASKPASS_REQUIRE");

    if let Some(t) = token {
        let pid = std::process::id();
        let tmp = env::temp_dir();
        let is_win = cfg!(target_os = "windows");
        let askpass = if is_win {
            tmp.join(format!("noteriv-askpass-{pid}.bat"))
        } else {
            tmp.join(format!("noteriv-askpass-{pid}.sh"))
        };

        let body = if is_win {
            format!("@echo {t}\r\n")
        } else {
            format!("#!/bin/sh\necho \"{t}\"\n")
        };
        if fs::write(&askpass, body).is_ok() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&askpass, fs::Permissions::from_mode(0o700));
            }
            env_overrides.push(("GIT_ASKPASS".into(), askpass.to_string_lossy().into_owned()));
            env_overrides.push(("GIT_TERMINAL_PROMPT".into(), "0".into()));
            askpass_to_clean = Some(askpass);
        }
    }

    for (k, v) in &env_overrides {
        cmd.env(k, v);
    }

    let timeout = if token.is_some() {
        Duration::from_secs(60)
    } else {
        Duration::from_secs(30)
    };

    let result = run_with_timeout(cmd, timeout);

    if let Some(p) = askpass_to_clean {
        let _ = fs::remove_file(p);
    }

    result
}

fn run_with_timeout(mut cmd: Command, timeout: Duration) -> GitRunResult {
    use std::io::Read;
    use std::process::Stdio;
    use wait_timeout::ChildExt;

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return GitRunResult {
                stdout: String::new(),
                stderr: e.to_string(),
                success: false,
            }
        }
    };

    let status = match child.wait_timeout(timeout) {
        Ok(Some(s)) => s,
        Ok(None) => {
            // Timed out — kill it.
            let _ = child.kill();
            let _ = child.wait();
            return GitRunResult {
                stdout: String::new(),
                stderr: format!("git command timed out after {}s", timeout.as_secs()),
                success: false,
            };
        }
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            return GitRunResult {
                stdout: String::new(),
                stderr: e.to_string(),
                success: false,
            };
        }
    };

    let mut stdout = String::new();
    let mut stderr = String::new();
    if let Some(mut s) = child.stdout.take() {
        let _ = s.read_to_string(&mut stdout);
    }
    if let Some(mut s) = child.stderr.take() {
        let _ = s.read_to_string(&mut stderr);
    }

    GitRunResult {
        stdout: stdout.trim().to_string(),
        stderr: stderr.trim().to_string(),
        success: status.success(),
    }
}

/// Mask the user-info part of every URL in `text`. Git echoes remote URLs in
/// its errors ("unable to access 'https://user:token@host/...'"), and the sync
/// commands pass an authenticated URL, so raw stderr must not reach the UI.
fn redact_credentials(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(i) = rest.find("://") {
        let (head, tail) = rest.split_at(i + 3);
        out.push_str(head);
        let end = tail
            .find(|c: char| c == '/' || c.is_whitespace() || c == '\'' || c == '"')
            .unwrap_or(tail.len());
        match tail[..end].rfind('@') {
            Some(at) => {
                out.push_str("***@");
                rest = &tail[at + 1..];
            }
            None => rest = tail,
        }
    }
    out.push_str(rest);
    out
}

/// A failed git invocation's message, safe to show to the user.
fn git_error(r: &GitRunResult) -> String {
    if r.stderr.is_empty() {
        "git command failed".into()
    } else {
        redact_credentials(&r.stderr)
    }
}

/// True when a pull failed only because the branch doesn't exist on the
/// remote yet — the normal state of a freshly created, empty repository.
fn remote_branch_missing(r: &GitRunResult) -> bool {
    r.stderr.contains("couldn't find remote ref")
}

/// Older versions pushed with `-u <authenticated URL>`, which saved that URL
/// (token included) as the branch's upstream in .git/config. Point the branch
/// back at the `origin` remote so the token no longer sits there in plain text.
fn repair_upstream(p: &Path, branch: &str) {
    let key = format!("branch.{branch}.remote");
    let r = run_git(&["config", "--get", &key], p, None);
    if r.success && r.stdout.contains("://") {
        let _ = run_git(&["config", &key, "origin"], p, None);
    }
}

fn ok_or_err(r: GitRunResult) -> Result<String, String> {
    if r.success {
        Ok(r.stdout)
    } else {
        Err(if r.stderr.is_empty() {
            "git command failed".into()
        } else {
            r.stderr
        })
    }
}

/// True if a rebase (interactive or `am`-style) is currently in progress in `dir`.
/// A half-finished rebase leaves HEAD detached; committing on top of it is how
/// auto-sync used to silently wedge a repo (local "Sync" commits pile up forever
/// while every push fails), so sync must detect and recover from it.
fn rebase_in_progress(dir: &Path) -> bool {
    let git_dir = {
        let r = run_git(&["rev-parse", "--git-dir"], dir, None);
        if r.success && !r.stdout.is_empty() {
            dir.join(r.stdout)
        } else {
            dir.join(".git")
        }
    };
    git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists()
}

/// True when HEAD is attached to a branch (not detached / mid-rebase).
fn on_branch(dir: &Path) -> bool {
    run_git(&["symbolic-ref", "--quiet", "HEAD"], dir, None).success
}

fn current_branch(dir: &Path) -> String {
    let r = run_git(&["branch", "--show-current"], dir, None);
    if r.success && !r.stdout.is_empty() {
        return r.stdout;
    }
    let r = run_git(&["symbolic-ref", "--short", "HEAD"], dir, None);
    if r.success && !r.stdout.is_empty() {
        return r.stdout;
    }
    let r = run_git(&["remote", "show", "origin"], dir, None);
    if r.success {
        for line in r.stdout.lines() {
            if let Some(rest) = line.trim().strip_prefix("HEAD branch:") {
                return rest.trim().to_string();
            }
        }
    }
    "main".into()
}

#[tauri::command]
pub async fn git_is_installed() -> bool {
    run_git(&["--version"], &env::current_dir().unwrap_or(PathBuf::from(".")), None).success
}

#[tauri::command]
pub async fn git_is_repo(dir: String) -> bool {
    run_git(&["rev-parse", "--is-inside-work-tree"], Path::new(&dir), None).success
}

#[tauri::command]
pub async fn git_init(dir: String) -> Result<bool, String> {
    let p = Path::new(&dir);
    let already = run_git(&["rev-parse", "--is-inside-work-tree"], p, None).success;
    if !already {
        let r = run_git(&["init"], p, None);
        if !r.success {
            return Err(r.stderr);
        }
    }
    let gi = p.join(".gitignore");
    if !gi.exists() {
        let _ = fs::write(&gi, ".DS_Store\nThumbs.db\n.trash/\n*.tmp\n");
    }
    Ok(true)
}

#[derive(Debug, Deserialize)]
pub struct SetRemoteInput {
    pub dir: String,
    pub url: String,
}

#[tauri::command]
pub async fn git_set_remote(args: SetRemoteInput) -> Result<bool, String> {
    let p = Path::new(&args.dir);
    let url = args.url.trim().trim_end_matches('/');
    let existing = run_git(&["remote", "get-url", "origin"], p, None);
    if url.is_empty() {
        // Clearing the remote in settings has to remove it from the repo too,
        // or `git status` keeps reporting one and sync keeps trying to use it.
        if existing.success {
            ok_or_err(run_git(&["remote", "remove", "origin"], p, None))?;
        }
    } else if existing.success {
        if existing.stdout != url {
            ok_or_err(run_git(&["remote", "set-url", "origin", url], p, None))?;
        }
    } else {
        ok_or_err(run_git(&["remote", "add", "origin", url], p, None))?;
    }
    Ok(true)
}

#[tauri::command]
pub async fn git_status(dir: String) -> GitStatus {
    let p = Path::new(&dir);
    let is_repo = run_git(&["rev-parse", "--is-inside-work-tree"], p, None).success;
    if !is_repo {
        return GitStatus::default();
    }
    let branch = current_branch(p);
    let remote_r = run_git(&["remote", "get-url", "origin"], p, None);
    let remote = if remote_r.success {
        Some(remote_r.stdout.clone())
    } else {
        None
    };
    let status_out = run_git(&["status", "--porcelain"], p, None);
    let changes = if status_out.success && !status_out.stdout.is_empty() {
        status_out.stdout.lines().filter(|l| !l.is_empty()).count()
    } else {
        0
    };
    let mut ahead = 0usize;
    let mut behind = 0usize;
    if remote.is_some() {
        let a = run_git(
            &["rev-list", "--count", &format!("origin/{branch}..HEAD")],
            p,
            None,
        );
        if a.success {
            ahead = a.stdout.parse().unwrap_or(0);
        }
        let b = run_git(
            &["rev-list", "--count", &format!("HEAD..origin/{branch}")],
            p,
            None,
        );
        if b.success {
            behind = b.stdout.parse().unwrap_or(0);
        }
    }
    GitStatus {
        is_repo: true,
        changes,
        branch: Some(branch),
        remote,
        ahead,
        behind,
    }
}

#[derive(Debug, Deserialize)]
pub struct GitSyncInput {
    pub dir: String,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(rename = "vaultId", default)]
    pub vault_id: Option<String>,
}

#[tauri::command]
pub async fn git_sync(args: GitSyncInput) -> Result<bool, String> {
    let _guard = crate::commands_fs::lock_file_mutations();
    let p = Path::new(&args.dir);
    let creds = credentials_for_vault(args.vault_id.as_deref());
    let token_ref = creds.as_ref().map(|c| c.token.as_str());

    let msg = args.message.unwrap_or_else(|| {
        format!("Sync notes {}", Utc::now().format("%Y-%m-%d"))
    });

    let branch = current_branch(p);
    repair_upstream(p, &branch);
    let remote_r = run_git(&["remote", "get-url", "origin"], p, None);
    let remote = if remote_r.success {
        Some(remote_r.stdout.clone())
    } else {
        None
    };

    // Recover from a rebase a previous sync (or a crash) left half-finished.
    // Without this, the add/commit below would stack commits onto a detached
    // HEAD and the repo would silently stop syncing. Abort so we resume clean.
    if rebase_in_progress(p) {
        let _ = run_git(&["rebase", "--abort"], p, None);
    }

    if let Some(r) = remote.as_deref() {
        let pull_url = match &creds {
            Some(c) => c.auth_url(r),
            None => "origin".into(),
        };
        let has_changes = run_git(&["status", "--porcelain"], p, None);
        let needs_stash = has_changes.success && !has_changes.stdout.is_empty();
        if needs_stash {
            let _ = run_git(&["stash", "push", "-m", "noteriv-sync-stash"], p, None);
        }
        let pull = run_git(&["pull", "--rebase", &pull_url, &branch], p, token_ref);
        // A conflicting rebase stops mid-way and leaves HEAD detached. Don't
        // commit on top of it: abort, restore the stash, and surface the
        // conflict so the user knows sync needs manual attention.
        if !pull.success && rebase_in_progress(p) {
            let _ = run_git(&["rebase", "--abort"], p, None);
            if needs_stash {
                let _ = run_git(&["stash", "pop"], p, None);
            }
            return Err(format!(
                "Sync paused: remote changes conflict with local edits and need manual resolution. {}",
                git_error(&pull)
            ));
        }
        if needs_stash {
            let _ = run_git(&["stash", "pop"], p, None);
        }
        // Authentication, network and "repository not found" failures used to
        // be dropped here, so a misconfigured remote looked like a successful
        // sync. An empty remote has no branch to pull yet; that one is fine.
        if !pull.success && !remote_branch_missing(&pull) {
            return Err(format!("Sync failed while pulling: {}", git_error(&pull)));
        }
    }

    // Never commit/push from a detached HEAD: current_branch() guesses a branch
    // name when detached, so an unguarded push would target the wrong ref and
    // silently no-op while local commits accumulate. Bail and surface it.
    if !on_branch(p) {
        return Err(
            "Sync paused: repository is in a detached HEAD state and needs manual attention.".into(),
        );
    }

    ok_or_err(run_git(&["add", "-A"], p, None))?;
    let st = run_git(&["status", "--porcelain"], p, None);
    if st.success && !st.stdout.is_empty() {
        ok_or_err(run_git(&["commit", "-m", &msg], p, None))?;
    }
    if let Some(r) = remote.as_deref() {
        let push_url = match &creds {
            Some(c) => c.auth_url(r),
            None => "origin".into(),
        };
        // No `-u`: with an authenticated URL it would store the token in
        // .git/config as the branch's upstream.
        let push = run_git(&["push", &push_url, &branch], p, token_ref);
        if !push.success {
            return Err(format!("Sync failed while pushing: {}", git_error(&push)));
        }
    }
    Ok(true)
}

#[derive(Debug, Deserialize)]
pub struct GitDirVaultInput {
    pub dir: String,
    #[serde(rename = "vaultId", default)]
    pub vault_id: Option<String>,
}

#[tauri::command]
pub async fn git_pull(args: GitDirVaultInput) -> Result<bool, String> {
    let _guard = crate::commands_fs::lock_file_mutations();
    let p = Path::new(&args.dir);
    let creds = credentials_for_vault(args.vault_id.as_deref());
    let branch = current_branch(p);
    repair_upstream(p, &branch);
    let has_changes = run_git(&["status", "--porcelain"], p, None);
    let needs_stash = has_changes.success && !has_changes.stdout.is_empty();
    if needs_stash {
        ok_or_err(run_git(&["stash", "push", "-m", "noteriv-pull-stash"], p, None))?;
    }
    let result = if let Some(c) = creds.as_ref() {
        let remote = ok_or_err(run_git(&["remote", "get-url", "origin"], p, None))?;
        let auth = c.auth_url(&remote);
        run_git(&["pull", &auth, &branch, "--rebase"], p, Some(&c.token))
    } else {
        run_git(&["pull", "origin", &branch, "--rebase"], p, None)
    };
    if needs_stash {
        let _ = run_git(&["stash", "pop"], p, None);
    }
    if !result.success && !remote_branch_missing(&result) {
        return Err(git_error(&result));
    }
    Ok(true)
}

#[tauri::command]
pub async fn git_fetch(args: GitDirVaultInput) -> Result<bool, String> {
    let p = Path::new(&args.dir);
    let creds = credentials_for_vault(args.vault_id.as_deref());
    let res = if let Some(c) = creds.as_ref() {
        let remote = ok_or_err(run_git(&["remote", "get-url", "origin"], p, None))?;
        let auth = c.auth_url(&remote);
        run_git(&["fetch", &auth], p, Some(&c.token))
    } else {
        run_git(&["fetch", "origin"], p, None)
    };
    if !res.success {
        return Err(git_error(&res));
    }
    Ok(true)
}

#[derive(Debug, Deserialize)]
pub struct GitLogInput {
    pub dir: String,
    #[serde(default)]
    pub count: Option<u32>,
}

#[tauri::command]
pub async fn git_log(args: GitLogInput) -> Vec<GitLogEntry> {
    let p = Path::new(&args.dir);
    let count = args.count.unwrap_or(20);
    let r = run_git(
        &[
            "log",
            &format!("--max-count={count}"),
            "--pretty=format:%H||%an||%ar||%s",
        ],
        p,
        None,
    );
    if !r.success || r.stdout.is_empty() {
        return Vec::new();
    }
    r.stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, "||").collect();
            if parts.len() == 4 {
                Some(GitLogEntry {
                    hash: parts[0].into(),
                    author: parts[1].into(),
                    date: parts[2].into(),
                    message: parts[3].into(),
                })
            } else {
                None
            }
        })
        .collect()
}

#[derive(Debug, Deserialize)]
pub struct GitCloneInput {
    pub url: String,
    pub dir: String,
    #[serde(rename = "vaultId", default)]
    pub vault_id: Option<String>,
}

#[tauri::command]
pub async fn git_clone(args: GitCloneInput) -> Result<bool, String> {
    let target = PathBuf::from(&args.dir);
    let parent = target
        .parent()
        .ok_or_else(|| "invalid clone target".to_string())?;
    let folder_name = target
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .ok_or_else(|| "invalid clone target name".to_string())?;
    let _ = fs::create_dir_all(parent);

    let creds = credentials_for_vault(args.vault_id.as_deref());
    if let Some(c) = creds.as_ref() {
        let auth = c.auth_url(&args.url);
        ok_or_err(run_git(&["clone", &auth, &folder_name], parent, Some(&c.token)))?;
        ok_or_err(run_git(
            &["remote", "set-url", "origin", &args.url],
            &target,
            None,
        ))?;
    } else {
        ok_or_err(run_git(&["clone", &args.url, &folder_name], parent, None))?;
    }
    Ok(true)
}

#[derive(Debug, Deserialize)]
pub struct GitFileLogInput {
    pub dir: String,
    #[serde(rename = "filePath")]
    pub file_path: String,
}

fn relative_unix(dir: &Path, file: &Path) -> String {
    pathdiff(dir, file).replace('\\', "/")
}

fn pathdiff(base: &Path, target: &Path) -> String {
    // Best-effort relative path; falls back to the absolute target.
    let a = dunce::canonicalize(base).unwrap_or_else(|_| base.to_path_buf());
    let b = dunce::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());
    let stripped = b.strip_prefix(&a).ok();
    match stripped {
        Some(p) => p.to_string_lossy().into_owned(),
        None => target.to_string_lossy().into_owned(),
    }
}

#[tauri::command]
pub async fn git_file_log(args: GitFileLogInput) -> Vec<GitLogEntry> {
    let p = Path::new(&args.dir);
    let rel = relative_unix(Path::new(&args.dir), Path::new(&args.file_path));
    let r = run_git(
        &[
            "log",
            "--follow",
            "--pretty=format:%H|%an|%ad|%s",
            "--",
            &rel,
        ],
        p,
        None,
    );
    if !r.success || r.stdout.is_empty() {
        return Vec::new();
    }
    r.stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() == 4 {
                Some(GitLogEntry {
                    hash: parts[0].into(),
                    author: parts[1].into(),
                    date: parts[2].into(),
                    message: parts[3].into(),
                })
            } else {
                None
            }
        })
        .collect()
}

#[derive(Debug, Deserialize)]
pub struct GitShowFileInput {
    pub dir: String,
    #[serde(rename = "filePath")]
    pub file_path: String,
    pub hash: String,
}

#[tauri::command]
pub async fn git_show_file(args: GitShowFileInput) -> Option<String> {
    let p = Path::new(&args.dir);
    let rel = relative_unix(Path::new(&args.dir), Path::new(&args.file_path));
    let r = run_git(&["show", &format!("{}:{}", args.hash, rel)], p, None);
    if r.success {
        Some(r.stdout)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let suffix = format!(
            "{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let dir = std::env::temp_dir().join(format!("noteriv-git-{name}-{suffix}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn git(dir: &Path, args: &[&str]) -> GitRunResult {
        run_git(args, dir, None)
    }

    /// A vault repo on `main` with one committed note and a local identity.
    fn vault(name: &str) -> PathBuf {
        let dir = scratch(name);
        assert!(git(&dir, &["init", "-b", "main"]).success);
        git(&dir, &["config", "user.email", "test@example.com"]);
        git(&dir, &["config", "user.name", "Test"]);
        fs::write(dir.join("note.md"), "hello").unwrap();
        git(&dir, &["add", "-A"]);
        assert!(git(&dir, &["commit", "-m", "init"]).success);
        dir
    }

    fn sync(dir: &Path) -> Result<bool, String> {
        tauri::async_runtime::block_on(git_sync(GitSyncInput {
            dir: dir.to_string_lossy().into_owned(),
            message: Some("test sync".into()),
            vault_id: None,
        }))
    }

    #[test]
    fn redacts_credentials_in_urls() {
        assert_eq!(
            redact_credentials("fatal: unable to access 'https://oauth2:glpat-SECRET@gitlab.com/a/b.git/': 403"),
            "fatal: unable to access 'https://***@gitlab.com/a/b.git/': 403"
        );
        assert_eq!(
            redact_credentials("https://user:p@ss@host/x and https://other@h2/y"),
            "https://***@host/x and https://***@h2/y"
        );
        assert_eq!(
            redact_credentials("fatal: repository 'https://gitlab.com/a/b.git/' not found"),
            "fatal: repository 'https://gitlab.com/a/b.git/' not found"
        );
        assert_eq!(redact_credentials("no urls here"), "no urls here");
    }

    #[test]
    fn sync_reports_an_unreachable_remote() {
        let dir = vault("unreachable");
        let missing = dir.join("does-not-exist.git");
        git(&dir, &["remote", "add", "origin", &missing.to_string_lossy()]);
        let err = sync(&dir).expect_err("a missing remote must fail the sync");
        assert!(err.starts_with("Sync failed while pulling"), "{err}");
    }

    #[test]
    fn sync_pushes_to_an_empty_remote() {
        let dir = vault("empty-remote");
        let remote = scratch("empty-remote-bare");
        assert!(git(&remote, &["init", "--bare", "-b", "main"]).success);
        git(&dir, &["remote", "add", "origin", &remote.to_string_lossy()]);
        assert_eq!(sync(&dir), Ok(true));
        let pushed = git(&remote, &["log", "--oneline", "main"]);
        assert!(pushed.success && pushed.stdout.contains("init"), "{}", pushed.stdout);
    }

    #[test]
    fn sync_repairs_an_upstream_that_stored_a_token() {
        let dir = vault("upstream");
        let remote = scratch("upstream-bare");
        assert!(git(&remote, &["init", "--bare", "-b", "main"]).success);
        git(&dir, &["remote", "add", "origin", &remote.to_string_lossy()]);
        git(&dir, &["config", "branch.main.remote", "https://oauth2:SECRET@gitlab.example.com/a/b.git"]);
        assert_eq!(sync(&dir), Ok(true));
        assert_eq!(git(&dir, &["config", "--get", "branch.main.remote"]).stdout, "origin");
    }

    #[test]
    fn clearing_the_remote_removes_it() {
        let dir = vault("clear-remote");
        let set = |url: &str| {
            tauri::async_runtime::block_on(git_set_remote(SetRemoteInput {
                dir: dir.to_string_lossy().into_owned(),
                url: url.into(),
            }))
        };
        assert_eq!(set("https://gitlab.example.com/a/b.git/"), Ok(true));
        assert_eq!(
            git(&dir, &["remote", "get-url", "origin"]).stdout,
            "https://gitlab.example.com/a/b.git"
        );
        assert_eq!(set("  "), Ok(true));
        assert!(!git(&dir, &["remote", "get-url", "origin"]).success);
    }
}
