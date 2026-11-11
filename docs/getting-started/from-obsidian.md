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

Tested by opening an Obsidian-style vault in Noteriv 2.4.8 on desktop; heading and block links were tested on 2.4.9.

| Obsidian feature | In Noteriv |
|---|---|
| Notes and folders | Shown as they are |
| `[[Note]]` and `[[Note\|alias]]` links | Work, including links by name to notes in other folders |
| `[[Note#Heading]]` and `[[Note#^block]]` links | Open the note at that heading or block (from 2.4.9) |
| `#tags` and nested `#parent/child` tags | Work |
| YAML frontmatter | Kept and displayed |
| Callouts (`> [!note]`) | Work |
| `==Highlights==`, task lists, tables, footnotes | Work |
| LaTeX math and Mermaid diagrams | Work |
| `.canvas` files | Open in the canvas view with their text cards and labelled connections |

## What does not carry over yet

| Obsidian feature | In Noteriv |
|---|---|
| `![[Note]]` and `![[image.png]]` embeds | Shown as a link to the file in both edit and read modes, not rendered inline |
| Foldable callouts (`> [!tip]-`) | The callout renders, but does not fold, and the `-` or `+` is shown |
| `%%comments%%` | Shown as text |
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
