---
title: Properties
order: 20
---

# Properties

Properties are the named values at the top of a note, such as its tags, a status or a due date. They are stored in the note as YAML frontmatter, between two lines of `---`. Noteriv shows them above the note as a list of values that you edit in place, each with a type: text, list, number, checkbox, date, or date and time.

This page describes the desktop app. The properties editor, property types and the All properties panel were added after 2.4.13. Versions up to 2.4.13 do not have them.

For the YAML itself and the properties Noteriv reads, see [Frontmatter](../reference/frontmatter.md).

## Properties Editor

The properties editor is shown above the text of a note that has a properties block. You do not open it: it is there in live mode and in view mode.

| Where | Properties editor |
|---|---|
| Live mode | Shown |
| View mode | Shown |
| Source mode | Not shown. You edit the YAML as text |
| Board notes | Not shown |
| The right pane of a [split](../editor/split-editor.md) | Not shown. The editor belongs to the note in the left pane |
| A [pop-out window](./pop-out-windows.md) | Not shown |

### Layout

The header has an arrow, the label **Properties** and the number of properties. Click the header to fold the editor away or to show it again. The choice applies to every note you open, and the editor is shown again the next time Noteriv starts.

Under the header there is one row for each property, in the order the properties are written in the note:

| Part of the row | What it does |
|---|---|
| Type button | Shows the type as a short mark: `T` for text, three lines for a list, `#` for a number, a ticked box for a checkbox, `D` for a date and `DT` for a date and time. Point at it to see the type by name. Click it to change the type |
| Name | The name of the property. Click it to rename the property |
| Value | The value, in a control that suits the type |
| X | Removes the property. Shown while the pointer is on the row |

The last line is the **Add property** button.

### Adding a Property

Click **Add property**, or run **Add Property to the Open Note** from the [command palette](./command-palette.md) (`Ctrl+Shift+P`). Type a name and press `Enter`. `Esc` closes the box without adding anything.

While you type, up to eight names are suggested: names that other notes in the vault use, followed by `tags`, `aliases`, `cssclasses`, `title`, `date`, `status` and `publish`. Names the note already has are left out. Click a suggestion to add it.

Things to know:

