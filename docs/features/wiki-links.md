---
title: Wiki-Links
order: 2
---

# Wiki-Links

Wiki-links are the primary way to connect notes in Noteriv. They use double-bracket syntax -- `[[note name]]` -- and resolve to files in your vault by filename, making it easy to build a web of interlinked ideas without worrying about file paths or URLs.

## Basic Syntax

To link to another note, wrap the note's filename (without the `.md` extension) in double square brackets:

```markdown
See [[meeting-notes]] for context.
```

When Noteriv encounters `[[meeting-notes]]`, it searches your vault for a file whose basename matches `meeting-notes` (case-insensitive). If a file called `Meeting-Notes.md`, `meeting-notes.md`, or `MEETING-NOTES.md` exists anywhere in the vault, the link resolves to it.

You do not need to include the file extension. Writing `[[meeting-notes.md]]` also works -- Noteriv strips a trailing `.md` before matching -- but the extension-free form is conventional.

## Display Text Aliases

If you want the rendered link to show different text from the filename, use the pipe syntax:

```markdown
Read the [[project-plan|original plan]] before the review.
```

This renders as a link labeled "original plan" that navigates to the `project-plan.md` file when clicked. The part before the pipe is the target filename; the part after the pipe is the display text.

Aliases are useful when the filename is technical or abbreviated but you want the prose to read naturally.

## Heading Anchors

You can link to a specific heading within a note by appending `#heading-text`:

```markdown
See [[architecture#caching-strategy]] for details.
```

When you click this link, Noteriv opens the `architecture.md` file and scrolls to the heading that matches "caching-strategy". The match is case-insensitive and spaces in the heading are converted to hyphens automatically.

You can combine heading anchors with display text:

```markdown
Refer to the [[architecture#caching-strategy|caching section]] in the architecture doc.
```

## Autocomplete

Typing `[[` in the editor activates wiki-link autocomplete. As you continue typing, a dropdown appears showing files in your vault whose names match what you have typed so far. The list updates with each keystroke and shows up to 30 results.

The autocomplete data is cached for 5 seconds to keep the experience snappy in large vaults. The cache is refreshed automatically after it expires.

To accept a suggestion:

- Use the arrow keys to highlight an entry, then press `Enter` or `Tab`.
- Click a suggestion with the mouse.

The completion inserts the filename and closing `]]` brackets for you, so you do not need to type them manually.

## How Resolution Works

When Noteriv resolves a wiki-link, it follows a two-pass strategy:

1. **Basename match.** It compares the link target (lowercased, `.md` stripped) against the basename of every file in the vault. The first case-insensitive match wins. This means a link like `[[notes]]` will resolve to `Notes.md` regardless of which folder it lives in.

2. **Path match.** If the link target contains a `/` character -- for example, `[[projects/alpha]]` -- Noteriv looks for the file at that path inside the vault, `projects/alpha.md`. This lets you disambiguate when two files in different folders share the same basename. The path has to be the whole path from the top of the vault: `[[alpha/notes]]` does not find `projects/alpha/notes.md`.

If no file matches, the link is rendered as an unresolved link, styled differently so you can see at a glance that the target does not exist yet. Clicking an unresolved link will create the file for you.

## Embedding with `![[]]`

Prefixing a wiki-link with `!` turns it into an embed:

```markdown
![[meeting-notes]]
```

On a line of its own, this shows the content of `meeting-notes.md` inline in the current note, in a box titled with the note's name. Click the title to open the note. Embeds are useful for reusing content across notes -- for example, embedding a template section or a reference table.

You can embed part of a note:

```markdown
![[meeting-notes#Decisions]]
![[meeting-notes#^action-items]]
```

The first shows the section under the "Decisions" heading, up to the next heading of the same level. The second shows the paragraph that carries the block id `^action-items`.

Image files can also be embedded this way, by name from anywhere in the vault, with an optional width or width and height:

```markdown
![[diagram.png]]
![[diagram.png|160]]
![[diagram.png|320x200]]
```

A few things to know:

- An embed written inside a sentence stays a link rather than expanding.
- Long notes are cut off after 150 lines, and the box scrolls.
- Embedded content is shown with basic formatting. Callouts, math and diagrams inside the embedded note are not drawn the way they are in the note itself.
- Files that open in their own view, such as drawings, canvases and PDFs, stay links.

