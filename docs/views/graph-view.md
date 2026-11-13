---
title: Graph View
order: 2
---

# Graph View

The graph view visualizes the connections between your notes as a force-directed network diagram. Every note in your vault becomes a node, and every `[[wiki-link]]` between notes becomes an edge. The result is an interactive map of your knowledge base that lets you see how ideas relate, spot isolated notes, and navigate between topics spatially.

The graph can show the whole vault or only the notes around the one you have open. A settings panel in the graph filters what is drawn, colours notes in groups, and changes how the graph looks and moves.

## Opening the Graph

There are four ways to open the graph view:

- **Keyboard shortcut**: Press `Ctrl+G`. The graph opens on the whole vault.
- **Ribbon sidebar**: Click the graph icon in the left ribbon.
- **Command palette**: Open `Ctrl+Shift+P` and search for "Graph View".
- **Local graph**: Open `Ctrl+Shift+P` and run "Open Local Graph". The graph opens on the note you have open and the notes around it. See [Local Graph](#local-graph).

The graph opens as a full-screen overlay on top of the editor. Press `Escape` or click the close button to dismiss it.

## How the Graph Is Built

When you open the graph, Noteriv reads the links of every `.md` and `.markdown` file in the active vault. For each note it:

1. Creates a **node** using the file name (without the `.md` extension) as the label.
2. Takes the `[[wiki-link]]` and `![[embed]]` references in the note. Links inside code blocks and inline code are not counted.
3. Creates a directed **edge** from the note to each note it links to.

A link is matched to a note by name, by path inside the vault, or by one of the note's [aliases](../features/wiki-links.md#note-aliases). Links are resolved case-insensitively. If your file contains `[[Meeting Notes]]` and a file named `meeting notes.md` exists, they are connected. A one-way link has an arrowhead at its target. When both notes link to each other, the relationship is drawn with arrowheads at both ends. Repeated links in the same direction are collapsed into one relationship.

Notes matched by [Excluded files](../features/file-settings.md#excluded-files) are left out of the graph.

With the default settings only notes are drawn. The [filters](#filters) can add other kinds of node:

| Node | How it is drawn |
|---|---|
| Note | A circle. In a group's colour if a [group](#groups) matches it |
| Tag | A filled circle in the theme's green, labelled `#tag` |
| Attachment | An outlined circle |
| Note that does not exist yet | A circle with a dashed outline |

## Node Sizing

Nodes are sized proportionally to their connection count. A note with many inbound and outbound links appears larger, making well-connected hub notes visually prominent. The radius scales linearly from a minimum of 6 pixels (for nodes with no connections) to a maximum of 22 pixels (for the most connected node in the graph). The **Node size** slider in the settings panel scales every node up or down.

This makes it easy to identify:

- **Hub notes**: Large nodes at the center of clusters. These are your most referenced ideas.
- **Orphan notes**: Small, isolated nodes. These may need linking or may be candidates for deletion.
- **Bridge notes**: Medium-sized nodes that sit between two clusters, connecting otherwise separate topics.

## Force-Directed Layout

The graph uses a custom force simulation that runs on every animation frame. Three forces govern node placement. Each has a slider under [Forces](#forces) in the settings panel.

### Repulsion

Every pair of nodes repels each other with a force inversely proportional to the square of their distance. This prevents nodes from overlapping and spreads the graph out evenly.

### Attraction

Nodes connected by an edge are attracted toward each other. The attraction is proportional to the distance between the nodes, pulling linked notes into visual proximity. The attraction is deliberately weaker than the repulsion force, so the layout remains spacious.

### Center Gravity

A gentle pull draws all nodes toward the center of the viewport. Orphan nodes (those with zero connections) feel a stronger center pull to prevent them from drifting to the edges. Connected nodes feel a lighter pull, allowing clusters to form naturally.

### Damping

Each simulation step multiplies all velocities by a damping factor (0.85), which gradually reduces motion and lets the layout settle into a stable arrangement.

## Interaction

### Pan

Click and drag on the empty canvas background to pan the view. The cursor changes to a grab hand while panning.

### Zoom

Scroll the mouse wheel to zoom in or out. You can also use the `+` and `-` buttons in the bottom-right corner of the graph overlay. The zoom range spans from 0.1x (extreme overview) to 5x (close-up).

### Drag Nodes

Click and drag a node to reposition it manually. While a node is being dragged, all forces on that node are suspended so it stays exactly where you place it. Releasing the node allows the simulation to resume, but the node retains its new position as a starting point.

### Click to Open

Click a note's node (without dragging) to open the note in the editor. The graph overlay closes automatically after navigation. Tags, attachments and notes that do not exist yet have nothing to open, so clicking them does nothing.

### Hover Tooltip

Hovering over a node displays a tooltip showing its name and its connection count (e.g., "Meeting Notes -- 7 connections"). This gives quick insight without opening the note.

### Search / Filter

A search bar at the top of the graph overlay, labelled "Filter nodes...", lets you filter nodes by name. As you type, nodes whose labels do not match the query are dimmed to near-invisible, while matching nodes remain fully opaque and always show their names. Edges between non-matching nodes are also dimmed. This helps you locate specific notes in large vaults.

The search bar only dims nodes. To remove nodes from the graph, use the [filters](#filters).

## Graph Settings

Click the **Graph settings** button in the graph overlay to open the settings panel. It has four parts: Filters, Groups, Display and Forces. Versions up to 2.4.13 do not have the panel.

Your settings are remembered on this computer and are used for every vault. **Restore defaults** at the top of the panel puts the filters, groups, display and forces back to how they started.

Changing a setting does not rearrange the graph from scratch. Nodes that stay in the graph keep their place.

### Filters

| Filter | Default | What it does |
|---|---|---|
| Local graph: this note and its neighbours | Off | Shows only the open note and the notes around it. See [Local Graph](#local-graph) |
| Depth | 1 | How far from the open note the local graph reaches. Shown when the local graph is on |
| Tags | Off | Adds a node for each tag, linked to every note that has the tag. Tags in the note and tags in the frontmatter both count |
| Attachments | Off | Adds a node for each file that a note links to or embeds and that is not a note, such as an image or a PDF |
| Existing notes only | On | Leaves out links to notes that do not exist. Switch it off to draw those notes too, with a dashed outline |
| Notes with no links | On | Shows notes that nothing links to and that link to nothing. Switch it off to hide them |

### Groups

A group gives a colour to the notes that match a rule. Click **New group**, type the rule in the box, and click the colour swatch if you want a different colour. The × beside a group removes it.

| Rule | Colours notes |
|---|---|
| `tag:#work` | With the tag `work`, or a tag nested under it such as `work/meetings` |
| `path:Projects` | Whose path inside the vault contains `Projects` |
| `file:plan` | Whose name contains `plan` |
| `plan` | Whose name or path contains `plan` |

Case is ignored. If a note matches more than one group, the group that is higher in the list gives it its colour. Only notes are coloured: tags and attachments keep their own look.

A group rule is one of the four forms above. It is not a full [search query](../features/search.md#search-queries).

### Display

| Setting | What it does |
|---|---|
| Arrows | Draws arrowheads that show which way each link goes. On by default |
| Node size | Makes every node larger or smaller |
| Link thickness | Makes the lines between nodes thicker or thinner |
| Hide names when zoomed out past | Sets how far you can zoom out before note names are hidden. The open note, the node under the pointer and nodes that match the search bar always show their names |
| Play time-lapse | Plays the [time-lapse](#time-lapse) |

### Forces

| Setting | What it does |
|---|---|
| Center force | How strongly nodes are pulled toward the middle |
| Repel force | How strongly nodes push each other apart |
| Link force | How strongly linked nodes pull on each other |
| Link distance | The length a link settles at. At the lowest setting there is no set length, and linked notes are pulled toward each other |

## Local Graph

The local graph shows the note you have open and the notes around it, and leaves out the rest of the vault. It is the quickest way to see what one note is connected to.

To open it, run **Open Local Graph** from the command palette, or open the graph and tick **Local graph: this note and its neighbours** in the settings panel. The option cannot be ticked when no note is open. The command has no default shortcut.

**Depth** sets how far the graph reaches, from 1 to 5:

| Depth | Shows |
|---|---|
| 1 | The open note, the notes it links to and the notes that link to it |
| 2 | Those, and everything linked to or from them |
| 3 to 5 | One more step out for each level |

Links are followed in both directions. The other filters still apply: with **Tags** on, for example, the open note's tags are part of its neighbourhood. The open note is always shown, even when it has no links and **Notes with no links** is off.

Whether the graph opens local is decided by how you open it: **Graph View** and `Ctrl+G` show the whole vault, and **Open Local Graph** shows the local graph. The depth is remembered.

## Time-Lapse

The time-lapse plays back how the vault grew. Open the settings panel and click **Play time-lapse** under Display. The notes disappear, then come back one at a time in the order they were created, oldest first. While it plays, the button reads "Playing...".

- Notes appear at an even pace, one after another, however far apart they were created. A hundred notes imported on the same day still appear one by one.
- The whole run takes between about 1.5 and 8 seconds, depending on how many notes there are.
- The order comes from each file's creation time. Where the file system does not record one, the modified time is used.
- It needs at least two notes in the graph. It plays whatever the graph is showing, so it works in the local graph too.

## Highlighting

When you hover over a node, the graph highlights that node and all of its directly connected neighbors. Edges between the hovered node and its neighbors are drawn in the accent color with increased opacity, while all other nodes and edges are dimmed. This "ego graph" view makes it easy to trace a note's immediate neighborhood.

If you opened the graph while a note was active in the editor, that note's node is rendered in the accent color with a border ring, so you can see where the current document sits in the overall structure.

## Stats

The bottom-left corner of the graph overlay displays two counters:

- **Nodes**: The number of nodes drawn. In the local graph the label reads "nearby".
- **Connections**: The total number of unique edges between the nodes drawn.

Next to the counters, a legend shows the two edge styles: one-way and reciprocal.

## Mobile

On the mobile app, the graph view is implemented as a full-screen WebView rendering an HTML5 canvas. The same directed and reciprocal edge styles are used there. Tapping a node sends a message back to the React Native layer, which navigates to the corresponding note in the editor.

Due to the performance constraints of mobile devices, the mobile graph filters out orphan nodes (those with zero connections) to reduce the number of rendered elements.

The settings panel, local graph, groups and time-lapse described on this page are in the desktop app.

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
