---
title: MCP Tools Reference
order: 3
---

# MCP Tools Reference

The Noteriv MCP server exposes 22 tools organized into six categories. This page documents each tool with its parameters, behavior, and usage examples.

---

## Vault Management

### list_vaults

List all Noteriv vaults configured on this machine.

**Parameters**: None

**Returns**: A list of vaults with their name, ID, path, and whether they are currently active.

**Example response**:
```
My Notes (abc123)
  Path: /home/user/notes
  [ACTIVE]

Work (def456)
  Path: /home/user/work-notes
```

### get_active_vault

Get the currently active vault name and path.

**Parameters**: None

**Returns**: The active vault's name, path, and ID. If a manual vault path was set via command-line argument or `set_vault_path`, that path is returned instead.

**Example response**:
```
My Notes
Path: /home/user/notes
ID: abc123
```

### switch_vault

Switch to a different vault by name or ID. All subsequent operations will target the new vault.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name_or_id` | string | Yes | The vault name (case-insensitive) or vault ID |

**Example**: `switch_vault({ name_or_id: "Work" })`

**Returns**: Confirmation with the new vault name and path.

### set_vault_path

Set a custom vault path for vaults that are not in the Noteriv configuration. Useful for pointing the server at any directory containing markdown files.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Absolute path to the vault directory |

**Example**: `set_vault_path({ path: "/home/user/my-project/docs" })`

**Returns**: Confirmation of the new vault path. Returns an error if the path does not exist.

---

## Note CRUD

### read_note

Read the full content of a note by its relative path within the vault.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Relative path from vault root (e.g., `Projects/roadmap.md`) |

**Example**: `read_note({ path: "Projects/roadmap.md" })`

**Returns**: The full markdown content of the note, or an error if the file does not exist.

### write_note

Create a new note or overwrite an existing one. Parent directories are created automatically if they do not exist.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Relative path for the note |
| `content` | string | Yes | Full markdown content to write |

**Example**: `write_note({ path: "Ideas/new-feature.md", content: "# New Feature\n\nDescription here." })`

**Returns**: Confirmation that the note was written.

### append_to_note

Append text to the end of an existing note. A newline is inserted between the existing content and the appended text if the file does not already end with one.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Relative path to the existing note |
| `content` | string | Yes | Text to append |

**Example**: `append_to_note({ path: "Daily/2026-03-20.md", content: "\n## Evening\n\nWrapped up the documentation." })`

**Returns**: Confirmation that the text was appended. Returns an error if the note does not exist.

### delete_note

Move a note to the trash (soft delete). The note is moved to `.noteriv/trash/` with a metadata file recording its original path and deletion time. The note can be restored later.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Relative path to the note to delete |

**Example**: `delete_note({ path: "Archive/old-draft.md" })`

**Returns**: Confirmation that the note was trashed.

### rename_note

Rename or move a note to a new path. Parent directories for the new path are created automatically.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `old_path` | string | Yes | Current relative path |
| `new_path` | string | Yes | New relative path |

**Example**: `rename_note({ old_path: "Inbox/idea.md", new_path: "Projects/idea.md" })`

**Returns**: Confirmation showing the old and new paths.

---

## Browsing

### list_notes

List all markdown notes (`.md` and `.markdown` files) in the vault or a specific subfolder. Does not include directories or non-markdown files.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `folder` | string | No | Subfolder to list (omit for entire vault) |

**Example**: `list_notes({ folder: "Projects" })`

**Returns**: Newline-separated list of relative file paths.

### list_folders

List all folders in the vault, including nested subfolders. Hidden directories (starting with `.`) and `node_modules` are excluded.

**Parameters**: None

**Returns**: Newline-separated list of relative folder paths.

### list_all_files

List all files in the vault or a subfolder, including non-markdown files like images, PDFs, and other attachments.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `folder` | string | No | Subfolder to list (omit for entire vault) |

**Returns**: Newline-separated list of relative file paths.

### search_notes

Full-text search across all notes in the vault. Searches both file names and file content (case-insensitive). Returns up to 20 matching files with up to 5 matching lines per file.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search text |

**Example**: `search_notes({ query: "API design" })`

**Returns**: Matching files with line numbers and matching line text:
```
Projects/api-spec.md
  L12: ## API Design Principles
  L45: The API design follows REST conventions.

