---
title: Editor Overview
order: 1
---

# Editor Overview

Noteriv's editor is built on [CodeMirror 6](https://codemirror.net/), a modern, extensible code editor framework for the web. It provides a fast, accessible editing experience designed specifically for Markdown note-taking, with three distinct view modes, split editing, focus mode, and optional Vim keybindings.

## View Modes

The editor supports three view modes, each suited to different workflows. You can switch between them using the status bar toggle, the command palette, or the right-click context menu.

### Live Mode

Live mode is the default editing experience. Lines that do not contain the cursor are rendered inline -- headings appear styled, bold and italic text is rendered, code blocks are syntax-highlighted, LaTeX math is typeset, and images are displayed. The line you are currently editing shows raw Markdown so you can see and modify the syntax directly.

This gives you the best of both worlds: a polished reading experience while you write, with full control over the underlying Markdown whenever you need it.

See [Live Mode](./live-mode.md) for details.

### Source Mode

Source mode displays the raw Markdown with syntax highlighting and line numbers. No inline rendering is performed. This mode is ideal for complex edits where you need to see every character of the markup, such as editing deeply nested lists, adjusting table alignment, or troubleshooting formatting issues.

See [Source Mode](./source-mode.md) for details.

### View Mode

View mode renders the entire document as read-only HTML. All Markdown is fully rendered, including headings, lists, tables, code blocks, math, and embedded images. Even though the document is read-only, interactive elements like task list checkboxes and table checkboxes can still be toggled by clicking them, and the underlying file is updated automatically.

See [View Mode](./view-mode.md) for details.

## Switching Modes

There are several ways to change the active view mode:

- **Status bar**: Click the mode indicator in the bottom status bar to cycle through Live, Source, and View.
- **Command palette**: Open the command palette (`Ctrl+P`) and search for "Toggle Live Mode", "Toggle Source Mode", or "Toggle View Mode".
- **Context menu**: Right-click inside the editor and select the desired mode from the context menu. You can also set a per-file default mode that persists across restarts.
- **Keyboard shortcut**: Use `Ctrl+Shift+L` to cycle between modes.

## Split Editor

The split editor lets you open two notes side by side in a single window. You can right-click any tab and choose "Open in Split", or press `Ctrl+\` to move the current note into a split pane. A draggable divider separates the two panes, and you can double-click it to reset to an even 50/50 split. Each pane operates independently and supports all three view modes.

See [Split Editor](./split-editor.md) for details.

## Focus Mode

Focus mode helps you concentrate on your writing by dimming every line in the editor except the one you are currently typing on. The active line is vertically centered in the viewport, keeping your eyes in a comfortable position as you write. Toggle it with `Ctrl+Shift+D` or from the command palette.

For an even more immersive experience, Zen mode (`Ctrl+Shift+E`) hides the sidebar, tab bar, and status bar, leaving only the editor visible.

See [Focus Mode](./focus-mode.md) for details.

## Vim Mode

If you prefer modal editing, Noteriv includes full Vim keybinding support powered by `@replit/codemirror-vim`. Enable it in Settings and you get Normal, Insert, and Visual modes with the standard Vim command vocabulary.

See [Vim Mode](./vim-mode.md) for details.

## Formatting Toolbar

A toolbar at the top of the editor provides quick-access buttons for common Markdown formatting: bold, italic, headings, links, lists, task lists, code, blockquotes, tables, horizontal rules, highlights, and math. Each button either wraps the current selection or inserts a formatting template at the cursor.

See [Formatting Toolbar](./formatting-toolbar.md) for details.

## Context Menu

Right-clicking inside the editor opens a context menu with mode switching, split editor controls, focus mode toggles, and the ability to set a per-file default view mode that is remembered across sessions.

See [Context Menu](./context-menu.md) for details.

## Architecture

Under the hood, the editor is a CodeMirror 6 `EditorView` instance extended with custom plugins:

- **Markdown language support** via `@codemirror/lang-markdown` with inline rendering decorations for live mode.
- **Syntax highlighting** using a custom theme that adapts to the active Noteriv theme.
- **State management** through CodeMirror's `EditorState` and `StateField` extensions, keeping mode, focus, and per-file settings in sync with the application state.
- **Vim bindings** via `@replit/codemirror-vim`, loaded conditionally when the setting is enabled.
- **Custom keymaps** for formatting shortcuts, mode toggling, split controls, and focus mode.

The editor communicates with the rest of the application through a thin adapter layer that handles file reads, writes, and workspace configuration persistence.

## Keyboard Shortcuts Reference

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+L` | Cycle view mode (Live / Source / View) |
| `Ctrl+\` | Open current note in split editor |
| `Ctrl+Shift+\` | Close split editor |
| `Ctrl+Shift+D` | Toggle focus mode |
| `Ctrl+Shift+E` | Toggle Zen mode |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+K` | Insert link |
| `Ctrl+Shift+K` | Insert code block |
| `Ctrl+Shift+M` | Insert math block |
| `Ctrl+P` | Open command palette |
| `Ctrl+S` | Save note |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |

These shortcuts apply to the default keymap. When Vim mode is active, many of these are overridden by Vim-style equivalents.
