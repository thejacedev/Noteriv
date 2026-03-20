---
title: Search
order: 7
---

# Search

Noteriv provides two search tools: Quick Open for finding files by name, and Vault Search for finding text across all files. Both are keyboard-driven and designed to get you to the right note in a few keystrokes.

## Quick Open

Quick Open is a fuzzy file finder. Press `Ctrl+P` (or `Cmd+P` on macOS) to open it.

### How It Works

When Quick Open activates, it loads a list of every file in your vault. As you type, the list filters in real time, matching your query against both the filename and the relative path. Matching is case-insensitive and substring-based: typing `meet` will match `Meeting-Notes.md`, `team-meeting.md`, and `notes/meetings/standup.md`.

The list shows up to 50 results at a time, sorted by relevance. When the query is empty, the first 50 files are displayed by default.

### Navigation

| Key | Action |
|---|---|
| Type | Filter the file list |
| `Up` / `Down` | Move the selection highlight |
| `Enter` | Open the selected file |
| `Esc` | Close Quick Open |
| Click | Open the clicked file |

Hovering over a result with the mouse moves the selection highlight to that item.

### Display

Each result shows two pieces of information:

- **File name.** The basename of the file, displayed in the primary text style.
- **Relative path.** The full path from the vault root (without the `.md` extension), displayed in a smaller, muted style below the name. This helps you distinguish between files with the same name in different folders.

### When to Use

Use Quick Open when you know (or approximately know) the name of the file you want to open. It is faster than navigating the folder tree for deep directory structures.

## Vault Search

Vault Search is a full-text search across every file in your vault. Press `Ctrl+Shift+F` (or `Cmd+Shift+F` on macOS) to open it.

### How It Works

When you type a query, Noteriv sends it to the backend, which scans every `.md` file in the vault for lines containing the query string. Matching is case-insensitive. Results are returned as a list of matches, each with the file path, line number, and the text of the matching line.

Search is debounced: Noteriv waits 200 milliseconds after you stop typing before executing the search. This prevents unnecessary work while you are still composing your query and keeps the UI responsive.

### Display

Each result shows:

- **File name** (without extension) and **line number**, formatted as `filename:42`.
- **Matching text.** The full text of the line, with the matching portion highlighted in a distinct color so it stands out visually.

A spinner appears next to the search input while a search is in progress.

### Navigation

| Key | Action |
|---|---|
| Type | Update the search query (debounced) |
| `Up` / `Down` | Move the selection highlight |
| `Enter` | Open the file at the selected result |
| `Esc` | Close Vault Search |
| Click | Open the file at the clicked result |

Hovering over a result with the mouse moves the selection highlight.

### When to Use

Use Vault Search when you need to find specific text, a phrase, or a pattern across your vault. Typical use cases:

- Finding every note that mentions a person, project, or concept.
- Locating a code snippet or configuration value you wrote down somewhere.
- Searching for a tag (e.g., `#urgent`) across the vault without opening the tag pane.
- Verifying that a piece of information exists before creating a new note about it.

## Differences Between Quick Open and Vault Search

| | Quick Open | Vault Search |
|---|---|---|
| Shortcut | `Ctrl+P` | `Ctrl+Shift+F` |
| Searches | File names and paths | File contents (full text) |
| Results | File entries | Lines within files |
| Line numbers | No | Yes |
| Highlight | No | Yes (matched text) |
| Debounce | No (instant filter) | Yes (200ms) |
| Use case | Navigate to a known file | Find text anywhere in the vault |

## Find in File

For searching within the currently open file, use `Ctrl+F` (Find in File). This activates CodeMirror's built-in search bar at the top of the editor, which supports:

- Case-sensitive and case-insensitive search.
- Regular expression search.
- Find and replace.
- Next/previous match navigation.

Find in File is separate from Quick Open and Vault Search. It operates only on the currently visible document.

## Search and the Command Palette

The [Command Palette](./command-palette.md) (`Ctrl+Shift+P`) also functions as a search tool, but for commands rather than files or content. If you are looking for an action (e.g., "Export as PDF", "Toggle Lint"), use the command palette. If you are looking for a note or text, use Quick Open or Vault Search.

## Tips

- **Start with Quick Open.** If you know the file name, `Ctrl+P` is almost always faster than Vault Search.
- **Use Vault Search for discovery.** When you are unsure which file contains something, or you want to see all occurrences, full-text search is the right tool.
- **Check line numbers.** Vault Search results include line numbers, which helps you jump to the exact location once you open the file.
- **Combine with wiki-links.** After finding a related note via search, add a `[[wiki-link]]` to it from your current note so you do not have to search for it again.
- **Search for tags.** Typing `#project` in Vault Search shows every line where that tag appears, which can be more informative than the tag pane's aggregated count.
