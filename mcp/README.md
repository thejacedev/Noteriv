# Noteriv MCP Server

MCP (Model Context Protocol) server that gives AI assistants full access to your Noteriv vault — read, write, search, organize, and manage notes.

Auto-discovers your vaults from the Noteriv app config. Works with Claude Code, Cursor, or any MCP-compatible AI.

[![npm](https://img.shields.io/npm/v/noteriv-mcp)](https://www.npmjs.com/package/noteriv-mcp)

## Setup

### Claude Code

Add to `~/.claude/mcp.json` (global — works in every project):
```json
{
  "mcpServers": {
    "noteriv": {
      "command": "npx",
      "args": ["noteriv-mcp"]
    }
  }
}
```

It auto-detects your active vault from the Noteriv app config. To pin a specific vault:
```json
{
  "mcpServers": {
    "noteriv": {
      "command": "npx",
      "args": ["noteriv-mcp", "/path/to/vault"]
    }
  }
}
```

### Cursor / other MCP clients

Add to your MCP config:
```json
{
  "mcpServers": {
    "noteriv": {
      "command": "npx",
      "args": ["noteriv-mcp"]
    }
  }
}
```

### From source

```bash
cd mcp && npm install
```

Then use `node /path/to/Noteriv/mcp/index.js` as the command instead of `npx noteriv-mcp`.

## Tools (22)

### Vault Management
| Tool | Description |
|------|-------------|
| `list_vaults` | List all vaults with names, paths, IDs |
| `get_active_vault` | Show the current vault |
| `switch_vault` | Switch to a vault by name or ID |
| `set_vault_path` | Use a custom vault path |

### Note CRUD
| Tool | Description |
|------|-------------|
| `read_note` | Read a note by relative path |
| `write_note` | Create or overwrite a note |
| `append_to_note` | Append text to a note |
| `delete_note` | Soft delete (moves to trash) |
| `rename_note` | Rename or move a note |

### Browsing & Search
| Tool | Description |
|------|-------------|
| `list_notes` | List markdown notes (optionally by folder) |
| `list_folders` | List all folders |
| `list_all_files` | List all files (images, PDFs, etc.) |
| `search_notes` | Full-text search with line numbers |

### Folder Management
| Tool | Description |
|------|-------------|
| `create_folder` | Create a folder |
| `delete_folder` | Delete a folder and contents |

### Knowledge Graph
| Tool | Description |
|------|-------------|
| `get_tags` | All #tags and their notes |
| `get_backlinks` | Notes linking to a given note |
| `get_outgoing_links` | Wiki-links in a note |

### Stats & Metadata
| Tool | Description |
|------|-------------|
| `get_vault_stats` | Note count, words, characters |
| `get_note_info` | Frontmatter, tags, links, word count |

### Daily Notes
| Tool | Description |
|------|-------------|
| `create_daily_note` | Create or get today's note |
| `get_recent_daily_notes` | Last N daily notes |

## Resources

All notes are exposed as MCP resources (`note:///path.md`) for direct browsing.

---

## Noteriv Feature Reference

Everything Noteriv supports — useful context when writing or editing notes via MCP.

---

### Markdown Syntax

#### Text Formatting
```
**bold**                  Bold text
*italic*                  Italic text
***bold italic***         Bold and italic
~~strikethrough~~         Strikethrough
==highlight==             Highlighted text
`inline code`             Inline code
$x^2$                     Inline math (KaTeX)
$$x^2 = y$$               Block math (KaTeX)
H~2~O                     Subscript
E=mc^2^                   Superscript
```

#### Headings & Structure
```
# H1
## H2
### H3
#### H4
##### H5
###### H6

---                       Horizontal rule
```

#### Lists & Tasks
```
- Item                    Unordered list
1. Item                   Ordered list
- [ ] Todo                Task (unchecked)
- [x] Done                Task (checked)
```

#### Links & Embeds
```
[text](url)               External link
[[Note Name]]             Wiki link to another note
[[Note Name|Display]]     Wiki link with custom display text
![[note]]                 Embed another note inline
![alt](image.png)         Image
![alt|300](image.png)     Image with fixed width
![alt|300x200](image.png) Image with fixed width and height
```

> **Wiki links** — the primary way to connect notes in Noteriv. Type `[[` in the editor to trigger autocomplete across all notes in your vault. Clicking a wiki link navigates to that note. Use `get_outgoing_links` and `get_backlinks` MCP tools to traverse the link graph.

#### Tables
```
| Column 1 | Column 2 |
|----------|----------|
| Cell     | Cell     |
```

#### Blockquotes & Callouts
```
> Regular blockquote

> [!note] Title
> Callout body text
```

Supported callout types: `note` `tip` `info` `warning` `danger` `bug` `example` `quote` `success` `question` `abstract` `todo` `failure` `important`

#### Code Blocks
````
```javascript
const x = 1;
```
````

Supported languages with syntax highlighting: `javascript` `typescript` `python` `rust` `go` `html` `css` `json` `bash` `java` `c++` `c#`

#### Special Blocks

**Table of Contents**
```
[TOC]
```
Drop `[TOC]` anywhere in a note and Noteriv auto-generates a clickable table of contents from all headings. Updates live as you edit.

**Mermaid Diagrams**
````
```mermaid
graph TD
  A --> B
```
````

**Dataview Queries**
````
```dataview
TABLE field1, field2 FROM #tag WHERE condition SORT BY field DESC LIMIT 10
LIST FROM "folder" WHERE condition
TASK FROM #tag WHERE !completed
```
````
Query your vault like a database. Filter by tag, folder, or frontmatter field. Renders live in the editor.

**Flashcards**
```
Q: What is the capital of France?
A: Paris

The {{Eiffel Tower}} is in Paris.   ← cloze deletion
```
Flashcard blocks are picked up by the Flashcard Review feature (SM-2 spaced repetition algorithm).

**Definition Lists**
```
Term
: Definition
```

**Footnotes**
```
Here is a note.[^1]
[^1]: Footnote content.
```

---

### Tags

Use `#tag` anywhere in a note body to tag it. Tags are searchable across the vault via `get_tags`.

---

### Frontmatter

YAML frontmatter at the top of a note:
```yaml
---
title: My Note
tags: [project, work]
due: 2026-04-01
status: active
---
```

Frontmatter fields are queryable via Dataview and visible via `get_note_info`.

---

### Views

| View | Description |
|------|-------------|
| **Editor** | Live markdown editor with inline rendering |
| **Read-only** | Clean rendered preview |
| **Graph** | Force-directed link graph across the vault |
| **Calendar** | Monthly calendar with daily notes and task due dates |
| **Board** | Board — drag-and-drop cards between columns |
| **Canvas** | Freeform whiteboard with nodes, connections, and drawings |
| **Slides** | Present notes as a slideshow (split slides with `---`) |
| **PDF Viewer** | Open and annotate PDFs inline |

---

### Board View

Create a kanban board by adding `board: true` to frontmatter. Cards are parsed from the note as tasks grouped under `## Column Name` headings.

```markdown
---
board: true
---

## To Do
- [ ] Write tests
- [ ] Fix login bug @due(2026-04-01) #backend

## In Progress
- [ ] Redesign dashboard

## Done
- [x] Set up CI
```

Cards support: tags (`#tag`), due dates (`@due(YYYY-MM-DD)`), drag-and-drop between columns, and completion toggle.

---

### Canvas / Whiteboard

`.canvas` files open in the visual whiteboard. Node types:

| Type | Description |
|------|-------------|
| **Text** | Editable text box |
| **Sticky Note** | Colored sticky (7 colors) |
| **File** | Embed a vault note as a node |
| **Image** | Image from vault or filesystem |
| **Drawing** | Freehand drawing (pencil, shapes, eraser) |
| **Group** | Group multiple nodes together |

Nodes can be connected with arrows. Full z-ordering (layer) control. Zoom range: 0.15x–3x.

---

### Drawing Editor

Embedded drawing canvas inside notes. Tools: pencil, rectangle, ellipse, line, arrow, text, eraser. Drawings saved as `.drawing` files in the vault.

---

### Audio Recorder

Record audio directly from the editor. Waveform visualization during recording. Saves as audio file in vault with auto-inserted markdown link.

---

### PDF Annotations

Open any PDF in the viewer and annotate with: highlight (yellow/green/blue/pink), underline, and text notes. Export annotations to markdown with page references.

---

### Focus Mode

Dims all lines except the one being typed on. Vertically centers the active line. Toggled via command palette or hotkey.

---

### Vim Mode

Full vim keybindings via `@replit/codemirror-vim`. Toggle in settings.

---

### Note History

Every note's change history tracked via git snapshots. View diffs and restore any previous version from the history timeline panel.

---

### File Recovery

Snapshot-based recovery separate from git history. Useful for recovering from accidental overwrites.

---

### Trash / Soft Delete

Deleted notes move to `.trash/` in the vault root — never permanently lost. Restore from the Trash panel.

---

### Sync

| Provider | Description |
|----------|-------------|
| **Git** | Full git sync with stash/pop for unsaved changes |
| **Folder** | Mirror vault to a local folder |
| **WebDAV** | Sync to any WebDAV server |

---

### Plugins

Community plugin registry. Install, enable, disable plugins. Plugin API exposes editor state, status bar, and commands.

---

### Publish / Export

- **HTML Export** — standalone HTML page with all theme colors preserved
- **Multi-note Export** — combine multiple notes into one HTML file
- **PDF Export** — export note as PDF
- **Slides** — present any note as a fullscreen slideshow