Notes/meeting-2026-03-15.md
  L8: Discussed API design for the new endpoints.
```

---

## Folders

### create_folder

Create a new folder in the vault. Intermediate directories are created automatically.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Relative folder path to create |

**Example**: `create_folder({ path: "Projects/2026/Q1" })`

### delete_folder

Permanently delete a folder and all of its contents. This is not a soft delete -- files are removed from disk.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Relative folder path to delete |

**Warning**: This operation is permanent. Consider moving important files before deleting a folder.

---

## Knowledge Graph

### get_tags

List all `#tags` found across all notes in the vault, along with the notes that use each tag. Tags are sorted by frequency (most-used first). Up to 5 file paths are shown per tag.

**Parameters**: None

**Example response**:
```
#project (8): Projects/alpha.md, Projects/beta.md, Notes/planning.md, ...
#meeting (5): Daily/2026-03-15.md, Daily/2026-03-16.md, Notes/standup.md, ...
#idea (3): Inbox/feature-x.md, Inbox/research.md, Ideas/brainstorm.md
```

### get_backlinks

Find all notes that contain a `[[wiki-link]]` pointing to a given note. This is the inverse of `get_outgoing_links` -- it answers "who links to this note?"

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Relative path to the target note |

**Example**: `get_backlinks({ path: "Concepts/react-hooks.md" })`

**Returns**: Newline-separated list of notes that link to the target. The search matches both `[[react-hooks]]` and `[[react-hooks|display text]]` link formats.

### get_outgoing_links

List all `[[wiki-links]]` found in a given note. Returns the link targets (note names), deduplicated.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Relative path to the source note |

**Example**: `get_outgoing_links({ path: "Projects/roadmap.md" })`

**Returns**: Newline-separated list of wiki-link targets.

---

## Stats & Meta

### get_vault_stats

Get aggregate statistics for the active vault.

**Parameters**: None

**Example response**:
```
Vault: /home/user/notes
Notes: 247
Words: 89,432
Characters: 512,876
```

### get_note_info

Get detailed metadata about a specific note, including frontmatter fields, word count, line count, tags, and outgoing wiki-links.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Relative path to the note |

**Example**: `get_note_info({ path: "Projects/roadmap.md" })`

**Example response**:
```
Path: Projects/roadmap.md
Words: 342
Lines: 48
Tags: #project, #roadmap
Links: milestones, team, timeline
Frontmatter:
  title: Project Roadmap
  status: active
  due: 2026-06-30
```

---

## Daily Notes

### create_daily_note

Create today's daily note in the `Daily/` folder, or return the existing one if it already exists. The filename follows the `YYYY-MM-DD.md` format.

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `content` | string | No | Initial content for the note (defaults to `# YYYY-MM-DD\n\n`) |

**Example**: `create_daily_note({ content: "# 2026-03-20\n\n## Tasks\n\n- [ ] Write documentation\n- [ ] Review PRs" })`

**Returns**: Confirmation that the note was created, or the full content of the existing note if one already exists for today.

### get_recent_daily_notes

List the most recent daily notes. Looks for files matching the `YYYY-MM-DD.md` pattern in the `Daily/` folder, sorted by date (newest first).

**Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `count` | number | No | Number of notes to return (default: 7) |

**Example**: `get_recent_daily_notes({ count: 14 })`

**Returns**: Newline-separated list of daily note paths:
```
Daily/2026-03-20.md
Daily/2026-03-19.md
Daily/2026-03-18.md
Daily/2026-03-17.md
Daily/2026-03-16.md
Daily/2026-03-15.md
Daily/2026-03-14.md
```
