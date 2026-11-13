---
title: Pop-Out Windows
order: 22
---

# Pop-Out Windows

A pop-out window shows one note in a window of its own, next to the main Noteriv window. Use it to keep a note in view on a second screen, or to write in one note while you look things up in the main window.

Pop-out windows are in the desktop app and were added after 2.4.13. Versions up to 2.4.13 do not have them.

## Opening a Pop-Out Window

Two commands in the [command palette](./command-palette.md) (`Ctrl+Shift+P`) open the note you have open in a new window:

| Command | What it does |
|---|---|
| **Open the Note in a New Window** | Opens the note in a pop-out window. Its tab stays open in the main window |
| **Move the Note to a New Window** | Opens the note in a pop-out window and closes its tab in the main window. A pinned tab is not closed |

Neither command has a default shortcut. You can give them one in Settings > Shortcuts.

Things to know:

- The commands work on notes. With a canvas, a base, a PDF, an image or a drawing in front, they do nothing.
- If the note has unsaved changes, it is saved first, together with any other unsaved notes, because the new window reads the note from its file. If a note cannot be saved, the window is not opened.
- You can open several pop-out windows.
- If the window cannot be opened, the status bar of the main window says why.

The window opens at 900 by 700 pixels and can be resized. Its title is the name of the note followed by `- Noteriv`.

## What the Window Has

A pop-out window is a small editor, not a second copy of the app.

| Part | What it is |
|---|---|
| Bar at the top | The name of the note on the left. Point at it to see the full path. On the right, whether the note is saved |
| Editor | The [live mode](../editor/live-mode.md) editor, with the note drawn as you type |

In the editor you have:

- [Folding](../editor/folding.md) of headings and lists, and several cursors at once.
- Find in File with `Ctrl+F`, and undo and redo with `Ctrl+Z` and `Ctrl+Shift+Z`.

The window uses the theme, the accent colour and the editor font, font size and line height of the main window, as they were when the pop-out window opened. If you change them afterwards, close the pop-out window and open it again.

## What the Window Does Not Have

| Not in a pop-out window | Instead |
|---|---|
| Tabs, the sidebar and the file list | One note for each window |
| Side panels, such as the outline and the links panel | Use them in the main window |
| Source mode and view mode | The window is always in live mode |
| The formatting toolbar and the editor's right-click menu | Type the markdown |
| The [properties editor](./properties.md) | The YAML block at the top of the note is folded. Unfold it and edit it as text |
| The command palette and the app's keyboard shortcuts | Only the keys of the editor itself work, such as `Ctrl+F` and `Ctrl+Z` |
| The status bar and the app's menu | The bar at the top shows whether the note is saved |

## Saving

A pop-out window saves by itself. It writes the note to its file a little under a second after you stop typing. The bar shows `Saving…` while there is something to save, and `Saved` when the file is up to date.

Wait for `Saved` before you close the window. Text typed in the last moment before closing may not have been written yet.

If the note cannot be written, the bar says `The note could not be saved.`

## Changes Made Elsewhere

While a pop-out window is visible and has nothing waiting to be saved, it reads the file again every two seconds. If the file has changed, the window shows the new text. This covers changes made in the main window, by sync, and by other programs.

It works in the other direction too: a tab in the main window that has no unsaved changes takes up what a pop-out window saves.

Two cases to watch for:

- **Typing in two places at once.** A pop-out window does not take up outside changes while it has unsaved typing of its own, and it then saves its own text over the file. Edit a note in one window at a time.
- **Renaming, moving or deleting the note.** A pop-out window stays on the path the note had when the window opened. It does not follow a note that is renamed or moved in the main window. Close the pop-out window before you do that. If you type in it afterwards, the note is written again under its old name.

If the note is already gone when the window opens, the bar says `This note is no longer there.`

## Closing

Closing a pop-out window closes that window only. The main window and the other pop-out windows stay open.

Closing the main window closes every pop-out window with it.

Pop-out windows are not opened again the next time you start Noteriv, and they are not part of a [workspace layout](./workspaces.md).
