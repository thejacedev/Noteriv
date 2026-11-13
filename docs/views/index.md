---
title: Views Overview
order: 1
---

# Views Overview

Noteriv is more than a text editor. In addition to the Markdown editor, it provides a collection of specialized views that let you visualize, organize, and interact with your notes in ways that plain text cannot. Each view is built into the application -- there are no plugins to install. You access them from the ribbon sidebar, the command palette (`Ctrl+P`), or through file associations that activate automatically based on file extension or frontmatter properties.

## Available Views

### Graph View

The graph view renders your entire vault as a force-directed network diagram. Notes become nodes, and wiki-links between them become edges. The visualization helps you spot clusters of related ideas, discover orphan notes that lack connections, and navigate your knowledge base spatially rather than hierarchically.

Open it with `Ctrl+G` or from the ribbon. A settings panel in the graph filters what is drawn, colours notes in groups, and switches to a local graph of the note you have open.

See [Graph View](./graph-view.md) for details.

### Board View

The board view transforms a Markdown file into a Kanban-style task board. Columns are defined by `##` headings and cards are defined by task list items (`- [ ]`). You can drag cards between columns, assign due dates, and attach tags -- all backed by a plain Markdown file that you can edit directly in any text editor.

Activate it by adding `board: true` to a note's frontmatter, or by naming the file with a `.board.md` extension.

See [Board View](./board-view.md) for details.

### Calendar View

The calendar view provides a monthly grid that ties into your daily notes and task due dates. Blue dots mark days that have a daily note; yellow dots mark days with tasks due. Click any day to open or create the corresponding daily note.

Open it from the ribbon or the command palette.

See [Calendar View](./calendar-view.md) for details.

### Slide Presentation

The slide view turns any Markdown note into a fullscreen presentation. Slides are separated by `---` horizontal rules. Navigate with arrow keys, and exit with Escape. No special file format is needed -- any note can be presented.

Accessible from the editor menu.

See [Slides](./slides.md) for details.

### Canvas

The canvas is a whiteboard with no fixed size. You place cards on it (text, sticky notes, images, files from the vault, web pages, groups and freehand strokes) and draw connections between them. Zoom with the mouse wheel, pan by dragging, and draw freehand with the draw tool.

Canvas files are saved as JSON Canvas, the format Obsidian uses for its canvases, so the same file can be opened in both apps (after 2.4.13). Cards can also hold files from the vault and web page addresses.

Create a canvas with **New Canvas / Whiteboard** in the command palette.

See [Canvas](./canvas.md) for details.

### Bases

A base shows the files of your vault as a table, cards or a list, picked by filters and sorted, grouped and summed up the way a `.base` file says (after 2.4.13). Create one with **Create New Base** from the command palette, or click a `.base` file. Views, filters and formulas are edited as YAML text.

See [Bases](./bases.md) for details.

### PDF Viewer

Noteriv opens PDF files inline with annotation tools. Highlight text in four colors, underline passages, and attach text notes. Annotations are saved as a sidecar JSON file next to the PDF, and can be exported to a Markdown note with page references.

See [PDF Viewer](./pdf-viewer.md) for details.

### Drawing Editor

The built-in drawing editor provides a vector canvas with pencil, shape, text, and eraser tools. Drawings are saved as `.drawing` files and can be embedded in Markdown notes with the `![[file.drawing]]` syntax. The editor supports full color and stroke configuration, pan and zoom, and exports to SVG.

See [Drawing Editor](./drawing-editor.md) for details.

## How Views Interact with Files

Views are selected automatically based on file type:

| File Extension | View |
|---|---|
| `.md` | Markdown editor (default) |
| `.md` with `board: true` frontmatter | Board view |
| `.board.md` | Board view |
| `.canvas` | Canvas |
| `.base` | Base (table, cards and list views) |
| `.drawing` | Drawing editor |
| `.pdf` | PDF viewer |

For Markdown files, you can switch between the standard editor and specialized views like the board or slide presentation at any time. The underlying file is always plain Markdown, so there is no format lock-in.

## Opening Views

There are three general ways to open a view:

1. **Ribbon sidebar**: Icons along the left rail for graph view, calendar view, and creating new canvases or drawings.
2. **Command palette** (`Ctrl+Shift+P`): Search for a view's command -- "Graph View", "Calendar View", "New Canvas / Whiteboard", "Create New Base", "New Drawing", "Start Presentation".
3. **File explorer**: Click a `.canvas`, `.base`, `.drawing`, or `.pdf` file to open it in the appropriate view. Board files open automatically in the board view.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+G` | Open graph view |
| `Ctrl+Shift+G` | Git sync (not a view, but often confused) |
| `Ctrl+P` | Command palette (search for any view) |
| `Escape` | Close overlay views (graph, slides) |
| Arrow keys | Navigate slides in presentation mode |

## Design Principles

All views in Noteriv share a few guiding principles:

- **Plain-text backing**: Board data is Markdown. Canvas data is JSON. Drawing data is JSON. Nothing is stored in a proprietary binary format.
- **Round-trip editing**: You can always open the underlying file in the Markdown editor, make changes, and see them reflected in the specialized view.
- **Theme-aware**: Every view respects the active Noteriv theme, reading CSS custom properties for colors, fonts, and spacing.
- **No external dependencies**: Views are rendered locally with the application's built-in rendering engine. No web services are contacted, and no data leaves your machine.
