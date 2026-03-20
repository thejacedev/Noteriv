---
title: Templates
order: 5
---

# Templates

Templates let you create new notes from predefined structures. Instead of starting from a blank file and retyping the same headings, frontmatter, and boilerplate, you select a template and Noteriv inserts its content with dynamic variables expanded.

## Template Storage

Templates are regular `.md` files stored in a `Templates/` folder at the root of your vault:

```
vault/
  Templates/
    Meeting.md
    Project.md
    Weekly Review.md
    Daily.md
```

Each file in this folder is treated as a template. The filename (without extension) becomes the template's display name in the picker.

Noteriv reads the `Templates/` directory each time you open the template picker. If the folder does not exist, the picker shows an empty state with instructions for creating it.

### Organizing Templates

You can have as many template files as you need. Since they are sorted alphabetically in the picker, prefixing names with numbers (e.g., `01-Meeting.md`, `02-Project.md`) can help control the order if you have many templates.

## Inserting a Template

Press `Ctrl+T` (or `Cmd+T` on macOS) to open the template picker. The picker consists of three parts:

1. **Search input.** Filters the template list as you type. The filter matches against template names.
2. **Template list.** Shows matching templates. Use the arrow keys to highlight an entry, or hover with the mouse. The selected template's preview updates in real time.
3. **Preview pane.** Displays the processed content of the currently highlighted template, with all variables replaced by their current values. This lets you see exactly what will be inserted before committing.

### Keyboard Navigation

| Key | Action |
|---|---|
| `Up` / `Down` | Move selection |
| `Enter` | Insert the selected template |
| `Esc` | Close the picker without inserting |

### Mouse Navigation

Click a template in the list to insert it immediately. Hover over a template to preview it without inserting.

## Template Variables

Variables use double-curly-brace syntax: `{{variable}}`. Noteriv replaces them at insertion time with computed values. Matching is case-insensitive and tolerates whitespace around the variable name, so `{{date}}`, `{{Date}}`, and `{{ date }}` all work.

### Built-In Variables

| Variable | Description | Example Output |
|---|---|---|
| `{{date}}` | Current date in `YYYY-MM-DD` format | `2025-11-03` |
| `{{time}}` | Current time in `HH:MM` (24-hour) format | `14:35` |
| `{{title}}` | The title of the note receiving the template | `Sprint Planning` |
| `{{datetime}}` | Full ISO 8601 timestamp | `2025-11-03T14:35:22.000Z` |
| `{{weekday}}` | Full weekday name | `Monday` |
| `{{month}}` | Full month name | `November` |
| `{{year}}` | Four-digit year | `2025` |

### Unrecognized Variables

If a template contains a variable that is not in the built-in list, Noteriv leaves it as-is. This means you can include placeholder patterns like `{{assignee}}` or `{{project-name}}` as manual fill-in reminders without them being silently removed.

## Example Templates

### Meeting Notes

```markdown
---
tags: [meeting]
date: {{date}}
---

# {{title}}

**Date:** {{date}} ({{weekday}})
**Time:** {{time}}
**Attendees:**

## Agenda

1.

## Discussion

## Action Items

- [ ]

## Notes

```

### Project Brief

```markdown
---
tags: [project]
status: active
created: {{date}}
---

# {{title}}

## Overview

## Goals

## Timeline

| Milestone | Target Date | Status |
|---|---|---|
|  |  |  |

## Resources

## Open Questions

```

### Weekly Review

```markdown
---
tags: [review, weekly]
week-of: {{date}}
---

# Weekly Review - {{date}}

## What went well

## What could improve

## Key metrics

## Next week priorities

- [ ]
- [ ]
- [ ]

## Notes

```

## How Processing Works

When you insert a template, Noteriv:

1. Reads the raw content of the selected template file.
2. Builds a variables map from the current date/time and the note's title.
3. Runs a single regex pass over the content, replacing every `{{...}}` occurrence whose inner name matches a known variable. The regex pattern is `/\{\{\s*(\w+)\s*\}\}/g`.
4. Inserts the processed text at the cursor position in the editor.

The entire process is synchronous after the file read, so there is no visible delay.

## Combining with Daily Notes

Templates pair well with [Daily Notes](./daily-notes.md). After pressing `Ctrl+D` to create a new daily note, immediately press `Ctrl+T` and select your daily template. The `{{date}}` and `{{weekday}}` variables will reflect today's values.

## Combining with Note Composer

If you have a template that represents a common section (e.g., a status update block), you can insert it into an existing note with `Ctrl+T`. The content is added at the cursor position, so templates are not limited to new-file creation.

## Tips

- **Keep templates minimal.** A template should provide structure, not content. Leave room for the actual writing.
- **Use frontmatter in templates.** Pre-filling `tags`, `status`, and `date` fields in the frontmatter saves time and keeps your vault consistent for dataview queries.
- **Name templates clearly.** The picker displays filenames, so `Meeting.md` is better than `tmpl-mtg-01.md`.
- **Use `{{title}}` for the H1 heading.** This ensures the note's heading matches its filename without extra typing.
- **Version your templates.** Since templates are plain files in the vault, they are versioned by Git sync like everything else. You can track how your templates evolve over time.
