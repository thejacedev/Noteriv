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

A save that is still waiting is made at once when the window loses focus, for example when you click another window. If you close the window within that second without leaving it first, the last words typed may not be written. Wait for `Saved` if you want to be sure.

Before each save, the window checks that the file is still what it last read. If it is not, the save is refused: see the next section.

## Changes Made Elsewhere

While a pop-out window is visible and has nothing waiting to be saved, it reads the file again every two seconds. If the file has changed, the window shows the new text. This covers changes made in the main window, by sync, and by other programs.

It works in the other direction too: a tab in the main window that has no unsaved changes takes up what a pop-out window saves.

### When a Save Is Refused

A pop-out window does not write over a change it has not seen. If the file changed, moved or went away between the window's last read and its save, the save is not made, the window stops saving, and the bar shows a message with two buttons:

| Message | When |
|---|---|
| `This note was changed somewhere else. What you typed here is not saved.` | The file holds something other than what the window last read: the main window, a sync or another program wrote it |
| `This note could not be saved. It may have been moved or deleted.` | The file is not at its path any more, or could not be written |

| Button | What it does |
|---|---|
| **Load the other version** | Shows the note as it is on disk now. What you typed in this window since its last save is given up |
| **Save mine anyway** | Writes what is in this window over the file, whatever it holds. If the note was moved or deleted, this makes a note at the old path again |

Nothing is saved from this window until you pick one of the two.

A pop-out window stays on the path the note had when the window opened. It does not follow a note that is renamed or moved in the main window. If the note is gone when the window opens, or when you choose **Load the other version**, the bar says `This note is no longer there.`

## Following Links

Clicking a `[[wiki-link]]` to another note shows that note in the same window, in place of the one that was there. Anything waiting to be saved is saved first. If that save is refused, the window stays on the note.

The link is matched against note names and paths. The part after `#` is not used, so the note opens at its top, and a link written with an alias is not followed.

## Closing

Closing a pop-out window closes that window only. The main window and the other pop-out windows stay open.

Closing the main window closes every pop-out window with it.

Pop-out windows are not opened again the next time you start Noteriv, and they are not part of a [workspace layout](./workspaces.md).
