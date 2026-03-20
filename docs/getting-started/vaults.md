---
title: Vaults
order: 4
---

# Vaults

A vault is the fundamental organizational unit in Noteriv. Understanding how vaults work will help you structure your notes effectively, whether you keep everything in one place or spread your work across several focused workspaces.

## What is a vault?

A vault is a folder on your filesystem that Noteriv treats as a self-contained workspace. Everything inside that folder -- markdown files, subfolders, images, attachments, drawings, canvases -- belongs to that vault. When you open a vault in Noteriv, the sidebar shows its file tree, the search indexes its contents, the graph view maps its links, and sync operates on its files.

There is nothing special about the folder itself. It is a regular directory that you can browse in your file manager, open in a terminal, or process with other tools. Noteriv stores its own configuration (plugins, themes, CSS snippets, trash) in a `.noteriv/` subdirectory inside the vault, but your notes are plain `.md` files at the top level and in whatever subfolder structure you create.

## Vault configuration storage

Noteriv uses `electron-store` (on desktop) and `AsyncStorage` (on mobile) to keep track of your vaults. This configuration includes:

- **Vault metadata** -- Each vault has an ID, a display name, and the absolute path to its folder on disk.
- **Git remote** -- If you connected GitHub sync, the remote URL is stored alongside the vault.
- **Auto-sync setting** -- Whether the vault should automatically sync changes.
- **Active vault** -- Which vault was last open, so Noteriv can restore it on launch.

This configuration is stored outside the vault folder itself, in the standard application data directory for your OS:

| Platform | Config location |
|---|---|
| Linux | `~/.config/noteriv/` |
| Windows | `%APPDATA%/noteriv/` |
| macOS | `~/Library/Application Support/noteriv/` |

The vault folder only contains your notes and the `.noteriv/` directory for vault-specific customization (plugins, themes, snippets, trash).

## Creating a vault

You can create a new vault in two ways:

### During first launch

The setup wizard walks you through creating your first vault. See the [Quickstart](quickstart.md) guide for a detailed walkthrough.

### From the vault switcher

After your first vault is set up, you can create additional vaults at any time:

1. Click the vault name in the top-left corner of the sidebar to open the vault switcher dropdown.
2. Click **New vault** at the bottom of the dropdown.
3. The setup wizard opens again, letting you name the new vault, pick its location, and optionally connect GitHub sync.

You can also create a vault from an existing folder that already contains markdown files. Choose "Open folder" in the wizard and point it to your existing notes directory. Noteriv indexes the folder and displays all your files immediately.

## Switching between vaults

Click the vault name in the sidebar to open the vault switcher. It shows all your vaults with their names and file paths. Click any vault to switch to it. Noteriv saves the state of your current vault (open tabs, sidebar expansion, scroll position) and restores the state of the vault you switch to.

You can also switch vaults from the command palette (`Ctrl+Shift+P`) by searching for the vault name.

Each vault is independent. Switching vaults changes the entire workspace: the file tree, open tabs, search scope, graph view, sync configuration, and installed plugins all switch to the new vault's state.

## Multiple vaults for different projects

Using multiple vaults is a good way to keep different areas of your life separated:

- **Personal** -- Journal entries, reading notes, personal projects, life admin.
- **Work** -- Meeting notes, project documentation, task tracking, team knowledge base.
- **Research** -- Academic papers, literature reviews, experiment logs, thesis drafts.
- **Learning** -- Course notes, flashcards, study guides, tutorial walkthroughs.

Each vault can have its own sync setup. Your work vault might sync to a company GitHub repository, your personal vault might sync to a private repo, and your research vault might not sync at all.

Each vault can also have different plugins, themes, and CSS snippets enabled. Your work vault might have a clean, minimal theme while your personal vault uses a more colorful one.

## Vault contents

A typical vault might look like this on disk:

