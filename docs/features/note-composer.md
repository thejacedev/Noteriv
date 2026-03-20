---
title: Note Composer
order: 11
---

# Note Composer

Note Composer is a tool for restructuring your notes. It has two modes: merge, which combines multiple files into one, and split, which breaks a single file into separate files at heading boundaries. Both operations work on standard Markdown files and preserve all content.

## Opening Note Composer

Open Note Composer from the command palette (`Ctrl+Shift+P`, search for "Note Composer"). It opens as a modal overlay with the currently active file as the target.

## Merge Mode

Merge mode lets you select files from your vault and append their content to the current note.

### Selecting Files

The merge interface shows:

1. **Search bar.** Filters the file list by name or path as you type. A badge on the right shows how many files are currently selected (e.g., "3 selected").

2. **File list.** Every file in the vault except the current one. Each entry shows the filename (without extension) and the relative path. Click a file to toggle its selection -- a checkmark appears next to selected files.

3. **Options.** Two checkboxes below the file list:
   - **Add filename as heading (h2) between merged content.** When checked (default), each merged file's content is preceded by an `## {filename}` heading. This helps you identify where each piece of content came from.
   - **Delete source files after merge.** When checked, the original files are deleted after their content has been merged. Use this with caution -- it is a destructive operation.

### How Merging Works

When you click the "Merge N files" button:

1. Noteriv reads the content of each selected file in order.
2. If the heading option is enabled, it prepends an `## {filename}` heading (without extension) before each file's content.
3. It appends the merged block to the end of the current note's content, separated by a blank line.
4. If the delete option is enabled, it deletes each source file.
5. The modal closes and the editor shows the updated content.

The merge preserves all formatting, frontmatter, and wiki-links from the source files. Since the content is appended as raw Markdown, you can rearrange it afterward.

### Order

Files are merged in the order they appear in the selection list. The selection list follows the order you clicked the files. If you need a specific order, click the files in that sequence.

## Split Mode

Split mode breaks the current note into multiple files, using headings as boundaries.

### Choosing a Split Level

The split interface has a toggle to select the heading level:

- **H1 headings.** Splits at every `# Heading` in the document.
- **H2 headings.** Splits at every `## Heading` in the document (default).

Only the selected level is used as a split boundary. Headings at other levels are treated as regular content within their section.

### Preview

Before splitting, Noteriv shows a preview of the files that would be created. Each preview entry shows:

- **File name.** Derived from the heading text, sanitized for use as a filename. Special characters (`< > : " / \ | ? * #`) are removed, spaces are replaced with hyphens, and the result is truncated to 200 characters. If a heading has no text, the file is named `Untitled.md`.
- **Content preview.** The first 200 characters of the section's content, giving you a sense of what each file will contain.

If the document has no headings at the selected level, the preview shows a message: "No H1/H2 headings found to split on."

### Preamble Handling

Content before the first heading at the target level is captured as a "Preamble" section. This ensures nothing is lost -- even if your note starts with introductory text before any headings.

### How Splitting Works

When you click the "Split into N files" button:

1. Noteriv splits the content at each heading boundary, producing an array of `{ title, content }` sections.
2. For each section, it creates a new `.md` file in the same directory as the current note. The filename is the sanitized heading text.
3. If a file with the same name already exists and is the current file, it is skipped to avoid overwriting.
4. After all files are created, Noteriv opens the first new file in the editor.
5. The modal closes.

The original file is not deleted or modified. You can delete it manually after verifying the split results.

## File Name Sanitization

Both merge (when creating headings) and split (when creating files) sanitize names using the same rules:

1. Remove characters that are invalid in filenames: `< > : " / \ | ? * #`.
2. Collapse consecutive whitespace to a single space.
3. Replace spaces with hyphens.
4. Collapse consecutive hyphens.
5. Remove leading and trailing hyphens.
6. Truncate to 200 characters.
7. If the result is empty, use "Untitled".

## Current File Indicator

The Note Composer modal always shows the current file's name at the top, so you know which file is the merge target or split source. This is displayed with a file icon and the filename without extension.

## Use Cases

### Consolidating Research

You have five files about different aspects of the same topic. Open one as the target, use merge mode to combine the others into it, and enable the heading option so each source file's content is clearly delineated.

### Breaking Up a Long Note

A note has grown to hundreds of lines with multiple H2 sections that would be better as standalone files. Open it, switch to split mode, choose H2, preview the result, and split. Each section becomes its own file.

### Refactoring a Project

A project note has sections for design, implementation, and testing. Split it into three files, then create a new index note that wiki-links to each one.

### Combining Daily Notes

At the end of the week, merge your five daily notes into a weekly summary file. Enable headings so each day is labeled.

## Tips

- **Preview before splitting.** The preview pane shows exactly what files will be created and what they will contain. Check it before committing.
- **Back up before destructive merges.** If you enable "delete source files after merge," there is no undo. Make sure you have [File Recovery](./file-recovery.md) snapshots or a Git sync before proceeding.
- **Use split for outline-driven writing.** Start with a single file containing your outline as H2 headings, flesh out each section, then split when the file gets unwieldy.
- **Reorder after merging.** Merge appends content in selection order. If you need a different arrangement, rearrange the sections in the editor after merging.
- **The original file is preserved after split.** You can compare the original to the split results before deleting it.
