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

## Display Text

If you want the rendered link to show different text from the filename, use the pipe syntax:

```markdown
Read the [[project-plan|original plan]] before the review.
```

This renders as a link labeled "original plan" that navigates to the `project-plan.md` file when clicked. The part before the pipe is the target filename; the part after the pipe is the display text.

Display text is useful when the filename is technical or abbreviated but you want the prose to read naturally. To give a note another name that works in every link, see [Note Aliases](#note-aliases).

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

## Note Aliases

An alias is another name for a note. List a note's aliases in its frontmatter, under `aliases`:

```markdown
---
aliases: [AI, Machine Intelligence]
---
```

A YAML list with one name per line works too, and so does a single name, or several names separated by commas. `alias` is read the same way as `aliases`. Aliases are read by the desktop app; versions up to 2.4.13 do not read them.

With the lines above in a note called `Artificial Intelligence.md`:

| Where | What an alias does |
|---|---|
| Links | `[[AI]]` opens the note, and `[[AI#History]]` opens it at that heading |
| Autocomplete | Typing `[[` and part of an alias offers the note. See [Autocomplete](#autocomplete) |
| [Quick Open](./search.md#finding-a-note-by-alias) | Typing an alias finds the note |
| [Links panel](#links-panel) | A link written with an alias counts as a backlink, and an alias written as plain text is an unlinked mention |
| [Graph view](../views/graph-view.md) | A link written with an alias is drawn as a link to the note |

How aliases are matched:

- Case is ignored: `[[ai]]` works as well as `[[AI]]`.
- A link is matched against note names first. An alias is only used when no note has that name, so a note called `AI.md` wins over a note with the alias `AI`.
- If two notes have the same alias, the link goes to the first of them in the file listing.
- Embeds use aliases the same way: `![[AI]]` shows the note when no note is named `AI`.
- The [lint panel](./lint.md) does not report a link written with an alias as broken.

## Autocomplete

Typing `[[` in the editor activates wiki-link autocomplete. As you continue typing, a dropdown appears showing notes in your vault whose path matches what you have typed so far. The list updates with each keystroke and shows up to 30 notes.

Once you have typed at least one character, aliases that match are offered as well, each marked `alias of` and the note it belongs to. Choosing one inserts `[[Note|alias]]`: the link points at the note and shows the alias as its text.

Notes matched by [Excluded files](./file-settings.md#excluded-files) are not suggested.

The autocomplete data is cached for 5 seconds to keep the experience snappy in large vaults. The cache is refreshed automatically after it expires.

To accept a suggestion:

- Use the arrow keys to highlight an entry, then press `Enter` or `Tab`.
- Click a suggestion with the mouse.

The completion inserts the note's path and the closing `]]` brackets for you, so you do not need to type them manually.

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

Sound, video and PDF files can be embedded as well (desktop app, after 2.4.13):

```markdown
![[interview.mp3]]
![[demo.mp4]]
![[paper.pdf]]
![[paper.pdf#page=3]]
```

| File | Endings | What is shown |
|---|---|---|
| Sound | `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.3gp` | A player, in the note |
| Video | `.mp4`, `.webm`, `.mov`, `.mkv`, `.ogv` | A player, in the note |
| PDF | `.pdf` | A card with the file name, and the page if you gave one. Click it to open the PDF, at that page |

A player does not read its file until you first use it, so a note with many recordings still opens quickly. Whether a file plays depends on the formats your system can play.

These files are found the way embedded images are: by their path inside the vault, or by name from anywhere in it. If two files share a name, the one in the shallowest folder is used.

A few things to know:

- An embed of a note written inside a sentence stays a link rather than expanding. Images, players and PDF cards are shown wherever they are written.
- Long notes are cut off after 150 lines, and the box scrolls.
- Embedded content is shown with basic formatting. Callouts, math and diagrams inside the embedded note are not drawn the way they are in the note itself.
- [Comments](../editor/comments.md) in the embedded note are left out.
- Files that open in their own view, such as drawings and canvases, stay links. Clicking the link opens the file.
- A base is the exception: `![[Projects.base]]` on a line of its own shows the base in the note, and `![[Projects.base#Cards]]` opens it on the view called `Cards`. See [Bases](../views/bases.md).
- Web pages are not embedded. An `<iframe>` in a note is removed when the note is drawn. This is on purpose: a note can arrive through sync or the web clipper, and a frame could load anything.

## Links to Other Files

A wiki-link can point at a file that is not a note. Write the file name with its ending:

```markdown
The figures are in [[paper.pdf]], and the table is on [[paper.pdf#page=3]].
```

Clicking the link opens the file in Noteriv. A PDF opens in the [PDF viewer](../views/pdf-viewer.md), at the page given after `#page=` if there is one. Images, canvases, drawings and bases open in their own views too. Versions up to 2.4.13 do nothing when a link to a file other than a note is clicked.

The file is found by its path inside the vault, or failing that by its name, with the shallowest file winning a shared name. Notes come first: if a note matches the link, the note is opened.

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

## Links Panel

The links panel shows how the open note is connected to the rest of the vault. It has four sections: Backlinks, Unlinked mentions, Outgoing links and Possible links. It is generated for you -- you do not need to maintain it. The panel described here is in the desktop app. Versions up to 2.4.13 have a backlinks list only.

### Opening the Panel

Open the command palette (`Ctrl+Shift+P`) and run **Toggle Backlinks**. Run it again, or click the X in the panel's header, to close it. The command has no default shortcut; you can give it one in Settings > Shortcuts.

Each section has a header with its name and a count. Click the header to fold or unfold the section. Possible links starts folded.

### Backlinks

Backlinks are the notes that link to the open note. A link counts whether it is written with the note's name, its path or one of its [aliases](#note-aliases), and whether it is a link or an embed:

- `[[filename]]`
- `[[filename|display text]]`
- `[[filename#heading]]`
- `![[filename]]`

Results are grouped by note and sorted alphabetically by note name, then by line number within each note. Under each note is a row for each line that holds a link, showing:

- **Line number.** The line where the link appears, shown as `L12`, `L45`, etc.
- **Snippet.** Up to 160 characters of the line containing the link, giving you context without having to open the file.

Click a note's name to open it. Click a line to open the note at that line. Links from the note to itself are not listed.

### Unlinked Mentions

Unlinked mentions are lines in other notes where the open note's name, or one of its aliases, is written as plain text and not as a link. The matched text is highlighted.

Click **Link** beside a mention to turn it into a link. Noteriv changes that line in the other note's file:

| The text as written | Becomes |
|---|---|
| The same as the note's name | `[[Note]]` |
| Anything else, such as an alias or different capitals | `[[Note\|text as written]]` |

If the line has changed since the panel found it, nothing is written and the list is refreshed.

What counts as a mention:

- A whole word or phrase, not part of a longer word. Case is ignored.
- Text that is not already inside a link, an embed, inline code, a web address or a `#tag`.
- Names and aliases shorter than three characters are not looked for, because they would match everywhere.
- Notes matched by [Excluded files](./file-settings.md#excluded-files) are not searched.

### Outgoing Links

Outgoing links are the notes and files the open note links to. Each one is listed once, in the order it first appears. A target the note links to more than once shows the number, such as `×3`.

Click a row to open the note. A target that does not match a note in the vault is struck through and cannot be clicked. That covers links to notes that do not exist yet, and also links and embeds that point at files other than notes, such as `![[photo.png]]`.

Links inside code blocks and inline code are not listed. The list is made from the text in the editor, so it changes as you type.

### Possible Links

Possible links are places in the open note where the name or an alias of another note is written as plain text. It is the reverse of unlinked mentions: it looks at the note you are in.

Each row shows the line number and the line, with the match highlighted. Click **Link** to turn the text into a link to that note, written as `[[Note]]` or `[[Note|text as written]]` by the same rule as above. The change is made to the text of the open note, and it is saved the next time the note is saved.

As with unlinked mentions, a match is a whole word or phrase that is not already inside a link, inline code, a web address or a tag, and names shorter than three characters are skipped. Text inside fenced code blocks is skipped too. At most 60 are listed.

## Live Rendering

In live mode, wiki-links on non-cursor lines are rendered as styled clickable text. The double brackets are hidden, and only the display text (or filename if no alias is set) is visible. Placing your cursor on the line reveals the raw `[[...]]` syntax for editing.

`Ctrl+Click` on a rendered wiki-link opens the linked note. A regular click places your cursor on the link for editing.

## Tips

- **Keep filenames short and descriptive.** Since resolution is by filename, shorter names mean faster typing and fewer collisions.
- **Use display text for readability.** Write `[[api-auth|authentication flow]]` instead of contorting your prose to fit a filename.
- **Give a note aliases for the names you actually use.** A note called `Artificial Intelligence` with the alias `AI` can be linked either way.
- **Check the links panel regularly.** Backlinks reveal connections you might not remember making, and unlinked mentions show the ones you have not made yet.
- **Use the lint panel** to catch broken wiki-links. Noteriv's linting engine flags any `[[target]]` that does not resolve to an existing file.
