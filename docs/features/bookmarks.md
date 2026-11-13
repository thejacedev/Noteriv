---
title: Bookmarks
order: 6
---

# Bookmarks

Bookmarks keep the things you return to one click away. You can bookmark a note, a folder, a search or a heading inside a note, and sort your bookmarks into groups. They appear in the bookmarks panel.

This page describes the desktop app. Versions up to 2.4.13 bookmark notes only, have no groups, and do not keep bookmarks after the app is closed.

## What You Can Bookmark

| Bookmark | How to add it | What clicking it does |
|---|---|---|
| Note | `Ctrl+Shift+B` with the note open, or right-click the file in the file list and choose **Bookmark** | Opens the note |
| Folder | Right-click the folder in the file list and choose **Bookmark Folder** | Opens the folder in the file list, along with the folders it is inside. The sidebar is opened if it was closed |
| Search | Click the star in the [Vault Search](./search.md#bookmark-a-search) panel | Opens Vault Search with that search filled in |
| Heading | Put the cursor under the heading and run **Bookmark the Heading Under the Cursor** from the command palette | Opens the note and scrolls to the heading |

Each of these is a toggle. Doing the same thing again removes the bookmark.

### Notes

Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on macOS) to bookmark the file you have open. The command is called **Toggle Bookmark** in the command palette. Right-clicking a file in the file list and choosing **Bookmark** works without opening the file first.

### Folders

A folder bookmark is a shortcut to a place in the file list. It is useful for a project folder that sits several levels down.

### Searches

A search bookmark stores the text of the search. The sort order and the Match case switch are not stored with it. See [Search](./search.md) for what a search can contain.

### Headings

**Bookmark the Heading Under the Cursor** bookmarks the heading that the cursor is on, or the nearest heading above it. It has no default shortcut. If the note has no heading at or above the cursor, nothing is bookmarked.

A heading bookmark finds its heading by its text. If you reword the heading, remove the bookmark and add it again.

## Bookmarks Panel

The bookmarks panel is on the right side of the window. It is shown whenever the vault has at least one bookmark or group, and also while the tag pane is open. With no bookmarks and no groups it is hidden, and it comes back when you add a bookmark.

### Layout

The header shows a star, the label "Bookmarks", the number of bookmarks, and a **+** button for making a group.

Each bookmark is a row with:

- An icon for its kind: a star for a note, a folder, a magnifying glass for a search, an H for a heading.
- Its name. For a note this is the file name without the extension, for a search the search text, and for a heading the heading text.
- A smaller line under the name: the folder a note is in, `Folder`, `Search`, or the note a heading belongs to.
- A **Move to group** menu, once you have made at least one group.
- A remove button (an X).

The group menu and the remove button show when the pointer is on the row. If a bookmarked note is the one open in the editor, its row is highlighted.

### Removing a Bookmark

Click the X on its row. This removes the bookmark only. The note, folder or search it pointed at is not touched.

## Groups

Groups are headings inside the panel that you file bookmarks under, such as one group for each project.

| To | Do this |
|---|---|
| Make a group | Click **+** in the panel header, type a name and press `Enter`. `Esc` cancels |
| Put a bookmark in a group | Point at the bookmark and pick the group from its **Move to group** menu |
| Take a bookmark out of a group | Pick **No group** from the same menu |
| Fold or unfold a group | Click the group's name |
| Remove a group | Click the X beside the group's name |

Bookmarks that are in no group are listed first, followed by each group in the order the groups were made. A group shows how many bookmarks it holds, and it can be empty.

Removing a group does not remove its bookmarks. They go back to the top of the list, with no group.

## Where Bookmarks Are Stored

Bookmarks are stored per vault, in the file `.noteriv/bookmarks.json` inside the vault folder. Each vault has its own bookmarks, and they are still there after you close and reopen the app.

```json
{
  "items": [
    { "kind": "file", "target": "Projects/Plan.md", "group": "Work" },
    { "kind": "search", "target": "tag:#work task-todo:call" }
  ],
  "groups": ["Work"]
}
```

Notes, folders and headings are stored by their path from the top of the vault, so the bookmarks work wherever the vault folder is. A bookmarks file that holds full paths is still read.

To have the same bookmarks on every device, switch on **Vault settings** for folder sync or WebDAV sync. Read [Vault Settings](../sync/what-syncs.md#vault-settings) first: when two devices have different bookmarks files, one replaces the other whole and no copy is kept, and that includes the first sync of a second device.

## Renaming, Moving and Deleting

When you rename or move a note or a folder in Noteriv, bookmarks that point at it, or at anything inside it, are updated to follow it. This covers note, folder and heading bookmarks.

When you delete a note or a folder in Noteriv, its bookmarks are removed, along with the bookmarks of anything that was inside a deleted folder.

Bookmarks are not updated when a file is renamed or deleted outside Noteriv. A bookmark that no longer points at anything stays in the list until you remove it.

## Use Cases

### Reference Notes

Pin your style guide, project glossary, or API reference. These are files you look up repeatedly but rarely edit.

### Active Projects

Bookmark the main note and the folder for each active project, and put them in a group. When you need to context-switch, click the bookmark instead of digging through folders.

### Daily Workflow

Bookmark your inbox file or task list, or a search for your open tasks. Pair this with [Daily Notes](./daily-notes.md): click the bookmark, then `Ctrl+D` for today's entry.

### Meeting Prep

Before a recurring meeting, bookmark the meeting notes file. After the meeting, remove the bookmark and add the next one.

## Bookmarks and Pinned Tabs

| Feature | Where | What it does |
|---|---|---|
| **Bookmarks** | Bookmarks panel | A list you keep of notes, folders, searches and headings |
| **Pinned Tabs** | Tab bar | Keeps a tab from being closed, at the left end of the tab bar |

## Tips

- **Keep the list short.** A long list is slow to scan. Remove bookmarks for work that is finished.
- **Use groups for projects.** One group for each project keeps the notes, the folder and the searches for that project together.
- **Bookmark a search instead of repeating it.** A search such as `tag:#work task-todo:call` is a list that stays up to date.
- **Combine with tags.** Bookmarking a file does not replace tagging it. Tags are for sorting and querying; bookmarks are for getting somewhere fast.
