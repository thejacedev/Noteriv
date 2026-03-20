---
title: Views Overview
order: 1
---

# Views Overview

Noteriv is more than a text editor. In addition to the Markdown editor, it provides a collection of specialized views that let you visualize, organize, and interact with your notes in ways that plain text cannot. Each view is built into the application -- there are no plugins to install. You access them from the ribbon sidebar, the command palette (`Ctrl+P`), or through file associations that activate automatically based on file extension or frontmatter properties.

## Available Views

### Graph View

The graph view renders your entire vault as a force-directed network diagram. Notes become nodes, and wiki-links between them become edges. The visualization helps you spot clusters of related ideas, discover orphan notes that lack connections, and navigate your knowledge base spatially rather than hierarchically.

Open it with `Ctrl+G` or from the ribbon.

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

The canvas is an infinite whiteboard for spatial thinking. Canvas files (`.canvas`) hold a JSON graph of text nodes, sticky notes, images, embedded files, freehand drawings, and groups, all connected by directional arrows. Zoom from 0.15x to 3x, pan with scroll or drag, and draw freehand with the pencil tool.

Create a canvas from the file menu or command palette.

See [Canvas](./canvas.md) for details.

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
| `.drawing` | Drawing editor |
| `.pdf` | PDF viewer |

For Markdown files, you can switch between the standard editor and specialized views like the board or slide presentation at any time. The underlying file is always plain Markdown, so there is no format lock-in.

## Opening Views

There are three general ways to open a view:

1. **Ribbon sidebar**: Icons along the left rail for graph view, calendar view, and creating new canvases or drawings.
2. **Command palette** (`Ctrl+P`): Search for any view by name -- "Graph View", "Calendar", "New Canvas", "New Drawing", "Present as Slides".
3. **File explorer**: Double-click a `.canvas`, `.drawing`, or `.pdf` file to open it in the appropriate view. Board files open automatically in the board view.

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
