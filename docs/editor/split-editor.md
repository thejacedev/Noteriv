---
title: Split Editor
order: 5
---

# Split Editor

The split editor lets you open two notes side by side in a single window. Each pane is a fully independent editor instance with its own active note, view mode, scroll position, and cursor. This is useful for referencing one note while writing another, comparing two versions of a document, or reviewing a note in view mode while editing it in live mode.

## Opening a Split

There are several ways to open the split editor:

### Keyboard Shortcut

Press `Ctrl+\` to move the currently active note into a new split pane. If no split is open, this creates a right pane with the current note and leaves the left pane with the same note (you can then open a different note in either pane). If a split is already open, this shortcut moves focus to the other pane.

### Tab Context Menu

Right-click any tab in the tab bar and select **Open in Split**. The note is opened in the opposite pane from the one it is currently in. If no split exists, a new right pane is created.

### Drag and Drop

You can drag a tab from the tab bar and drop it onto the right side of the editor area to open it in a split pane. A visual indicator shows where the tab will land as you drag.

### Command Palette

Open the command palette (`Ctrl+P`) and search for "Open in Split" or "Split Editor". The current note is moved to a new split pane.

## Pane Layout

The split editor divides the editor area into two side-by-side panes separated by a vertical divider. Each pane has its own:

- **Tab bar**: Each pane has an independent set of tabs. You can open, close, reorder, and pin tabs in each pane independently.
- **Editor instance**: Each pane runs its own CodeMirror 6 editor with its own state, extensions, and cursor.
- **View mode**: Each pane can be in a different view mode. For example, you can have live mode in the left pane and view mode in the right pane to preview the same note.
- **Status bar section**: The status bar shows information for the currently focused pane (line number, column, word count, mode).

## The Divider

The vertical divider between the two panes is interactive:

### Dragging

Click and drag the divider left or right to resize the panes. The minimum pane width is approximately 20% of the editor area, preventing you from accidentally collapsing a pane to an unusable size. As you drag, the panes resize in real time.

### Double-Click to Reset

Double-click the divider to reset both panes to an equal 50/50 split. This is a quick way to restore a balanced layout after resizing.

### Visual Feedback

The divider shows a subtle hover effect when your mouse is over it, indicating that it is draggable. During a drag operation, the divider is highlighted with the accent color.

## Working with Split Panes

### Focus

Click inside a pane to give it focus. The focused pane has a subtle border highlight and is the target for keyboard shortcuts, file operations, and mode changes. You can also press `Ctrl+\` to toggle focus between the two panes.

### Opening Notes

When you open a note from the file explorer sidebar, it opens in the currently focused pane. This means you can click in the right pane, then click a note in the sidebar, and it opens on the right side. The same applies to links -- clicking a wiki-link opens the linked note in the current pane.

To open a note in the other pane, hold `Ctrl` while clicking the note in the sidebar or the wiki-link in the editor. This is useful for following a link without losing your place in the current note.

### Independent Modes

Each pane maintains its own view mode. Switching modes (via the status bar, command palette, or context menu) affects only the focused pane. This enables powerful workflows:

- **Edit + Preview**: Open the same note in both panes with live mode on the left and view mode on the right. As you edit on the left, the right pane shows the fully rendered output.
- **Source + Live**: Edit a complex table in source mode on one side while seeing the rendered table in live mode on the other.
- **Reference + Write**: Open a reference note in view mode on the right while composing a new note in live mode on the left.

### Scrolling

Each pane scrolls independently. There is no linked scrolling by default. You can scroll one pane without affecting the other.

## Closing the Split

### Keyboard Shortcut

Press `Ctrl+Shift+\` to close the split editor. The note in the focused pane is kept, and the other pane is closed. Any open tabs in the closed pane are preserved in the tab history and can be reopened.

### Close Button

Each pane has a small close button (X) in its tab bar area. Clicking it closes that pane and expands the remaining pane to fill the editor area.

### Closing All Tabs

If you close all tabs in one pane, that pane is automatically closed and the remaining pane expands.

## State Persistence

The split editor state is saved in your workspace configuration:

- **Split open/closed**: Whether the split was open when you last closed Noteriv is remembered and restored on next launch.
- **Divider position**: The position of the divider (e.g., 60/40 split) is preserved across sessions.
- **Open tabs per pane**: Each pane's set of open tabs is saved and restored independently.
- **Active tab per pane**: The last active tab in each pane is restored.
- **View modes**: The view mode of each pane is saved.

## Limitations

- The split editor supports exactly two panes. There is no three-way or grid split.
- The split is always vertical (side by side), not horizontal (top and bottom).
- Drag and drop of tabs between panes is supported, but you cannot merge panes by dragging.
- Some operations that affect the "current editor" (like certain plugin commands) apply to the focused pane only.

## Keyboard Reference

| Shortcut | Action |
|---|---|
| `Ctrl+\` | Open split / toggle focus between panes |
| `Ctrl+Shift+\` | Close split editor |
| `Ctrl+Click` (sidebar) | Open note in the other pane |
| `Ctrl+Click` (wiki-link) | Open linked note in the other pane |

## Common Workflows

### Comparing Two Notes

Open note A in the left pane and note B in the right pane, both in source mode. Scroll through each to compare content, structure, or formatting differences.

### Writing with References

Open your reference material or outline in view mode in the right pane. Write in live mode in the left pane, glancing at the reference as needed without switching tabs or windows.

### Same Note, Dual View

Open the same note in both panes. Set the left pane to live or source mode for editing and the right pane to view mode for a rendered preview. Changes in the left pane are reflected in the right pane in real time.
