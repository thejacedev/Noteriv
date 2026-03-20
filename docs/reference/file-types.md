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

Canvas files are JSON documents that describe a whiteboard layout. They contain nodes (sticky notes, images, and text blocks) and connections between them. The canvas editor provides a freeform, infinite-space workspace for visual note-taking and brainstorming.

Canvas file structure:

```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "sticky",
      "x": 100,
      "y": 200,
      "width": 200,
      "height": 150,
      "content": "Sticky note text",
      "color": "#f9e2af"
    },
    {
      "id": "node-2",
      "type": "image",
      "x": 400,
      "y": 200,
      "width": 300,
      "height": 200,
      "src": "attachments/diagram.png"
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "from": "node-1",
      "to": "node-2"
    }
  ]
}
```

Node types:

| Type | Description |
|---|---|
| `sticky` | A colored sticky note with text content |
| `image` | An embedded image from the vault or a URL |
| `text` | A text block with markdown support |

Canvas files are created from the command palette ("New Canvas") or the file context menu.

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

Attachments are typically stored in an `attachments/` folder within your vault, but they can be placed anywhere. Reference them in markdown using standard image syntax or relative links.

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
