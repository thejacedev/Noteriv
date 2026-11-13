---
title: Folding
order: 10
---

# Folding

Folding hides the text under a heading or a list item, so you can see the outline of a long note and open only the part you are working on. It works in live mode, source mode and view mode. Versions up to 2.4.13 do not have it.

Folding changes what is shown, not the note. Nothing is written to the file, and folds are not remembered: a note opens with its headings and lists unfolded.

## What Can Be Folded

| Line | What folding hides |
|---|---|
| A heading | Everything under it, up to the next heading of the same or a higher level |
| A list item with something nested under it | The lines nested under the item |

For a list item, the nested lines are the lines after it that are indented further than the item itself. Blank lines between them are folded too. An item with nothing nested under it cannot be folded.

```markdown
## Shopping

- Bakery
  - Bread
  - Rolls
- Market
```

Here `## Shopping` and `- Bakery` can be folded. `- Market` cannot, because nothing is nested under it.

### The Properties Block

The YAML block at the top of a note, between the two `---` lines, folds as well. Its arrow is beside the first line.

- In live mode the block is folded each time a note is loaded, because the [properties editor](../features/properties.md) above the note shows the same values. Click the `…` marker or the arrow to unfold it.
- In source mode it is not folded for you, but you can fold it from the arrow in the margin.
- **Fold All Headings and Lists** leaves the block as it is. **Unfold All Headings and Lists** unfolds it with everything else.

## Fold Arrows

A line that can be folded has an arrow to its left. Click the arrow to fold the line, and click it again to unfold it.

| Mode | Where the arrow is | When it shows |
|---|---|---|
| Live | Just left of the text | While the pointer is on the line |
| View | Just left of the text | While the pointer is on the line |
| Source | In the margin, beside the line numbers | While the pointer is over the margin |

The arrow of a folded line stays visible all the time, so you can see what is folded.

Folded text is replaced by a small `…` marker at the end of the line. Clicking the marker unfolds it.

In source mode the margin also has arrows for other blocks that are written over several lines, such as a fenced code block or a table. Live mode and view mode only offer arrows for headings and list items.

## Fold All and Unfold All

Two commands in the [command palette](../features/command-palette.md) (`Ctrl+Shift+P`) work on the whole note:

| Command | What it does |
|---|---|
| Fold All Headings and Lists | Folds the headings and lists of the note |
| Unfold All Headings and Lists | Unfolds everything that is folded |

**Fold All Headings and Lists** folds from the outside in: a heading is folded, and the headings and lists under it are hidden with it. In a note with a single top-level heading, everything under that heading is folded away. Text that is not under a heading or in a list stays as it is.

Both commands act on the note in the view you are looking at. Neither has a default shortcut. To give them one, open Settings (`Ctrl+,`) and go to Shortcuts.
