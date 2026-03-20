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

When you create a new board file from the file menu ("New Board"), Noteriv generates a starter file with three columns: **To Do**, **In Progress**, and **Done**.

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

Click a card to edit its text inline. Changes are saved automatically when you click away or press `Enter`.

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

Tags are extracted from the card text using the `#tag-name` syntax. Any word prefixed with `#` is treated as a tag. Tags are rendered as colored pills on the card, making it easy to scan for categories at a glance.

Tags are preserved exactly as written in the Markdown. When the board serializes back to Markdown, tags are appended after the card text in the same position they originally occupied.

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

Due dates also appear in the calendar view as yellow dots on the corresponding day, creating a bridge between board and calendar workflows.

## Auto-Save

The board view automatically saves changes to disk every 5 seconds while the board is open and has unsaved modifications. This ensures that drag-and-drop operations, card edits, and checkbox toggles are persisted without requiring a manual save. You can also trigger a save at any time with `Ctrl+S`.

## Round-Trip Editing

Because the board format is plain Markdown, you can switch between the board view and the standard editor at any time:

1. Open the file in the board view to drag cards and toggle checkboxes.
2. Switch to the editor to make bulk text edits, add long descriptions, or restructure the file.
3. Switch back to the board view -- it re-parses the file on every open.

Any Markdown that the board parser does not understand (paragraphs, images, code blocks outside the column/card structure) is preserved in the frontmatter section and written back unmodified.

## Data Model

Internally, the board is represented as a `BoardData` structure:

- **columns**: An array of `BoardColumn` objects, each containing an `id`, `title`, and an array of `cards`.
- **cards**: Each `BoardCard` has an `id`, `text`, `completed` boolean, `tags` array, and an optional `dueDate` string.
- **frontmatter**: The raw YAML frontmatter string, preserved verbatim.

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
