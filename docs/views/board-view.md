---
title: Board View
order: 3
---

# Board View

The board view transforms a Markdown file into a Kanban-style task board with draggable columns and cards. It is designed for project management, sprint planning, habit tracking, and any workflow that benefits from visual task organization -- all while keeping your data in a plain Markdown file that you can read and edit anywhere.

## Activating the Board View

There are two ways to tell Noteriv that a file should be displayed as a board:

### Frontmatter Flag

Add `board: true` to the YAML frontmatter of any `.md` file:

```yaml
---
board: true
---
```

When Noteriv opens this file, it automatically switches to the board renderer instead of the standard editor.

### File Extension

Name your file with a `.board.md` extension, for example `Sprint 12.board.md`. Files with this extension are always opened in the board view, regardless of frontmatter content. This convention makes board files easy to identify in the file explorer and in other tools.

## Markdown Format

The board view reads and writes standard Markdown. The format is straightforward:

- **Columns** are defined by `##` level-two headings.
- **Cards** are task list items (`- [ ]` for incomplete, `- [x]` for complete) under each column heading.
- **Tags** are inline hashtags like `#urgent` or `#frontend`.
- **Due dates** use the syntax `@due(YYYY-MM-DD)`.
- **Other annotations** use the syntax `@key(value)`, for example `@estimate(90)`.

### Example

```markdown
---
board: true
---

## To Do

- [ ] Write integration tests #backend @due(2026-04-01)
- [ ] Design onboarding flow #design
- [ ] Update API documentation #docs

## In Progress

- [ ] Implement user auth #backend #urgent
- [x] Fix sidebar layout bug #frontend

## Done

- [x] Set up CI pipeline #devops
- [x] Create database schema #backend
```

This file renders as a three-column board with cards in each column. The raw Markdown is always the source of truth -- every change you make in the board view is serialized back to this format.

## Columns

### Creating Columns

New columns can be added from the board toolbar. Noteriv inserts a new `## Column Name` heading at the end of the file. You can rename a column by editing its heading directly in the board view or by switching to the editor and modifying the `##` heading.

### Deleting Columns

Removing a column deletes its heading and all cards under it from the Markdown file. This action cannot be undone from the board view -- use `Ctrl+Z` in the editor to undo if needed.

### Default Columns

When you create a new board with the **New board** button in the ribbon on the left edge of the window (since 3.0.7), or with **New Board** in the command palette (`Ctrl+Shift+P`), Noteriv generates a starter file with three columns: **To Do**, **In Progress**, and **Done**.

```markdown
---
board: true
---

## To Do

- [ ] New task

## In Progress

## Done
```

## Cards

### Adding Cards

Click the "+" button at the bottom of any column to add a new card. A text input appears where you can type the card text, tags, and due date. Press `Enter` to confirm or `Escape` to cancel.

### Editing Cards

Double-click a card to edit its text inline. Changes are saved automatically when you click away or press `Enter`.

### Completing Cards

Click the checkbox on a card to toggle its completion state. Completed cards are rendered with a strikethrough style and a checked checkbox (`- [x]`).

### Deleting Cards

Each card has a small delete button (visible on hover) that removes it from the column and the underlying file.

### Dragging Cards

Drag a card to reorder it within a column, or drop it into a different column. The board view uses drag-and-drop powered by pointer events. When you drop a card:

1. The card is removed from its source column.
2. The card is inserted at the drop position in the target column.
3. The Markdown file is re-serialized to reflect the new ordering.

The board supports both mouse and touch drag on supported platforms.

## Tags

Tags are extracted from the card text using the `#tag-name` syntax. A tag is a `#` followed by letters, digits, `_`, `-` or `/`, at the start of the card text or after a space. Letters of any language count, so `#réunion` is one tag, and so is a nested tag like `#work/urgent`. Tags are rendered as colored pills on the card, making it easy to scan for categories at a glance.

A `#` inside a word is not a tag. The one in a web address (`https://example.com/guide#install`) or in a link to a heading (`[[Plan#Risks]]`) stays where it is.

When the board writes the file, a card's tags come after its text, in the order they were written.

### Examples

