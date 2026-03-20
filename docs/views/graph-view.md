---
title: Graph View
order: 2
---

# Graph View

The graph view visualizes the connections between your notes as a force-directed network diagram. Every Markdown file in your vault becomes a node, and every `[[wiki-link]]` between files becomes an edge. The result is an interactive map of your knowledge base that lets you see how ideas relate, spot isolated notes, and navigate between topics spatially.

## Opening the Graph

There are three ways to open the graph view:

- **Keyboard shortcut**: Press `Ctrl+G`.
- **Ribbon sidebar**: Click the graph icon in the left ribbon.
- **Command palette**: Open `Ctrl+P` and search for "Graph View".

The graph opens as a full-screen overlay on top of the editor. Press `Escape` or click the close button to dismiss it.

## How the Graph Is Built

When you open the graph, Noteriv scans every `.md` and `.markdown` file in the active vault. For each file it:

1. Creates a **node** using the file name (without the `.md` extension) as the label.
2. Extracts all `[[wiki-link]]` references from the file content using the pattern `[[target]]` or `[[target|alias]]`.
3. Creates an **edge** between the source file and each linked target, provided the target file exists in the vault.

Links are resolved case-insensitively. If your file contains `[[Meeting Notes]]` and a file named `meeting notes.md` exists, they are connected. Duplicate edges between the same pair of files are collapsed into a single edge.

## Node Sizing

Nodes are sized proportionally to their connection count. A note with many inbound and outbound links appears larger, making well-connected hub notes visually prominent. The radius formula scales linearly from a minimum of 6 pixels (for nodes with zero or one connection) to a maximum of 22 pixels (for the most connected node in the vault).

This makes it easy to identify:

- **Hub notes**: Large nodes at the center of clusters. These are your most referenced ideas.
- **Orphan notes**: Small, isolated nodes that float to the periphery. These may need linking or may be candidates for deletion.
- **Bridge notes**: Medium-sized nodes that sit between two clusters, connecting otherwise separate topics.

## Force-Directed Layout

The graph uses a custom force simulation that runs on every animation frame. Three forces govern node placement:

### Repulsion

Every pair of nodes repels each other with a force inversely proportional to the square of their distance. This prevents nodes from overlapping and spreads the graph out evenly. The repulsion constant is tuned to produce readable spacing without pushing nodes off-screen.

### Attraction

Nodes connected by an edge are attracted toward each other. The attraction is proportional to the distance between the nodes, pulling linked notes into visual proximity. The attraction constant is deliberately weaker than the repulsion force, so the layout remains spacious.

### Center Gravity

A gentle pull draws all nodes toward the center of the viewport. Orphan nodes (those with zero connections) feel a stronger center pull to prevent them from drifting to the edges. Connected nodes feel a lighter pull, allowing clusters to form naturally.

### Damping

Each simulation step multiplies all velocities by a damping factor (0.82), which gradually reduces motion and lets the layout settle into a stable arrangement. After a few hundred frames, the simulation reaches equilibrium and nodes stop moving.

## Interaction

### Pan

Click and drag on the empty canvas background to pan the view. The cursor changes to a grab hand while panning.

### Zoom

Scroll the mouse wheel to zoom in or out. You can also use the `+` and `-` buttons in the bottom-right corner of the graph overlay. The zoom range spans from 0.1x (extreme overview) to 5x (close-up).

### Drag Nodes

Click and drag a node to reposition it manually. While a node is being dragged, all forces on that node are suspended so it stays exactly where you place it. Releasing the node allows the simulation to resume, but the node retains its new position as a starting point.

### Click to Open

Click a node (without dragging) to open the corresponding note in the editor. The graph overlay closes automatically after navigation.

### Hover Tooltip

Hovering over a node displays a tooltip showing the note name and its connection count (e.g., "Meeting Notes -- 7 connections"). This gives quick insight without opening the note.

### Search / Filter

A search bar at the top of the graph overlay lets you filter nodes by name. As you type, nodes whose labels do not match the query are dimmed to near-invisible, while matching nodes remain fully opaque. Edges between non-matching nodes are also dimmed. This helps you locate specific notes in large vaults.

## Highlighting

When you hover over a node, the graph highlights that node and all of its directly connected neighbors. Edges between the hovered node and its neighbors are drawn in the accent color with increased opacity, while all other nodes and edges are dimmed. This "ego graph" view makes it easy to trace a note's immediate neighborhood.

If you opened the graph while a note was active in the editor, that note's node is rendered in the accent color with a white border ring, so you can see where the current document sits in the overall structure.

## Stats

The bottom-left corner of the graph overlay displays two counters:

- **Notes**: The total number of Markdown files in the vault (displayed as nodes).
- **Connections**: The total number of unique edges (wiki-link pairs).

## Mobile

On the mobile app, the graph view is implemented as a full-screen WebView rendering an HTML5 canvas. The same force simulation runs in JavaScript inside the WebView. Tapping a node sends a message back to the React Native layer, which navigates to the corresponding note in the editor.

Due to the performance constraints of mobile devices, the mobile graph filters out orphan nodes (those with zero connections) to reduce the number of rendered elements.

## Performance Notes

The force simulation runs on every animation frame, so very large vaults (thousands of notes) may cause noticeable CPU usage while the graph is open. The simulation caps at 300 frames on mobile to limit battery drain. On desktop, the simulation runs indefinitely but settles to near-zero motion within a few seconds.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+G` | Open graph view |
| `Escape` | Close graph view |
| Scroll wheel | Zoom in/out |
| Click + drag (background) | Pan |
| Click + drag (node) | Reposition node |
| Click (node) | Open note |
