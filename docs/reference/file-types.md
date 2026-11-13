---
title: File Types
order: 5
---

# File Types

Noteriv works with several file types, each serving a specific purpose. This page documents all supported file extensions and the `.noteriv/` configuration directory structure.

## Note Files

### .md / .markdown

Standard markdown files containing your notes. This is the primary file type in Noteriv. Every note you create is a `.md` file stored as plain text on your filesystem.

Markdown files can contain:

- Standard markdown formatting (headings, bold, italic, links, lists, etc.)
- Extended syntax (wiki-links, callouts, math, Mermaid diagrams, dataview queries, etc.)
- YAML frontmatter at the top of the file
- Flashcard definitions (Q:/A: pairs and {{cloze}} deletions)

Both `.md` and `.markdown` extensions are treated identically. The `.md` extension is used by default when creating new notes.

### .board.md

Board notes are standard markdown files with `board: true` in their frontmatter. They are rendered as Kanban boards instead of regular notes. The `.board.md` extension is a naming convention, not a requirement -- any `.md` file with `board: true` in frontmatter is treated as a board.

Board structure:

```markdown
---
board: true
---

## Column One

- Card one
- Card two

## Column Two

- Card three
```

H2 headings become columns. List items become cards. You can move cards between columns using drag-and-drop (desktop) or the context menu (mobile).

## Canvas Files

### .canvas

A canvas file holds one [canvas](../views/canvas.md): the cards on it and the connections between them. It is a JSON document in the JSON Canvas 1.0 format, the format Obsidian uses for its canvases (after 2.4.13). Versions up to 2.4.13 write a layout of Noteriv's own. Newer versions still open those files, and rewrite them as JSON Canvas the first time the canvas is changed.

Canvas file structure:

```json
{
  "nodes": [
    {
      "id": "1111111111111111",
      "type": "text",
      "text": "Main idea",
      "x": 101,
      "y": 200,
      "width": 260,
      "height": 160,
      "color": "1"
    },
    {
      "id": "2222222222222222",
      "type": "file",
      "file": "Projects/Plan.md",
      "x": 420,
      "y": 200,
      "width": 260,
      "height": 120,
      "color": "5"
    },
    {
      "id": "3333333333333333",
      "type": "text",
      "text": "Call Dana",
      "x": 100,
      "y": 420,
      "width": 200,
      "height": 200,
      "color": "#f5c2e7",
      "noteriv": {
        "type": "sticky",
        "rotation": -1.37
      }
    },
    {
      "id": "7777777777777777",
      "type": "group",
      "x": 60,
      "y": 160,
      "width": 680,
      "height": 520,
      "label": "Sprint",
      "color": "6"
    }
  ],
  "edges": [
    {
      "id": "aaaaaaaaaaaaaaaa",
      "fromNode": "1111111111111111",
      "fromSide": "right",
      "toNode": "2222222222222222",
      "toSide": "left"
    }
  ]
}
```

Fields every card has:

| Field | Description |
|---|---|
| `id` | The card's id. Noteriv gives a new card 16 hex characters |
| `type` | `text`, `file`, `link` or `group` |
| `x`, `y` | Where the card is, in whole numbers |
| `width`, `height` | The card's size, in whole numbers |
| `color` | Optional. A preset from `"1"` to `"6"` (red, orange, yellow, green, blue, purple) or a hex colour such as `"#ff8800"` |

Fields by type:

| Type | Fields |
|---|---|
| `text` | `text`: the text on the card |
| `file` | `file`: the path from the top of the vault, with `/` between folders. `subpath`, optional: `#Heading` or `#^block-id` for part of a note, `#page=3` for a page of a PDF |
| `link` | `url`: the address of a web page |
| `group` | `label`. Also `background`, an image inside the vault, and `backgroundStyle` (`cover`, `ratio` or `repeat`). Noteriv draws and keeps a background but has no control for setting one |

Fields of an edge:

| Field | Description |
|---|---|
| `id` | The edge's id |
| `fromNode`, `toNode` | The ids of the two cards |
| `fromSide`, `toSide` | Optional. `top`, `bottom`, `left` or `right` |
| `fromEnd`, `toEnd` | Optional. `none` or `arrow`. Left out, the start has no arrow and the end has one |
| `color` | Optional, as for a card |
| `label` | Optional. The text on the line |

JSON Canvas has no sticky notes, image cards or freehand strokes. Noteriv writes each as a card the format does have, with a `noteriv` field that says what it is:

