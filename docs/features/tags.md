---
title: Tags
order: 3
---

# Tags

Tags let you categorize and cross-reference notes without folders. Write a `#tag` anywhere in a note's body and Noteriv will index it, count it, and make it searchable across your entire vault.

## Syntax

A tag starts with `#` followed by a letter, then any combination of letters, digits, hyphens, and forward slashes. Tags must be preceded by whitespace or appear at the start of a line.

```markdown
This note is about #rust and #systems-programming.
```

### Rules

- Tags must start with a letter after the `#`. Pure numbers like `#123` are not treated as tags.
- Hyphens are allowed: `#long-running-task` is a valid tag.
- Headings are not tags. A line starting with `# My Heading` is parsed as a heading, not a tag.
- Tags inside fenced code blocks (`` ``` ``) are ignored. If you write `#example` inside a code block, it will not appear in the tag pane.
- Tags inside inline code (`` `#example` ``) are ignored.
- Tags inside URLs (e.g., `https://example.com/page#anchor`) are ignored. The parser strips URLs before scanning for tags to avoid false positives.

### Frontmatter Tags

Tags can also be declared in YAML frontmatter:

```yaml
---
tags: [project, alpha, urgent]
---
```

Frontmatter tags are indexed by the dataview engine and appear in query results. The tag pane indexes tags from the note body using the `#` syntax.

## Hierarchical Tags

Use `/` to create nested tag hierarchies:

```markdown
#project/alpha
#project/alpha/backend
#project/beta
```

In the tag pane, these render as a collapsible tree:

```
project (3 total)
  alpha (2)
    backend (1)
  beta (1)
```

Hierarchical tags are useful for organizing large tag vocabularies without creating hundreds of flat tags. You can expand and collapse branches in the tree to focus on specific areas.

There is no limit to nesting depth. `#a/b/c/d/e` works, though keeping hierarchies shallow (two or three levels) is recommended for readability.

## Tag Pane

The tag pane is a sidebar panel that shows every tag in your vault as a navigable tree.

### Opening the Pane

Open the tag pane from the command palette (`Ctrl+Shift+P`, search for "Toggle Tag Pane") or from the sidebar panel selector.

### Layout

The pane has three sections:

1. **Header.** Shows the label "Tags" and the total number of unique tags in the vault. Three action buttons sit on the right: expand all, collapse all, and refresh.

2. **Filter input.** A search field for filtering the tag tree. Type a substring to narrow the list. Only tags (or tag branches) that contain the filter string are shown. A clear button appears when the filter is active.

3. **Tag tree.** The main content area. Each row shows a `#` prefix, the tag segment name, and the total count (the tag's own count plus all descendants). Rows with children display a chevron that toggles expansion.

### Interaction

- **Click a tag** to select it. The tag pane highlights the selected tag and reveals a list of files that contain it. Each file entry shows the filename without extension and is clickable to open the file in the editor.
- **Click the chevron** (or click a parent tag that has children) to expand or collapse the branch.
- **Expand All / Collapse All** buttons in the header toggle the entire tree at once.
- **Refresh** rescans the vault. The tag pane scans automatically when it becomes visible or the vault changes, but you can force a refresh if you have just edited tags.

### Sorting

Tags are sorted by total count (descending), then alphabetically. The most-used tags appear at the top of each level. Within a branch, children follow the same sorting rule.

## How Tags Are Extracted

Noteriv scans every `.md` and `.markdown` file in the vault using a regular expression that:

1. Detects fenced code blocks and skips their contents entirely.
2. Skips heading lines (lines starting with `# `, `## `, etc.).
3. Strips inline code spans and URLs from each line before scanning.
4. Matches the pattern `#[letter][word-chars-hyphens-slashes]*`.

The scan runs in parallel batches of 10 files at a time to balance speed against file-system load. Results are deduplicated per file -- if you use `#important` five times in one note, it counts as one file for that tag.

## Using Tags with Vault Search

Tags are searchable through vault search (`Ctrl+Shift+F`). Searching for `#project` will find every line in the vault that contains that tag, with line numbers and context snippets. This is useful for a quick ad-hoc check without opening the tag pane.

## Using Tags with Dataview

Dataview queries can filter by tag:

```dataview
TABLE title, status FROM #project WHERE status != "done" SORT BY title
```

This returns all notes tagged with `#project` that have a `status` frontmatter field not equal to "done". See the [Dataview](./dataview.md) documentation for the full query syntax.

## Using Tags with Lint

The markdown linter detects duplicate tags within a single note. If you accidentally use `#important` on line 3 and again on line 47, the lint panel will flag the second occurrence as an info-level message:

```
Duplicate tag #important (first used on line 3)
```

This helps keep your tagging consistent and avoids unintentional repetition.

## Tips

- **Use hierarchical tags for broad categories.** Instead of `#alpha-project-backend`, use `#project/alpha/backend`. The tree view makes hierarchies much easier to navigate.
- **Keep tag names lowercase.** While Noteriv's tag pane is case-sensitive in display, search and filtering are case-insensitive. Consistent casing avoids visual clutter.
- **Combine tags with folders.** Tags and folders serve different purposes. Folders give a file a single physical location; tags let a note belong to multiple categories. Use both together for maximum flexibility.
- **Review the tag pane periodically.** Stale or misspelled tags accumulate over time. A quick scan of the tag pane helps you spot and consolidate them.