```markdown
- [ ] Implement login page #frontend #auth
- [ ] Write unit tests #testing #backend
```

## Due Dates

Due dates use the `@due(YYYY-MM-DD)` syntax. When present, the date is displayed on the card below the text. Overdue cards (where the due date is in the past and the card is not completed) are highlighted with a warning color.

```markdown
- [ ] Submit quarterly report @due(2026-03-31)
```

Only this form is read as a due date. Anything else, such as `@due(friday)`, stays in the card text. To change a card's date, type the new `@due(...)` into the card text: it takes the place of the old one.

Due dates also appear in the calendar view as yellow dots on the corresponding day, creating a bridge between board and calendar workflows.

## Other Annotations

A card can carry any other piece of information written as `@key(value)`. The board shows each one as a chip with the key and the value, between the tags and the due date.

```markdown
- [ ] Team workshop #team @time(09:30) @estimate(90) @room(B-12)
```

- The key starts with a letter and can hold letters, digits, `_` and `-`. The value is what stands between the brackets. It can be empty, as in `@urgent()`, and it cannot hold brackets of its own.
- Like a tag, an annotation starts the card text or follows a space.
- The board gives no key a meaning of its own except `due`. Which keys you use is up to you.
- To add an annotation or change its value, type it into the card text. A value typed for a key the card already has takes the place of the old one.
- The calendar shows a task's line as it is written, annotations included.

Versions up to 3.0.2 showed these as part of the card text.

## Auto-Save

The board view automatically saves changes to disk every 5 seconds while the board is open and has unsaved modifications. This ensures that drag-and-drop operations, card edits, and checkbox toggles are persisted without requiring a manual save. You can also trigger a save at any time with `Ctrl+S`.

## Round-Trip Editing

Because the board format is plain Markdown, you can switch between the board view and the standard editor at any time:

1. Open the file in the board view to drag cards and toggle checkboxes.
2. Switch to the editor to make bulk text edits, add long descriptions, or restructure the file.
3. Switch back to the board view -- it re-parses the file on every open.

The board shows columns and cards. Every other line in the file is kept and written back where it was:

- A title or text above the first column stays above it.
- Text under a column heading, before its first card, stays with the column.
- Anything under a card stays with that card: sub-items, a note, an image, a code block. It moves with the card when you drag it, and it is deleted with the card. The board asks before it deletes a card or a column that holds lines it does not show.

The board does not show these lines. Switch to the editor to read or change them.

Two things are tidied when the board writes the file: empty lines between cards are removed, and a card's tags, annotations and due date are moved to the end of its line, in that order.

Up to version 3.0.2 the board deleted every line it did not show the first time you changed a card. It also cut a `#` out of web addresses and heading links, and removed a due date that was not written as `YYYY-MM-DD`.

## Data Model

Internally, the board is represented as a `BoardData` structure:

- **columns**: An array of `BoardColumn` objects, each containing an `id`, `title`, an array of `cards`, and `extra`, the lines between the heading and the first card.
- **cards**: Each `BoardCard` has an `id`, `text`, `completed` boolean, `tags` array, an optional `dueDate` string, `meta`, the other annotations as `{ key, value }` pairs, and `extra`, the lines under the card that the board does not show.
- **frontmatter**: The raw YAML frontmatter string, preserved verbatim.
- **preamble**: The lines between the frontmatter and the first column.
- **eol**: The line ending the file came with, so a file with Windows line endings is written back with them.

Operations like `moveCard`, `reorderCard`, `addCard`, `removeCard`, `toggleCard`, `addColumn`, and `removeColumn` produce a new immutable copy of the board data, which is then serialized back to Markdown and written to disk.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save board to disk |
| `Enter` | Confirm card edit |
| `Escape` | Cancel card edit |

## Limitations

- The board parser only recognizes `##` headings as columns. `#`, `###`, and deeper headings are ignored.
- Cards must be task list items (`- [ ]` or `- [x]`). Regular list items (`- text`) are not rendered as cards.
- Nested task items are not supported. Only top-level items under each column heading are parsed.
- The board view does not support card descriptions or multi-line card content. Each card is a single line of text.
