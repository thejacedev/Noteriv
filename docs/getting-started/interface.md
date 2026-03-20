---
title: Interface
order: 5
---

# Interface

Noteriv's desktop interface is designed around a keyboard-driven workflow with a clean, distraction-free layout. Every element has a purpose, and most can be hidden when you need to focus on writing. This guide explains each part of the UI.

## Layout overview

The interface is divided into five main areas, arranged from top to bottom and left to right:

```
┌──────────────────────────────────────────────────────────┐
│  Title Bar (vault name, tabs, view mode, window controls)│
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  Sidebar   │              Editor Area                    │
│  (file     │         (markdown editor or                 │
│   tree,    │          special views)                     │
│   panels)  │                                             │
│            │                                             │
│            │                                             │
├────────────┴─────────────────────────────────────────────┤
│  Status Bar (word count, file info, sync status)         │
└──────────────────────────────────────────────────────────┘
```

## Title bar

The title bar runs across the top of the window and contains three functional areas: the vault switcher, the tab bar, and the control buttons.

### Vault switcher

In the top-left corner, the current vault name is displayed. Clicking it opens a dropdown that lists all your vaults. From here you can:

- Switch to a different vault by clicking its name.
- See the file path for each vault.
- Access git settings for vaults with a remote configured (click the git icon).
- Remove a vault from Noteriv (click the X button).
- Create a new vault (click "New vault" at the bottom).

### Tab bar

Open files appear as tabs in the title bar, similar to a web browser or code editor. Tabs show the filename and a dot indicator when the file has unsaved changes.

- **Click** a tab to switch to that file.
- **Middle-click** or click the X to close a tab.
- **Drag** tabs to reorder them.
- **Right-click** a tab for a context menu with additional options:
  - Close tab, close other tabs, close all tabs, close tabs to the right.
  - Pin/unpin the tab (pinned tabs cannot be accidentally closed and appear first).
  - Open in split editor (side-by-side view).
  - Reveal in sidebar (highlights the file in the file tree).
  - Copy file path to clipboard.

Pinned tabs are visually distinguished and always stay at the left end of the tab bar. They persist across sessions and are protected from "Close All" and "Close Other" operations.

### View mode buttons

To the right of the tabs, three buttons let you switch the editor view mode:

- **Live** -- Rendered preview as you type (the default).
- **Source** -- Raw markdown with syntax highlighting.
- **View** -- Read-only rendered output.

The current mode is highlighted. Press `Ctrl+E` to cycle between modes, or click the button directly. You can also right-click in the editor to set a per-file default mode that persists across restarts.

### Window controls

On the far right of the title bar, you find the settings gear icon and the standard window controls (minimize, maximize/restore, close). On macOS, window controls appear on the left side following platform conventions.

## Sidebar

The sidebar occupies the left side of the window. Toggle it with `Ctrl+B`. When collapsed, the full width is given to the editor area.

### File tree

The primary sidebar content is the file tree, which shows all files and folders in your vault. Files and folders are displayed in a hierarchical structure that mirrors the vault's folder layout on disk.

- **Click** a file to open it in a new tab (or switch to its existing tab).
- **Click** a folder to expand or collapse it.
- **Drag files** between folders to move them.
- **Drag files** within a folder to reorder them. The custom sort order is saved per-vault.
- **Right-click** for a context menu with options to create, rename, delete, move to trash, copy path, and more.
- **Ctrl+Click** to select multiple files. **Shift+Click** to select a range. With multiple files selected, right-click to merge them into one note, delete them, or move them in bulk.

The file tree automatically refreshes when files are changed externally, such as by the MCP server, a git sync, or another application editing files in the vault directory.

### Sidebar panels

Several panels can appear in the sidebar area, toggled via keyboard shortcuts or the command palette:

- **Bookmarks panel** -- Shows your bookmarked notes for quick access. Toggle with `Ctrl+Shift+B` (the same shortcut also bookmarks the current note).
- **Outline panel** -- Displays a table of contents generated from headings in the current note. Click a heading to jump to it. Toggle with `Ctrl+Shift+O`.
- **Backlinks panel** -- Lists every note that links to the current file via wiki-links. Helpful for discovering connections.
- **Tag pane** -- Shows all tags used across your vault in a hierarchical tree. Click a tag to see all notes that use it.
- **Trash panel** -- Browse soft-deleted notes and restore them. Deleted notes are kept in `.noteriv/trash/`.

## Editor area

