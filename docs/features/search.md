---
title: Search
order: 7
---

# Search

Noteriv provides two search tools: Quick Open for finding files by name, and Vault Search for finding text across all notes. Both are keyboard-driven. Vault Search also understands a query language with operators, and a search can be shown inside a note with a `query` block.

## Quick Open

Quick Open is a file finder. Press `Ctrl+P` (or `Cmd+P` on macOS) to open it.

### How It Works

When Quick Open activates, it loads a list of every file in your vault. As you type, the list filters in real time, matching your query against the filename, the relative path and the note's aliases. Matching is case-insensitive and substring-based: typing `meet` will match `Meeting-Notes.md`, `team-meeting.md`, and `notes/meetings/standup.md`.

The list shows up to 50 results at a time. When the query is empty, the first 50 files are displayed.

Files matched by [Excluded files](./file-settings.md#excluded-files) are not listed.

### Finding a Note by Alias

If a note lists other names for itself under `aliases` in its frontmatter, Quick Open finds it by those names too (after 2.4.13). When a note is listed because of an alias and not because of its name or path, the line under its name starts with `also called` and the alias that matched. See [Note Aliases](./wiki-links.md#note-aliases).

### Navigation

| Key | Action |
|---|---|
| Type | Filter the file list |
| `Up` / `Down` | Move the selection highlight |
| `Enter` | Open the selected file |
| `Esc` | Close Quick Open |
| Click | Open the clicked file |

Hovering over a result with the mouse moves the selection highlight to that item.

### Display

Each result shows two pieces of information:

- **File name.** The basename of the file, displayed in the primary text style.
- **Relative path.** The full path from the vault root (without the `.md` extension), displayed in a smaller, muted style below the name. This helps you distinguish between files with the same name in different folders.

### When to Use

Use Quick Open when you know (or approximately know) the name of the file you want to open. It is faster than navigating the folder tree for deep directory structures.

## Vault Search

Vault Search looks through the text of every note in your vault. Press `Ctrl+Shift+F` (or `Cmd+Shift+F` on macOS) to open it. You can also click the **Search in vault** button in the ribbon, or run **Find in Vault** from the command palette.

Type a word and the panel lists the notes that contain it. For more exact searches, write a query with the operators described under [Search Queries](#search-queries). The query language, sorting, and the other options described here are in the desktop app. Versions up to 2.4.13 search for one piece of text only, and stop at 200 lines.

### How It Works

- Only notes are searched: files ending in `.md` or `.markdown`.
- Search is debounced: Noteriv waits 200 milliseconds after you stop typing before it searches. A spinner appears next to the search input while a search is in progress.
- Case is ignored, unless you switch on **Match case** or use `match-case:` in the query.
- Notes matched by [Excluded files](./file-settings.md#excluded-files) are left out.
- At most 500 notes are listed, and 30 matching lines for each note. A line longer than 400 characters is cut off.

### Results

Results are grouped by note. Each note has a row with its name and the folder it is in. Under it is a row for each matching line, with the line number and the matching text highlighted. If a note has more matching lines than are shown, its row says how many more.

A search that only asks about names, paths, tags or properties, such as `tag:#work`, lists the notes with no lines under them.

Above the results, the panel shows a count, such as `12 matches in 4 notes`. If the query cannot be read, the panel says why in red, for example that a quote or a bracket is not closed.

### Navigation

| Key | Action |
|---|---|
| Type | Update the search query (debounced) |
| `Up` / `Down` | Move the selection highlight through the note rows and line rows |
| `Enter` | Open the selected result |
| `Esc` | Close Vault Search |
| Click | Open the clicked result |

Opening a note row opens the note. Opening a line row opens the note and scrolls to that line. Hovering over a result with the mouse moves the selection highlight.

### Options

A row of controls sits under the search input:

| Control | What it does |
|---|---|
| **Aa** (Match case) | When on, text has to match in upper and lower case exactly as typed |
| Sort menu | Sets the order of the notes in the results |
| **Search options** | Shows a list of example queries. Click one to add it to the search |
| **Copy results** | Copies the results as text. Shown when there are results |
| Star | Bookmarks the search. Shown when the search box holds a query that can be read |

The sort menu has six orders:

| Order | Notes are listed |
|---|---|
| File name (A to Z) | By name. This is what the panel opens with |
| File name (Z to A) | By name, reversed |
| Modified (new to old) | Most recently changed first |
| Modified (old to new) | Least recently changed first |
| Created (new to old) | Newest first |
| Created (old to new) | Oldest first |

The panel opens with Match case off and sorted by file name each time.

### Copy Results

**Copy results** puts the list on the clipboard as plain text: each note's path, followed by its matching lines with their line numbers.

```text
Projects/Plan
  12: Call the baker about the order
  30: Order flour
Recipes/Baking Day
  4: Mix flour and water, then knead.
```

### Bookmark a Search

Click the star to add the search to your [bookmarks](./bookmarks.md). Click it again to remove it. Clicking the bookmark later opens Vault Search with the same search filled in. Only the text of the search is kept, not the sort order or the Match case switch.

## Search Queries

A query is made of words, phrases and operators. The same language is used in the Vault Search panel and in `query` blocks.

### Words and Phrases

| Query | Finds notes where |
|---|---|
| `meeting notes` | Both words appear, anywhere in the note's text or its path |
| `"meeting notes"` | The words appear together, exactly like that |
| `work OR home` | Either word appears |
| `meeting -draft` | `meeting` appears and `draft` does not |
| `(work OR home) meeting` | `meeting` appears, with `work` or `home` |
| `-(draft old)` | `draft` and `old` do not both appear |

Things to know:

- Words separated by spaces must all be found. They do not have to be on the same line.
- `OR` has to be written in capitals. In lower case, `or` is a word to search for.
- A `-` directly before a word, phrase, operator or bracket means "not".
- Brackets group parts of a query.
- To put a quotation mark inside a phrase, write `\"`.
- A plain word is also looked for in the note's path, so `recipes` finds every note in a `Recipes` folder.

### Regular Expressions

Put a regular expression between slashes:

```text
/fl[aeiou]+r/
/^## /
/\d{4}-\d{2}-\d{2}/
```

A regular expression is tested one line at a time, so `^` and `$` stand for the start and the end of a line. Write `\/` for a slash inside the expression. Like words, a regular expression ignores case unless Match case is on. Look-arounds and back-references are not supported.

### Where to Look

An operator narrows the search to one part of a note. Write it directly before what it applies to, with no space after the colon.

| Operator | Finds notes where | Example |
|---|---|---|
| `file:` | The file name matches | `file:plan` |
| `path:` | The path inside the vault matches | `path:Projects/` |
| `content:` | The text matches. The path is not looked at | `content:budget` |
| `tag:` | The note has the tag, or a tag nested under it | `tag:#work` |
| `line:( )` | The words are all on one line | `line:(mix flour)` |
| `section:( )` | The words are all in one section | `section:(dog cat)` |
| `block:( )` | The words are all in one block | `block:(dog cat)` |
| `task:` | A task matches | `task:call` |
| `task-todo:` | A task that is not done matches | `task-todo:call` |
| `task-done:` | A task that is done matches | `task-done:call` |

What follows an operator can be a word, a `"phrase"`, a `/regular expression/` or a bracketed group:

```text
path:"Projects/Alpha"
file:(plan OR draft)
line:(cat -dog)
```

Details:

- **`file:` and `path:`.** `file:` looks at the file name with its extension. `path:` looks at the whole path from the top of the vault, folders included.
- **`tag:`.** The `#` is optional. `tag:#project` also finds `#project/alpha`, but it does not find `#projects` or `#alpha`. Tags written in the note and tags listed under `tags` in the frontmatter both count. Case is ignored.
- **`section:`.** A section runs from one heading to the next heading, of any level. The text before the first heading is a section too.
- **`block:`.** A block is a run of lines with no blank line between them, such as a paragraph or a list.
- **Tasks.** A task is a list item with a checkbox, such as `- [ ] call the baker`. A task with an empty box is not done. A task with anything else in the box, such as `[x]`, is done.
- **A space after the colon** turns the operator into ordinary text: `file: plan` searches for the words `file:` and `plan`.

### Upper and Lower Case

| Operator | What it does | Example |
|---|---|---|
| `match-case:` | Matches this part exactly as typed, even when Match case is off | `match-case:Cat` |
| `ignore-case:` | Ignores case for this part, even when Match case is on | `ignore-case:cat` |

### Properties

Square brackets search the properties in a note's frontmatter.

| Query | Finds notes where |
|---|---|
| `[status]` | There is a `status` property |
| `[status:done]` | The `status` property contains `done` |
| `[status:done OR open]` | The `status` property contains `done` or `open` |
| `[people:"Grace Hopper"]` | The `people` property contains that phrase |

The name of a property is matched without regard to case. For a property that holds a list, one matching item is enough. Only top-level properties with plain values or simple lists are searched. Values nested inside other values are not.

### Putting It Together

```text
tag:#work task-todo:call
path:Projects/ "status report" -draft
[status:done] file:(plan OR review)
line:(invoice /\d{4}/) -tag:#archive
```

## Search Results in a Note

A fenced code block with the language `query` runs its text as a search and shows the results in the note (desktop app, after 2.4.13):

````markdown
```query
tag:#work task-todo:call
```
````

The block uses the same query language as Vault Search. It is drawn in live mode and view mode. To change the query in live mode, put the cursor inside the block.

What the block shows:

- A header with the query.
- Each matching note as a link. Click it to open the note.
- Up to five matching lines under each note, with the matches highlighted, followed by a count of the rest.
- Up to 50 notes, newest changes first. If more notes match, the block says how many are not shown.
- Notes matched by [Excluded files](./file-settings.md#excluded-files) are left out, as in the search panel.
- `No results` when nothing matches, or the reason when the query cannot be read.

The search runs again each time the block is drawn, which is when the note is opened or the block is edited. The results are not written into the note: the file only holds the query.

## Differences Between Quick Open and Vault Search

| | Quick Open | Vault Search |
|---|---|---|
| Shortcut | `Ctrl+P` | `Ctrl+Shift+F` |
| Searches | File names, paths and aliases | Note text, plus names, paths, tags and properties |
| Results | File entries | Notes, with their matching lines |
| Line numbers | No | Yes |
| Highlight | No | Yes (matched text) |
| Operators | No | Yes |
| Debounce | No (instant filter) | Yes (200ms) |
| Use case | Navigate to a known file | Find text anywhere in the vault |

## Find in File

For searching within the currently open file, use `Ctrl+F` (Find in File). This activates CodeMirror's built-in search bar at the top of the editor, which supports:

- Case-sensitive and case-insensitive search.
- Regular expression search.
- Find and replace.
- Next/previous match navigation.

Find in File is separate from Quick Open and Vault Search. It operates only on the currently visible document.

## Search and the Command Palette

The [Command Palette](./command-palette.md) (`Ctrl+Shift+P`) also functions as a search tool, but for commands rather than files or content. If you are looking for an action (e.g., "Export as PDF", "Toggle Lint"), use the command palette. If you are looking for a note or text, use Quick Open or Vault Search.

## Tips

- **Start with Quick Open.** If you know the file name, `Ctrl+P` is almost always faster than Vault Search.
- **Use Vault Search for discovery.** When you are unsure which file contains something, or you want to see all occurrences, full-text search is the right tool.
- **Open at the line.** Choosing a line in the results opens the note at that line.
- **Search for tags with `tag:`.** `tag:#project` finds notes that have the tag, including nested tags and tags in the frontmatter. A plain `#project` only finds that text.
- **Keep words together.** `line:(...)`, `block:(...)` and `section:(...)` find notes where the words are close to each other, not just somewhere in the same note.
- **Bookmark the searches you repeat.** A bookmarked search is one click away in the bookmarks panel.
- **Combine with wiki-links.** After finding a related note via search, add a `[[wiki-link]]` to it from your current note so you do not have to search for it again.
