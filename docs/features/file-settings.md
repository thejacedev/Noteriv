---
title: File Settings
order: 19
---

# File Settings

These settings decide where new notes go, which folder the Attachment Manager uses, which files are left out of search and suggestions, and what happens to a file you delete. They are all in Settings > General (`Ctrl+,`) in the desktop app. They were added after 2.4.13.

| Setting | Choices | Default |
|---|---|---|
| New notes go | At the top of the vault, Beside the open note, In a folder I choose | At the top of the vault |
| Folder for new notes | A folder inside the vault | Empty |
| Attachment folder | A folder inside the vault | `attachments` |
| Deleted files | Move to Noteriv's trash, Move to the system trash | Move to Noteriv's trash |
| Excluded files | One pattern per line | Empty |

The same section has **Reveal the open note**, described in [File List](./file-list.md#reveal-the-open-note).

## Where New Notes Go

**New notes go** sets the folder a new note is created in.

| Choice | The note is created |
|---|---|
| At the top of the vault | In the vault folder itself |
| Beside the open note | In the same folder as the note you have open. With no note open, at the top of the vault |
| In a folder I choose | In the folder named in **Folder for new notes** |

**Folder for new notes** appears when you pick the third choice. Write a folder inside the vault, such as `Inbox` or `Projects/Drafts`. The folder is created if it does not exist. If the box is empty, new notes go to the top of the vault.

The setting is used by:

- **New File** (`Ctrl+N`), the new-file button in the sidebar header and the new-note button in the ribbon. The note is called `Untitled`, or `Untitled 2`, `Untitled 3` and so on if that name is taken.
- **Create New Unique Note**, described below.

It is not used when you right-click a folder in the file list and choose **New File**. That note is created in the folder you clicked.

## Unique Notes

The command **Create New Unique Note** makes an empty note named after the current date and time, to the minute, and opens it. The name has the form `YYYYMMDDHHmm`:

```text
202611131045.md
```

That is 13 November 2026 at 10:45, in your computer's local time. If a note with that name already exists in the folder, the next free minute is used: `202611131046`, and so on.

The note is created where **New notes go** says. The command has no default shortcut. Run it from the command palette (`Ctrl+Shift+P`), or give it a shortcut in Settings > Shortcuts.

## Attachment Folder

**Attachment folder** is the folder inside the vault that the Attachment Manager works with. Files you add in the Attachment Manager are saved there, the manager lists what is in it, and the links it inserts point to it.

Write a folder inside the vault, such as `attachments` or `files/media`. If the box is empty, `attachments` is used.

Things to know:

- Changing the setting does not move files that are already in the old folder.
- Images you drop onto the editor and recordings made with the Audio Recorder are not affected by this setting.

## Excluded Files

**Excluded files** is a list of folders, files and file endings to leave out. Write one pattern per line:

```text
Archive
Templates/Old.md
*.tmp
```

| Pattern | Leaves out |
|---|---|
| `Archive` | The folder `Archive` at the top of the vault, and everything in it |
| `Projects/Old` | A folder further down, by its path from the top of the vault |
| `Templates/Old.md` | One file, by its path from the top of the vault |
| `*.tmp` | Every file whose name ends in `.tmp` |

How patterns are read:

- A folder or file pattern is a path from the top of the vault. `Archive` does not match `Notes/Archive`, and it does not match a folder called `Archived`.
- `*` is only understood at the start of a pattern, where it means "ends with". There are no other wildcards.
- Case is ignored.
- Blank lines, and lines that start with `#`, are ignored.

Excluded files are left out of:

- [Vault Search](./search.md#vault-search)
- [Quick Open](./search.md#quick-open)
- The suggestions shown after typing `[[`
- The [graph view](../views/graph-view.md)
- Unlinked mentions in the [links panel](./wiki-links.md#links-panel)

They are still shown in the file list, and you can open them and link to them as usual.

## Deleted Files

**Deleted files** sets where a file goes when you delete it from the file list.

| Choice | What happens |
|---|---|
| Move to Noteriv's trash | The file is moved to `.noteriv/trash/` inside the vault. You can restore it in Noteriv with the **Open Trash** command |
| Move to the system trash | The file is moved to your computer's own trash: the Recycle Bin on Windows, the Trash on macOS, the desktop's trash on Linux. You restore it from there, not from Noteriv |

If a file cannot be moved to the system trash, the status bar says so and the file stays where it is.

The setting applies to files deleted from the file list: **Delete** in the right-click menu, and **Delete N Files** when several files are selected. Two things do not follow it:

- Deleting a folder from the file list removes the folder and everything in it for good. The confirmation says so before anything is deleted.
- The **Delete File** command, which deletes the open note, always uses Noteriv's trash.