The editor area is the central workspace where you write and read your notes. It uses CodeMirror 6 as the editing engine, providing fast, responsive text editing with full markdown support.

### Editor features

- **Syntax highlighting** in source mode for markdown elements, code blocks, frontmatter, and more.
- **Live rendering** in live mode, where markdown is rendered inline as you type.
- **Formatting toolbar** at the top of the editor with buttons for bold, italic, headings, links, lists, code, tables, and horizontal rules.
- **Auto-save** at configurable intervals (10 seconds, 30 seconds, 1 minute, or 5 minutes). Manual save with `Ctrl+S`.
- **Spell check** toggled on or off in settings.
- **Vim mode** for users who prefer vim keybindings. Enable it in settings.
- **Focus mode** (`Ctrl+Shift+D`) dims all lines except the one you are currently editing, helping you concentrate on the active sentence or paragraph.
- **Slash commands** -- Type `/` at the start of a line to open a menu of quick insertions: headings, lists, code blocks, callouts, tables, and more.

### Split editor

Press `Ctrl+\` to split the editor into two panes side by side. Each pane can show a different file, allowing you to reference one note while writing another. You can also split by right-clicking a tab and selecting "Open in Split".

Press `Ctrl+Shift+\` to close the split and return to a single pane.

### Special views

Some file types and features open specialized views in the editor area instead of the standard markdown editor:

- **Canvas / Whiteboard** -- `.canvas` files open an infinite canvas where you can place text nodes, sticky notes, images, drawings, and connect them with edges.
- **Board view** -- `.board.md` files (or notes with `board: true` frontmatter) open as a drag-and-drop task board with columns and cards.
- **Drawing editor** -- `.drawing` files open a drawing canvas with pencil, shapes, arrows, text, and eraser tools.
- **PDF viewer** -- PDF files open with inline annotation tools (highlight, underline, note).
- **Graph view** (`Ctrl+G`) -- An interactive force-directed graph showing how notes connect through wiki-links.
- **Calendar view** -- A month calendar that shows daily notes and tasks with due dates.
- **Slide presentation** -- Present any note as slides, split by `---` horizontal rules.

## Status bar

The status bar runs along the bottom of the window and shows contextual information:

- **Word count and character count** for the current note.
- **Line and column** position of the cursor.
- **File path** of the current note.
- **Sync status** -- Shows whether the vault is synced, syncing, or has pending changes.
- **Encoding and line ending** information.

## Overlays and modals

Several UI elements appear as overlays on top of the main interface:

- **Quick open** (`Ctrl+P`) -- A search dialog for fuzzy-finding files by name across the vault.
- **Command palette** (`Ctrl+Shift+P`) -- A searchable list of all available commands, grouped by category, with their keyboard shortcuts shown. Recently used commands appear at the top.
- **Settings modal** (`Ctrl+,`) -- A multi-section settings panel covering editor preferences, appearance, sync configuration, hotkey customization, and more.
- **Template picker** (`Ctrl+T`) -- Browse and insert note templates.
- **Vault search** (`Ctrl+Shift+F`) -- Full-text search across all notes in the vault.
- **Find in file** (`Ctrl+F`) -- Search and replace within the current note.

## Zen mode

Press `Ctrl+Shift+E` to enter zen mode. This hides the title bar, sidebar, and status bar, leaving only the editor in a centered, distraction-free layout. Press `Ctrl+Shift+E` again to exit zen mode.

Zen mode pairs well with focus mode (`Ctrl+Shift+D`) for a completely immersive writing experience.

## Fullscreen

Press `F11` to toggle fullscreen mode. This expands Noteriv to fill your entire screen, hiding the operating system's title bar and taskbar. Press `F11` again to return to windowed mode.

## Customizing the interface

You can adjust many aspects of the interface from Settings (`Ctrl+,`):

- **Font size** -- Editor font size from 12px to 24px.
- **Line height** -- From 1.2 to 2.0.
- **Editor font** -- Choose from JetBrains Mono, Fira Code, Cascadia Code, Source Code Pro, SF Mono, or system monospace.
- **Tab size** -- 2, 4, or 8 spaces.
- **Theme** -- 10 built-in themes (8 dark, 2 light) plus community themes and custom theme creation.
- **Accent color** -- 8 options: Blue, Lavender, Mauve, Pink, Peach, Yellow, Green, Teal.
- **CSS snippets** -- Fine-tune any visual element with custom CSS.

For a complete list of keyboard shortcuts, see the [Keyboard Shortcuts](keyboard-shortcuts.md) guide.
