---
title: Drawing Editor
order: 8
---

# Drawing Editor

Noteriv includes a built-in drawing editor for creating diagrams, sketches, and illustrations directly inside your vault. Drawings are saved as `.drawing` files in JSON format and can be embedded in Markdown notes using the `![[file.drawing]]` syntax. The editor provides a vector-based canvas with pencil, shape, text, and eraser tools, plus full color and stroke configuration.

## Creating a Drawing

There are several ways to create a new drawing:

- **File menu**: File > New Drawing.
- **Command palette**: Press `Ctrl+P` and search for "New Drawing".
- **File explorer**: Right-click a folder and select "New Drawing".

New drawings are named automatically using a counter system: `Drawing.drawing`, `Drawing 2.drawing`, `Drawing 3.drawing`, and so on. You can rename the file after creation.

## File Format

Drawing files use a JSON format with the following structure:

```json
{
  "type": "drawing",
  "version": 2,
  "elements": [
    {
      "id": "el-abc123",
      "type": "rectangle",
      "x": 100,
      "y": 50,
      "width": 200,
      "height": 120,
      "strokeColor": "#cdd6f4",
      "backgroundColor": "transparent",
      "strokeWidth": 2
    }
  ],
  "appState": {
    "viewBackgroundColor": "#1e1e2e",
    "theme": "dark"
  }
}
```

Each element has a unique ID, a type string, position coordinates, dimensions, and type-specific visual properties. The `appState` object stores the canvas background color and theme, which adapt to the active Noteriv theme when the drawing is first created.

## Drawing Tools

### Pencil

The pencil tool captures freehand strokes as you draw with the mouse or stylus. Each stroke is stored as an array of `[x, y]` coordinate pairs. The stroke is rendered as a polyline with round line caps and line joins for smooth curves.

The pencil tool is ideal for quick sketches, handwritten annotations, and freeform diagrams. On devices with stylus support (tablets, drawing pads), pressure sensitivity may affect stroke width depending on browser capabilities.

### Rectangle

Click and drag to create a rectangle. The starting point is one corner and the release point is the opposite corner. Rectangles have configurable stroke color, fill color (background), and stroke width. Corners are slightly rounded (4px radius) for a polished appearance.

### Ellipse

Click and drag to create an ellipse. The bounding box of the drag gesture defines the ellipse dimensions. Like rectangles, ellipses support stroke color, fill color, and stroke width configuration.

### Line

Click and drag to draw a straight line between two points. The line's stroke color and width are configurable. Lines are useful for connecting elements in diagrams or drawing simple structures.

### Arrow

Functions identically to the line tool but adds a triangular arrowhead at the end point. The arrowhead points in the direction of the drag. Arrows are commonly used for flowcharts, architecture diagrams, and annotated illustrations.

The arrowhead is rendered as an SVG marker with a fixed size relative to the stroke width, ensuring it looks proportional at any scale.

### Text

Click on the canvas to place a text element. A text input appears where you can type your content. Text elements are rendered using the system sans-serif font at 14px. They can be moved and resized after creation.

Text elements are useful for labels, titles, and annotations in diagrams. They maintain their legibility across zoom levels because they are rendered as SVG text, not rasterized.

### Eraser

The eraser tool removes entire elements. Click on any element to delete it. The eraser operates on complete shapes and strokes -- it does not partially erase. For pencil strokes, clicking anywhere along the stroke removes the entire stroke.

## Color and Stroke Configuration

### Stroke Color

The toolbar includes a color picker for setting the stroke (outline) color of new elements. The default stroke color is `#cdd6f4` (a light text color from the Catppuccin Mocha palette), which provides good contrast on the default dark canvas background.

You can choose any color from the full RGB spectrum. The selected color applies to all subsequently created elements until you change it.

### Background Color

For filled shapes (rectangles and ellipses), you can set a background (fill) color. The default is transparent, which creates outlined shapes. Set a background color to create solid or semi-transparent filled shapes.

### Stroke Width

The stroke width controls the thickness of lines, outlines, and pencil strokes. Common widths range from 1px (thin, precise lines) to 8px (bold, prominent strokes). The default is 2px.

## Pan and Zoom

### Pan

Click and drag on the empty canvas background to pan the viewport. On trackpads, two-finger scroll also pans. The background grid moves with the viewport, providing spatial orientation.

### Zoom

Use the scroll wheel to zoom in and out. The drawing editor supports the same zoom range as the canvas view, allowing you to work at detailed close-up levels or see the entire drawing at a glance.

Zoom controls (+ and - buttons) are available in the toolbar. The current zoom level is displayed as a percentage.

## Embedding Drawings in Notes

Drawings can be embedded in any Markdown note using the standard Noteriv embed syntax:

```markdown
Here is the system architecture:

![[architecture.drawing]]

As you can see, the three services communicate through the message bus.
```

When the note is rendered in live mode or view mode, the drawing file is loaded, converted to an SVG representation, and displayed inline. The SVG conversion handles all element types:

- **Rectangles** become `<rect>` elements with rounded corners.
- **Ellipses** become `<ellipse>` elements.
- **Lines** become `<line>` elements.
- **Arrows** become `<line>` elements with an SVG marker arrowhead.
- **Text** becomes `<text>` elements.
- **Pencil strokes** become `<polyline>` elements with round caps and joins.

The SVG is sized to the bounding box of all elements with 20px padding on each side. An empty drawing renders as a placeholder with the text "Empty Drawing".

## SVG Export

The `elementsToSVG` function generates a standalone SVG document from the drawing elements. This SVG can be:

- Embedded in Markdown notes (automatic).
- Copied to the clipboard for pasting into other applications.
- Saved as an `.svg` file for use outside Noteriv.

The SVG includes a background rectangle matching the canvas background color, so the drawing looks correct when embedded in documents with different backgrounds.

## Element Operations

### Select

Click an element to select it. Selected elements show a selection outline.

### Move

Click and drag a selected element to reposition it on the canvas.

### Resize

Drag a handle on a selected element to change its dimensions.

### Delete

Select an element and press `Delete` or `Backspace` to remove it.

## Theme Integration

The drawing editor reads the active Noteriv theme to set default colors:

- **Canvas background**: Uses the theme's `--bg-primary` color (e.g., `#1e1e2e` for dark themes).
- **Default stroke**: Uses the theme's `--text-primary` color for good contrast.
- **Theme mode**: Stored as `"dark"` or `"light"` in the drawing file's `appState`.

When you open a drawing created in a different theme, the stored background and stroke colors are preserved. This means drawings look as they were designed, regardless of the current theme.

## Compatibility

The drawing file format is compatible with files that have a `"type": "excalidraw"` header, meaning Noteriv can open drawings exported from Excalidraw. However, not all Excalidraw element types may render identically, since Noteriv uses a simplified element model.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Delete` / `Backspace` | Delete selected element |
| `Escape` | Deselect / exit tool |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Select all elements |
| Scroll wheel | Zoom |

## Limitations

- The drawing editor does not support curved lines (bezier paths), only straight lines and freehand polylines.
- Text editing is single-line only. Multi-line text blocks are not supported.
- There is no layer system. Elements overlap based on creation order, and there is no way to reorder them independently (unlike the canvas view, which supports z-ordering).
- The drawing editor is a desktop-only feature. Mobile users can view embedded drawings as rendered SVGs but cannot edit `.drawing` files directly.
- Collaborative editing is not supported. Drawings should be edited by one person at a time.
