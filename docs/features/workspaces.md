---
title: Workspace Layouts
order: 21
---

# Workspace Layouts

A workspace layout is the arrangement of the window, saved under a name: the tabs that are open, the split, the file list and the side panels. Save one for each way you work, such as writing or reviewing, and bring any of them back when you need it.

Layouts are in the desktop app and were added after 2.4.13. Versions up to 2.4.13 do not have them.

## What a Layout Remembers

| Part of the window | What is saved |
|---|---|
| Tabs | The open tabs in their order, the tab in front, and which tabs are pinned |
| Split | The note in the right pane of a [split](../editor/split-editor.md) |
| View mode | Live, source or view, and the view mode set for a single note |
| File list | The folders that are open, whether the sidebar is collapsed, and its width |
| Side panels | Which of these are open: the outline, the links panel, the footnotes panel, the tag pane, the All properties panel and the lint panel |

A layout does not hold:

- The position of the divider in a split.
- The order and the sorting of the file list.
- The cursor and the scroll position in each note.
- Panels added by plugins.
- [Pop-out windows](./pop-out-windows.md).

A tab for a file outside the vault folder is left out when the layout is saved.

## Saving a Layout

1. Arrange the window the way you want it.
2. Run **Manage Workspace Layouts** from the [command palette](./command-palette.md) (`Ctrl+Shift+P`).
3. Type a name in the box at the top and press `Enter`, or click **Save**.

The status bar confirms it, for example `Saved the layout "Writing"`. The layout you save becomes the current one.

About names:

- Spaces at the start and the end are removed, and several spaces in a row become one.
- A name is cut off after 80 characters.
- If a layout with the name exists, the button reads **Replace**, and saving replaces that layout.
- Upper and lower case count: `Writing` and `writing` are two layouts.

A saved layout does not follow what you do afterwards. It stays as it was until you update it.

**Manage Workspace Layouts** has no default shortcut. You can give it one in Settings > Shortcuts.

## Loading a Layout

Open **Manage Workspace Layouts** and click the layout's name, or its **Load** button. The window is put back the way the layout was saved:

- Notes with unsaved changes are saved first. If a note cannot be saved, the layout is not loaded.
- The tabs that are open now are closed, and the tabs of the layout are opened in their place.
- The split, the view mode, the file list and the pinned tabs are set from the layout.
- The six side panels are set from the layout too. A panel that was not open when the layout was saved is closed.
- The layout becomes the current one, and the layouts window closes.

If some of the layout's notes have been deleted, renamed or moved since it was saved, they are skipped and the status bar says so:

```text
Loaded the layout "Writing"; 2 of its notes are no longer there
```

## Managing Layouts

The layouts window lists the saved layouts by name. The current layout, the one you loaded or saved last, is marked `current`. Under each name is a line that says what the layout holds:

```text
3 notes open, split, outline, backlinks
```

The number counts every tab of the layout. The words after it are `split` and the side panels of the layout, by these names:

| Name in the line | Panel |
|---|---|
| `outline` | Outline panel |
| `backlinks` | Links panel |
| `footnotes` | Footnotes panel |
| `tags` | Tag pane |
| `properties` | [All properties panel](./properties.md#all-properties-panel) |
| `lint` | Lint panel |

Each layout has four buttons:

| Button | What it does |
|---|---|
| **Load** | Loads the layout |
| **Update** | Replaces the layout with what is on screen now |
| **Rename** | Turns the name into a box. Type the new name and press `Enter`. Nothing changes if the name is empty or another layout has it |
| **Delete** | Removes the layout at once, without asking. Your notes and the window are not touched |

`Esc`, or a click outside the window, closes it.

## Save Workspace Layout

The command **Save Workspace Layout** saves what is on screen without opening the list:

- With a current layout, it saves over that layout and the status bar confirms it.
- With no current layout, it opens the layouts window so you can give the layout a name.

The command has no default shortcut. You can give it one in Settings > Shortcuts.

## Where Layouts Are Stored

Layouts are stored per vault, in the file `.noteriv/workspaces.json` inside the vault folder:

```json
{
  "layouts": {
    "Writing": {
      "openTabs": ["Projects/Plan.md", "Inbox.md"],
      "activeTab": "Projects/Plan.md",
      "splitTab": "Inbox.md",
      "pinnedTabs": ["Inbox.md"],
      "expandedFolders": ["Projects"],
      "fileViewModes": { "Inbox.md": "view" },
      "viewMode": "live",
      "sidebarCollapsed": false,
      "sidebarWidth": 250,
      "panels": ["outline", "backlinks"]
    }
  },
  "active": "Writing"
}
```

Notes and folders are written as paths from the top of the vault, with `/` between folders. A layout therefore still works when the vault is in a different folder, such as on a second computer. A path that leads out of the vault is ignored when the layout is loaded.

If you sync the vault to a folder or over WebDAV, the **Vault settings** switch in Settings > Sync decides whether this file goes to your other devices. See [What Syncs](../sync/what-syncs.md).

## Layouts and the Tabs You Had Open

Noteriv already reopens the tabs you had open the last time you used a vault. That happens by itself and is kept in a different file, `.noteriv/workspace.json`. It is one arrangement that changes as you work.

Layouts are separate from it. A layout is only saved when you save it, and loading one replaces what is on screen.

## Tips

- **Name layouts after the work.** `Writing`, `Review` and `Planning` say more than `Layout 1`.
- **Update a layout when it drifts.** After you open other notes or panels, use **Update** or **Save Workspace Layout** to keep the change.
- **Check the line under the name.** It shows how many tabs a layout opens before you load it.
- **Remember that loading closes the open tabs.** Save the arrangement you have as a layout first if you want to come back to it.
