---
title: File List
order: 18
---

# File List

The file list is the tree of folders and notes in the sidebar. This page covers changing its order, finding the open note in it, and closing all its folders at once. For opening, moving and renaming files, see [Interface](../getting-started/interface.md#file-tree). The features on this page are in the desktop app, and were added after 2.4.13.

## Sort Order

Click the **Change sort order** button in the sidebar header, next to the new-file button, and pick an order from the menu:

| Order | What it does |
|---|---|
| My own order | Keeps the order you have dragged things into. This is the default |
| File name (A to Z) | By name |
| File name (Z to A) | By name, reversed |
| Modified (new to old) | Most recently changed first |
| Modified (old to new) | Least recently changed first |
| Created (new to old) | Newest first |
| Created (old to new) | Oldest first |

The order applies to every folder in the list, and it is remembered.

How the orders work:

- In every order except **My own order**, folders come before files. The folders are sorted the same way as the files.
- Names are compared without regard to case, and numbers in names are read as numbers, so `Note 2` comes before `Note 10`.
- When two files have the same time, they are ordered by name.
- Some file systems do not record when a file was created. For those files the modified time is used.
- Dragging a note to a new place in its folder sets its place in **My own order**. The other orders do not use it.

## Reveal the Open Note

To find the note you are working on in the file list, open the command palette (`Ctrl+Shift+P`) and run **Reveal the Open Note in the File List**. Noteriv opens the sidebar if it is closed, opens the folders the note is inside, and scrolls the list to the note.

To have this happen on its own, go to Settings > General and switch on **Reveal the open note**. The file list then opens at each note you open or switch to. The setting is off by default.

## Collapse All Folders

When at least one folder is open, the sidebar header has a **Collapse all folders** button. Click it to close every folder in the list. The command **Collapse All Folders** in the command palette does the same.

## Commands

| Command | Default shortcut |
|---|---|
| Reveal the Open Note in the File List | None |
| Collapse All Folders | None |

To give a command a shortcut, open Settings (`Ctrl+,`) and go to Shortcuts.

## Related

- [File Settings](./file-settings.md) covers where new notes go, the attachment folder, excluded files and what happens to deleted files.
- [Multi-Select](./multi-select.md) covers selecting several files in the list.