- The new property is added after the others, with no value. A list starts with no items and a checkbox starts unchecked.
- Its type is the one the vault has for that name. If the vault has none, it is text. See [How a Type Is Chosen](#how-a-type-is-chosen).
- A name the note already has is not added a second time.
- If the note has no properties block, one is made at the top of the note.

**Add Property to the Open Note** also works on a note that has no properties yet: it shows the editor with the name box open. If you are in source mode, it switches to live mode first. The command has no default shortcut. You can give it one in Settings > Shortcuts.

Adding `status` with the value `open` to a note that starts with a heading gives:

```markdown
---
status: open
---
# Title
```

### Editing a Value

| Type | Control | How to edit |
|---|---|---|
| Text | A text box | Type, then press `Enter` or click somewhere else. `Esc` drops what you typed |
| Number | A number box | The same as text |
| Checkbox | A checkbox | Click it |
| Date | A date picker | Pick a day. Each pick is saved at once |
| Date and time | A date and time picker | Pick a day and a time. Each pick is saved at once |
| List | One chip for each item, and a box after them | See below |

A property with no value shows `Empty`.

To edit a list:

- Type in the box after the chips and press `Enter` or `,` to add an item. Clicking somewhere else adds it too.
- Text you paste with commas in it is split into one item for each part.
- Click the **×** on a chip to remove that item.
- `Backspace` in the empty box removes the last item.

### Renaming and Removing

To rename a property, click its name, type the new name and press `Enter`. The value and the property's place in the list are kept. If the note already has a property with the new name, nothing changes. Renaming changes this note only.

To remove a property, click the X at the end of its row. When you remove the last property, the whole block is taken out of the note, the `---` lines included.

### Undo

In live mode, a change made in the properties editor is an edit to the note like any other, and the cursor and the folds in the note stay where they are. To undo it, click in the text of the note and press `Ctrl+Z`. While the cursor is still in a box of the properties editor, `Ctrl+Z` does not reach the note.

In view mode the change is made to the note in the same way, but view mode has no undo.

## Property Types

| Type | Holds | In the note |
|---|---|---|
| Text | Any text | `status: open` |
| List | Several values | `tags: [work, planning]` |
| Number | A number | `rating: 4` |
| Checkbox | Yes or no | `done: false` |
| Date | A day | `due: 2026-11-20` |
| Date and time | A day and a time | `start: 2026-11-20T09:30` |

### How a Type Is Chosen

Noteriv decides the type of a property in this order:

1. **Fixed names.** `tags`, `aliases` and `cssclasses` are always lists, however the name is capitalised. Their type button cannot be clicked.
2. **The type you chose.** Once you pick a type for a name, it is kept for the vault, and a property with that name has that type in every note.
3. **The look of the value.** With no chosen type, the type follows the value in each note:

| Value in the note | Type |
|---|---|
| A YAML list | List |
| A number | Number |
| `true` or `false` | Checkbox |
| Text of the form `2026-11-20` | Date |
| Text that starts with a date and a time, such as `2026-11-20T09:30` or `2026-11-20 09:30:00` | Date and time |
| Anything else, or no value | Text |

Until you choose a type, a property can therefore be a number in one note and text in another.

### Changing a Type

Click the type button at the start of the row and pick a type from the menu. Two things happen:

- The type is recorded for the vault, under that exact name.
- The value in the note you have open is changed to fit the new type, where it can be.

| New type | What happens to the value |
|---|---|
| Text | A list becomes its items with commas between them. A number or a checkbox becomes its text |
| List | Text is split at the commas |
| Number | Text that reads as a number becomes that number. Other text is kept and marked |
| Checkbox | `true`, `yes`, `1` and `on` become checked. Every other value becomes unchecked |
| Date | The first date of the form `2026-11-20` in the text is kept. Text with no date is kept and marked |
| Date and time | A date with a time is kept. A date alone gets the time `00:00`. Other text is kept and marked |

Changing to Checkbox replaces any other text with unchecked. In live mode you can bring the old value back: click in the text of the note and press `Ctrl+Z`.

Values in other notes are not rewritten. A value there that does not fit the new type is marked when you open the note.

### Values That Do Not Fit

A value that does not fit the type of its property is not thrown away. It is shown as text in a box with a yellow border, and pointing at the box says what is wrong, for example `This value is not a number`. The note is left as it is until you type something else.

When you type a new value into a marked box, Noteriv saves it as the property's type if it can be read that way. If it cannot, it is saved as the text you typed.

A property that holds properties of its own (a nested YAML block) is shown as dimmed text that cannot be edited here. Edit it in the note.

A property with no value fits every type.

### Where Types Are Stored

The types you choose are kept per vault, in the file `.noteriv/types.json` inside the vault folder:

```json
{
  "types": {
    "due": "date",
    "rating": "number",
    "start": "datetime"
  }
}
```

The file only holds names you have chosen a type for. The type names are `text`, `list`, `number`, `checkbox`, `date` and `datetime`. Upper and lower case count in a property name here: `Status` and `status` each have their own type.

If you sync the vault to a folder or over WebDAV, the **Vault settings** switch in Settings > Sync decides whether this file goes to your other devices. See [What Syncs](../sync/what-syncs.md).

## The YAML Block in the Note

The properties editor is another way of editing the YAML at the top of the note. The YAML stays in the file.

### What Counts as a Properties Block

- The first line of the note is `---` and nothing else.
- The block ends at the next line that is `---` or `...` and nothing else.

A note whose first line is `---` but which has no closing line has no properties block.

### In Each Mode

| Mode | The YAML block |
|---|---|
| Live | Folded when the note is loaded: you see the first `---` followed by a `…` marker. Click the marker, or the arrow beside the first line, to unfold it. Unfolded, it is shown as written, in small dimmed monospace text, and is not drawn as markdown. A `# comment` in it is not a heading, and the `---` lines are not rules |
| Source | Shown as text with the rest of the note. It is not folded when the note opens. You can fold it with the arrow in the margin beside the first line |
| View | Hidden. The properties editor above the note shows the values |

In live mode a block you unfold stays unfolded until the note is loaded again, for example when you switch to another tab and back. See [Folding](../editor/folding.md).

### What an Edit Keeps

A change in the properties editor is made to that one property in the YAML. The block is not written out again from scratch, so these are kept:

- Comments in the block.
- The order of the properties.
- The form of a list: one written one item to a line stays that way, and one written on one line stays on one line.
- The line endings of the note.
- The text of the note under the block.

Changing `rating` to 5 in this note changes that line and nothing else:

```yaml
---
title: Weekly plan
# written by hand
tags:
  - work
  - planning
rating: 4
---
```

Two things are written in a fixed way. A new list goes on one line, such as `tags: [a, b]`. And the block is closed with `---` after an edit, also when it was closed with `...` before.

### Invalid YAML

If the block is not valid YAML, or is something other than a list of `name: value` pairs, the properties editor does not show rows. It shows this instead:

```text
The properties at the top of this note are not valid YAML, so they are shown as text. Fix them in the note.
```

Noteriv never rewrites a block it cannot read. To put it right, unfold the block in live mode or switch to source mode, and correct the YAML there.

### Headings

The outline panel, the table of contents and the **Bookmark the Heading Under the Cursor** command skip the properties block. A line such as `# written by hand` in the YAML is a comment, not a heading of the note.

## All Properties Panel

The All properties panel lists every property used in the vault, with its type and the number of notes that have it. Run **Toggle All Properties** from the command palette to open it, and run it again to close it. The command has no default shortcut. You can give it one in Settings > Shortcuts.

The panel is on the right side of the window. Its header shows the label "All properties", the number of different properties, and a close button.

| Control | What it does |
|---|---|
| **Sorted by name** / **Sorted by use** | Switches the order of the list: by name, or the most used property first. The panel opens sorted by name |
| **Refresh** | Reads the vault again |
| Type menu on a row | Sets the type of that property for the vault |
| Name on a row | Opens [Vault Search](./search.md#vault-search) with a search for the notes that have the property |

Things to know:

- **The list is read when the panel opens.** After you add or remove properties, click **Refresh** to see the change.
- **The type menu changes the type, not the notes.** No value is rewritten. Values that do not fit are marked when you open their notes. The menu is switched off for `tags`, `aliases` and `cssclasses`.
- **A type nobody chose is a guess.** For a property with no chosen type, the panel shows the type that its value in one of the notes looks like.
- **Clicking a name searches for `[name]`.** For `status` the search is `[status]`. The search does not look at upper and lower case in the name, so the number of notes it finds can differ from the number on the row. See [Search Queries](./search.md#search-queries).
- **Only top-level properties are listed.** A property nested inside another is not a row of its own. Notes whose properties block cannot be read add nothing to the list.

While the vault is being read, the panel says `Reading the vault…`. If no note has properties, it says so and points to the **Add Property to the Open Note** command.

## Properties Elsewhere

- **Search.** `[status]` finds notes that have a property, and `[status:done]` finds notes where it has a value. See [Search Queries](./search.md#search-queries).
- **Bases.** A base lists notes together with their properties. See [Bases](../views/bases.md).
- **Dataview.** A `dataview` block can show and filter by simple `name: value` properties. See [Dataview](./dataview.md).
- **Links and tags.** `aliases` gives a note other names for links, and `tags` adds tags. See [Note Aliases](./wiki-links.md#note-aliases) and [Tags](./tags.md).

## Tips

- **Choose types for the names you use everywhere.** A chosen type keeps `due` a date and `rating` a number in every note, and a value that is something else is marked when you open its note.
- **Use the suggestions.** Picking a name the vault already uses avoids having both `status` and `Status`.
- **Fix marked values instead of removing them.** A marked value is still in the note. Type the corrected value into the box.
- **Keep nested YAML for source mode.** The editor shows nested values but does not edit them.
