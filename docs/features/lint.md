---
title: Lint
order: 14
---

# Lint

The markdown linting panel checks your notes for common structural issues: broken links, empty headings, unclosed code blocks, and more. It runs against the currently open file and displays results in a color-coded list, sorted by severity.

## Opening the Lint Panel

Press `Ctrl+Shift+L` (or `Cmd+Shift+L` on macOS) to toggle the lint panel. You can also open it from the command palette (`Ctrl+Shift+P`, search for "Toggle Lint Warnings").

## Lint Rules

Noteriv checks for the following issues in the current file:

### Broken Wiki-Links (Error)

Every `[[target]]` wiki-link in the file is checked against the vault's file list. If the target does not match any existing file (case-insensitive basename comparison), the lint panel reports an error.

```
Line 15, Col 3: Broken wiki-link: [[nonexistent-note]]
```

This catches typos in link targets, references to deleted files, and links to files you intended to create but have not yet.

The check considers the display text alias syntax (`[[target|alias]]`) -- only the target portion before the pipe is validated.

### Empty Headings (Warning)

A heading line with no text after the `#` characters triggers a warning.

```markdown
##
```

```
Line 8, Col 3: Empty heading
```

Empty headings are usually accidental -- the result of deleting heading text during editing. They create empty entries in the outline panel and table of contents.

### Duplicate Headings (Warning)

If two headings at the same level have identical text (case-insensitive), the second occurrence is flagged.

```markdown
## Setup
...content...
## Setup
```

```
Line 22, Col 1: Duplicate heading "Setup" (same as line 5)
```

Duplicate headings are problematic for heading anchors (only one can be reliably targeted) and for the outline panel (two identical entries are confusing). The lint rule compares at the same heading level, so an `## Overview` and a `### Overview` are not considered duplicates.

### Unclosed Code Blocks (Error)

If a fenced code block is opened with `` ``` `` or `~~~` but never closed, the linter flags the opening fence.

```
Line 34, Col 1: Unclosed code block
```

Unclosed code blocks cause everything after the opening fence to be treated as code, which usually hides all subsequent formatting. This is a high-severity error because it affects the rendering of the entire rest of the document.

### Broken Images (Error)

Image syntax with an empty or clearly invalid local path is flagged:

```markdown
![screenshot]()
![diagram](.)
```

```
Line 12, Col 1: Broken image path: (empty)
```

URLs (`http://`, `https://`) and data URIs are not flagged, as they cannot be validated locally. Only local paths that are empty or obviously broken (like a bare `.`) are reported.

### Duplicate Tags (Info)

If the same tag appears more than once in a file, the second and subsequent occurrences are flagged.

```markdown
This is #important for the project.
...
Remember, this is #important.
```

```
Line 47, Col 12: Duplicate tag #important (first used on line 3)
```

Duplicate tags are not an error -- the note will work fine -- but they are usually unintentional. The tag pane counts each file only once per tag regardless of how many times it appears, so duplicates do not affect tag counts.

Tag matching is case-insensitive: `#Important` and `#important` are considered duplicates.

### Missing H1 (Info)

If the document has content but no H1 heading (`# Title`), an info message is shown.

```
Line 1, Col 1: Document has no H1 heading
```

This is informational, not an error. Many valid notes do not need an H1 heading, but it can be useful to catch files where the title heading was accidentally deleted.

## Severity Levels

Each lint result is assigned a severity level that determines its color in the panel:

| Level | Color | Meaning |
|---|---|---|
| Error | Red | Something is broken and should be fixed. Broken links, broken images, unclosed code blocks. |
| Warning | Yellow | A probable mistake that may cause confusion. Empty headings, duplicate headings. |
| Info | Blue | A suggestion or observation. Duplicate tags, missing H1. |

Results are sorted by severity (errors first, then warnings, then info), and within each severity by line number.

## Lint Panel Layout

The lint panel displays:

1. **Header.** Shows "Lint" and the total number of warnings/errors.
2. **Results list.** Each entry shows:
   - A colored severity indicator (dot or icon).
   - The line and column number.
   - The rule name (e.g., `broken-wikilink`, `empty-heading`).
   - The human-readable message.

Clicking a result navigates the editor cursor to the corresponding line and column, so you can fix the issue immediately.

## When Linting Runs

The lint panel analyzes the current file's content each time:

- You toggle the panel open.
- You switch to a different file.
- The file content changes (debounced to avoid running on every keystroke).

Linting runs synchronously in the browser. For typical notes (under 10,000 lines), it completes in under 10 milliseconds.

## Code Block Awareness

The linter is aware of fenced code blocks. Tags, wiki-links, and headings inside code blocks are excluded from all checks. This prevents false positives from code examples:

````markdown
```markdown
# This heading is inside a code block and is NOT flagged
[[example-link]] is also not checked
#tag-in-code is not counted as a duplicate
```
````

## Interaction with Other Features

### Wiki-Links

Broken wiki-link detection depends on the vault's file list being available. The linter receives a list of all filenames (without extensions) and checks each wiki-link target against it. If the file list is not available (e.g., the vault has not finished loading), wiki-link checks are skipped.

### Tags

Duplicate tag detection uses the same tag regex as the [Tag Pane](./tags.md), ensuring consistent behavior. Tags on heading lines are excluded (headings start with `#` but are not tags).

### Outline

Empty and duplicate headings affect the outline panel's quality. Fixing lint warnings for headings directly improves the outline view.

## Complete Example

Given this Markdown:

```markdown
## Introduction

This note covers #design patterns in software.

See [[singleton]] for a common example.

##

The {{factory pattern}} creates objects.

#design is fundamental to architecture.

![diagram]()

See [[nonexistent-page]] for more.

## Introduction
```

The lint panel would show:

| Severity | Line | Message |
|---|---|---|
| Error | 12 | Broken image path: (empty) |
| Error | 14 | Broken wiki-link: [[nonexistent-page]] |
| Warning | 7 | Empty heading |
| Warning | 16 | Duplicate heading "Introduction" (same as line 1) |
| Info | 1 | Document has no H1 heading |
| Info | 11 | Duplicate tag #design (first used on line 3) |

## Tips

- **Run lint before publishing.** A quick lint check catches broken links and formatting issues before you share a note.
- **Fix errors first.** Red items (broken links, unclosed code blocks) are the most impactful. Warnings and info can be addressed at your discretion.
- **Use lint to find orphaned links.** After renaming or deleting a file, toggle lint on any note that might have linked to it. Broken wiki-link errors will reveal stale references.
- **Ignore missing H1 if intentional.** Not every note needs a title heading. If your workflow uses filenames as titles, you can safely ignore the "missing H1" info message.
- **Pair with the outline panel.** After fixing heading lint issues, open the outline (`Ctrl+Shift+O`) to verify the heading structure looks correct.
