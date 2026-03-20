---
title: Features
order: 1
---

# Features

Noteriv ships with a full set of tools for writing, organizing, and querying your notes. Every feature works on local Markdown files inside your vault, so your data stays yours whether you sync it with Git, a cloud drive, or not at all.

This section covers each major feature in detail. If you are new to Noteriv, reading through this list will give you a clear picture of what is available and how the pieces fit together.

## Linking and Discovery

### [Wiki-Links](./wiki-links.md)

Connect your notes with `[[double bracket]]` links. Noteriv resolves links by filename (case-insensitive), supports display text aliases and heading anchors, and provides a backlinks panel that shows every note pointing at the one you are reading.

### [Tags](./tags.md)

Mark notes with `#tag` syntax anywhere in the body. Tags can be hierarchical (`#project/alpha`) and are aggregated in a dedicated tag pane with note counts, filtering, and expand/collapse controls.

### [Backlinks](./wiki-links.md#backlinks-panel)

The backlinks panel scans your entire vault in real time and lists every note that contains a wiki-link to the file you have open. Results are grouped by source file, with line numbers and text snippets.

## Daily Workflow

### [Daily Notes](./daily-notes.md)

Press `Ctrl+D` to open or create today's note. Daily notes are named with the `YYYY-MM-DD.md` format and stored in a `DailyNotes/` folder if one exists, otherwise in the vault root. A calendar view shows dots on days that have daily notes.

### [Templates](./templates.md)

Create notes from reusable templates stored in a `Templates/` folder. Variables like `{{date}}`, `{{time}}`, and `{{title}}` are expanded on insertion. Open the template picker with `Ctrl+T`.

### [Bookmarks](./bookmarks.md)

Pin frequently used notes so they appear in a dedicated bookmarks panel in the sidebar. Toggle a bookmark on the current file with `Ctrl+Shift+B`.

## Finding Things

### [Search](./search.md)

Two search tools: Quick Open (`Ctrl+P`) for fuzzy filename lookup, and Vault Search (`Ctrl+Shift+F`) for full-text search across every note in the vault. Results include line numbers and highlighted matches.

### [Command Palette](./command-palette.md)

Press `Ctrl+Shift+P` to open a searchable list of every available command. The palette remembers recently used commands and shows keyboard shortcuts next to each entry.

## History and Recovery

### [File Recovery](./file-recovery.md)

Automatic local snapshots are saved before every write, up to 50 per file. A recovery screen shows a timeline of snapshots with preview and one-click restore. No external service required.

### [Note History](./note-history.md)

Git-based version history for individual files. View a commit timeline, read the content at any past commit, and diff between versions. Requires your vault to be a Git repository with sync enabled.

## Restructuring

### [Note Composer](./note-composer.md)

Merge multiple notes into one or split a note into separate files at heading boundaries. Accessible from the command palette or the editor menu.

### [Multi-Select](./multi-select.md)

Select multiple files in the sidebar with `Ctrl+Click` and `Shift+Click`. Right-click the selection for bulk operations: merge, delete, or drag all selected files into a folder.

## Study and Review

### [Flashcards](./flashcards.md)

Spaced repetition built into the editor. Define `Q:/A:` pairs or `{{cloze}}` deletions inside your notes and review them with the SM-2 scheduling algorithm. Progress is saved locally in the vault.

## Querying

### [Dataview](./dataview.md)

Query your vault like a database using `dataview` code blocks. Build tables, lists, and task views filtered by tags, folders, or frontmatter fields. Results render live in the editor.

## Quality

### [Lint](./lint.md)

A markdown linting panel checks for broken wiki-links, empty headings, duplicate headings, unclosed code blocks, broken images, duplicate tags, and missing H1 headings. Toggle the panel with `Ctrl+Shift+L`.

## Keyboard Shortcuts at a Glance

| Action | Shortcut |
|---|---|
| Quick Open | `Ctrl+P` |
| Command Palette | `Ctrl+Shift+P` |
| Vault Search | `Ctrl+Shift+F` |
| Daily Note | `Ctrl+D` |
| Insert Template | `Ctrl+T` |
| Toggle Bookmark | `Ctrl+Shift+B` |
| Toggle Lint | `Ctrl+Shift+L` |
| Save | `Ctrl+S` |
| New File | `Ctrl+N` |
| Graph View | `Ctrl+G` |
| Git Sync | `Ctrl+Shift+G` |
| Toggle Sidebar | `Ctrl+B` |
| Toggle Outline | `Ctrl+Shift+O` |
| Toggle View Mode | `Ctrl+E` |
| Random Note | `Ctrl+Shift+R` |

On macOS, replace `Ctrl` with `Cmd` throughout.
