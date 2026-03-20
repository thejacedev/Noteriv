---
title: Canvas
order: 6
---

# Canvas

The canvas is an infinite whiteboard for spatial thinking. Unlike the linear Markdown editor, the canvas lets you place notes, images, sticky notes, and drawings anywhere on a two-dimensional surface and connect them with arrows. It is designed for brainstorming, mind mapping, system architecture diagrams, mood boards, and any task where free-form spatial arrangement is more natural than sequential text.

## File Format

Canvas data is stored in `.canvas` files as JSON. The format is simple and human-readable:

```json
{
  "nodes": [
    {
      "id": "a1b2c3d4e5f6g7h8",
      "type": "text",
      "x": 100,
      "y": 200,
      "width": 260,
      "height": 160,
      "text": "Main idea"
    }
  ],
  "edges": [
    {
      "id": "h8g7f6e5d4c3b2a1",
      "fromNode": "a1b2c3d4e5f6g7h8",
      "toNode": "i9j0k1l2m3n4o5p6",
      "fromSide": "right",
      "toSide": "left"
    }
  ]
}
```

Each node has a unique 16-character hex ID, a type, position (x, y), dimensions (width, height), and type-specific properties. Edges connect two nodes by ID and specify which side of each node the connection attaches to (top, bottom, left, or right).

## Creating a Canvas

- **File menu**: File > New Canvas, or use the command palette and search for "New Canvas".
- **File explorer**: Right-click a folder and select "New Canvas".
- **Keyboard**: No default shortcut, but you can assign one in the hotkey settings.

New canvases open with an empty viewport and a dot-grid background.

## Node Types

### Text Nodes

General-purpose text cards. They render Markdown content inside a bordered rectangle. Default size is 260 x 160 pixels. Double-click to edit the text content.

### Sticky Notes

Colored square cards that mimic physical sticky notes. Six colors are available:

| Color | Hex |
|---|---|
| Yellow | `#f9e2af` |
| Pink | `#f5c2e7` |
| Blue | `#89dceb` |
| Green | `#a6e3a1` |
| Purple | `#cba6f7` |
| Peach | `#fab387` |

Sticky notes are 200 x 200 pixels by default and have a slight random rotation (between -2 and +2 degrees) applied on creation for a natural, pinned-on-a-corkboard appearance. Double-click to edit the text.

### Image Nodes

Display an image from the vault. Specify the image path relative to the vault root. Default size is 300 x 240 pixels. The image is scaled to fit the node rectangle while preserving aspect ratio.

### File Embed Nodes

Embed a reference to another file in the vault. The node displays the file name and, for Markdown files, a preview of the content. Clicking the file embed opens the referenced file in the editor. Default size is 260 x 120 pixels.

### Drawing Nodes

Freehand strokes captured with the pencil tool. Each drawing node stores an array of point coordinates, a stroke color, and a stroke width. The node's bounding box is calculated automatically from the point data with padding for the stroke width.

### Group Nodes

Rectangular regions that visually group other nodes. Groups have a label displayed at the top and a semi-transparent background. Drag the group to move all nodes inside it. Groups are useful for organizing related items into sections on the canvas.

## Edges (Arrows)

Edges are directional connections between two nodes. They are drawn as lines with an arrowhead on the target end. Each edge specifies:

- **fromNode / toNode**: The IDs of the connected nodes.
- **fromSide / toSide**: Which side of the node the edge attaches to (top, bottom, left, or right). Sides are auto-detected based on the relative positions of the two nodes, but can be manually adjusted.
- **label** (optional): Text displayed along the edge.
- **color** (optional): Override the default edge color.

To create an edge, drag from the edge handle on one node to another node. The handle appears when you hover near the edge of a node.

### Auto-Side Detection

When you create a new edge, Noteriv calculates which sides of the two nodes face each other based on their center positions. If node A is to the left of node B, the edge connects from A's right side to B's left side. If you later move a node, the edge sides can be recalculated automatically.

## Drawing Tools

The canvas toolbar includes freehand drawing tools:

### Pencil

Click and drag to draw freehand strokes on the canvas. Points are captured at pointer resolution and stored as coordinate arrays. You can choose the stroke color and width from the toolbar.

### Shapes

Pre-built shape tools are available in the drawing editor (see [Drawing Editor](./drawing-editor.md)). On the canvas, freehand drawing nodes are the primary drawing mechanism.

### Eraser

Select the eraser tool and click on a drawing stroke to remove it. The eraser works on entire stroke nodes, not individual points.

## Viewport Controls

### Pan

Click and drag on the empty background to pan the viewport. The cursor changes to a grab hand while panning. On trackpads, two-finger scroll also pans the view.

### Zoom

Scroll the mouse wheel to zoom in or out. Pinch gestures on trackpads are also supported. The zoom range is **0.15x to 3x**:

- At 0.15x, you see the entire canvas overview -- useful for large diagrams.
- At 1x (default), nodes are at their natural size.
- At 3x, you are zoomed in for detail work on small text or drawings.

Zoom controls (+ and - buttons) are available in the toolbar for mouse-free zooming.

### Zoom Step

Each scroll tick or button press adjusts the zoom by a constant step. The zoom is clamped to the `[0.15, 3]` range.

## Z-Ordering

Nodes have a visual stacking order. When nodes overlap, the one created most recently appears on top. You can adjust the z-order:

- **Bring to Front**: Moves the selected node above all other nodes.
- **Send to Back**: Moves the selected node below all other nodes.

These operations are available in the node context menu (right-click a node).

## Node Operations

### Select

Click a node to select it. Selected nodes show resize handles at the corners and edges.

### Move

Click and drag a node to reposition it. Hold `Shift` while dragging to constrain movement to a single axis (horizontal or vertical).

### Resize

Drag a resize handle to change the node's dimensions. The minimum size is enforced to prevent nodes from becoming too small to interact with.

### Delete

Select a node and press `Delete` or `Backspace` to remove it. All edges connected to the deleted node are also removed.

### Edit Text

Double-click a text node or sticky note to enter edit mode. Type your content and click outside the node or press `Escape` to finish editing.

## Saving

Canvas files are saved automatically when you make changes. The JSON structure is serialized with 2-space indentation for readability. The file is written through the same file system layer as Markdown notes, so it participates in version control (git sync) and backup (folder sync) alongside your other vault files.

## Dot-Grid Background

The canvas viewport displays a subtle dot-grid pattern (24px spacing) that adapts to the active theme. The grid helps with visual alignment when placing nodes but does not enforce snap-to-grid behavior.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Delete` / `Backspace` | Delete selected node |
| `Escape` | Deselect / exit edit mode |
| `Ctrl+A` | Select all nodes |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| Double-click | Edit text node |
| Scroll wheel | Zoom |

## Performance

The canvas renders using DOM elements positioned with CSS transforms, not an HTML5 `<canvas>` element. This means text remains selectable, links are clickable, and accessibility tools can read node content. For canvases with hundreds of nodes, the renderer skips off-screen nodes to maintain smooth scrolling.

## Limitations

- Canvas files are JSON-only. They cannot be edited meaningfully in a plain text editor (though the format is readable).
- There is no snap-to-grid or alignment guides. Nodes are positioned freely.
- Collaborative editing is not supported on canvases. Only one user should edit a canvas at a time.
- The canvas is not available on the mobile app in the current version. Mobile users can view canvas files as raw JSON.
