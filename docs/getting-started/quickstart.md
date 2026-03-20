---
title: Quickstart
order: 3
---

# Quickstart

This guide walks you through your first five minutes with Noteriv: running the setup wizard, creating a vault, optionally connecting GitHub sync, and writing your first note.

## First launch: the setup wizard

When you open Noteriv for the first time, the setup wizard appears. It guides you through creating your first vault in four steps.

### Step 1: Choose how to start

The wizard presents three options:

- **New vault** -- Start fresh with an empty folder. This is the right choice for most new users.
- **Open folder** -- Use an existing folder that already contains markdown notes. Noteriv will index the folder and display your files in the sidebar immediately.
- **Clone from GitHub** -- Pull notes from a GitHub repository. Choose this if you already have a notes vault stored in a repo and want to sync it with Noteriv.

Click the option that fits your situation.

### Step 2: Name your vault

Give your vault a name. This is a display name used inside Noteriv -- it does not affect the folder name on disk, though it is used as a suggestion. Pick something descriptive like "Personal", "Work", "Research", or "Journal".

Type a name and press Enter or click Continue.

### Step 3: Pick a location

Choose where your vault folder will live on your filesystem.

- For a **new vault**, you can pick a parent directory or leave it blank to use the default location (`~/Noteriv/<vault-name>` on Linux/macOS, `%USERPROFILE%\Noteriv\<vault-name>` on Windows). Noteriv creates the folder for you.
- For an **existing folder**, click the folder picker and navigate to the directory that contains your notes.
- For a **clone**, pick the parent directory where the repository will be cloned into.

### Step 4: Connect GitHub (optional)

This step lets you set up GitHub sync. If you do not want cloud sync right now, click **Create Vault** or **Skip** to finish without it. You can always configure sync later in Settings.

If you do want GitHub sync:

1. Click **Connect GitHub**.
2. You need a GitHub Personal Access Token (PAT) with the `repo` scope. Click "Generate on GitHub" to open the token creation page in your browser.
3. Paste your token into the input field and click **Connect**. Noteriv validates the token, shows your GitHub username and avatar, and loads your repositories.
4. Your token is encrypted and stored locally using your operating system's keychain. It is never sent anywhere except to GitHub's API.

After connecting, you can enable **Auto-sync on save**, which pushes changes to GitHub every time you save a file.

### Step 5: Pick a repository

If you connected GitHub, the wizard shows a repository picker:

- **Create new repo** -- Enter a name for a new GitHub repository. You can make it private (recommended for personal notes). Noteriv creates the repo on your behalf.
- **Select existing repo** -- Browse your GitHub repositories and pick one. If you chose "Clone from GitHub" in step 1, the repo will be cloned to your chosen location.

Click **Create Vault** (or **Clone & Create** for clone setups) and Noteriv sets everything up. After a moment, the main editor opens and you are ready to go.

## Creating your first note

With your vault open, you can create a note in several ways:

- Press `Ctrl+N` (or `Cmd+N` on macOS) to create a new file.
- Click the new file icon at the top of the sidebar.
- Right-click in the sidebar and select "New File".

A new untitled note opens in the editor. Type a filename when prompted (the `.md` extension is added automatically if you omit it), then start writing.

Try typing some markdown:

```markdown
# My First Note

Welcome to Noteriv. This is **bold text** and this is *italic text*.

## A list of things

- Item one
- Item two
- Item three

## A task list

- [ ] Learn the shortcuts
- [ ] Try different view modes
- [ ] Connect GitHub sync

## A link to another note

Check out [[My Second Note]] for more ideas.
```

Press `Ctrl+S` to save. Your note is now a `.md` file in your vault folder.

## Switching between view modes

The editor supports three modes. You can switch between them using the view mode buttons in the title bar or by pressing `Ctrl+E`:

### Live mode

This is the default. As you type markdown, it renders inline. Headings appear as headings, bold text appears bold, links become clickable, code blocks get syntax highlighting, and math formulas render as formatted equations. You are editing and previewing at the same time.

### Source mode

Shows raw markdown text with syntax highlighting. Markdown syntax characters (like `**`, `#`, and `[[`) are visible and editable directly. This is useful when you need precise control over formatting, or when editing complex structures like tables or frontmatter.

### View mode

A clean, read-only rendered view. No editing cursor, no markdown syntax -- just the fully rendered content. Use this mode when you want to read or review a note without accidentally changing it.

You can also set a default view mode per file by right-clicking in the editor and selecting your preferred mode. This preference persists across sessions.

## Using the command palette

Press `Ctrl+Shift+P` to open the command palette. It lists every available action in Noteriv, organized by category. Start typing to filter the list -- you can search by command name, category, or action ID.

The command palette is the fastest way to discover features. If you are ever wondering "can Noteriv do X?", open the palette and search for it.

Recently used commands appear at the top when the search field is empty, so your most frequent actions are always within reach.

## Quick open

Press `Ctrl+P` to open the quick open dialog. Start typing a filename to fuzzy-search across all notes in your vault. Select a result to open it in a new tab. This is the fastest way to navigate between notes when your vault grows large.

## Creating folders

Organize your notes into folders:

- Press `Ctrl+Shift+N` to create a new folder.
- Or right-click in the sidebar and select "New Folder".

You can nest folders as deep as you like. Drag and drop files and folders in the sidebar to rearrange them.

## Daily notes

Press `Ctrl+D` to open today's daily note. If it does not exist yet, Noteriv creates it automatically with the current date as the filename (e.g., `2026-03-20.md`). Daily notes are a great way to keep a running journal, track tasks for the day, or capture quick thoughts.

## Setting up sync later

If you skipped GitHub sync during setup, you can configure it at any time:

1. Open Settings with `Ctrl+,`.
2. Go to the Sync section.
3. Enter your GitHub Personal Access Token and select a repository.
4. Configure sync options: auto-sync interval, sync on save, pull on open.

You can also set up alternative sync methods here:

- **Folder sync** -- Mirror your vault to a folder managed by Dropbox, Google Drive, OneDrive, or iCloud. Choose push, pull, or bidirectional sync.
- **WebDAV sync** -- Connect to a Nextcloud, ownCloud, or any WebDAV-compatible server. Enter the URL, credentials, and remote path.

## What to explore next

Now that you have a vault and your first note, here are some features worth trying:

- **Wiki-links** -- Type `[[` to link to other notes. Noteriv auto-completes note names as you type.
- **Tags** -- Add `#tag` or `#parent/child` tags to your notes. View all tags in the tag pane.
- **Graph view** -- Press `Ctrl+G` to see a visual map of how your notes connect through wiki-links.
- **Templates** -- Press `Ctrl+T` to insert a note template with variables like `{{date}}`, `{{time}}`, and `{{title}}`.
- **Bookmarks** -- Press `Ctrl+Shift+B` to bookmark the current note for quick access.
- **Split editor** -- Press `Ctrl+\` to open a second editor pane side by side.
- **Focus mode** -- Press `Ctrl+Shift+D` to dim everything except the line you are editing.
- **Zen mode** -- Press `Ctrl+Shift+E` to hide all UI chrome and focus purely on writing.

For a full list of keyboard shortcuts, see the [Keyboard Shortcuts](keyboard-shortcuts.md) guide. To understand the full UI layout, see the [Interface](interface.md) guide.
