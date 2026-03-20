---
title: Daily Notes
order: 4
---

# Daily Notes

Daily notes give you a quick way to capture thoughts, tasks, and logs for the current day. Press a single shortcut to open today's note -- if it does not exist yet, Noteriv creates it for you automatically.

## Opening Today's Note

Press `Ctrl+D` (or `Cmd+D` on macOS) to open the daily note for the current date. If the file already exists, it opens in the editor. If it does not, Noteriv creates a new empty file with the appropriate name and opens it.

You can also trigger this action from the command palette (`Ctrl+Shift+P`, search for "Open Daily Note").

## Naming Convention

Daily notes follow the `YYYY-MM-DD.md` format:

```
2025-11-03.md
2025-11-04.md
2025-11-05.md
```

This format sorts chronologically in any file browser and avoids locale-dependent date ambiguities. The date used is always the local date on your machine at the moment you invoke the command.

## Storage Location

Noteriv checks for a folder named `DailyNotes/` in the vault root. If it exists, daily notes are created inside it:

```
vault/
  DailyNotes/
    2025-11-03.md
    2025-11-04.md
```

If no `DailyNotes/` folder exists, daily notes are created in the vault root:

```
vault/
  2025-11-03.md
  2025-11-04.md
```

You can create the `DailyNotes/` folder at any time by right-clicking in the sidebar and selecting "New Folder". Existing daily notes in the vault root will not be moved automatically -- only newly created notes use the folder.

## Calendar View

The calendar view provides a visual overview of your daily notes. It renders a standard month grid where each day cell can show:

- **A dot indicator** on days that have a daily note file.
- **Task counts** if any notes contain tasks with `@due(YYYY-MM-DD)` dates that fall on that day.
- **Today highlighting** to mark the current date.

### Opening the Calendar

Open the calendar from the command palette (`Ctrl+Shift+P`, search for "Calendar View") or from the sidebar panel selector.

### Navigation

Use the left and right arrows in the calendar header to move between months. Clicking a day cell that has a daily note opens that note. Clicking a day without a note creates a new daily note for that date and opens it.

### Week Start

The calendar defaults to Sunday as the first day of the week. The week headers update accordingly, showing `Sun Mon Tue Wed Thu Fri Sat` or `Mon Tue Wed Thu Fri Sat Sun` depending on the setting.

## Templates for Daily Notes

You can combine daily notes with the [Templates](./templates.md) feature. If you create a template file named something like `Daily.md` in your `Templates/` folder:

```markdown
# {{date}}

## Tasks

- [ ]

## Notes


## Journal

```

You can then press `Ctrl+T` immediately after creating a daily note to insert this template. The `{{date}}` variable is replaced with today's date in `YYYY-MM-DD` format, and `{{weekday}}` would be replaced with the day name (e.g., "Wednesday").

## Tasks and Due Dates

Daily notes work well as a home for tasks. Noteriv recognizes the standard checkbox syntax:

```markdown
- [ ] Review pull request
- [ ] Send status update @due(2025-11-03)
- [x] Deploy staging build
```

Tasks with `@due(YYYY-MM-DD)` annotations are picked up by the calendar view and displayed as counts on the relevant day. This gives you a forward-looking view of what is due without leaving the calendar.

## Frontmatter

Like any Markdown file, daily notes can include YAML frontmatter:

```yaml
---
tags: [daily, work]
mood: productive
---
```

Frontmatter fields are indexed by the [Dataview](./dataview.md) engine, so you can query across daily notes:

```dataview
TABLE mood FROM "DailyNotes" WHERE mood != "" SORT BY file.name DESC LIMIT 30
```

This returns a table of your last 30 daily notes that have a `mood` field.

## Searching Daily Notes

All daily notes are regular Markdown files, so they appear in Quick Open (`Ctrl+P`) and Vault Search (`Ctrl+Shift+F`) like any other file. Typing `2025-11` in Quick Open will show all daily notes from November 2025.

## Tips

- **Use daily notes as an inbox.** Capture everything quickly during the day, then move structured content to permanent notes later.
- **Link to project notes.** Add wiki-links like `[[project-alpha]]` in your daily note to create a trail of context. The backlinks panel on the project note will then show every daily note that mentioned it.
- **Review weekly.** Scroll through the calendar view to see which days had notes and which did not. Gaps can be informative.
- **Keep a consistent structure.** Using the same template for every daily note makes it easy to scan them later.
- **Tag daily notes.** Adding `#daily` in the body or frontmatter lets you query all daily notes via the tag pane or dataview without relying on the folder name.
