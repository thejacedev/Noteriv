---
title: Features
order: 1
---

# Features

Noteriv ships with a full set of tools for writing, organizing, and querying your notes. Every feature works on local Markdown files inside your vault, so your data stays yours whether you sync it with Git, a cloud drive, or not at all.

This section covers each major feature in detail. If you are new to Noteriv, reading through this list will give you a clear picture of what is available and how the pieces fit together.

## Linking and Discovery

### [Wiki-Links](./wiki-links.md)

Connect your notes with `[[double bracket]]` links. Noteriv resolves links by filename (case-insensitive) or by an alias listed in the note's frontmatter, supports display text and heading anchors, and embeds notes, images, sound, video and PDFs with `![[...]]`.

### [Tags](./tags.md)

Mark notes with `#tag` syntax anywhere in the body. Tags can be hierarchical (`#project/alpha`) and are aggregated in a dedicated tag pane with note counts, filtering, and expand/collapse controls.

### [Links Panel](./wiki-links.md#links-panel)

The links panel shows how the open note is connected: the notes that link to it, the notes that mention it by name without linking, the notes it links to, and the places in it where another note is named without a link. Results come with line numbers and text snippets, and a mention can be turned into a link with one click.

## Daily Workflow

### [Daily Notes](./daily-notes.md)

Press `Ctrl+D` to open or create today's note. Daily notes are named with the `YYYY-MM-DD.md` format and stored in a `DailyNotes/` folder if one exists, otherwise in the vault root. A calendar view shows dots on days that have daily notes.

### [Templates](./templates.md)

Create notes from reusable templates stored in a `Templates/` folder. Variables like `{{date}}`, `{{time}}`, and `{{title}}` are expanded on insertion. Open the template picker with `Ctrl+T`.

### [Bookmarks](./bookmarks.md)

Bookmark notes, folders, searches and headings so they appear in a dedicated bookmarks panel, and sort them into groups. Toggle a bookmark on the current file with `Ctrl+Shift+B`.

## Finding Things

### [Search](./search.md)

Two search tools: Quick Open (`Ctrl+P`) for finding a file by name or alias, and Vault Search (`Ctrl+Shift+F`) for full-text search across every note in the vault. Vault Search has a query language with operators such as `tag:`, `path:` and `line:()`, regular expressions and sorting. Results include line numbers and highlighted matches, and a `query` code block shows a search inside a note.

### [Command Palette](./command-palette.md)

Press `Ctrl+Shift+P` to open a searchable list of every available command. The palette remembers recently used commands, shows keyboard shortcuts next to each entry, and lets you pin commands to the top.

## Files

### [File List](./file-list.md)

Sort the file list by name, modified time or created time, or keep your own order. Jump to the open note in the list, and close all folders at once.

### [File Settings](./file-settings.md)

Choose where new notes go, which folder the Attachment Manager uses, which files are left out of search and suggestions, and whether deleted files go to Noteriv's trash or the system trash. Also covers unique notes, which are named by the date and time.

## Writing

### [Footnotes](./footnotes.md)

Numbered footnotes, inline footnotes written as `^[text]`, and a panel that lists the footnotes of the open note and jumps to each one.

### [Properties](./properties.md)

Edit a note's frontmatter as typed values above the note: text, list, number, checkbox, date, and date and time. A property's type is kept for the whole vault, and a panel lists every property in the vault with the number of notes that use it.

## Windows and Layouts

### [Workspace Layouts](./workspaces.md)

Save the open notes, the split, the file list and the side panels under a name, and bring them back later.

### [Pop-Out Windows](./pop-out-windows.md)

Open a note in a small window of its own, next to the main window.

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

### [Intelligent Knowledge Base](./intelligent-knowledge-base.md)

Ingest text, Markdown, notes, or an editor selection into a local, review-first knowledge workflow. Noteriv finds related notes, proposes wiki-links and flashcards, shows diffs, and verifies that an existing note has not changed before applying an approved update.

### [Flashcards](./flashcards.md)

Spaced repetition built into the editor. Define `Q:/A:` pairs or `{{cloze}}` deletions inside your notes and review them with the SM-2 scheduling algorithm. Progress is saved locally in the vault.

## Querying

### [Dataview](./dataview.md)

Query your vault like a database using `dataview` code blocks. Build tables, lists, and task views filtered by tags, folders, or frontmatter fields. Results render live in the editor.

### [Bases](../views/bases.md)

A `.base` file shows the files of the vault as a table, cards or a list, with filters, formulas, sorting, grouping and summaries. Bases are written as YAML text and can also be shown inside a note.

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
