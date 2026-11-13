---
title: Wiki-Links
order: 2
---

# Wiki-Links

Wiki-links are the primary way to connect notes in Noteriv. They use double-bracket syntax -- `[[note name]]` -- and find files in your vault by name, so you can link notes without writing out file paths or URLs.

Ordinary markdown links to notes, such as `[text](Note.md)`, work as well. See [Markdown Links](#markdown-links). Which of the two Noteriv writes when it adds a link for you is a setting: see [Link Format](#link-format).

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

You can link to a specific heading within a note by appending `#` and the heading's text:

```markdown
See [[architecture#Caching Strategy]] for details.
```

When you click this link, Noteriv opens the `architecture.md` file and scrolls to the heading "Caching Strategy". The heading is matched by its text. Letter case, extra spaces and inline formatting such as bold are ignored.

To link to one paragraph, give the paragraph a block id and link to that:

```markdown
See [[architecture#^cache-rule]].
```

This opens the note at the paragraph that carries the block id `^cache-rule`. A link with nothing before the `#`, such as `[[#Caching Strategy]]`, goes to a heading in the note you are in.

You can combine heading anchors with display text:

```markdown
Refer to the [[architecture#Caching Strategy|caching section]] in the architecture doc.
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
- Aliases are for wiki-links. A [markdown link](#markdown-links) such as `[text](AI)` is read as a path or a file name, not as an alias.
- The [lint panel](./lint.md) does not report a link written with an alias as broken.

## Autocomplete

Typing `[[` in the editor activates wiki-link autocomplete. As you continue typing, a dropdown appears showing notes in your vault whose path matches what you have typed so far. The list updates with each keystroke and shows up to 30 notes.

Once you have typed at least one character, aliases that match are offered as well, each marked `alias of` and the note it belongs to. Choosing one writes a link that points at the note and shows the alias as its text, such as `[[Note|alias]]`.

Notes matched by [Excluded files](./file-settings.md#excluded-files) are not suggested.

The autocomplete data is cached for 5 seconds to keep the experience snappy in large vaults. The cache is refreshed automatically after it expires.

To accept a suggestion:

- Use the arrow keys to highlight an entry, then press `Enter` or `Tab`.
- Click a suggestion with the mouse.

Choosing a suggestion writes the whole link for you, in place of the `[[` and whatever you typed after it. The link is written in the format chosen under [Link Format](#link-format) (after 2.4.13):

| Settings | What is written for the note `Projects/Deep/Spec.md` |
|---|---|
| The defaults | `[[Spec]]`, or `[[Projects/Deep/Spec]]` when another note called `Spec` would be found first |
| **Use \[\[Wikilinks\]\]** off | `[Spec](Spec.md)` |

If you type `![[` and choose a note, an embed is written: `![[Spec]]`. Versions up to 2.4.13 always insert the note's path and the closing `]]`, as in `[[Projects/Deep/Spec]]`.

## How Resolution Works

When you click a wiki-link, Noteriv works out where it leads in this order, and stops at the first step that finds something:

1. **A path from the note.** A target that starts with `./` or `../` is read as a path from the folder of the note the link is in (after 2.4.13). If a file is there, the link goes to it. A heading after `#` is allowed here too.
2. **A note, by name or by path.** The target is compared with the name of every note, and with every note's whole path from the top of the vault.
3. **A note, by alias.** If no note has that name or path, a note that lists the target as one of its [aliases](#note-aliases) is used.
4. **The part before the `#`.** If nothing has matched and the target contains `#`, the part before the first `#` is looked up by steps 2 and 3, and the rest is the heading or block to go to. The whole target is tried first so that a note with `#` in its name still opens.
5. **Another file.** If no note matched and the target ends in a file ending other than `.md` or `.markdown`, it is looked up among the files that are not notes: by its path from the top of the vault, and failing that by its name.

If no step finds anything, the click does nothing.

| Written | What it finds |
|---|---|
| `[[Plan]]` | The note called `Plan`, in whatever folder it is |
| `[[Projects/Plan]]` | The note at `Projects/Plan.md`, counted from the top of the vault |
| `[[./Plan]]` | The note `Plan` in the same folder as the note the link is in |
| `[[../Plan]]` | The note `Plan` one folder up from the note the link is in |
| `[[Plan#Scope]]`, `[[Plan#^intro]]` | The note `Plan`, at the heading `Scope` or at the block `^intro` |
| `[[AI]]` | The note with the alias `AI`, when no note is called `AI` |
| `[[paper.pdf]]`, `[[files/paper.pdf]]` | A file that is not a note. See [Links to Other Files](#links-to-other-files) |

How names and paths are compared:

- Letter case is ignored, a `.md` or `.markdown` ending is ignored, and `\` is read as `/`.
- A path without `./` or `../` has to be the whole path from the top of the vault: `[[Deep/Spec]]` does not find `Projects/Deep/Spec.md`. From a note in `Projects`, write `[[./Deep/Spec]]`, `[[Projects/Deep/Spec]]` or `[[Spec]]`.
- If several notes share a name, a link by name goes to the one whose path comes first in the file listing, which is sorted by path: `Archive/Plan` before `Projects/Plan`. Write the path to reach another one: `[[Projects/Plan]]`.
- A note at the top of the vault can share its name with a note that is listed before it, such as `Plan.md` beside `Archive/Plan.md`. Then `[[Plan]]` goes to `Archive/Plan`, and the only wiki-link that reaches the note at the top is a path from the linking note: `[[./Plan]]` or `[[../Plan]]`.
- A `./` or `../` path with no file at the end of it is read by the later steps. In practice that finds a file other than a note by its name: `[[./photo.png]]` finds a `photo.png` elsewhere in the vault when none is beside the note.

A wiki-link that finds nothing looks like any other link in the editor, and clicking it does not create a note. The [links panel](#outgoing-links) strikes such links through, and the [lint panel](./lint.md) reports a wiki-link whose name matches no note and no alias. A link written as a path is checked there by the name at the end of the path. Versions up to 2.4.13 report every link written as a path as broken.

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

An embed can also name its file by a path from the note it is written in, the way a [wiki-link](#how-resolution-works) can:

```markdown
![[./img/diagram.png]]
![[../img/diagram.png|160]]
![[./meeting-notes#Decisions]]
```

A few things to know:

- An embed of a note written inside a sentence stays a link rather than expanding. Images, players and PDF cards are shown wherever they are written.
- Long notes are cut off after 150 lines, and the box scrolls.
- Embedded content is shown with basic formatting. Callouts, math and diagrams inside the embedded note are not drawn the way they are in the note itself.
- [Comments](../editor/comments.md) in the embedded note are left out.
- Files that open in their own view, such as drawings and canvases, stay links. Clicking the link opens the file.
- A base is the exception: `![[Projects.base]]` on a line of its own shows the base in the note, and `![[Projects.base#Cards]]` opens it on the view called `Cards`. See [Bases](../views/bases.md).
- Web pages are not embedded. An `<iframe>` in a note is removed when the note is drawn. This is on purpose: a note can arrive through sync or the web clipper, and a frame could load anything.
- In a PDF export or a published page, a wiki-link is written as its text and an embedded picture as an image. Any other embed, an embedded note included, is written as the name of its file. Versions up to 2.4.13 write the brackets as they are.

## Links to Other Files

A wiki-link can point at a file that is not a note. Write the file name with its ending:

```markdown
The figures are in [[paper.pdf]], and the table is on [[paper.pdf#page=3]].
```

Clicking the link opens the file in Noteriv. A PDF opens in the [PDF viewer](../views/pdf-viewer.md), at the page given after `#page=` if there is one. Images, canvases, drawings and bases open in their own views too. Versions up to 2.4.13 do nothing when a link to a file other than a note is clicked.

The file is found by its path inside the vault, or failing that by its name, with the shallowest file winning a shared name. Notes come first: if a note matches the link, the note is opened. A path from the note the link is in works here as well, as in `[[../files/paper.pdf]]`.

A [markdown link](#markdown-links) to a file, such as `[the paper](files/paper.pdf#page=3)`, opens it the same way.

## Markdown Links

An ordinary markdown link can lead to a note or a file in your vault (desktop app, after 2.4.13):

```markdown
See [the plan](Projects/Plan.md) and [its scope](Projects/Plan.md#Scope).
The figures are in [the paper](files/paper.pdf#page=3).
Back to [the top](#Overview).
```

| Link | A click |
|---|---|
| `[text](Projects/Plan.md)` | Opens the note |
| `[text](Projects/Plan.md#Scope)` | Opens the note at the heading `Scope` |
| `[text](Projects/Plan.md#^intro)` | Opens the note at the block `^intro` |
| `[text](files/paper.pdf#page=3)` | Opens the PDF at page 3. Other files open in their own views |
| `[text](#Overview)` | Goes to the heading `Overview` in the note you are in |

This works in live mode and in view mode. A link that leads to no file does nothing when clicked. Versions up to 2.4.13 do not open a markdown link to a note.

### How a Path Is Read

Where Noteriv looks depends on how the path starts:

| Written | Where Noteriv looks |
|---|---|
| `[text](/Projects/Plan.md)` | From the top of the vault, and nowhere else |
| `[text](./Plan.md)` | From the folder of the note the link is in. If nothing is there, from the top of the vault |
| `[text](../Plan.md)` | From the folder of the note the link is in, going one folder up. If nothing is there, the link leads nowhere |
| `[text](Projects/Plan.md)` | From the top of the vault. If nothing is there, from the folder of the note the link is in |
| `[text](Plan.md)` | From the top of the vault, then from the folder of the note the link is in. If neither has it, by name, the way a [wiki-link](#how-resolution-works) finds a note or a file |

Only a bare name is found by name. A path with a folder in it has to lead to the file: in a note at the top of the vault, `[text](Deep/Spec.md)` does not find `Projects/Deep/Spec.md`.

At each place Noteriv looks for the exact path first, then the same path with letter case ignored, then a note with its ending left off, so `[text](Projects/Plan)` finds `Projects/Plan.md`. A path that climbs above the top of the vault leads nowhere.

The path can be written in these ways:

| Written | Meaning |
|---|---|
| `[text](My%20notes/Plan.md)` | Percent-encoded. The path is decoded first. If that finds nothing, it is read as written |
| `[text](My notes/Plan.md)` | With spaces as they are |
| `[text](<My notes/Plan.md>)` | Inside angle brackets |
| `[text](Notes/My note (draft).md)` | With parentheses, when they pair up |
| `[text](Plan.md "The plan")` | With a title: a quoted string at the very end, after a space |
| `[text](Notes/C%23%20basics.md#Types)` | The first `#` starts the heading, so a `#` in a file name has to be written `%23` |

A link is not read as a path into the vault when it contains `://` or starts with `mailto:`, `data:`, `tel:`, `sms:`, `file:`, `javascript:`, `blob:` or `about:`. What a click on a web link does is described under [Live Rendering](#live-rendering).

### Where Markdown Links Count

A markdown link to a file in the vault is a link like any other:

- The [links panel](#links-panel) lists it under Backlinks and Outgoing links.
- The [graph view](../views/graph-view.md) draws it, and a [base](../views/bases.md) includes it in `file.links`.
- [Renaming or moving](#renaming-and-moving-notes) the file updates it.
- A picture written as `![alt](path)` is found by the same rules as a link.

Two things differ from wiki-links. A markdown link does not use [aliases](#note-aliases), and the [lint panel](./lint.md) does not check markdown links.

## Link Format

When Noteriv writes a link for you, two settings decide how it is written. Both are in Settings > General, in the desktop app (after 2.4.13):

| Setting | Choices | Default |
|---|---|---|
| New link format | Shortest path when possible, Relative path to file, Absolute path in vault | Shortest path when possible |
| Use \[\[Wikilinks\]\] | On, off | On |

**New link format** sets how the path in the link is written:

| Choice | The path that is written |
|---|---|
| Shortest path when possible | The file's name alone when that is enough to find it, otherwise its path from the top of the vault |
| Relative path to file | The path from the folder of the note the link is in |
| Absolute path in vault | The path from the top of the vault |

**Use \[\[Wikilinks\]\]** sets the kind of link. Turn it off to have new links written as `[text](path.md)`, which other markdown apps read too.

This is the same link written under each combination. The link is in `Projects/Plan.md` and leads to `Projects/Deep/Spec.md`, the only note called `Spec`:

| New link format | Wikilinks on | Wikilinks off |
|---|---|---|
| Shortest path when possible | `[[Spec]]` | `[Spec](Spec.md)` |
| Relative path to file | `[[./Deep/Spec]]` | `[Spec](Deep/Spec.md)` |
| Absolute path in vault | `[[Projects/Deep/Spec]]` | `[Spec](Projects/Deep/Spec.md)` |

Things to know about what is written:

- A wiki-link leaves off a note's `.md`. A markdown link keeps it, shows the note's name as its text, and has its path percent-encoded: a space becomes `%20`.
- In a wiki-link, a path from the note normally starts with `./` or `../`, because a path without them is read from the top of the vault. Where a shorter form leads to the same file, it is used: a note in the same folder is written by its name alone when the name is enough.
- In a markdown link, a path from the note is written without `./` when it is read correctly that way, and with `./` when the bare path would find another file first.
- A note at the top of the vault has the same path from the top as its name: with **Absolute path in vault**, a link to `Inbox.md` is `[[Inbox]]`.

### When a Longer Form Is Used

Every link Noteriv writes is checked against the rules that read links, from the note the link goes into. If the form you chose would lead to a different file, the next longer form is used. These examples use the default settings, in a vault with the notes `Archive/Plan.md`, `Plan.md` and `Projects/Plan.md`:

| Link to | Written in `Inbox.md` as | Why |
|---|---|---|
| `Archive/Plan.md` | `[[Plan]]` | By name, `Plan` is the first of the three in the file listing |
| `Projects/Plan.md` | `[[Projects/Plan]]` | The name alone would find `Archive/Plan` |
| `Plan.md` | `[[./Plan]]` | The name finds `Archive/Plan`, and so does `Plan` read as a path. A path from the note is read exactly |

With **Relative path to file** and wikilinks off, a link from `Projects/Plan.md` to `Projects/Deep/Spec.md` is `[Spec](./Deep/Spec.md)` when the vault also has a `Deep/Spec.md` at the top, because `Deep/Spec.md` on its own would be looked for there first.

Two cases switch the kind of link:

- With wikilinks off, an embed of anything other than a picture is still written as `![[...]]`. That is the only form the editor shows in place for a note, a recording, a video or a PDF. The path inside it follows **New link format**.
- With wikilinks on, a file whose name holds `[`, `]` or `|` gets a markdown link, because those characters end a wiki-link.

### Where the Format Is Used

| Where | What is written |
|---|---|
| The suggestions after `[[` | A link to the note you choose, or an embed after `![[`. See [Autocomplete](#autocomplete) |
| **Link** beside an [unlinked mention](#unlinked-mentions) | A link to the open note, in the other note |
| **Link** beside a [possible link](#possible-links) | A link to the other note, in the open note |
| The Attachment Manager | An embed for a picture, a sound file or a video. A plain link for a PDF or any other file |
| The Audio Recorder | An embed of the new recording |

This is what the Attachment Manager inserts into `Projects/Plan.md` for files in the [attachment folder](./file-settings.md#attachment-folder):

| File | Default settings | Relative path to file, wikilinks off |
|---|---|---|
| `photo.png` | `![[photo.png]]` | `![photo.png](../attachments/photo.png)` |
| `rec.webm` | `![[rec.webm]]` | `![[../attachments/rec.webm]]` |
| `paper.pdf` | `[[paper.pdf]]` | `[paper.pdf](../attachments/paper.pdf)` |

Versions up to 2.4.13 insert `![photo.png](attachments/photo.png)` for a picture, `![Audio](attachments/rec.webm)` for a sound file or a recording, and `[paper.pdf](attachments/paper.pdf)` for a PDF.

An image you drop onto the editor does not follow these settings. It is inserted as `![](attachments/photo.png)`: an image with a path from the top of the vault, starting with the attachment folder.

Both settings apply only to links Noteriv adds from now on. Links that are already in your notes are not converted, and a [rename](#renaming-and-moving-notes) keeps each link in the form it was written in. Links you type yourself are read in every form, whatever the settings say.

## Renaming and Moving Notes

When you rename or move a note, an attachment or a folder in Noteriv, the links that point to it are rewritten in every note, so they keep working. Versions up to 2.4.13 do not do this.

The rule is that every link points at the same file after the rename as it did before, and stays in the form it was written in. Wiki-links, embeds and [markdown links](#markdown-links) are all followed:

| Before | You do | After |
|---|---|---|
| `[[Inbox]]`, `[[Inbox#Today\|today]]`, `![[Inbox]]` | Rename `Inbox` to `Home` | `[[Home]]`, `[[Home#Today\|today]]`, `![[Home]]` |
| `[[Projects/Plan]]` | Rename the folder `Projects` to `Work` | `[[Work/Plan]]` |
| `[[Spec]]` | Move `Spec` to another folder | Unchanged: a link by name still finds it |
| `[[Projects/Deep/Spec]]` | Move `Spec` from `Projects/Deep` to `Archive` | `[[Archive/Spec]]` |
| `![[photo.png]]` | Rename `photo.png` to `team.png` | `![[team.png]]` |
| `![photo](attachments/photo.png)` | Rename the folder `attachments` to `files` | `![photo](files/photo.png)` |
| `![x](My%20files/team%20photo.png)` | Rename the folder `My files` to `Shared files` | `![x](Shared%20files/team%20photo.png)` |

A link written as a path from its own note is followed as well. These links are in `Projects/Plan.md`, and `Spec` is moved from `Projects/Deep` to `Archive`:

| Before | After |
|---|---|
| `[spec](./Deep/Spec.md)` | `[spec](../Archive/Spec.md)` |
| `[spec](Deep/Spec.md)` | `[spec](../Archive/Spec.md)` |
| `[spec](/Projects/Deep/Spec.md)` | `[spec](/Archive/Spec.md)` |
| `[spec](Projects/Deep/Spec.md)` | `[spec](Archive/Spec.md)` |
| `[spec](Spec.md)` | Unchanged: the name still finds it |
| `[[./Deep/Spec]]` | `[[../Archive/Spec]]` |

How the form of a link is kept:

- A path from the note stays a path from the note, and a path from the top of the vault stays one. A leading `/` is kept.
- A bare name stays a bare name while the name is enough to find the file.
- A percent-encoded path stays encoded. A path written with spaces stays as written, unless the new name holds a character that would cut the path short, such as `#`. Then the path is encoded.
- A note's `.md` is kept where you wrote it and left off where you did not.
- Headings, block references, display text, image sizes and titles are kept.

A link that still leads to its file is left exactly as you wrote it. If two notes share a name and a rename would make a link by name point at the other one, the link is written out with its path. With the notes `Archive/Plan` and `Projects/Plan`, moving `Archive/Plan` to a folder called `Zebra` turns `[[Plan]]` into `[[Zebra/Plan]]`.

When a note itself moves to another folder, the links inside it that are paths from its own folder are rewritten so that they lead to the same files from the new place. These links are in `Projects/Plan.md`, and that note is moved into `Projects/Deep`:

| Before | After |
|---|---|
| `[spec](./Deep/Spec.md)` | `[spec](./Spec.md)` |
| `[inbox](../Inbox.md)` | `[inbox](../../Inbox.md)` |
| `[[../Inbox]]` | `[[../../Inbox]]` |
| `[inbox](/Inbox.md)`, `[[Spec]]` | Unchanged |

When a whole folder moves, a path from one note in it to another, such as `[spec](./Deep/Spec.md)`, still leads to the same file and is not changed. A path that leads out of the folder, such as `[[../Inbox]]`, is rewritten when the folder's new place makes it lead somewhere else.

The status bar says how many links were updated. Notes that are open are updated too, and unsaved edits in them are kept.

A few things are deliberately left alone:

- Links inside code blocks and inline code.
- Links that did not point at anything before the rename, even when the rename puts a file where they point.
- Web addresses and mail links.
- Text in files that are not notes, such as the file references inside `.canvas` files. Folder names in `dataview` queries are not changed either.

Links are only updated when the rename is done in the desktop app. Renaming a file in your file manager, on mobile or through the MCP server does not update them. A rename can now change many notes at once, so if you sync, let the other devices sync before you edit the same notes there.

To turn this off, go to Settings > General and switch off **Update links on rename**.

## Links Panel

The links panel shows how the open note is connected to the rest of the vault. It has four sections: Backlinks, Unlinked mentions, Outgoing links and Possible links. It is generated for you -- you do not need to maintain it. The panel described here is in the desktop app. Versions up to 2.4.13 have a backlinks list only.

### Opening the Panel

Open the command palette (`Ctrl+Shift+P`) and run **Toggle Backlinks**. Run it again, or click the X in the panel's header, to close it. The command has no default shortcut; you can give it one in Settings > Shortcuts.

Each section has a header with its name and a count. Click the header to fold or unfold the section. Possible links starts folded.

### Backlinks

Backlinks are the notes that link to the open note. A link counts whether it is written with the note's name, its path or one of its [aliases](#note-aliases), whether it is a link or an embed, and whether it is a wiki-link or a [markdown link](#markdown-links):

- `[[filename]]`
- `[[filename|display text]]`
- `[[filename#heading]]`
- `![[filename]]`
- `[[./filename]]` and `[[../filename]]`, read from the folder of the note the link is in
- `[text](folder/filename.md)`, in any of the forms a markdown link's path can take

Results are grouped by note and sorted alphabetically by note name, then by line number within each note. Under each note is a row for each line that holds a link, showing:

- **Line number.** The line where the link appears, shown as `L12`, `L45`, etc.
- **Snippet.** Up to 160 characters of the line containing the link, giving you context without having to open the file.

Click a note's name to open it. Click a line to open the note at that line. Links from the note to itself are not listed.

### Unlinked Mentions

Unlinked mentions are lines in other notes where the open note's name, or one of its aliases, is written as plain text and not as a link. The matched text is highlighted.

Click **Link** beside a mention to turn it into a link. Noteriv changes that line in the other note's file. The link is written in the format chosen under [Link Format](#link-format):

| The text as written | With the default settings | With **Use \[\[Wikilinks\]\]** off |
|---|---|---|
| The same as the note's name | `[[Note]]` | `[Note](Note.md)` |
| Anything else, such as an alias or different capitals | `[[Note\|text as written]]` | `[text as written](Note.md)` |

If the line has changed since the panel found it, nothing is written and the list is refreshed. The panel shows the first 400 characters of a longer line. For such a line, only that beginning has to be unchanged.

What counts as a mention:

- A whole word or phrase, not part of a longer word. Case is ignored.
- Text that is not already inside a link, an embed, inline code, a web address or a `#tag`.
- Names and aliases shorter than three characters are not looked for, because they would match everywhere.
- Notes matched by [Excluded files](./file-settings.md#excluded-files) are not searched.

### Outgoing Links

Outgoing links are the notes and files the open note links to: its wiki-links, its embeds, and its markdown links to files in the vault. Each target is listed once, as it is written, in the order it first appears. A target the note links to more than once shows the number, such as `×3`.

Click a row to open the note or the file. A link to a picture, a PDF or another file opens that file. Hover over a row to see the path of the file it leads to.

A target that matches no note and no file in the vault is struck through and cannot be clicked. That is a link to something that does not exist yet, or no longer exists.

Web links, mail links and links to a heading in the same note are not listed. Links inside code blocks and inline code are not listed either. The list is made from the text in the editor, so it changes as you type.

### Possible Links

Possible links are places in the open note where the name or an alias of another note is written as plain text. It is the reverse of unlinked mentions: it looks at the note you are in.

Each row shows the line number and the line, with the match highlighted. Click **Link** to turn the text into a link to that note. It is written by the same rule as above and in the same [format](#link-format): `[[Note]]` or `[[Note|text as written]]` with the default settings. The change is made to the text of the open note, and it is saved the next time the note is saved.

As with unlinked mentions, a match is a whole word or phrase that is not already inside a link, inline code, a web address or a tag, and names shorter than three characters are skipped. Text inside fenced code blocks is skipped too. Notes matched by [Excluded files](./file-settings.md#excluded-files) are not suggested. At most 60 are listed.

## Live Rendering

In live mode, wiki-links on non-cursor lines are rendered as styled clickable text. The double brackets are hidden, and only the display text (or filename if no alias is set) is visible. Placing your cursor on the line reveals the raw `[[...]]` syntax for editing. Markdown links are rendered the same way, as their text.

A plain click on a rendered link follows it. No modifier key is needed, and the click does not move the cursor:

| You click | What happens |
|---|---|
| A wiki-link | The note or file opens, at the heading or block if the link names one |
| A markdown link to a note or a file | The same |
| A markdown link such as `[text](#Heading)` | The note you are in scrolls to that heading |
| A web link | The page opens in your browser, or in the [web page reader](./web-reader.md) when **Open web links in the reader** is on in Settings > General |
| A link that leads nowhere | Nothing |

Following a markdown link to a note or a file, and opening a web link with a single click in live mode, are in the desktop app after 2.4.13.

To edit a link, move the cursor onto its line with the keyboard, or click another part of the line. The line then shows the link as written.

The same clicks work in view mode, where every line is rendered. A pop-out window follows only wiki-links to notes, written by name or by path from the top of the vault.

## Tips

- **Keep filenames short and descriptive.** Since resolution is by filename, shorter names mean faster typing and fewer collisions.
- **Use display text for readability.** Write `[[api-auth|authentication flow]]` instead of contorting your prose to fit a filename.
- **Give a note aliases for the names you actually use.** A note called `Artificial Intelligence` with the alias `AI` can be linked either way.
- **Check the links panel regularly.** Backlinks reveal connections you might not remember making, and unlinked mentions show the ones you have not made yet.
- **Use the lint panel** to catch broken wiki-links. It reports a `[[target]]` whose name matches no note and no alias.
- **Turn off Use \[\[Wikilinks\]\]** if you also open the vault in an app that does not read wiki-links. New links are then written as markdown links, and Noteriv reads both kinds.
