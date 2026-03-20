---
title: Command Palette
order: 8
---

# Command Palette

The command palette is a searchable launcher for every action in Noteriv. Instead of remembering keyboard shortcuts or hunting through menus, you type what you want to do and the palette finds the matching command.

## Opening the Palette

Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS). The palette opens as a centered overlay with a text input at the top and a scrollable list of commands below.

## Layout

The palette consists of three visual sections:

### Search Input

A text field with a menu icon on the left. As you type, the command list filters instantly. The filter matches against the command's label, category, and internal action name, so you can find a command by any of these attributes.

### Recent Commands

When the search field is empty, the top of the command list shows a "Recent" section containing the commands you used most recently. This lets you repeat frequent actions with just two keystrokes: `Ctrl+Shift+P` then `Enter`.

Recent commands are tracked per session and persist across palette opens within the same session. The most recently executed command appears first.

### Command List

Below the recent section (or filling the entire list when a filter is active), commands are grouped by category. Each group has a category header (e.g., "File", "Navigation", "Formatting", "View", "Edit", "Sync") followed by the commands in that category.

Each command row shows:

- **Label.** The human-readable name of the command (e.g., "Toggle Bookmark", "Insert Template").
- **Keyboard shortcut.** Displayed on the right side of the row, formatted for your platform. On macOS, `Ctrl` is shown as the command symbol. Commands without a shortcut show no badge.

## Navigation

| Key | Action |
|---|---|
| Type | Filter the command list |
| `Up` / `Down` | Move the selection highlight |
| `Enter` | Execute the selected command |
| `Esc` | Close the palette |
| Click | Execute the clicked command |
| Hover | Move the selection highlight |

The selection highlight starts at the top of the list. When you execute a command, the palette closes automatically and the command runs.

## Available Commands

The palette includes every action registered in Noteriv. Here is a representative list, grouped by category:

### File

| Command | Shortcut |
|---|---|
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| New File | `Ctrl+N` |
| New Folder | `Ctrl+Shift+N` |
| Open File | `Ctrl+O` |
| Close Tab | `Ctrl+W` |
| Close All Tabs | `Ctrl+Shift+W` |
| Delete File | -- |
| Toggle Bookmark | `Ctrl+Shift+B` |
| File Recovery | -- |
| Export as PDF | -- |
| Pin/Unpin Tab | `Ctrl+Shift+T` |
| Open Trash | -- |
| New Canvas / Whiteboard | -- |

### Navigation

| Command | Shortcut |
|---|---|
| Quick Open | `Ctrl+P` |
| Command Palette | `Ctrl+Shift+P` |
| Next Tab | `Ctrl+Tab` |
| Previous Tab | `Ctrl+Shift+Tab` |
| Open Daily Note | `Ctrl+D` |
| Open Random Note | `Ctrl+Shift+R` |
| Flashcard Review | -- |

### Search

| Command | Shortcut |
|---|---|
| Find in File | `Ctrl+F` |
| Find in Vault | `Ctrl+Shift+F` |

### View

| Command | Shortcut |
|---|---|
| Toggle Sidebar | `Ctrl+B` |
| Toggle View Mode | `Ctrl+E` |
| Toggle Fullscreen | `F11` |
| Zen Mode | `Ctrl+Shift+E` |
| Settings | `Ctrl+,` |
| Toggle Outline | `Ctrl+Shift+O` |
| Graph View | `Ctrl+G` |
| Toggle Backlinks | -- |
| Toggle Tag Pane | -- |
| Calendar View | -- |
| Toggle Focus Mode | `Ctrl+Shift+D` |
| Note History | -- |
| Toggle Lint Warnings | `Ctrl+Shift+L` |
| Split Editor | `Ctrl+\` |
| Close Split | `Ctrl+Shift+\` |

### Edit

| Command | Shortcut |
|---|---|
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` |
| Insert Template | `Ctrl+T` |
| Note Composer | -- |
| Audio Recorder | -- |
| Attachment Manager | -- |
| Insert Dataview Query | -- |
| Insert Table of Contents | -- |
| New Drawing | -- |

### Formatting

| Command | Shortcut |
|---|---|
| Bold | -- |
| Italic | `Ctrl+I` |
| Inline Code | `` Ctrl+` `` |
| Strikethrough | -- |
| Insert Link | `Ctrl+K` |
| Insert Image | -- |
| Horizontal Rule | -- |
| Code Block | -- |
| Blockquote | -- |
| Task List | -- |
| Insert Table | -- |

### Sync

| Command | Shortcut |
|---|---|
| Sync Now | `Ctrl+Shift+G` |

## Filtering Behavior

The filter is case-insensitive and matches against three fields simultaneously:

1. **Label** -- the display name (e.g., "Toggle Bookmark").
2. **Category** -- the group name (e.g., "File", "View").
3. **Action** -- the internal identifier (e.g., "toggleBookmark").

This means typing "sync" shows "Sync Now" (matches the label and category), and typing "pdf" shows "Export as PDF" (matches the label).

If no commands match the filter, the palette displays "No commands found".

## Customizing Shortcuts

Keyboard shortcuts for commands can be customized in Settings (`Ctrl+,`). Changes are saved locally and merged over the defaults. The command palette always shows the current effective shortcut, whether it is the default or a custom one.

## Tips

- **Use the palette as a learning tool.** Browse the full list with an empty query to discover commands you did not know existed.
- **Let recent commands work for you.** If you keep inserting templates, the "Insert Template" command will stay at the top of the recent list, making it a two-key operation.
- **Search by category.** Typing "format" shows all formatting commands grouped together.
- **Pair with shortcuts.** Once you find yourself using a command frequently via the palette, note its keyboard shortcut and start using that instead for speed.
