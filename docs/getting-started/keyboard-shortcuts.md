---
title: Keyboard Shortcuts
order: 6
---

# Keyboard Shortcuts

Noteriv has over 70 keyboard shortcuts covering file management, navigation, editing, formatting, views, sync, and more. All shortcuts are customizable -- you can rebind any action to a different key combination in Settings.

On macOS, `Ctrl` is replaced by `Cmd` throughout.

## Customizing shortcuts

All shortcuts can be changed in Settings (`Ctrl+,`). Navigate to the Hotkeys section to see every action and its current binding. Click on a shortcut to record a new key combination. Changes take effect immediately and persist across sessions.

If you rebind a shortcut, the command palette and this documentation will reflect your custom binding. To reset a shortcut to its default, clear the binding in Settings.

## File

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save the current file |
| `Ctrl+Shift+S` | Save as (save to a new location) |
| `Ctrl+N` | Create a new file |
| `Ctrl+Shift+N` | Create a new folder |
| `Ctrl+O` | Open a file from disk |
| `Ctrl+W` | Close the current tab |
| `Ctrl+Shift+W` | Close all tabs |
| `Ctrl+Shift+B` | Toggle bookmark on the current note |
| `Ctrl+Shift+T` | Pin or unpin the current tab |

### File management details

**Save** writes the current editor content to disk. If auto-save is enabled in Settings, files are saved automatically at the configured interval, but `Ctrl+S` lets you save immediately at any time. If GitHub sync with "sync on save" is enabled, saving also triggers a push to the remote repository.

**Close tab** closes the active tab. If the file has unsaved changes, you are prompted to save or discard them. Pinned tabs are protected from close operations -- you must unpin them first, or use `Ctrl+W` directly on the pinned tab.

**Bookmark** adds the current note to your bookmarks panel for quick access. Press the same shortcut again to remove the bookmark. Bookmarked notes appear in the bookmarks panel in the sidebar.

**Pin tab** prevents a tab from being closed by "Close All Tabs" or "Close Other Tabs". Pinned tabs are sorted to the left end of the tab bar and persist across sessions.

## Navigation

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick open (fuzzy file search) |
| `Ctrl+Shift+P` | Open the command palette |
| `Ctrl+Tab` | Switch to the next tab |
| `Ctrl+Shift+Tab` | Switch to the previous tab |
| `Ctrl+D` | Open today's daily note |
| `Ctrl+Shift+R` | Open a random note |

### Navigation details

**Quick open** is a fuzzy file finder that searches across all notes in your vault. Start typing any part of a filename to filter results. It matches against the full file path, so you can type folder names to narrow results. Press Enter to open the selected file.

**Command palette** lists every available action in Noteriv, organized by category (File, Navigation, Search, View, Edit, Formatting, Sync). Each entry shows its keyboard shortcut if one is assigned. Start typing to filter commands. Recently used commands appear at the top of the list when the search field is empty, putting your most frequent actions within easy reach.

**Daily note** opens (or creates) a note for today's date. The note is named with the current date (e.g., `2026-03-20.md`) and placed in the root of your vault or in a configured daily notes folder.

**Random note** opens a randomly selected note from your vault. This is useful for rediscovering forgotten ideas or reviewing old notes.

## Search

| Shortcut | Action |
|---|---|
| `Ctrl+F` | Find in the current file |
| `Ctrl+Shift+F` | Search across all notes in the vault |

**Find in file** opens a search bar within the editor for searching and replacing text in the current note. Supports case-sensitive and regex search.

**Find in vault** opens a full-text search dialog that searches across every note in your vault. Results show the matching line with context. Click a result to open the file and jump to the match.

## View

| Shortcut | Action |
|---|---|
| `Ctrl+E` | Toggle view mode (cycles: live, source, view) |
| `Ctrl+B` | Toggle the sidebar |
| `Ctrl+G` | Open the graph view |
| `Ctrl+Shift+O` | Toggle the outline panel |
| `Ctrl+Shift+D` | Toggle focus mode |
| `Ctrl+Shift+E` | Toggle zen mode |
| `Ctrl+\` | Split editor (open second pane) |
| `Ctrl+Shift+\` | Close split editor |
| `Ctrl+Shift+L` | Toggle lint warnings |
| `F11` | Toggle fullscreen |
| `Ctrl+,` | Open Settings |

### View mode details

**Toggle view mode** cycles through the three editor modes:

1. **Live** -- Markdown is rendered inline as you type. This is the default mode and gives you a WYSIWYG-like experience while still editing markdown.
2. **Source** -- Raw markdown with syntax highlighting. All markdown syntax characters are visible. Best for precise formatting control.
3. **View** -- Read-only rendered output. The editor cursor is hidden and the content cannot be edited. Best for reading and reviewing.

**Focus mode** dims all lines in the editor except the one containing your cursor. This creates a spotlight effect that helps you concentrate on the sentence you are currently writing. The surrounding context is still visible but at reduced opacity.

**Zen mode** hides the title bar, sidebar, and status bar, leaving only the editor in a centered column. Combined with focus mode, this provides a completely distraction-free writing environment.

**Graph view** opens an interactive force-directed graph that visualizes the connections between your notes through wiki-links. Notes appear as nodes, and links appear as edges. Click a node to open that note. The graph updates in real time as you add or remove links.

**Outline panel** shows a table of contents generated from the headings in the current note. Click any heading to scroll to it. The outline updates as you edit.

**Split editor** divides the editor area into two side-by-side panes. Each pane can show a different file, letting you reference one note while writing another.

**Lint warnings** shows or hides inline lint markers in the editor. Lint rules check for common markdown issues like broken wiki-links, inconsistent heading levels, and unclosed code blocks.

## Edit

| Shortcut | Action |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+T` | Insert a template |