```
My Notes/
├── .noteriv/              Noteriv configuration (auto-created)
│   ├── plugins/           Installed plugins
│   ├── themes/            Custom themes
│   ├── snippets/          CSS snippets
│   └── trash/             Soft-deleted notes (restorable)
├── Daily/                 Daily notes folder
│   ├── 2026-03-18.md
│   ├── 2026-03-19.md
│   └── 2026-03-20.md
├── Projects/              Project notes
│   ├── Project Alpha/
│   │   ├── overview.md
│   │   └── tasks.md
│   └── Project Beta/
│       └── notes.md
├── Templates/             Note templates
│   ├── meeting.md
│   └── journal.md
├── welcome.md
└── ideas.md
```

All of this is standard files and folders. You can create, rename, move, and delete them from within Noteriv or from your file manager. If you modify files externally (from another editor, from the MCP server, or from a git pull), Noteriv's vault file watcher detects the changes and automatically refreshes the sidebar and any open files.

## Managing vault files

Inside a vault, you can organize your notes however you like:

- **Create files** with `Ctrl+N` or by right-clicking in the sidebar.
- **Create folders** with `Ctrl+Shift+N` or by right-clicking in the sidebar.
- **Rename** files and folders by right-clicking and selecting "Rename" or by pressing F2.
- **Move** files by dragging them in the sidebar from one folder to another.
- **Reorder** files within a folder by dragging them up or down. The custom order is saved per-vault.
- **Delete** files by right-clicking and selecting "Delete" or "Move to Trash". Soft-deleted files go to `.noteriv/trash/` and can be restored from the Trash panel.
- **Multi-select** files with `Ctrl+Click` (toggle individual files) or `Shift+Click` (select a range). Then right-click to merge, delete, or move the selection in bulk.

## Deleting a vault

To remove a vault from Noteriv:

1. Open the vault switcher by clicking the vault name.
2. Hover over the vault you want to remove and click the X button.
3. Confirm the deletion.

Deleting a vault from Noteriv removes it from the app's configuration only. **Your files are not deleted.** The folder and all its contents remain on disk. You can re-add the folder as a vault at any time by creating a new vault and choosing "Open folder".

You need at least one vault, so you cannot delete the last remaining vault. If you want to start over, create a new vault first, then delete the old one.

## Git sync per vault

Each vault can have its own GitHub sync configuration:

- **Git remote** -- The GitHub repository URL for this vault.
- **Auto-sync** -- Whether to automatically push changes at a regular interval.
- **Sync on save** -- Whether to push immediately after every manual save.
- **Pull on open** -- Whether to pull the latest changes when opening the vault.

You can manage a vault's git settings from the vault switcher by clicking the git icon next to a vault that has a remote configured.

## Vault-specific customization

Each vault stores its own customizations in the `.noteriv/` directory:

- **Plugins** -- Installed plugins live in `.noteriv/plugins/<plugin-id>/`. Each plugin has a `manifest.json` and a `main.js`. You can enable or disable plugins per vault.
- **Themes** -- Custom themes live in `.noteriv/themes/`. Install community themes from the Theme Picker or create your own.
- **CSS Snippets** -- Custom CSS files live in `.noteriv/snippets/`. Toggle them individually to fine-tune the editor and preview appearance.
- **Trash** -- Soft-deleted notes live in `.noteriv/trash/` with metadata for restoration. Open the Trash panel to browse and restore deleted notes.

## Tips for vault organization

- **Start simple.** Do not over-engineer your folder structure upfront. Start with a flat list of notes and organize into folders as patterns emerge.
- **Use wiki-links liberally.** Linking notes together with `[[double brackets]]` is more powerful than folder hierarchy for discovering connections. The graph view and backlinks panel help you navigate these connections.
- **Use tags for cross-cutting categories.** Folders enforce a single hierarchy. Tags like `#project/alpha` and `#status/in-progress` let you categorize notes along multiple dimensions.
- **Keep templates in a dedicated folder.** When you use `Ctrl+T` to insert a template, Noteriv looks for files in a Templates folder.
- **Let daily notes accumulate.** Daily notes in a `Daily/` folder serve as a chronological log. Use the calendar view to browse them by date.
