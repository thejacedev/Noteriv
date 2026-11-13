---
title: Frontmatter
order: 3
---

# Frontmatter

Frontmatter is a block of YAML metadata at the very top of a markdown note, delimited by triple dashes (`---`). Noteriv reads frontmatter to enable features like board view, tag filtering, dataview queries, and more.

The values in the block are the note's properties. In the desktop app they are shown above the note in an editor, each with a type (after 2.4.13). See [Properties](../features/properties.md).

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

These field names are common in Noteriv vaults. Some of them have a meaning of their own in Noteriv, which is noted under each one.

### title

```yaml
title: My Note Title
```

A title for the note, kept as an ordinary property. Noteriv does not use it as the name of the note: the sidebar, search results, the links panel and the graph view show the file name. You can show it as a column in a dataview query:

````markdown
```dataview
TABLE title, status FROM #project
```
````

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

Defines tags for the note, in addition to the inline `#tags` in its text. Frontmatter tags do not need a `#` prefix.

Not every part of Noteriv reads them. See [Frontmatter and Tags](#frontmatter-and-tags).

### aliases

```yaml
aliases: [AI, Machine Intelligence]
```

Or in YAML list format:

```yaml
aliases:
  - AI
  - Machine Intelligence
```

Gives the note other names. A link written with an alias, such as `[[AI]]`, opens the note, and link suggestions and Quick Open find the note by its aliases. A single name, or several names separated by commas, also works, and `alias` is read the same way. Aliases are compared without regard to case. The field is read by the desktop app; versions up to 2.4.13 do not read it. See [Note Aliases](../features/wiki-links.md#note-aliases).

### due

```yaml
due: 2026-04-15
```

Sets a due date for the note. The date should be in `YYYY-MM-DD` format. The calendar view counts the note among the things due on that day. The field is also commonly used with dataview queries to build task lists and project timelines:

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

When set to `true`, Noteriv renders this note as a Kanban board instead of a regular markdown document. In board view, H2 headings become columns and list items become cards. See the [Board View](../views/board-view.md) documentation for details.

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

## Property Types

In the desktop app, each property has a type (after 2.4.13). The type decides how the value is shown and edited in the properties editor.

| Type | Example |
|---|---|
| Text | `status: active` |
| List | `tags: [a, b, c]` |
| Number | `priority: 1` |
| Checkbox | `board: true` |
| Date | `due: 2026-04-15` |
| Date and time | `start: 2026-04-15T09:30` |

A list can be written on one line, as above, or one item to a line:

```yaml
tags:
  - project
  - active
  - urgent
```

How the type is decided:

- `tags`, `aliases` and `cssclasses` are always lists.
- For any other name you can choose a type. The choice is kept for the whole vault, in `.noteriv/types.json`.
- With no chosen type, the type follows the value: a YAML list is a list, a number is a number, `true` and `false` are a checkbox, text of the form `2026-04-15` is a date, text that starts with a date and a time is a date and time, and everything else is text.

A value that does not fit its type is kept as it is and marked in the editor. See [Property Types](../features/properties.md#property-types).

Types belong to the properties editor. Dataview does not use them. See [Frontmatter and Dataview](#frontmatter-and-dataview).

## Properties Editor

The desktop app shows the frontmatter of a note above its text as a list of properties, in live mode and view mode (after 2.4.13). Each property is edited as the kind of value it is: a text box, a number box, a checkbox, a date picker or a list of items. In the editor you can:

- Add a property, with suggestions for names the vault already uses
- Edit a value
- Rename or remove a property
- Change the type of a property

To add the first property to a note, run **Add Property to the Open Note** from the command palette (`Ctrl+Shift+P`).

A change made in the editor is written to the YAML block in the note. Comments in the block, the order of the fields and the way a list is written are kept. A block that is not valid YAML is never rewritten: the editor says so, and you correct the YAML in the note.

In live mode the YAML block itself is folded at the top of the note, and view mode hides it. Source mode shows it as text and has no properties editor.

See [Properties](../features/properties.md) for the full description.

## Frontmatter and Dataview

All frontmatter fields are automatically available as queryable columns in dataview. When you write a TABLE query, you can include any frontmatter key as a column:

````markdown
```dataview
TABLE status, due, priority FROM #project SORT BY priority
```
````

The dataview engine extracts frontmatter by parsing the YAML block at the top of each note. Simple `key: value` pairs on each line are recognized. Complex nested YAML structures (maps, nested lists) are not supported in dataview queries.

Dataview treats every value as text:

| Written as | In dataview |
|---|---|
| `status: active` | The text `active` |
| `priority: 1` | The text `1`. Numbers are compared and sorted as text |
| `due: 2026-04-15` | The text `2026-04-15`. Dates in `YYYY-MM-DD` format sort correctly as text |
| `tags: [a, b, c]` | The text `[a, b, c]`. The tags also count for `FROM #a` |
| A list written one item to a line | Not read |

A field name made of letters, digits and `_` is read. A name with a space or a hyphen in it is not.

## Frontmatter and Tags

Tags in frontmatter are used alongside the inline tags from the note body. If your note has:

```yaml
---
tags: [project]
---

Some text with #active and #urgent tags.
```

Then the note has the inline tags `active` and `urgent`, and the frontmatter tag `project`. The parts of Noteriv listed here all read the inline tags. The frontmatter tag is read by some of them and not by others:

| Feature | Frontmatter tags |
|---|---|
| The `tag:` operator in [Vault Search](../features/search.md#search-queries) | Read |
| Graph view (tags shown in the graph, and groups made with `tag:`) | Read |
| [Bases](../views/bases.md) | Read |
| Dataview (`FROM #project`) | Read when the tags are written on one line, as `tags: [project]` |
| Tag pane | Not read. The tag pane lists the `#tags` written in the text of notes |

See [Tags](../features/tags.md).

## Best Practices

- **Use frontmatter for metadata**, not content. Keep actual note content below the closing `---`.
- **Use consistent field names** across your vault. If some notes use `status` and others use `state`, dataview queries become harder to write.
- **Use `YYYY-MM-DD` for dates** so they sort correctly in dataview queries.
- **Keep the YAML valid**. Colons in values need quoting: `title: "Note: Important"`. Strings with special characters should also be quoted.
- **Do not duplicate information**. If a note has `# Meeting Notes` as its H1 heading, you do not necessarily need `title: Meeting Notes` in frontmatter too.