| In Noteriv | Written as | `noteriv` holds |
|---|---|---|
| Sticky note | A `text` card with the note's text and its paper colour | `"type": "sticky"` and `rotation`, the tilt in degrees |
| Image card | A `file` card that points at the image | `"type": "image"` |
| Freehand strokes | One `text` card with the id `noteriv-drawings` | `"type": "drawings"`, `nodes` with every stroke, and `edges` with the connections that touch a stroke |

Fields Noteriv does not use, and cards of a type it does not know, are written back as they were.

Canvas files are created with the **New Canvas / Whiteboard** command in the command palette. See [Canvas](../views/canvas.md#file-format) for how the file is read and written.

## Base Files

### .base

A base file is YAML text that describes views over the files of the vault: filters, formulas, and one or more table, cards or list views. It holds no copy of your notes. Base files open in the base tab in the desktop app (after 2.4.13), and can be shown inside a note with a `base` code block or with `![[name.base]]`.

```yaml
filters:
  and:
    - file.ext == "md"
views:
  - type: table
    name: Table
    order:
      - file.name
      - file.folder
      - file.mtime
```

Base files are created with the **Create New Base** command in the command palette. See [Bases](../views/bases.md) for the file syntax.

## Drawing Files

### .drawing

Drawing files store freehand drawings created in the drawing editor. The drawing editor provides pen, eraser, and shape tools for creating diagrams, annotations, and sketches.

Drawing files are JSON documents containing stroke data, colors, and tool settings. They are rendered as SVG in the editor and can be exported as PNG or SVG images.

## Attachment Files

Noteriv can display and manage various attachment file types within your vault:

| Type | Extensions | Behavior |
|---|---|---|
| Images | `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp` | Displayed inline in preview, managed via the attachment manager |
| PDFs | `.pdf` | Opened in the PDF viewer with annotation support (desktop) |
| Audio | `.mp3`, `.wav`, `.ogg`, `.m4a` | Played with the built-in audio player |
| Video | `.mp4`, `.webm` | Played with the built-in video player |
| Other | Any extension | Listed in the attachment manager, opened with the system default application |

Attachments are typically stored in an `attachments/` folder within your vault, but they can be placed anywhere. Reference them in markdown using standard image syntax or relative links. The folder that new attachments are saved to is set in Settings > General: see [Attachment Folder](../features/file-settings.md#attachment-folder).

Sound, video and PDF files can also be embedded in a note with `![[file]]`, and a wiki-link to a file opens it: see [Embedding](../features/wiki-links.md#embedding-with).

## The .noteriv Directory

Every vault contains a `.noteriv/` hidden directory that stores Noteriv-specific configuration, plugins, themes, and data. This directory is automatically created when you open a vault.

### Directory Structure

```
your-vault/
  .noteriv/
    themes/               # Custom theme JSON files
      my-theme.json
    snippets/             # CSS snippet files
      wider-editor.css
      custom-fonts.css
    plugins/              # Community and custom plugins
      word-count/
        manifest.json
        main.js
      daily-stats/
        manifest.json
        main.js
    snapshots/            # Automatic file recovery snapshots
      note-name/
        2026-03-20T10-30-00.md
        2026-03-19T14-15-00.md
    trash/                # Soft-deleted notes
      1234567890-abc123.md
      1234567890-abc123.meta.json
    plugin-config.json    # Which plugins are enabled
    snippet-config.json   # Which CSS snippets are enabled
    flashcard-reviews.json  # Spaced repetition review data
    bookmarks.json        # Bookmarks and bookmark groups
    types.json            # The types chosen for properties
    workspaces.json       # Saved workspace layouts
    workspace.json        # The tabs open on this device
```

### Configuration Files

#### plugin-config.json

Stores the list of enabled plugin IDs:

```json
{
  "enabled": ["word-count", "daily-stats"]
}
```

#### snippet-config.json

Stores the list of enabled CSS snippet IDs:

```json
{
  "enabled": ["wider-editor", "custom-fonts"]
}
```

#### flashcard-reviews.json

Stores spaced repetition review data for all flashcards in the vault. Each card has an easiness factor, interval, repetition count, and next review date based on the SM-2 algorithm:

```json
{
  "card-id-hash": {
    "cardId": "card-id-hash",
    "ease": 2.5,
    "interval": 6,
    "repetitions": 3,
    "nextReview": "2026-03-26",
    "lastReview": "2026-03-20"
  }
}
```

#### bookmarks.json

Stores the vault's [bookmarks](../features/bookmarks.md) and the groups they are sorted into. It is written after 2.4.13; earlier versions do not keep bookmarks in a file.

```json
{
  "items": [
    { "kind": "file", "target": "Projects/Plan.md", "group": "Work" },
    { "kind": "folder", "target": "Projects" },
    { "kind": "search", "target": "tag:#work task-todo:call" },
    { "kind": "heading", "target": "Projects/Plan.md#Next steps" }
  ],
  "groups": ["Work"]
}
```

| Field | Meaning |
|---|---|
| `kind` | `file`, `folder`, `search` or `heading` |
| `target` | The path of a file or folder from the top of the vault, the text of a search, or a file's path followed by `#` and the heading text. A file that holds full paths is still read |
| `group` | The group the bookmark is in. Left out when it is in no group |
| `groups` | The group names, in the order they are shown. A group can be empty |

#### types.json

Stores the type chosen for each [property](../features/properties.md), so that every note in the vault agrees on it (after 2.4.13). Only properties whose type you have chosen are listed.

```json
{
  "types": {
    "due": "date",
    "rating": "number"
  }
}
```

The values are `text`, `list`, `number`, `checkbox`, `date` and `datetime`.

#### workspaces.json

Stores the saved [workspace layouts](../features/workspaces.md) (after 2.4.13). Paths are written from the top of the vault.

```json
{
  "layouts": {
    "Writing": {
      "openTabs": ["Projects/Plan.md", "Inbox.md"],
      "activeTab": "Projects/Plan.md",
      "splitTab": "Inbox.md",
      "pinnedTabs": ["Inbox.md"],
      "expandedFolders": ["Projects"],
      "fileViewModes": { "Inbox.md": "view" },
      "viewMode": "live",
      "sidebarCollapsed": false,
      "sidebarWidth": 250,
      "panels": ["outline", "backlinks"]
    }
  },
  "active": "Writing"
}
```

This is a different file from `workspace.json`, which holds the tabs that are open on this device and is rewritten as you work.

`bookmarks.json`, `types.json` and `workspaces.json` are the three files that the **Vault settings** option of folder sync and WebDAV sync carries. See [What Syncs](../sync/what-syncs.md).

### Themes Directory

Custom theme files (`.json`) are stored in `.noteriv/themes/`. Each file defines a complete color scheme. See [Custom Themes](../themes/custom-themes.md) for the JSON format.

### Snippets Directory

CSS snippet files (`.css`) are stored in `.noteriv/snippets/`. Each file contains CSS rules that are injected into the app when the snippet is enabled. See [CSS Snippets](../themes/css-snippets.md) for details.

### Plugins Directory

Each plugin is a subdirectory of `.noteriv/plugins/` containing at minimum `manifest.json` and an entry JavaScript file. See [Creating Plugins](../plugins/creating-plugins.md) for the plugin structure.

### Snapshots Directory

The file recovery system stores automatic snapshots of your notes in `.noteriv/snapshots/`. Each note has its own subdirectory containing timestamped copies. These snapshots are separate from git history and provide a safety net even for vaults that are not synced with git.

### Trash Directory

When you delete a note (soft delete), it is moved to `.noteriv/trash/` with a unique ID. A companion `.meta.json` file records the original path, filename, and deletion timestamp so the note can be restored to its original location.

## App Configuration

Separate from the per-vault `.noteriv/` directory, the Noteriv app stores global configuration (vault list, active vault, window state) in the operating system's standard configuration directory:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Noteriv/config.json` |
| Windows | `%APPDATA%/Noteriv/config.json` |
| Linux | `~/.config/noteriv/config.json` |

This file contains the list of registered vaults with their names, paths, and IDs, along with the active vault ID and global settings.

## Daily Notes Directory

Daily notes are stored in a `Daily/` folder at the vault root. Filenames follow the `YYYY-MM-DD.md` format (e.g., `2026-03-20.md`). This folder is created automatically when you create your first daily note.

## Git and Sync

If your vault is synced with GitHub, a `.git/` directory is present at the vault root (managed by git, not Noteriv). The `.noteriv/` directory is included in git sync by default, so your plugins, themes, snippets, and flashcard review data are synced across devices.

The `.noteriv/trash/` directory is typically excluded from git sync to avoid syncing deleted files. You can configure this in your `.gitignore`.