**Insert template** opens the template picker, which lists all template files in your vault. Select a template to insert its contents at the cursor position. Templates support variables like `{{date}}`, `{{time}}`, `{{title}}`, and more, which are replaced with actual values when inserted.

## Formatting

| Shortcut | Action |
|---|---|
| `Ctrl+I` | Toggle italic on selected text |
| `Ctrl+K` | Insert a link |
| `Ctrl+`` ` | Toggle inline code on selected text |

### Formatting details

**Italic** wraps the selected text in `*asterisks*` (or removes them if already italic). If no text is selected, it inserts a pair of asterisks and places the cursor between them.

**Insert link** wraps the selected text in markdown link syntax `[text](url)`. If no text is selected, it inserts the link template and places the cursor in the URL position.

**Inline code** wraps the selected text in backticks (or removes them if already wrapped). Useful for marking up code references, variable names, or commands inline.

Additional formatting commands are available through the formatting toolbar at the top of the editor and through the command palette. These include bold, strikethrough, headings, images, horizontal rules, code blocks, blockquotes, task lists, and tables. You can bind keyboard shortcuts to any of these from Settings.

## Sync

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+G` | Sync now (push and pull with GitHub) |

**Sync now** triggers an immediate git sync operation. It pulls any remote changes first, then pushes your local changes. The sync status is shown in the status bar. If there are conflicts, Noteriv notifies you so you can resolve them.

Sync also happens automatically in the background if auto-sync is enabled in Settings. The default interval is every 5 minutes, but you can set it to 1, 5, 10, or 30 minutes, or disable it entirely.

## All shortcuts at a glance

Here is every default shortcut in a single table, sorted by category:

| Category | Action | Default Shortcut |
|---|---|---|
| File | Save | `Ctrl+S` |
| File | Save As | `Ctrl+Shift+S` |
| File | New File | `Ctrl+N` |
| File | New Folder | `Ctrl+Shift+N` |
| File | Open File | `Ctrl+O` |
| File | Close Tab | `Ctrl+W` |
| File | Close All Tabs | `Ctrl+Shift+W` |
| File | Toggle Bookmark | `Ctrl+Shift+B` |
| File | Pin/Unpin Tab | `Ctrl+Shift+T` |
| Navigation | Quick Open | `Ctrl+P` |
| Navigation | Command Palette | `Ctrl+Shift+P` |
| Navigation | Next Tab | `Ctrl+Tab` |
| Navigation | Previous Tab | `Ctrl+Shift+Tab` |
| Navigation | Open Daily Note | `Ctrl+D` |
| Navigation | Open Random Note | `Ctrl+Shift+R` |
| Search | Find in File | `Ctrl+F` |
| Search | Find in Vault | `Ctrl+Shift+F` |
| View | Toggle View Mode | `Ctrl+E` |
| View | Toggle Sidebar | `Ctrl+B` |
| View | Graph View | `Ctrl+G` |
| View | Toggle Outline | `Ctrl+Shift+O` |
| View | Toggle Focus Mode | `Ctrl+Shift+D` |
| View | Zen Mode | `Ctrl+Shift+E` |
| View | Split Editor | `Ctrl+\` |
| View | Close Split | `Ctrl+Shift+\` |
| View | Toggle Lint | `Ctrl+Shift+L` |
| View | Toggle Fullscreen | `F11` |
| View | Settings | `Ctrl+,` |
| Edit | Undo | `Ctrl+Z` |
| Edit | Redo | `Ctrl+Shift+Z` |
| Edit | Insert Template | `Ctrl+T` |
| Formatting | Italic | `Ctrl+I` |
| Formatting | Inline Code | `Ctrl+`` ` |
| Formatting | Insert Link | `Ctrl+K` |
| Sync | Sync Now | `Ctrl+Shift+G` |

## Commands without default shortcuts

Many commands do not have a default keyboard shortcut but can be accessed through the command palette (`Ctrl+Shift+P`) or assigned a shortcut in Settings:

| Action | Description |
|---|---|
| Close Other Tabs | Close all tabs except the active one |
| Delete File | Delete the current file |
| Bold | Toggle bold formatting |
| Strikethrough | Toggle strikethrough formatting |
| Insert Image | Insert an image reference |
| Horizontal Rule | Insert a `---` separator |
| Code Block | Insert a fenced code block |
| Blockquote | Insert a blockquote |
| Task List | Insert a task list |
| Insert Table | Insert a markdown table |
| Toggle Backlinks | Show or hide the backlinks panel |
| Toggle Tag Pane | Show or hide the tag pane |
| Note Composer | Open the note merge/split tool |
| File Recovery | Browse and restore file snapshots |
| Export as PDF | Export the current note to PDF |
| Audio Recorder | Start the built-in audio recorder |
| Attachment Manager | Browse vault attachments |
| Start Presentation | Present the current note as slides |
| Plugin Manager | Browse and manage plugins |
| CSS Snippets | Manage CSS snippets |
| Calendar View | Open the month calendar |
| New Board | Create a new board file |
| New Drawing | Create a new drawing file |
| Insert TOC | Insert a table of contents |
| Update TOC | Refresh an existing table of contents |
| Insert Dataview | Insert a dataview query block |
| Publish as HTML | Export the note as a standalone web page |
| Flashcard Review | Start a spaced repetition review session |
| Live Collaboration | Start or join a co-editing session |
| New Canvas | Create a new canvas/whiteboard |
| Open PDF | Open a PDF file with annotation tools |
| Export PDF Annotations | Export annotations to markdown |
| Open Trash | Browse and restore deleted notes |
| Note History | View the change history for the current note |

To bind any of these to a keyboard shortcut, open Settings (`Ctrl+,`), go to the Hotkeys section, find the action, and press the key combination you want to assign.
