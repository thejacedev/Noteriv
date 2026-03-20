---
title: Git Sync
order: 2
---

# Git Sync

Git sync is Noteriv's primary synchronization method on the desktop app. It uses the system-installed `git` binary to commit your vault changes and push them to a remote GitHub repository. Every edit is version-controlled, giving you a complete history of your notes that you can browse, diff, and restore at any time.

## Prerequisites

Git sync requires:

1. **Git installed**: The `git` command must be available on your system PATH. Noteriv calls `git --version` at startup to verify this. On macOS, git ships with Xcode command-line tools. On Linux, install it via your package manager (`apt install git`, `dnf install git`). On Windows, install [Git for Windows](https://git-scm.com/download/win).

2. **A GitHub repository**: Create a repository on GitHub (public or private) to hold your vault. Note the HTTPS URL (e.g., `https://github.com/yourname/notes.git`).

3. **A personal access token**: Generate a token at [github.com/settings/tokens](https://github.com/settings/tokens) with the `repo` scope. This token authenticates push and pull operations without requiring SSH keys.

## Setup

### New Vault with Git

When creating a new vault in the setup wizard, enable the "Git sync" toggle and paste your GitHub remote URL. Noteriv will create the vault directory, run `git init`, create a `.gitignore` with sensible defaults, set the remote URL, and make an initial commit and push.

### Existing Vault

Open the sidebar and click "Set up Git sync" at the bottom. Enter the remote URL, toggle auto-sync if desired, and click Save. Noteriv initializes a git repository if needed, sets the remote, and the next sync cycle commits all existing files.

### Cloning an Existing Repo

Create a new vault in Noteriv, set the remote URL to an existing repository, and run "Pull" from the sidebar to download all remote files. Alternatively, clone the repository manually with `git clone` and open the directory as a vault.

## Sync Cycle

When a sync is triggered (manually or automatically), Noteriv executes the following operations in sequence. This is the core of the sync logic, implemented in `desktop/main/sync/git.js`.

### 1. Fetch

```
git fetch <remote>
```

Downloads the latest state from the remote repository without modifying local files. This lets Noteriv know what has changed on the remote.

### 2. Pull with Rebase

```
git pull --rebase <remote> <branch>
```

Integrates remote changes into your local branch using rebase instead of merge. Rebasing replays your local commits on top of the remote changes, resulting in a cleaner linear history without merge commits.

### 3. Stash Protection

Before pulling, Noteriv checks for uncommitted local changes:

```
git status --porcelain
```

If there are uncommitted changes, they are stashed before the pull:

```
git stash push -m "noteriv-sync-stash"
```

After the pull completes, the stash is popped:

```
git stash pop
```

This prevents pull failures due to a dirty working tree and ensures that your in-progress edits are not lost during sync.

### 4. Stage All Changes

```
git add -A
```

Stages all new, modified, and deleted files. This includes everything in the vault directory except files excluded by `.gitignore`.

### 5. Commit

```
git commit -m "Sync notes 2026-03-20"
```

Creates a commit with a timestamped message. If there are no staged changes (everything is already committed), this step is skipped.

### 6. Push

```
git push -u <remote> <branch>
```

Pushes the commit(s) to the remote repository. The `-u` flag sets the upstream tracking reference.

The complete cycle -- fetch, pull, stash/pop, add, commit, push -- is designed to be idempotent. Running it when there are no changes is a no-op (the commit step is skipped and the push has nothing new to send).

## Authentication

Git operations that contact the remote (fetch, pull, push) require authentication. Noteriv handles this via a temporary `GIT_ASKPASS` script:

1. Before each authenticated git command, Noteriv writes a small shell script to a temp file that echoes the token.
2. The `GIT_ASKPASS` environment variable is set to point to this script.
3. `GIT_TERMINAL_PROMPT=0` is set to prevent interactive prompts.
4. The git command runs with these environment variables.
5. After the command completes (success or failure), the script file is deleted.

This approach avoids storing the token in git's credential manager, in the git config, or in any file that persists after the operation. The token exists on disk only for the duration of the git command.

On Windows, a `.bat` file is used instead of a shell script, with the same create-use-delete lifecycle.

## Auto-Sync

When auto-sync is enabled, Noteriv runs the full sync cycle every 5 seconds (configurable in Settings). The auto-sync timer:

1. Checks if a remote is configured.
2. Fetches the latest remote state.
3. Pulls if the local branch is behind.
4. Commits and pushes if there are local changes.

The interval is measured from the completion of one sync to the start of the next, so slow network operations do not cause overlapping syncs.

The auto-sync interval is configured in Settings > Sync > "Auto sync interval". Set it to 0 to disable interval-based auto-sync while keeping the sync-on-save behavior.

## Pull on Open

The "Pull on open" setting (enabled by default) triggers a `git pull` when you open a vault. This ensures you start with the latest version of your notes, especially useful if you edited on another device since your last session.

## Status Indicator

The sidebar displays the current branch name and a colored status dot: green (clean, up to date), yellow (uncommitted local changes), or blue (commits ahead of remote). Next to the dot, counts show the number of uncommitted changes, commits ahead, and commits behind. Status is refreshed every 30 seconds and immediately after each sync.

## Commit Messages

Automatic commits use the format `Sync notes YYYY-MM-DD`. The setup wizard's initial commit uses `Initial commit from Noteriv`. Custom commit messages are not currently supported through the UI.

## Merge Conflicts

If the same file was modified both locally and on the remote, and the changes overlap, git will insert conflict markers:

```
<<<<<<< HEAD
Your local version of the line
=======
The remote version of the line
>>>>>>> origin/main
```

Noteriv does not have a visual merge conflict resolver. To fix a conflict:

1. Open the affected file in the editor.
2. Find the `<<<<<<<`, `=======`, and `>>>>>>>` markers.
3. Edit the file to keep the content you want and remove the markers.
4. Save the file.
5. The next sync cycle will commit the resolved version and push it.

## .gitignore

When Noteriv initializes a new git repository, it creates a `.gitignore` with defaults: `.DS_Store`, `Thumbs.db`, `.trash/`, and `*.tmp`. Edit this file to add exclusions like `node_modules/`, `*.log`, or large binary files.

## Security

Tokens are never stored in the git config or credential helper -- only in the temporary askpass script, which is deleted immediately after each command. Each git command has a 60-second timeout (30 seconds for non-authenticated commands). Remote URLs are stored in `.noteriv/`, which is excluded from git commits.

## Troubleshooting

| Problem | Solution |
|---|---|
| "git: command not found" | Install git and ensure it is on your PATH. |
| "Authentication failed" | Regenerate your token with `repo` scope. Check that the remote URL uses HTTPS. |
| "Permission denied" | Ensure your token has write access to the repository. |
| "Merge conflict" | Open the file, resolve the conflict markers, save, and sync again. |
| "Sync timeout" | Check your network connection. Increase the timeout if needed. |
| "Nothing to push" | This is normal -- it means your local and remote are already in sync. |

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+G` | Trigger sync now (fetch + pull + commit + push) |
| `Ctrl+S` | Save file (triggers sync if "Auto-sync on save" is enabled) |
