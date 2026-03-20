---
title: Calendar View
order: 4
---

# Calendar View

The calendar view provides a monthly grid that connects your daily notes, tasks, and due dates into a visual timeline. It answers the question "what did I write on this day?" and "what is due this week?" at a glance, without requiring you to search or scroll through folders.

## Opening the Calendar

There are three ways to open the calendar view:

- **Ribbon sidebar**: Click the calendar icon in the left ribbon.
- **Command palette**: Open `Ctrl+P` and search for "Calendar".
- **Daily note header**: The daily note panel includes a mini-calendar for quick date selection.

On mobile, the calendar is a full-screen view accessible from the bottom navigation bar.

## Monthly Grid

The calendar displays a standard 7-column grid representing one month. The grid always shows 6 complete weeks (42 cells), which means leading days from the previous month and trailing days from the next month appear in a dimmed style to fill the rows.

Each cell shows the day number and up to two indicator dots:

- **Blue dot**: A daily note exists for this day.
- **Yellow dot**: One or more tasks with a `@due(YYYY-MM-DD)` date fall on this day.

The current day is highlighted with the accent color border and a subtle background tint.

## Week Start Configuration

By default, weeks start on Sunday. If you prefer a Monday start (common in European locales), you can change this in Settings. The `weekStartMonday` option rotates the column headers from `Sun Mon Tue ... Sat` to `Mon Tue ... Sun` and adjusts the grid layout accordingly.

## Navigation

### Month Navigation

Arrow buttons on either side of the month/year header let you step one month forward or backward. The header displays the month name and year (e.g., "March 2026").

### Today Button

A "Today" button resets the view to the current month and scrolls the current day into view. This is useful after browsing past or future months.

## Daily Notes Integration

Clicking a day in the calendar does one of two things:

1. **If a daily note exists**: Opens it in the editor.
2. **If no daily note exists**: Creates a new daily note for that date using your configured daily note template and folder, then opens it.

Daily notes are matched by their file name. Noteriv looks for files named in the `YYYY-MM-DD` format (e.g., `2026-03-20.md`) inside the configured daily notes folder. The matching is based on the formatted date string, so your daily notes must follow this naming convention to be recognized by the calendar.

## Task Due Dates

The calendar scans all Markdown files in the vault for task items that include a due date annotation:

```markdown
- [ ] Submit report @due(2026-03-25)
- [x] Review PR @due(2026-03-20)
```

Tasks are extracted using a regex that matches `- [ ]` or `- [x]` items followed by `@due(YYYY-MM-DD)` anywhere in the line. The due date is parsed and mapped to the corresponding day on the calendar grid.

Additionally, the calendar checks for `due:` fields in YAML frontmatter:

```yaml
---
due: 2026-03-28
---
```

This lets you assign a due date to an entire note, not just individual tasks within it.

### Task Counts

When a day has tasks due, the yellow dot indicates their presence. Hovering over a day cell (on desktop) or tapping it (on mobile) can show a count of how many tasks are due that day. Completed tasks (`- [x]`) are still counted but styled differently.

## Calendar Data Model

The calendar is built from three data sources that are assembled when the view opens:

### Daily Notes Map

A `Map<string, string>` that maps date strings (`YYYY-MM-DD`) to file paths. This is built by scanning the daily notes folder and parsing file names.

### Tasks by Date

A `Map<string, number>` that maps date strings to the number of tasks due on that date. This is built by scanning all files in the vault for `@due()` annotations and frontmatter `due:` fields.

### Notes by Date

A `Map<string, number>` that maps date strings to the total number of notes associated with that date (including daily notes and any notes with matching due dates).

These three maps are combined with the month grid to produce an array of `CalendarDay` objects, each containing:

- `date`: The JavaScript `Date` object.
- `dayOfMonth`: The numeric day (1-31).
- `isCurrentMonth`: Whether this day belongs to the displayed month.
- `isToday`: Whether this day is today.
- `hasDailyNote`: Whether a daily note file exists for this date.
- `dailyNotePath`: The file path to the daily note, or `null`.
- `taskCount`: The number of tasks due on this date.
- `noteCount`: The number of notes associated with this date.

## Mobile Calendar

On the mobile app, the calendar view is a dedicated screen accessible from the navigation. It uses the same grid layout and dot indicators, adapted for touch interaction. Tapping a day navigates to the daily note editor. The month picker supports swipe gestures for navigation.

## Date Formatting

All dates in the calendar system use the `YYYY-MM-DD` format (ISO 8601). This is the same format used for:

- Daily note file names (`2026-03-20.md`)
- Due date annotations (`@due(2026-03-20)`)
- Frontmatter due fields (`due: 2026-03-20`)

The `formatDate` utility converts a `Date` object to this string, and `parseDate` converts a string back. Both are locale-independent and do not rely on browser date formatting.

## Interaction with Board View

Tasks that have `@due()` annotations in board files appear on the calendar just like tasks in any other Markdown file. This creates a natural connection between your Kanban workflow and your time-based planning:

- Use the board view to organize tasks into columns (To Do, In Progress, Done).
- Use the calendar view to see what is due when.
- Click a date to create a daily note where you can plan which board tasks to tackle.

## Limitations

- The calendar only recognizes the `YYYY-MM-DD` date format. Other formats (e.g., `MM/DD/YYYY`, `March 20, 2026`) are not parsed.
- Daily note detection relies on file naming. If your daily notes use a different naming pattern (e.g., `March 20 2026.md`), they will not appear as blue dots on the calendar.
- Task scanning reads all files on every calendar open. In very large vaults (10,000+ files), the initial load may take a noticeable moment.
- The calendar does not support recurring tasks or time-of-day scheduling. It operates at day-level granularity only.
