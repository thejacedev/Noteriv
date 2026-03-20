---
title: Bookmarks
order: 6
---

# Bookmarks

Bookmarks give you instant access to your most-used notes. Instead of searching or scrolling through the file tree, bookmarked notes appear in a dedicated sidebar panel, always one click away.

## Adding and Removing Bookmarks

### Keyboard Shortcut

Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on macOS) to toggle a bookmark on the currently open file. If the file is not bookmarked, it is added. If it is already bookmarked, it is removed.

### Context Menu

Right-click a file in the sidebar and select "Bookmark" to add it. This works without opening the file first.

### From the Bookmarks Panel

Each bookmarked entry in the panel has a remove button (an X icon) on the right side. Click it to unbookmark the file without opening it.

## Bookmarks Panel

The bookmarks panel is a sidebar section that lists all your bookmarked files.

### Opening the Panel

The bookmarks panel appears in the sidebar when you toggle it via the sidebar panel selector or through the command palette (`Ctrl+Shift+P`, search for "Toggle Bookmark").

### Layout

The panel has two parts:

1. **Header.** Displays a star icon, the label "Bookmarks", and the total count of bookmarked files.

2. **Bookmark list.** Each entry shows:
   - A filled star icon indicating the file is bookmarked.
   - The file name (without extension).
   - The relative path within the vault (shown below the name when the file is not in the vault root).
   - A remove button on hover.

### Active File Highlighting

If one of your bookmarked files is currently open in the editor, its entry in the panel is highlighted with a distinct background color. This gives you a visual indicator of where you are relative to your pinned notes.

### Empty State

When no files are bookmarked, the panel shows a star icon with the message "No bookmarks yet" and a hint: "Right-click a file or use Ctrl+B to bookmark."

## Navigation

Click any entry in the bookmarks panel to open that file in the editor. This is the primary use case: one-click access to files you reference frequently, regardless of where they are in the folder tree.

## Persistence

Bookmarks are stored as an array of file paths in Noteriv's local settings. They persist across sessions -- closing and reopening the app does not lose your bookmarks.

If a bookmarked file is moved or renamed through the sidebar, the bookmark path is updated automatically. If a bookmarked file is deleted, the entry remains in the list but will show as unavailable until you remove it.

## Use Cases

### Reference Notes

Pin your style guide, project glossary, or API reference. These are files you look up repeatedly but rarely edit.

### Active Projects

Bookmark the main note for each active project. When you need to context-switch, click the bookmark instead of digging through folders.

### Daily Workflow

Bookmark your daily note template, inbox file, or task list. Pair this with [Daily Notes](./daily-notes.md) for a streamlined morning routine: click the bookmark, then `Ctrl+D` for today's entry.

### Meeting Prep

Before a recurring meeting, bookmark the meeting notes file. After the meeting, remove the bookmark and add the next one.

## Bookmarks vs. Favorites vs. Pinned Tabs

Noteriv distinguishes between three related but different features:

| Feature | Scope | Behavior |
|---|---|---|
| **Bookmarks** | Sidebar panel | Persistent list of files for quick access |
| **Pinned Tabs** | Tab bar | Prevents a tab from being closed; tab stays at the left end of the tab bar |
| **Recent Files** | Quick Open | Automatically tracked; shows your most recently opened files |

Bookmarks are manually curated, which means they represent an intentional decision that a file is important, not just that you opened it recently.

## Tips

- **Keep the list short.** Bookmarks lose their value if you have 50 of them. Aim for 5-10 files that you genuinely access multiple times per day.
- **Review periodically.** Remove bookmarks for projects or topics that are no longer active. Stale bookmarks add noise.
- **Combine with tags.** Bookmarking a file does not replace tagging it. Tags are for categorization and querying; bookmarks are for fast access.
- **Use relative paths as context.** The bookmarks panel shows the relative path below the filename, which helps when you have files with the same name in different folders (e.g., `projects/alpha/README.md` vs `projects/beta/README.md`).