## Renaming and Moving Notes

When you rename or move a note, an attachment or a folder in Noteriv, the links that point to it are rewritten in every note, so they keep working. Versions up to 2.4.13 do not do this.

The rule is that every link points at the same file after the rename as it did before:

| Before | You do | After |
|---|---|---|
| `[[Inbox]]`, `[[Inbox#Today\|today]]`, `![[Inbox]]` | Rename `Inbox` to `Home` | `[[Home]]`, `[[Home#Today\|today]]`, `![[Home]]` |
| `[[Projects/Plan]]` | Rename the folder `Projects` to `Work` | `[[Work/Plan]]` |
| `[[Plan]]` | Move `Plan` to another folder | Unchanged: a link by name still finds it |
| `![[photo.png]]` | Rename `photo.png` to `team.png` | `![[team.png]]` |
| `![photo](attachments/photo.png)` | Rename the folder `attachments` to `files` | `![photo](files/photo.png)` |

Headings, block references, display text and image sizes in a link are kept. A link that still works is left exactly as you wrote it. If two notes share a name and a rename would make a link by name point at the other one, the link is written out with its path, such as `[[Archive/Plan]]`.

The status bar says how many links were updated. Notes that are open are updated too, and unsaved edits in them are kept.

A few things are deliberately left alone:

- Links inside code blocks and inline code.
- Links that did not point at anything before the rename.
- Links written relative to the note's own folder, such as `[text](../Other.md)`. Noteriv reads a `[text](path)` link as a path from the top of the vault, and that is the form it updates.
- File references inside `.canvas` files and folder names in `dataview` queries.

Links are only updated when the rename is done in the desktop app. Renaming a file in your file manager, on mobile or through the MCP server does not update them. A rename can now change many notes at once, so if you sync, let the other devices sync before you edit the same notes there.

To turn this off, go to Settings > General and switch off **Update links on rename**.

## Backlinks Panel

The backlinks panel shows every note in your vault that contains a wiki-link pointing to the file you currently have open. It is a read-only, automatically generated view -- you do not need to maintain it.

### Opening the Panel

Open the backlinks panel from the command palette (`Ctrl+Shift+P`, then search for "Toggle Backlinks") or by clicking the backlinks icon in the editor toolbar.

### What It Shows

For each source file that links to your current note, the panel displays:

- **File name.** The basename of the linking note, without the extension.
- **Line number.** The exact line where the link appears, shown as `L12`, `L45`, etc.
- **Snippet.** Up to 120 characters of the line containing the link, giving you context without having to open the file.

Results are grouped by source file and sorted alphabetically by filename, then by line number within each file.

### Scanning

When you open the backlinks panel or switch to a different file, Noteriv scans every `.md` and `.markdown` file in the vault for references to the current file's basename. The scan runs in parallel with a concurrency limit to avoid blocking the UI, and self-references (the current file linking to itself) are excluded.

The regex used for matching handles all wiki-link forms:

- `[[filename]]`
- `[[filename|alias]]`
- `![[filename]]`
- `![[filename|alias]]`

### Navigating

Click any backlink entry to open the source file in the editor. This makes backlinks a fast way to trace the connections between your notes without manually searching.

## Live Rendering

In live mode, wiki-links on non-cursor lines are rendered as styled clickable text. The double brackets are hidden, and only the display text (or filename if no alias is set) is visible. Placing your cursor on the line reveals the raw `[[...]]` syntax for editing.

`Ctrl+Click` on a rendered wiki-link opens the linked note. A regular click places your cursor on the link for editing.

## Tips

- **Keep filenames short and descriptive.** Since resolution is by filename, shorter names mean faster typing and fewer collisions.
- **Use aliases for readability.** Write `[[api-auth|authentication flow]]` instead of contorting your prose to fit a filename.
- **Check backlinks regularly.** The backlinks panel reveals connections you might not remember making, which is valuable when revisiting old notes.
- **Use the lint panel** to catch broken wiki-links. Noteriv's linting engine flags any `[[target]]` that does not resolve to an existing file.
