---
title: Context Menu
order: 9
---

# Context Menu

Right-clicking inside the editor opens a context menu with actions specific to the editing context. The menu provides access to view mode controls, split editor operations, focus mode toggles, and per-file configuration. It supplements the keyboard shortcuts and command palette, offering a discoverable interface for features you might not use often enough to memorize a shortcut for.

## Opening the Context Menu

Right-click anywhere inside the editor content area. The context menu appears at the mouse position. It can be dismissed by clicking elsewhere, pressing `Escape`, or selecting an action.

The context menu is available in all three view modes (live, source, and view) and in both panes of the split editor. The actions in the menu apply to the pane where you right-clicked.

## Menu Structure

The context menu is organized into logical groups separated by dividers:

### Clipboard Actions

The top section contains standard clipboard operations:

| Action | Description |
|---|---|
| **Cut** | Cut the selected text to the clipboard (`Ctrl+X`) |
| **Copy** | Copy the selected text to the clipboard (`Ctrl+C`) |
| **Paste** | Paste clipboard content at the cursor (`Ctrl+V`) |
| **Paste as Plain Text** | Paste without formatting, stripping any rich text from the clipboard (`Ctrl+Shift+V`) |

If no text is selected, Cut and Copy operate on the entire current line (matching standard CodeMirror behavior).

### View Mode

The view mode section lets you change how the current note is displayed:

| Action | Description |
|---|---|
| **Live Mode** | Switch to live mode (inline rendering) |
| **Source Mode** | Switch to source mode (raw Markdown) |
| **View Mode** | Switch to view mode (read-only preview) |

The currently active mode is indicated with a checkmark. Selecting a different mode switches immediately. This is equivalent to using the status bar mode toggle or the command palette.

### Default View Mode

This section controls the per-file default view mode:

| Action | Description |
|---|---|
| **Set Default: Live** | Set this file's default view mode to Live |
| **Set Default: Source** | Set this file's default view mode to Source |
| **Set Default: View** | Set this file's default view mode to View |
| **Clear Default** | Remove the per-file default (use the global setting) |

The current default (if set) is indicated with a checkmark. See the Per-File Default View Mode section below for details.

### Split Editor

| Action | Description |
|---|---|
| **Open in Split** | Open the current note in a split pane (`Ctrl+\`) |
| **Close Split** | Close the split editor (`Ctrl+Shift+\`) |

"Open in Split" is available when a single pane is active. "Close Split" is available when the split editor is open.

### Focus and Zen Mode

| Action | Description |
|---|---|
| **Focus Mode** | Toggle focus mode (`Ctrl+Shift+D`) |
| **Zen Mode** | Toggle Zen mode (`Ctrl+Shift+E`) |

Each item shows a checkmark when the corresponding mode is active.

### Note Actions

The bottom section contains actions related to the note file:

| Action | Description |
|---|---|
| **Reveal in File Explorer** | Highlight the current note in the sidebar file explorer |
| **Copy File Path** | Copy the absolute file path of the current note to the clipboard |
| **Copy Relative Path** | Copy the vault-relative path of the current note |
| **Open in System Editor** | Open the file in the operating system's default text editor |

## Per-File Default View Mode

One of the context menu's most useful features is the ability to set a default view mode on a per-file basis. This setting is independent of the global default view mode in Settings and overrides it for the specific file.

### How It Works

When you set a per-file default:

1. The setting is stored in the workspace configuration file (`.noteriv/workspace.json` in your vault root).
2. Every time you open that file, it automatically opens in the specified mode instead of the global default.
3. You can still switch modes manually after opening -- the default only controls the initial mode.
4. The setting persists across Noteriv restarts, vault switches, and application updates.

### Use Cases

- **Reference notes**: Set frequently-read reference notes to open in View mode so they are immediately readable without switching modes.
- **Template files**: Set template files to open in Source mode so you can see and edit the raw Markdown structure, including frontmatter and placeholder syntax.
- **Journal entries**: Set daily notes or journal entries to open in Live mode for comfortable writing with inline rendering.
- **Complex documents**: Set notes with complex tables or deeply nested structures to open in Source mode for easier editing.

### Clearing the Default

Select **Clear Default** from the context menu to remove the per-file override. The note will then open in whatever the global default view mode is (set in Settings > Editor > Default View Mode).

### Storage Format

Per-file defaults are stored as a mapping from file paths (relative to the vault root) to mode names in the workspace configuration:

```json
{
  "fileViewModes": {
    "notes/reference.md": "view",
    "templates/meeting.md": "source",
    "journal/2026-03-20.md": "live"
  }
}
```

This file is inside the `.noteriv` directory in your vault, which you can include or exclude from version control as you prefer.

## Context Menu in Different Modes

The context menu adapts slightly based on the active view mode:

### In Live Mode

All sections are available. Clipboard actions operate on the raw Markdown text, not the rendered output. For example, copying a bold word copies `**word**`, not just the rendered bold text.

### In Source Mode

All sections are available. The behavior is identical to live mode since source mode shows raw Markdown.

### In View Mode

Clipboard actions (Cut, Paste) are disabled since view mode is read-only. Copy still works -- it copies the rendered text content of the selection. The view mode section is available for switching to an editable mode. All other sections work normally.

## Context Menu on Special Elements

Right-clicking on certain elements provides additional context-specific actions:

### On a Link

| Action | Description |
|---|---|
| **Open Link** | Open the URL in the default browser |
| **Copy Link URL** | Copy the link destination to the clipboard |
| **Edit Link** | Place the cursor on the link syntax for editing (live mode) |

### On a Wiki-Link

| Action | Description |
|---|---|
| **Open Note** | Navigate to the linked note |
| **Open in Split** | Open the linked note in a split pane |
| **Copy Note Path** | Copy the linked note's path |

### On an Image

| Action | Description |
|---|---|
| **Open Image** | Open the image in the system's default viewer |
| **Copy Image Path** | Copy the image file path |
| **Resize Image** | Open a dialog to set the image display dimensions |

### On a Code Block

| Action | Description |
|---|---|
| **Copy Code** | Copy the code block contents (without the fence markers) |
| **Change Language** | Edit the language identifier |

## Context Menu in Split Editor

When the split editor is open, the context menu actions apply to the pane where you right-clicked. Mode changes, focus mode toggles, and per-file defaults are all pane-specific. The split editor section of the menu shows "Close Split" instead of "Open in Split" since the split is already active.

## Keyboard Navigation

After the context menu is open, you can navigate it with the keyboard:

| Key | Action |
|---|---|
| `Arrow Up` / `Arrow Down` | Move between menu items |
| `Enter` | Select the highlighted item |
| `Escape` | Close the menu |
| `Left Arrow` | Close a submenu |
| `Right Arrow` | Open a submenu |

Menu items with keyboard shortcuts display the shortcut on the right side of the menu item for reference.
