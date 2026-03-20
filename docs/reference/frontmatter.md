---
title: Frontmatter
order: 3
---

# Frontmatter

Frontmatter is a block of YAML metadata at the very top of a markdown note, delimited by triple dashes (`---`). Noteriv reads frontmatter to enable features like board view, tag filtering, dataview queries, and more.

## Syntax

Frontmatter must be the first thing in the file, with no blank lines or content before it:

```markdown
---
title: Project Roadmap
tags: [project, roadmap, active]
status: in-progress
due: 2026-06-30
---

# Project Roadmap

The rest of your note goes here.
```

The YAML block is delimited by `---` on its own line at the start and end. Everything between the delimiters is parsed as YAML key-value pairs.

## Built-In Fields

Noteriv recognizes and uses the following frontmatter fields:

### title

```yaml
title: My Note Title
```

Sets the display title of the note. When present, this title is used in the sidebar, search results, backlinks panel, and graph view instead of the filename. If not set, the filename (without extension) is used.

### tags

```yaml
tags: [project, active, urgent]
```

Or in YAML list format:

```yaml
tags:
  - project
  - active
  - urgent
```

Defines tags for the note. These tags are merged with inline `#tags` found in the note content. Both frontmatter tags and inline tags are searchable, appear in the tag browser, and are queryable via dataview.

Unlike inline tags, frontmatter tags do not need a `#` prefix. Writing `tags: [project]` is equivalent to having `#project` somewhere in the note body.

### due

```yaml
due: 2026-04-15
```

Sets a due date for the note. The date should be in `YYYY-MM-DD` format. This field is commonly used with dataview queries to build task lists and project timelines:

````markdown
```dataview
TABLE title, due FROM #task WHERE due < "2026-05-01" SORT BY due
```
````

### status

```yaml
status: in-progress
```

Sets a status for the note. Common values include `todo`, `in-progress`, `done`, `blocked`, and `archived`, but you can use any string. Status is queryable via dataview and useful for building project dashboards:

````markdown
```dataview
TABLE title, status FROM #project WHERE status != "done"
```
````

### board

```yaml
board: true
```

When set to `true`, Noteriv renders this note as a Kanban board instead of a regular markdown document. In board view, H2 headings become columns and list items become cards. See the [Board View](../views/board.md) documentation for details.

Board note example:

```markdown
---
board: true
---

## To Do

- Design the API
- Write unit tests

## In Progress

- Implement authentication

## Done

- Set up the repository
- Create the database schema
```

## Custom Fields

You can add any custom key-value pair to frontmatter. Custom fields are accessible in dataview queries:

```yaml
---
title: Meeting Notes
tags: [meeting]
attendees: Alice, Bob, Carol
project: Alpha
priority: high
---
```

Query custom fields with dataview:

````markdown
```dataview
TABLE attendees, project FROM #meeting WHERE priority = "high" SORT BY file.name
```
````

### Supported Value Types

| Type | Example | Notes |
|---|---|---|
| String | `status: active` | The most common type. Strings do not need quotes unless they contain special YAML characters. |
| Number | `priority: 1` | Parsed as a string for dataview purposes. |
| Boolean | `board: true` | Used by the `board` field. |
| Date | `due: 2026-04-15` | Use `YYYY-MM-DD` format. Stored and compared as strings. |
| List | `tags: [a, b, c]` | YAML inline list syntax. |
| Multi-line list | See below | YAML block list syntax. |

Multi-line list example:

```yaml
tags:
  - project
  - active
  - urgent
```

## Frontmatter Editor

Noteriv includes a visual frontmatter editor that lets you add, edit, and remove frontmatter fields without hand-editing the YAML block. Open it from the editor menu or the command palette ("Edit Frontmatter").

The frontmatter editor displays each field as a labeled input. You can:

- Add new fields with any key and value
- Edit existing field values
- Remove fields
- Toggle boolean fields with a switch

Changes are written directly to the YAML block in the note file.

## Frontmatter and Dataview

All frontmatter fields are automatically available as queryable columns in dataview. When you write a TABLE query, you can include any frontmatter key as a column:

````markdown
```dataview
TABLE status, due, priority FROM #project SORT BY priority
```
````

The dataview engine extracts frontmatter by parsing the YAML block at the top of each note. Simple `key: value` pairs on each line are recognized. Complex nested YAML structures (maps, nested lists) are not supported in dataview queries.

## Frontmatter and Tags

Tags in frontmatter are merged with inline tags from the note body. If your note has:

```yaml
---
tags: [project]
---

Some text with #active and #urgent tags.
```

Then the note's effective tag list is `[project, active, urgent]`. This means you can use either frontmatter tags or inline tags (or both) depending on your preference.

The tag browser, graph view, and dataview all see the merged tag list.

## Best Practices

- **Use frontmatter for metadata**, not content. Keep actual note content below the closing `---`.
- **Use consistent field names** across your vault. If some notes use `status` and others use `state`, dataview queries become harder to write.
- **Use `YYYY-MM-DD` for dates** so they sort correctly in dataview queries.
- **Keep the YAML valid**. Colons in values need quoting: `title: "Note: Important"`. Strings with special characters should also be quoted.
- **Do not duplicate information**. If a note has `# Meeting Notes` as its H1 heading, you do not necessarily need `title: Meeting Notes` in frontmatter too.
