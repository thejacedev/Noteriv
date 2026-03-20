---
title: Multi-Select
order: 15
---

# Multi-Select

Multi-select lets you operate on multiple files at once from the sidebar. Instead of acting on files one at a time, you can select a group and merge them, delete them, or drag them all into a folder in a single action.

## Selecting Files

### Ctrl+Click (Toggle Individual Files)

Hold `Ctrl` (or `Cmd` on macOS) and click a file in the sidebar to add it to the selection. Clicking a selected file with `Ctrl` held removes it from the selection.

Each `Ctrl+Click` toggles that single file without affecting the rest of the selection. This is useful for picking specific files scattered across different folders.

### Shift+Click (Range Selection)

Hold `Shift` and click a file to select a contiguous range from the last clicked file to the current one. The range follows the visual order of files as they appear in the sidebar tree (top to bottom, respecting expanded folders).

For example, if the sidebar shows:

```
notes/
  alpha.md
  beta.md
  gamma.md
  delta.md
  epsilon.md
```

Clicking `beta.md`, then `Shift+Click` on `delta.md`, selects `beta.md`, `gamma.md`, and `delta.md`.

Range selection adds to the existing selection -- it does not clear files that were previously selected via `Ctrl+Click`.

### Normal Click (Clear Selection)

A regular click (without `Ctrl` or `Shift`) on a file clears the entire multi-selection and opens that file normally. The last clicked file is tracked internally as the anchor for subsequent `Shift+Click` range operations.

### Directories

Multi-select applies only to files, not directories. Clicking a directory with `Ctrl` or `Shift` held has no effect on the multi-selection. Directories expand and collapse normally.

## Visual Feedback

Selected files are highlighted in the sidebar with a distinct background color (the `sb-selected` class). This visual indicator persists as long as the selection is active, even as you scroll through the file tree.

The currently active file (the one open in the editor) has a separate visual indicator (the active pill). A file can be both selected and active -- in that case, both indicators are visible.

## Context Menu Actions

Right-click on any file when a multi-selection is active to see bulk operations. The context menu detects the selection and offers actions that apply to all selected files.

### Merge N Notes

Available when 2 or more files are selected. This action:

1. Reads the content of each selected file, sorted alphabetically by path.
2. Combines them with `---` horizontal rule separators between each file's content.
3. Creates a new file named `Merged - {first-file} + {N-1} more.md` in the same directory as the first selected file.
4. Opens the merged file in the editor.
5. Clears the multi-selection.

The source files are not deleted. You can review the merged result before deciding whether to remove the originals.

This is a quick alternative to the [Note Composer](./note-composer.md) merge mode when you want a simple concatenation without heading insertion or file deletion options.

### Delete N Files

Available when 2 or more files are selected. This action:

1. Sends each selected file to the trash (if the trash feature is enabled) or deletes them permanently.
2. Refreshes the sidebar file tree.
3. Clears the multi-selection.

A confirmation is not shown for individual files -- the action executes immediately. Use with care. If the trash feature is enabled, deleted files can be recovered from the trash panel.

### Right-Click Behavior

When you right-click a file:

- If the file is already in the selection, the context menu shows bulk actions for the full selection.
- If the file is not in the selection but other files are selected, the right-clicked file is automatically added to the selection, and the context menu shows bulk actions for the updated selection.
- If no files are selected, the context menu shows standard single-file actions (New File, New Folder, Rename, Delete).

This ensures that right-clicking always acts on the visible selection, preventing the confusing scenario where bulk actions apply to a different set of files than what you see highlighted.

## Drag and Drop

Multi-select integrates with Noteriv's drag-and-drop system. When you drag a file that is part of a multi-selection, all selected files move together.

### Moving to a Folder

1. Select multiple files with `Ctrl+Click` or `Shift+Click`.
2. Drag any one of the selected files.
3. Drop on a folder in the sidebar.

All selected files are moved into the target folder. The folder expands automatically if it was collapsed. The multi-selection is cleared after the move.

### Visual Indicators

During a drag operation:

- The dragged file's opacity is reduced.
- When hovering over a folder, the folder is highlighted as a drop target.
- A drop line appears between items to indicate insertion position.

### Reordering

If you drag within the same directory (reordering), only the single dragged file's position changes. Reordering does not apply to the full multi-selection because reordering multiple files simultaneously would produce ambiguous results.

## Combining with Other Features

### With Note Composer

For more control over merging (adding headings between sections, deleting source files, or merging into an existing note), use the [Note Composer](./note-composer.md) instead. Multi-select merge is a quick-and-simple alternative.

### With Bookmarks

Multi-select does not interact with bookmarks directly. Each selected file would need to be bookmarked individually.

### With Trash

When the trash feature is enabled, "Delete N Files" sends files to the trash instead of permanently deleting them. You can then recover them from the trash panel if needed.

## Selection Persistence

The multi-selection is transient:

- It is cleared when you perform a bulk action (merge, delete, or drag-drop).
- It is cleared when you click a file normally (without `Ctrl` or `Shift`).
- It persists across sidebar scrolling and folder expansion/collapse.
- It does not persist across app restarts or vault switches.

## Complete Workflow Example

Suppose you have a folder of meeting notes and want to consolidate the last five into a single file:

1. Navigate to the `meetings/` folder in the sidebar.
2. Click the first meeting note.
3. `Shift+Click` the fifth meeting note. All five are selected and highlighted.
4. Right-click any of the highlighted files.
5. Select "Merge 5 Notes" from the context menu.
6. A new file `Merged - 2025-10-28-standup + 4 more.md` is created and opened.
7. Review the merged content. Each section is separated by `---`.
8. If satisfied, delete the originals: select the five original files again and right-click > "Delete 5 Files".

## Tips

- **Use `Ctrl+Click` for scattered files.** When the files you want are in different folders, `Ctrl+Click` each one individually.
- **Use `Shift+Click` for consecutive files.** When the files are in the same folder and adjacent, `Shift+Click` is faster.
- **Check the selection before right-clicking.** The highlighted files in the sidebar are exactly the files that will be affected by bulk actions.
- **Combine with folder organization.** Select multiple files and drag them into a new folder to reorganize your vault quickly.
- **Use multi-select merge for simple cases.** If you just want to concatenate files without options, multi-select merge is faster than opening Note Composer.
- **Undo is not available for bulk delete.** If the trash feature is off, deleted files are gone permanently. Enable trash or sync with Git before bulk-deleting.
