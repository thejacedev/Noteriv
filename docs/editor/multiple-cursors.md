---
title: Multiple Cursors
order: 11
---

# Multiple Cursors

You can put several cursors in a note and type at all of them at once. This is useful for making the same change on several lines, such as adding a prefix to each item of a list. It works in live mode and source mode. Versions up to 2.4.13 do not have it.

## Adding Cursors

| Action | Result |
|---|---|
| `Alt+Click` | Adds a cursor where you click, and keeps the ones you already have |
| `Shift+Alt` and drag | Selects a rectangle: one selection on each line the drag covers |

While `Alt` is held down, the pointer is shown as a crosshair.

## Editing

Whatever you type is typed at every cursor, and deleting removes text at every cursor.

To go back to one cursor, click anywhere in the note without holding `Alt`, or press `Esc`.

## In Live Mode

Live mode shows raw Markdown on every line that has a cursor and renders the rest. With cursors on several lines, all of those lines show their Markdown at once. See [Live Mode](./live-mode.md).

## Where It Does Not Apply

View mode is read-only and has no cursor, so there is nothing to add.
