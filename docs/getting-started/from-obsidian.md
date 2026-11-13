---
title: Coming from Obsidian
order: 7
---

# Coming from Obsidian

An Obsidian vault is a folder of markdown files, and so is a Noteriv vault. You can open your existing vault in Noteriv as it is, with no import or conversion step, and keep using Obsidian on the same folder.

## Open your vault

1. Click the vault name in the top-left corner to open the vault switcher.
2. Click **New vault**, then choose **Open folder** in the wizard.
3. Pick your Obsidian vault folder.

Your notes and folders appear in the sidebar straight away. Nothing is copied or moved: Noteriv reads and writes the same `.md` files.

## Using both apps on one folder

Noteriv keeps its own settings in a `.noteriv/` folder inside the vault. It does not change `.obsidian/`, and hides that folder from the file tree. You can switch back to Obsidian at any time, or run both.

## What carries over

Tested by opening an Obsidian-style vault in Noteriv 2.4.8 on desktop; heading and block links were tested on 2.4.9, and embeds on 2.4.10. Rows marked "after 2.4.13" are newer than that test.

| Obsidian feature | In Noteriv |
|---|---|
| Notes and folders | Shown as they are |
| `[[Note]]` and `[[Note\|alias]]` links | Work, including links by name to notes in other folders |
| `[[Note#Heading]]` and `[[Note#^block]]` links | Open the note at that heading or block (from 2.4.9) |
| `aliases` in frontmatter | A link written with an alias opens the note, and link suggestions and Quick Open find the note by its aliases (after 2.4.13). Embeds need the note's own name. See [Note Aliases](/features/wiki-links#note-aliases) |
| `![[Note]]`, `![[Note#Heading]]` and `![[Note#^block]]` embeds | Shown inline when the embed is on a line of its own (from 2.4.10). Inside a sentence it stays a link |
| `![[image.png]]` and `![[image.png\|160]]` embeds | The image is shown, found by name anywhere in the vault (from 2.4.10) |
| `![[audio.mp3]]` and `![[video.mp4]]` embeds | A player is shown in the note (after 2.4.13) |
| `![[paper.pdf]]` and `![[paper.pdf#page=3]]` embeds | A card that opens the PDF, at that page when one is given (after 2.4.13). The pages are not drawn inside the note |
| Links to files, such as `[[paper.pdf#page=3]]` | Open the file in Noteriv (after 2.4.13). See [Links to Other Files](/features/wiki-links#links-to-other-files) |
| `#tags` and nested `#parent/child` tags | Work |
| YAML frontmatter | Kept and displayed |
| Callouts (`> [!note]`) | Work |
| `==Highlights==`, task lists, tables, footnotes | Work |
| Inline footnotes (`^[text]`) | Shown in place, small and raised (after 2.4.13) |
| `%%comments%%`, inline and as a block | Dimmed in live mode, hidden in view mode, and left out of published pages and PDFs (after 2.4.13). See [Comments](/editor/comments) |
| LaTeX math and Mermaid diagrams | Work |
| `.canvas` files | Open in the canvas view with their text cards and labelled connections |
| Links updated when a note is renamed or moved | Done for notes, attachments and folders renamed in the desktop app (after 2.4.13). See [Renaming and Moving Notes](/features/wiki-links#renaming-and-moving-notes) |
| Search operators: `file:`, `path:`, `content:`, `tag:`, `line:()`, `section:()`, `block:()`, `task:`, `[property]`, `/regex/`, `OR`, `-` | Work in Vault Search (after 2.4.13). See [Search Queries](/features/search#search-queries) |
| `query` code blocks | Show search results in the note (after 2.4.13). See [Search Results in a Note](/features/search#search-results-in-a-note) |
| Backlinks, unlinked mentions and outgoing links | In the [links panel](/features/wiki-links#links-panel), which also lists possible links (after 2.4.13) |
| Graph filters, groups, local graph and the time-lapse animation | In the graph's settings panel (after 2.4.13). See [Graph View](/views/graph-view#graph-settings) |
| Folding headings and list items | Fold arrows beside the line, and commands to fold and unfold everything (after 2.4.13). See [Folding](/editor/folding) |
| Multiple cursors | `Alt+Click` adds a cursor; `Shift+Alt` and a drag selects a rectangle (after 2.4.13). See [Multiple Cursors](/editor/multiple-cursors) |
| Unique notes named by timestamp | The **Create New Unique Note** command (after 2.4.13). See [Unique Notes](/features/file-settings#unique-notes) |
| Settings for new note location, attachment folder, excluded files and deleted files | In Settings > General (after 2.4.13). See [File Settings](/features/file-settings) |
| Pinned commands in the command palette | Work (after 2.4.13). See [Pinning Commands](/features/command-palette#pinning-commands) |

## What does not carry over yet

| Obsidian feature | In Noteriv |
|---|---|
| Callouts, math and diagrams inside an embedded note | The embedded text is shown, but these are not drawn the way they are in the note itself |
| Foldable callouts (`> [!tip]-`) | The callout renders, but does not fold, and the `-` or `+` is shown |
| Web pages embedded with an `<iframe>` | Not shown. Frames are removed from note content on purpose |
| Bookmarks made in Obsidian | Not read. Noteriv keeps its own [bookmarks](/features/bookmarks) for notes, folders, searches and headings, with groups, in `.noteriv/bookmarks.json` (after 2.4.13) |
| File cards on a canvas | The card appears but its note content does not load |
| Dataview queries | Noteriv has its own [`dataview` block](/features/dataview) rather than the Obsidian plugin, so check each query: results may differ |
| Community plugins and themes | Obsidian plugins and themes do not run in Noteriv. It has its own [plugin API](/plugins/) and [themes](/themes/) |

None of this changes your files. Anything Noteriv does not render stays in the note exactly as you wrote it.

## How the two apps differ

| | Noteriv | Obsidian |
|---|---|---|
| Source code | Open source, MIT licence | Free to use, not open source |
| Notes | Plain markdown files on your disk | Plain markdown files on your disk |
| Sync | Git and WebDAV built in, or any synced folder | Obsidian Sync as a paid add-on, or any synced folder |
| Plugins | A plugin API with a small catalogue | Community plugins and themes |

Obsidian has been around longer and its community plugin library is much larger. If your workflow depends on specific Obsidian plugins, check the second table above before switching.
