---
title: Dataview
order: 13
---

# Dataview

Dataview lets you query your vault like a database. Write a query in a fenced code block, and Noteriv renders the results live in the editor -- tables, lists, or task views filtered by tags, folders, frontmatter fields, and more.

## Basic Syntax

Wrap your query in a fenced code block with the language tag `dataview`:

````markdown
```dataview
TABLE title, status FROM #project WHERE status != "done" SORT BY title
```
````

The query is parsed and executed against every note in your vault. Results are rendered inline, replacing the code block with a formatted table, list, or task view.

## Query Types

Dataview supports three query types: TABLE, LIST, and TASK.

### TABLE

Returns a table with columns defined by the field list.

```
TABLE field1, field2, field3 FROM source WHERE condition SORT BY field LIMIT n
```

Example:

````markdown
```dataview
TABLE title, status, priority FROM #project WHERE status != "archived" SORT BY priority DESC LIMIT 20
```
````

This renders a table with three columns (title, status, priority) containing notes tagged `#project` where the `status` frontmatter field is not "archived", sorted by priority in descending order, limited to 20 rows.

If no fields are specified, the table defaults to showing `file.name`.

### LIST

Returns a simple list of note names.

```
LIST FROM source WHERE condition SORT BY field LIMIT n
```

Example:

````markdown
```dataview
LIST FROM "Projects" WHERE status = "active"
```
````

This renders a bullet list of every note in the `Projects/` folder that has `status: active` in its frontmatter. Each item shows the file name and is clickable to open the note.

### TASK

Returns all task items (`- [ ]` / `- [x]`) from matching notes.

```
TASK FROM source WHERE condition
```

Example:

````markdown
```dataview
TASK FROM #work WHERE !completed
```
````

This renders all uncompleted tasks from notes tagged `#work`. Each task shows its text, completion status, source file name, and is interactive -- you can check/uncheck tasks directly in the rendered view.

## FROM Clause

The `FROM` clause specifies which notes to include. Three forms are supported:

### Tag Source

```
FROM #tag-name
```

Includes only notes that contain the specified tag (without the `#` prefix in the match). The tag is matched against both inline `#tag` syntax and frontmatter `tags` arrays.

### Folder Source

```
FROM "folder-path"
```

Includes only notes whose file path starts with the given folder. The path is relative to the vault root. Quotes are required.

```
FROM "Projects/Active"
```

### All Notes

Omit the `FROM` clause entirely to query all notes in the vault:

```
TABLE title, tags
```

Or use an empty string:

```
TABLE title FROM ""
```

## WHERE Clause

The `WHERE` clause filters notes based on field values.

### Comparison Operators

```
WHERE field = "value"
WHERE field != "value"
WHERE field > "value"
WHERE field < "value"
WHERE field >= "value"
WHERE field <= "value"
```

Values are compared as strings. For numeric comparisons, ensure values are formatted consistently (e.g., zero-padded dates).

### Boolean Fields

A field name alone checks that the field exists and is non-empty:

```
WHERE status
```

Prefix with `!` to negate:

```
WHERE !completed
```

### Logical Operators

Combine conditions with `AND` and `OR`:

```
WHERE status = "active" AND priority = "high"
WHERE tag = "urgent" OR tag = "blocked"
```

### Contains

Check if a field contains a substring:

```
WHERE contains(title, "meeting")
```

### NOT

Negate any condition:

```
WHERE ! status = "done"
```

## SORT BY Clause

Sort results by a field:

```
SORT BY field ASC
SORT BY field DESC
```

The default sort order is ascending (`ASC`). The sort is string-based, so dates in `YYYY-MM-DD` format sort correctly.

## LIMIT Clause

Restrict the number of results:

```
LIMIT 10
```

Without a limit, all matching notes are returned.

## Available Fields

### File Metadata Fields

These fields are available on every note without any frontmatter:

| Field | Description | Example |
|---|---|---|
| `file.name` | Filename without extension | `meeting-notes` |
| `file.path` | Full file path | `/vault/projects/meeting-notes.md` |
| `file.folder` | Parent directory path | `/vault/projects` |
| `file.tags` | Comma-separated list of tags | `project, meeting` |
| `file.created` | Creation date | `2025-11-01` |
| `file.modified` | Last modified date | `2025-11-03` |
| `file.size` | File size in bytes | `4096` |

### Frontmatter Fields

Any key in the note's YAML frontmatter is available as a field:

```yaml
---
title: Sprint Planning
status: active
priority: high
assignee: Alice
---
```

These become fields `title`, `status`, `priority`, and `assignee` in queries.

## Live Rendering

Dataview blocks are rendered live in the editor. When you are viewing a note (not editing the code block line), the raw query is replaced with the rendered result. Moving your cursor to the code block line reveals the raw query for editing.

Results update when the block is re-rendered (e.g., when you reopen the note or switch view modes). They are not auto-refreshed in real time as other files change.

## Complete Examples

### Project Dashboard

````markdown
```dataview
TABLE status, priority, assignee FROM #project WHERE status != "archived" SORT BY priority DESC
```
````

### Recent Notes

````markdown
```dataview
TABLE file.modified FROM "" SORT BY file.modified DESC LIMIT 10
```
````

### Task Overview

````markdown
```dataview
TASK FROM #work WHERE !completed
```
````

### Notes in a Folder

````markdown
```dataview
LIST FROM "Areas/Health"
```
````

### Filtered by Frontmatter

````markdown
```dataview
TABLE title, rating FROM #book WHERE rating >= "4" SORT BY rating DESC
```
````

### Combined Conditions

````markdown
```dataview
TABLE title, status FROM #project WHERE status = "active" AND priority = "high" SORT BY title LIMIT 5
```
````

## How Parsing Works

Noteriv's dataview engine:

1. **Tokenizes** the query string, respecting quoted strings.
2. **Parses** the query type (TABLE, LIST, TASK), field list, FROM source, WHERE clause, SORT BY, and LIMIT.
3. **Loads** all matching notes from the vault, extracting file metadata, frontmatter, tags, and tasks.
4. **Evaluates** the WHERE clause against each note.
5. **Sorts** the results.
6. **Applies** the limit.
7. **Renders** the result as HTML (a table, list, or task list).

The entire process runs in the browser. There is no server component or external database.

## Error Handling

If a query has a syntax error, the rendered block displays an error message instead of results. Common errors:

- `Unknown query type: SELECT` -- use TABLE, LIST, or TASK instead.
- `Empty query` -- the code block is empty.

## Tips

- **Start simple.** Begin with `LIST FROM #tag` and add complexity (WHERE, SORT, LIMIT) once you confirm the basic query works.
- **Use frontmatter consistently.** Dataview is most powerful when your notes have structured frontmatter. Decide on field names (e.g., `status`, `priority`, `due`) and use them across all relevant notes.
- **Combine with tags.** Tags in the `FROM` clause and frontmatter fields in the `WHERE` clause work together for precise filtering.
- **Use LIMIT for dashboards.** A "Recent 10 notes" or "Top 5 priorities" table is more useful on a dashboard note than an unbounded list.
- **Check field names.** Frontmatter keys are case-sensitive. `Status` and `status` are different fields.
