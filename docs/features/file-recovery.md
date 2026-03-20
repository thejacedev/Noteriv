---
title: File Recovery
order: 9
---

# File Recovery

File recovery is Noteriv's local snapshot system. Every time you save a note, a copy of the previous content is stored as a timestamped snapshot. If you make a mistake, lose content, or want to compare what a note looked like earlier, you can browse and restore any snapshot without relying on Git or an external backup.

## How Snapshots Work

### Automatic Capture

Before Noteriv writes new content to a file, it saves the current content as a snapshot. This happens transparently on every save operation -- you do not need to trigger it manually. If the content is empty (whitespace only), no snapshot is created.

### Storage Location

Snapshots are stored in `.noteriv/snapshots/` within your vault directory:

```
vault/
  .noteriv/
    snapshots/
      meeting-notes-1698012345678.md
      meeting-notes-1698015678901.md
      project-plan-1698018901234.md
```

The `.noteriv/` folder is created automatically when the first snapshot is saved. You should add `.noteriv/` to your `.gitignore` if you do not want snapshots synced to a remote repository (they are local recovery data and can be large).

### Naming Convention

Snapshot filenames follow the pattern `{sanitized-name}-{timestamp}.md`:

- **Sanitized name.** The file's relative path from the vault root, with `/` and `\` replaced by `__`, the extension stripped, and special characters replaced by `_`. For example, `projects/alpha/notes.md` becomes `projects__alpha__notes`.
- **Timestamp.** A Unix timestamp in milliseconds (e.g., `1698012345678`), ensuring uniqueness and chronological ordering.

### Retention Limit

Noteriv keeps up to **50 snapshots per file**. When a new snapshot would exceed this limit, the oldest snapshots are deleted automatically. This prevents unbounded disk usage while keeping a meaningful history window.

### Age-Based Cleanup

Noteriv can also clean up snapshots older than a configurable number of days (default: 30). This runs periodically and removes stale snapshots across all files in the vault.

## Recovery Screen

The file recovery screen lets you browse, preview, and restore snapshots for the currently open file.

### Opening the Screen

Open file recovery from the command palette (`Ctrl+Shift+P`, search for "File Recovery"). The recovery screen opens as a modal overlay.

### Layout

The screen has two panes:

#### Snapshot List (Left Pane)

Shows all snapshots for the current file, newest first. Each entry displays:

- **Date.** Formatted as a human-readable date (e.g., "Nov 3, 2025").
- **Time.** The exact time the snapshot was captured (e.g., "14:35:22").
- **Relative age.** A shorthand like "2h ago", "3d ago", or "1mo ago" for quick reference.
- **File size.** The size of the snapshot content (e.g., "2.4 KB").
- **Delete button.** A small X icon on each entry for removing individual snapshots you no longer need.

The header shows "Snapshots" and a count of the total number available.

#### Preview Pane (Right Pane)

When you click a snapshot in the list, its content is loaded and displayed as preformatted text in the preview pane. A "Restore" button appears in the preview header.

If no snapshot is selected, the preview pane shows the message "Select a snapshot to preview".

### Restoring a Snapshot

1. Click a snapshot in the list to load its preview.
2. Review the content in the preview pane.
3. Click the "Restore" button.

Restoring replaces the current editor content with the snapshot's content. The change is applied immediately in the editor, so you can undo it with `Ctrl+Z` if needed. A new snapshot of the pre-restore content is also saved, so you never lose the current state by restoring.

### Deleting Snapshots

Click the X button on any snapshot entry to delete it permanently. This is useful for removing snapshots you know you will never need (e.g., snapshots from a test save or an accidental paste).

If you delete the currently previewed snapshot, the preview pane resets to its empty state.

### Closing the Screen

Press `Esc`, click the X button in the header, or click outside the modal to close the recovery screen.

## Diff View

When comparing the current content to a snapshot, you can visually identify what changed:

- **Green lines** indicate content that was added since the snapshot.
- **Red lines** indicate content that was removed since the snapshot.
- **Unchanged lines** are displayed normally.

This color-coded diff makes it easy to understand what changed without reading the entire file.

## Snapshots vs. Note History

Noteriv has two overlapping but distinct history features:

| | File Recovery (Snapshots) | Note History (Git) |
|---|---|---|
| Storage | `.noteriv/snapshots/` | Git commit history |
| Trigger | Every save | Every Git commit |
| Requires Git | No | Yes |
| Granularity | Per-save | Per-commit |
| Retention | 50 per file, 30 days | Unlimited (Git history) |
| Use case | Quick undo of recent changes | Long-term version tracking |

Snapshots are your safety net for recent work. [Note History](./note-history.md) is your long-term audit trail. Both can be used simultaneously.

## Performance Considerations

Snapshots are lightweight:

- Each snapshot is a plain text file, so disk usage is proportional to the size of your notes.
- The snapshot directory is read lazily -- Noteriv only scans it when you open the recovery screen.
- Writing a snapshot is a single file-write operation that happens in the background after the main save completes.
- The 50-snapshot limit and age-based cleanup keep the directory from growing indefinitely.

For a typical note of 5 KB, 50 snapshots use about 250 KB. Even with thousands of notes, the total snapshot storage is usually a few hundred megabytes at most.

## Tips

- **Check recovery before panicking.** If you accidentally deleted text or overwrote a section, open file recovery before trying to reconstruct from memory. The snapshot is probably there.
- **Use restore + undo for comparison.** Restore a snapshot, visually compare it to what you had, then `Ctrl+Z` if you want to go back to the current version.
- **Clean up after experiments.** If you made many test saves while iterating on formatting or structure, delete the intermediate snapshots to keep the list manageable.
- **Add `.noteriv/` to `.gitignore`.** Snapshots are local recovery data. Syncing them to Git adds noise and uses storage without benefit.
