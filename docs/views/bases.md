---
title: Bases
order: 9
---

# Bases

A base shows the files of your vault as a table, a set of cards or a list. It is a text file ending in `.base` that holds YAML: which files to show, which properties to show for each one, how to sort and group them, and any values to work out with formulas. A base holds no copy of your notes. It reads their [properties](../features/properties.md) from the vault when it is opened.

Bases are in the desktop app only, and are newer than version 2.4.13. The file format is the one Obsidian uses for its bases.

There is no visual editor for views, filters or formulas. You change a base by editing its YAML. The base's tab has an **Edit as text** button for this, and the views redraw as you type.

## Creating a Base

Run **Create New Base** from the [command palette](../features/command-palette.md) (`Ctrl+Shift+P`). The command has no default shortcut. You can give it one in Settings > Shortcuts.

The command:

- Creates a file called `Untitled.base`, or `Untitled 2.base`, `Untitled 3.base` and so on if that name is taken.
- Puts it in the folder that the **New notes go** setting names. See [File Settings](../features/file-settings.md).
- Opens it in a tab.

The new base lists every file ending in `.md`, with its name, folder and modified time:

```yaml
filters:
  and:
    - file.ext == "md"
views:
  - type: table
    name: Table
    order:
      - file.name
      - file.folder
      - file.mtime
```

Notes that end in `.markdown` are not matched by this filter. To list them too, change the filter:

```yaml
filters:
  or:
    - file.ext == "md"
    - file.ext == "markdown"
```

A base is a plain text file, so you can also make one in any text editor. An empty `.base` file is a valid base: it shows every file in a table with one column, the file name.

## Opening a Base

Click a `.base` file in the file list. It opens in a tab of its own. A [link](../features/wiki-links.md) to the file, such as `[[Projects.base]]`, opens it too.

Quick Open lists notes only, so it does not find bases.

## The Base Tab

The bar at the top of the tab shows the name of the base and these controls:

| Control | What it does |
|---|---|
| **Edit as text** | Shows the YAML of the base beside the views. The button then reads **Hide the text** |
| **Save** | Writes your changes to the file. Shown while the text is on show |
| `Not saved` | A label that appears when the text differs from the file |

Under the bar is the toolbar of the views:

| Control | What it does |
|---|---|
| View tabs | One tab for each view in the file, with the view's name. Shown when the base has two or more views |
| **Filter** box | Keeps the rows where one of the view's columns shows the text you type |
| Count | How many rows are on show, such as `12 results`. When a view's `limit` cut the list, it reads like `10 of 25` |
| **Copy as CSV** | Copies the rows on show to the clipboard |
| **Refresh** | Reads the vault again and redraws the view |

### Filter Box

The text you type is looked for in what the columns of the view show, not in the rest of each note. Case is ignored. The file name column is searched with its extension, so typing `md` matches every note when that column is in the view. The filter box is applied after the filters written in the file and before the view's `limit`. It is not saved.

When nothing is left, the view says `Nothing matches the filter.` A view whose own filters match no file says `No files match this view.`

### Sorting by a Column

In a table, click a column heading to sort by that column. Click it again to sort the other way, and a third time to go back to the order the view asks for. An arrow beside the heading shows the direction.

A sort made this way takes the place of the view's own `sort` while it is on. It is not written to the file, and it is dropped when you switch to another view.

### Copy as CSV

**Copy as CSV** puts the rows on show on the clipboard, for pasting into a spreadsheet. The button reads **Copied** for a moment afterwards. The first line holds the column headings. Each line after it is one row, in the order shown, with the columns of the view.

- A cell holds the text of its value: `true` or `false` for a checkbox, the items of a list separated by commas.
- A field that holds a comma, a quotation mark or a line break is put in quotation marks.
- The file name column holds the name with its extension.
- A cell that failed holds its error message.
- Group headings and summaries are not copied.

### Refresh

A base reads the vault when it is opened. A change you make to a note after that does not appear in the base until you click **Refresh**.

### Edit as Text

Click **Edit as text** to show the YAML in a box on the left. The views on the right redraw with each key you press.

| Key | Action |
|---|---|
| `Tab` | Inserts two spaces |
| `Ctrl+S` (`Cmd+S` on macOS) | Saves the base, while the cursor is in the text box |

If the text cannot be read as a base, the reason is shown under the box and in place of the views. See [Errors](#errors).

Things to know:

- A base that reads correctly is saved by itself, a little under a second after you stop typing. Text that cannot be read as a base is not saved while you type, so a half-written line does not replace the file.
- When you leave the tab, by switching to another tab or closing the base, whatever is not saved yet is written to the file as it is, whether or not it reads as a base. Nothing you typed is lost on a change of tab.
- **Save** is only shown while the text is on show. If you hide the text with changes in it, they are kept, and the `Not saved` label stays until they are saved.
- The tab reads the file when it opens. It does not pick up a change made to the file somewhere else while it is open.

### How Values Are Shown

| Value | Shown as |
|---|---|
| The file name (`file.name` or `file.basename`) | The name without its extension, as a link that opens the file |
| Text or a number | As it is |
| `true` or `false` | A ticked or empty checkbox |
| A date | `2025-05-27`, or `2025-05-27 08:30:00` when it has a time |
| A duration | Words, to its two largest units: `3 days 4 hours` |
| A list | Its items, separated by commas |
| A link to a file | The last part of its path, or its display text. Click it to open the file |
| A web address | The address, or its display text. Click it to open it in your browser |
| A tag | The tag with its `#` |
| A nested mapping | JSON text |
| `html()` | The HTML, with anything unsafe removed |
| `image()` | The picture, when its address starts with `http://` or `https://`. Otherwise a link named after the file |
| `icon()` | The name of the icon, as text |
| Nothing | An empty cell |
| An error | A warning sign. Point at it to read what went wrong |

A base shows values. It does not change them: the checkboxes cannot be clicked, and there is no editing in a cell. To change a value, open the note.

## Bases Inside a Note

A base can be drawn inside a note in two ways: written in the note as a `base` code block, or kept in a `.base` file and embedded. Either way the base appears in a box with the same toolbar as in a tab. The box grows to 420 pixels high and then scrolls.

Both are drawn in live mode and view mode.

### Base Code Block

A fenced code block with the language `base` holds a whole base:

````markdown
```base
filters:
  and:
    - file.hasTag("project")
views:
  - type: table
    name: Projects
    order:
      - file.name
      - status
```
````

To change the base in live mode, put the cursor inside the block. The YAML is shown while the cursor is there.

A published page or an exported PDF shows a `base` block as its YAML text.

### Embedding a Base File

Embed a `.base` file the way you [embed a note](../features/wiki-links.md#embedding-with):

```markdown
![[Projects.base]]
![[Projects.base#Cards]]
```

| Embed | Shows |
|---|---|
| `![[Projects.base]]` | The base, opened on its first view |
| `![[Projects.base#Cards]]` | The base, opened on the view called `Cards` |

Details:

- The embed has to be on a line of its own. Inside a sentence it stays a link.
- The `.base` ending is needed.
- The file is found by its path from the top of the vault, or by its name anywhere in the vault.
- A view is matched by its name. If the letter case differs, it is still found.
- If the base has two or more views, the view tabs are shown in the embed as well, so the other views can still be reached.
- If no view has the name, the first view is shown, with a line such as `There is no view called "Cards". Showing "Table".`

### What `this` Refers To

In a filter or a formula, `this` is the file the base is shown in.

| Where the base is drawn | `this` is |
|---|---|
| In a `base` code block | The note you have open |
| In an embed of a `.base` file | The note you have open |
| In the base's own tab | The `.base` file itself |

`this.status` reads the `status` property of that file, and `this.file` gives its file properties, such as `this.file.name` or `this.file.folder`. The name of the file is `this.file.name`: `this.name` would read a property called `name`. A `.base` file has no properties of its own, so in a base's tab only `this.file` holds anything.

A base that uses `this` shows different rows in each note it is embedded in. This one lists the files that link to the note you are reading:

```yaml
filters:
  and:
    - file.hasLink(this.file)
```

## Which Files Are Rows

Every file in the vault is a row, not only the notes. A base with no filters lists images, PDFs, canvases and other bases beside your notes.

- **Notes** (`.md` and `.markdown`) come with the properties in their frontmatter, their tags, their links, their size and their dates.
- **Other files** come with their name, path, folder and extension only. Their size reads 0, and their created and modified times are not read, so those show a date around the start of 1970.
- **Left out:** files and folders whose name starts with a dot, folders called `node_modules`, and symbolic links.

The [Excluded files](../features/file-settings.md#excluded-files) setting does not apply to bases. A file it matches is still a row.

To list notes only, filter on the extension, as the base made by **Create New Base** does.

## File Syntax

A base is a YAML mapping with up to five keys. All of them are optional.

| Key | What it holds |
|---|---|
| `filters` | Which files the base shows, in every view |
| `formulas` | Named expressions, worked out for each row |
| `properties` | Display names for properties |
| `summaries` | Named formulas that sum up a column |
| `views` | A list of views |

Keys that are not in this table are ignored. A key that holds the wrong kind of value, such as `views` holding text, stops the base from being read.

```yaml
filters:
  and:
    - file.hasTag("book")
formulas:
  per_page: (price / pages).toFixed(3)
properties:
  formula.per_page:
    displayName: Price per page
summaries:
  rounded: values.mean().round(1)
views:
  - type: table
    name: Books
    order:
      - file.name
      - price
      - formula.per_page
    summaries:
      price: rounded
```

### Quoting

Filters and formulas are YAML text. Most can be written as they are, but YAML reads some characters its own way. Put a statement in single quotes when it:

- starts with `!`, `"`, `'`, `[` or `{`
- contains a colon followed by a space, or a space followed by `#`

```yaml
filters:
  and:
    - '!archived'
    - 'status != "done"'
```

Inside single quotes, write a single quote twice.

### Views

Each entry of `views` is a mapping with these keys:

| Key | What it holds | When left out |
|---|---|---|
| `type` | `table`, `cards` or `list`. See [View Types](#view-types) | `table` |
| `name` | The name on the view's tab, and the name an embed asks for | The type with a capital letter, such as `Table` |
| `filters` | Filters for this view alone | No extra filters |
| `order` | The properties to show, in order. In a table these are the columns | `file.name` alone |
| `sort` | The properties to sort the rows by | The rows are not sorted |
| `groupBy` | The property to group the rows by | No groups |
| `groupOrder` | Which groups to show, and in which order | Every group |
| `limit` | The largest number of rows to show | Every row |
| `summaries` | The summary to show for a property | No summaries |
| `image` | In a cards view, the property that holds the cover of each card | No cover |

Other keys of a view are ignored.

A base with no `views` is shown as one table called `Table` with the file name as its only column.

### Order of the Steps

A view is worked out in this order:

1. The filters of the base and the filters of the view. A file has to pass both.
2. The text in the **Filter** box.
3. The sort.
4. The limit.
5. The grouping.
6. The summaries, over the rows that are left.

### Filters

A filter is a statement, or statements joined with `and`, `or` and `not`. A statement is an [expression](#expressions). A file passes when the statement gives a value that counts as true.

One statement can be the whole filter:

```yaml
filters: 'file.ext == "md"'
```

To join statements, write `and`, `or` or `not` with a list under it. The lists can be nested to any depth:

```yaml
filters:
  and:
    - file.hasTag("book")
    - or:
        - status == "reading"
        - rating >= 4
    - not:
        - file.inFolder("Archive")
        - file.hasTag("draft")
```

| Key | A file passes when |
|---|---|
| `and` | Every statement in the list is true |
| `or` | At least one statement in the list is true |
| `not` | None of the statements in the list is true |

This filter keeps the files tagged `book` that are being read or are rated 4 or more, and that are neither in the `Archive` folder nor tagged `draft`.

Details:

- A view's `filters` are added to the base's. A file has to pass both.
- A list written straight under `filters`, with no key, is read as `and`.
- A mapping that holds more than one of the three keys is read as all of them together.
- A group with nothing in it lets every file through.
- A statement that fails for a file is reported above the view. See [Errors](#errors).

### Formulas

`formulas` gives a name to an expression. The expression is worked out for each row.

```yaml
formulas:
  total: price * quantity
  label: 'if(price, "$" + price.toFixed(2), "")'
  with_tax: formula.total * 1.1
```

Use a formula as `formula.` and its name, anywhere a property can be used: in `order`, `sort`, `groupBy`, a filter, the `summaries` of a view, or another formula. A formula that leads back to itself gives an error in its cell.

### Display Names

`properties` sets the heading shown for a property:

```yaml
properties:
  status:
    displayName: Stage
  formula.total:
    displayName: Total cost
  file.ext:
    displayName: Kind
```

The display name is used for the column heading in a table, the label on a card and the heading in a CSV copy. Without one, a note property or a formula is headed by its name, and a file property by the heading listed under [File Properties](#file-properties).

`displayName` is the only setting that is used. Other settings of a property are ignored.

### Property Names in a View

In `order`, `sort`, `groupBy`, the `summaries` of a view and the keys of `properties`, a property is named by its id:

| Written | Means |
|---|---|
| `status` | The note property `status` |
| `note.status` | The same property |
| `file.name` | A file property |
| `formula.total` | The formula called `total` |

Everything after the prefix is the name, so a name with a space or a dot in it is written as it is: `due date`, or `note.due date`. An id is not an expression: `address.city` means a property whose name is `address.city`. To show a value from inside a nested property, write a formula for it.

### Sort

`sort` is a list. The rows are sorted by the first entry. Rows that are equal there are sorted by the second, and so on.

```yaml
views:
  - type: table
    sort:
      - property: file.mtime
        direction: DESC
      - property: status
      - priority
```

Each entry is a property with a `direction` of `ASC` or `DESC`, or the name of a property alone. The direction is `ASC` when it is left out, and it can be written in small letters.

How rows are ordered:

- Numbers sort by value, dates from old to new, and text without regard to case, with `Note 2` before `Note 10`.
- Rows with nothing to sort by go last, whichever the direction. That covers rows where the property is empty and rows where its formula failed.
- In a column that mixes kinds of value, an ascending sort puts numbers first, then dates, durations and checkboxes, then everything else by its text.
- Rows that sort the same keep the order they had.
- Without a `sort`, notes come first, in the order of their paths, followed by the other files.

### Limit

`limit` is the largest number of rows to show.

```yaml
views:
  - type: table
    limit: 10
```

- The limit is applied after the filters and the sort, and before the grouping. With a limit of 5, the groups share five rows between them.
- Zero or less means no limit. A number with a fraction is rounded down.
- Summaries cover the rows that are shown, not the rows that were cut.

### Grouping

`groupBy` puts the rows with the same value of a property together, under a heading with that value and the number of rows.

```yaml
views:
  - type: table
    groupBy:
      property: status
      direction: ASC
```

`groupBy: status` is the short way to write the same thing.

- The groups are sorted by their value, in the `direction` given.
- Rows with no value, or whose formula failed, form a group called `None`. It comes last in either direction.
- Inside a group, the rows keep the order the view's `sort` gave them.
- Two links to the same note count as the same value, however they are written.
- A list is one value. Grouped by `tags`, the notes tagged `a` and `b` form a group of their own, apart from the notes tagged `a` alone.

`groupOrder` picks the groups to show and sets their order:

```yaml
views:
  - type: table
    groupBy:
      property: status
    groupOrder:
      - To do
      - Doing
      - Done
      - null
```

- Only the listed groups are shown, in the order listed. Rows of other groups are not shown.
- `null` stands for the `None` group.
- A listed value that no row has is shown as a group with no rows.
- An empty list hides every group.

### Summaries in a View

The `summaries` of a view name a summary for a property:

```yaml
views:
  - type: table
    order:
      - file.name
      - price
      - done
    summaries:
      price: Average
      done: Checked
```

The value is the name of a built-in summary or of a formula in the base's own `summaries`. See [Summaries](#summaries).

## Expressions

Filters, formulas and summary formulas are written in one expression language.

### Values

| Kind | Written as |
|---|---|
| Number | `1`, `2.5`, `.5`, `1e3` |
| Text | `"message"` or `'message'` |
| True and false | `true`, `false` |
| Nothing | `null` |
| List | `[1, 2, 3]` |
| Mapping | `{"name": "value", count: 2}` |
| Regular expression | `/abc/`, with flags after it: `/abc/gi` |

Inside text, `\"` and `\'` write a quotation mark, `\\` a backslash, `\n` a new line and `\t` a tab.

### Operators

| Operator | What it does |
|---|---|
| `+` `-` `*` `/` `%` | Add, subtract, multiply, divide, and the remainder of a division |
| `==` `!=` | Equal, not equal |
| `<` `<=` `>` `>=` | Less than, at most, greater than, at least |
| `&&` | And |
| `\|\|` | Or |
| `!` | Not |
| `( )` | Grouping |

Multiplying and dividing are done before adding and subtracting, those before comparisons, comparisons before `&&`, and `&&` before `||`. Use brackets to change the order.

Things to know:

- **`+` also joins text.** When either side is text, the two are joined: `"$" + price`. This means `"3" + 4` gives `34`. The other arithmetic operators read text that holds a number as that number: `"3.50" * 2` gives `7`.
- **A single `=` is an error.** Write `==` to compare.
- **Text is compared exactly.** `status == "done"` is false for `Done`.
- **Equality reads across kinds.** A number equals text that holds the same number. A date equals text that reads as the same date. A tag equals its name with or without the `#`, in any letter case. A link equals a file when it points at that file. Two lists are equal when they hold equal items in the same order.
- **`<` and `>` need two values of one kind:** two numbers, two dates, two durations or two pieces of text. Comparing text with a number is an error, unless the text holds a number.
- **`&&` and `||` give true or false,** whatever the values on each side. The right side is not worked out when the left side settles the answer.
- **Dividing by zero is an error.**

### What Counts as True

A filter statement, the first argument of `if()` and the operators `&&`, `||` and `!` read a value as true or false:

| Value | Counts as |
|---|---|
| Nothing, `false`, `0`, empty text, an empty list | False |
| Anything else | True |

So `filters: tags` keeps the notes that have at least one tag in their `tags` property.

### Properties

| Written | Means |
|---|---|
| `status` | The `status` property in the note's frontmatter |
| `note.status` | The same property |
| `note["due date"]` | A property whose name is not a plain word |
| `file.name` | A [file property](#file-properties) |
| `formula.total` | The formula called `total` |
| `this` | The file the base is shown in. See [What `this` Refers To](#what-this-refers-to) |

A plain name is made of letters, digits, `_` and `$`. Any other name needs the bracket form: in an expression `due-date` is `due` minus `date`, so write `note["due-date"]`. The bracket form is also the way to read a property called `file`, `note`, `formula` or `this`.

Reading into a value:

| Written | Gives |
|---|---|
| `address.city` | The `city` key of a nested property |
| `address["city"]` | The same |
| `tasks[0]` | The first item of a list. Items are counted from 0 |
| `tasks.length` | The number of items in a list |
| `title.length` | The number of characters in text |

Text in frontmatter is read for what it holds:

| Frontmatter value | Read as |
|---|---|
| `"[[Note]]"` | A link |
| `https://example.com` or `mailto:someone@example.com` | A web address |
| `2025-06-01`, `2025-06-01T09:15` or `2025-06-01 09:15:00` | A date |
| Any other text | Text |

The whole value has to be the link, the address or the date. Text such as `see [[Note]] for more` stays text.

### File Properties

These are known for every row. The last column is the heading a column gets when no display name is set.

| Property | Holds | Heading |
|---|---|---|
| `file.name` | The file name with its extension: `Plan.md` | file name |
| `file.basename` | The file name without its extension: `Plan` | file base name |
| `file.path` | The path from the top of the vault: `Projects/Plan.md` | file path |
| `file.folder` | The folder from the top of the vault: `Projects`. Empty for a file at the top | folder |
| `file.ext` | The extension without its dot: `md` | file extension |
| `file.size` | The size in bytes. 0 for a file that is not a note | file size |
| `file.ctime` | When the note was created, as a date with a time. Where the system does not record this, the modified time | created time |
| `file.mtime` | When the note was last modified, as a date with a time | modified time |
| `file.tags` | The note's tags, from its text and from the `tags` property | file tags |
| `file.links` | The `[[links]]` and `![[embeds]]` in the text of the note, and its markdown links to files in the vault | links |
| `file.embeds` | Always an empty list. Embeds are in `file.links` | embeds |
| `file.backlinks` | Links to the files that link to this one | backlinks |
| `file.properties` | All of the note's frontmatter, as one mapping | properties |
| `file.file` | The file itself, the same as `file` | file |

Any other name after `file.` gives the error `There is no file property called "…"`.

Things to know:

- `file.links`, `file.backlinks` and `file.hasLink()` see the links in the text of a note: `[[…]]` links, embeds, and markdown links such as `[text](Folder/Note.md)` that lead to a file in the vault. A link inside a frontmatter property is not counted, and neither is a link inside code.
- `tags` on its own is the `tags` property of the frontmatter. `file.tags` also holds the tags written in the text. To test for a tag, `file.hasTag("book")` covers both, and nested tags too.

### Empty Values

A property that a note does not have is empty. That is not an error:

- In arithmetic, an empty value gives an empty result: `price * quantity` is empty when either is missing.
- Joined to text, an empty value adds nothing: `"Total: " + price`.
- `<`, `<=`, `>` and `>=` are false when a side is empty.
- `status == null` is true when the note has no `status`.
- Reading into an empty value stays empty: `address.city` is empty when there is no `address`.
- A function that asks a question, such as `contains()` or `startsWith()`, answers false on an empty value. Any other function gives an empty value. The four functions that work on [any value](#any-value), such as `isEmpty()`, are the exception: they answer for the empty value itself.

### Names Inside a Function

`filter()`, `map()` and `reduce()` run an expression once for each item of a list. Inside that expression:

| Name | Holds |
|---|---|
| `value` | The item |
| `index` | Its position, counted from 0 |
| `acc` | In `reduce()`, the result so far |

If a note has a property with one of these names, write `note.value` to read the property inside the function.

### Dates and Durations

| To get | Write |
|---|---|
| A date | `date("2025-05-27")` |
| A date with a time | `date("2025-05-27 08:30:00")` or `date("2025-05-27T08:30")` |
| This moment | `now()` |
| Today, with no time | `today()` |
| A length of time | `duration("1h 30m")` |

`date()` reads `YYYY-MM-DD`, with a time after a space or a `T` if you want one, and a zone such as `Z` or `+02:00` after the time. All dates are shown in your computer's local time.

The parts of a date are read with a dot: `year`, `month`, `day`, `hour`, `minute`, `second` and `millisecond`. `due.year` gives `2025`.

**Adding and subtracting.** Add text that holds a duration to a date, or subtract it:

```text
due + "2w"
now() - "1 week"
today() + "1M" + "2d"
```

| Unit | Written as |
|---|---|
| Years | `y`, `year`, `years` |
| Months | `M`, `month`, `months` |
| Weeks | `w`, `week`, `weeks` |
| Days | `d`, `day`, `days` |
| Hours | `h`, `hour`, `hours` |
| Minutes | `m`, `minute`, `minutes` |
| Seconds | `s`, `second`, `seconds` |

The one-letter units depend on case: `M` is a month and `m` is a minute. The words do not. Several units can be written together: `"1h 30m"`.

- Adding a month keeps the day of the month where it can: 31 January plus `"1M"` is 28 February.
- Adding a duration to a date that is missing gives nothing.

**The time between two dates.** Subtracting one date from another gives a duration. Its length is read with a dot, in `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `seconds` or `milliseconds`:

```text
(due - today()).days
```

Between two dates that have no time, the result is a whole number of days. A duration can be multiplied or divided by a number, and dividing one duration by another gives a number: `duration("3h") / duration("30m")` is `6`.

**Comparing.** Dates compare with `<`, `>` and `==`, and with text that holds a date: `due >= "2025-01-01"`. A common filter is `file.mtime > now() - "1 week"`.

### Date Formats

`format()` turns a date into text with a pattern. For 27 May 2025 at 23:59:59:

| Pattern | Gives |
|---|---|
| `YYYY-MM-DD` | `2025-05-27` |
| `D MMMM YYYY` | `27 May 2025` |
| `ddd, MMM Do YY` | `Tue, May 27th 25` |
| `h:mm A` | `11:59 PM` |
| `[Week] W [of] GGGG` | `Week 22 of 2025` |
| `LL` | `May 27, 2025` |

The parts a pattern can hold:

| Part | Gives |
|---|---|
| `YYYY`, `YY` | The year, in four digits or two |
| `Q`, `Qo` | The quarter: `2`, `2nd` |
| `M`, `MM`, `Mo`, `MMM`, `MMMM` | The month: `1`, `01`, `1st`, `Jan`, `January` |
| `D`, `DD`, `Do` | The day of the month: `7`, `07`, `7th` |
| `DDD`, `DDDD`, `DDDo` | The day of the year: `147`, in three digits, `147th` |
| `d`, `do`, `dd`, `ddd`, `dddd` | The day of the week: `0` for Sunday to `6`, `2nd`, `Tu`, `Tue`, `Tuesday` |
| `E` | The day of the week from `1` for Monday to `7` for Sunday |
| `W`, `WW`, `Wo` | The ISO week of the year: `22`, in two digits, `22nd` |
| `GGGG`, `GG` | The year that ISO week belongs to |
| `w`, `ww`, `wo` | The week of the year, where weeks start on Sunday and week 1 holds 1 January |
| `gggg`, `gg` | The year that week belongs to |
| `H`, `HH` | The hour from 0 to 23 |
| `h`, `hh` | The hour from 1 to 12 |
| `k`, `kk` | The hour from 1 to 24 |
| `m`, `mm` | The minute |
| `s`, `ss` | The second |
| `S`, `SS`, `SSS` | Tenths, hundredths and thousandths of a second |
| `A`, `a` | `AM` or `PM`, `am` or `pm` |
| `Z`, `ZZ` | The offset from UTC: `+02:00`, `+0200` |
| `X`, `x` | Seconds, or milliseconds, since the start of 1970 |
| `LT`, `LTS` | `h:mm A`, `h:mm:ss A` |
| `L`, `LL` | `MM/DD/YYYY`, `MMMM D, YYYY` |
| `LLL`, `LLLL` | `MMMM D, YYYY h:mm A`, `dddd, MMMM D, YYYY h:mm A` |
| `[text]` | The text between the brackets, as it is |

Month and weekday names are in English. Put words in square brackets: outside them, a letter that is one of the parts above is replaced, even in the middle of a word.

## Functions

There are two kinds of function. A global function is called by its name: `today()`. The others are called on a value, after a dot: `title.lower()`. The tables below list every function there is.

To call a function on a number written in the expression, put the number in brackets: `(2.5).round()`.

### Global Functions

| Function | What it does | Example |
|---|---|---|
| `date(text)` | Reads a date from text | `date("2025-05-27")` |
| `duration(text)` | Reads a length of time from text | `duration("1h 30m")` |
| `escapeHTML(text)` | Makes text safe to put inside HTML | `escapeHTML("<b>")` gives `&lt;b&gt;` |
| `file(target)` | The file that a path, a name or a link points at, or nothing | `file("Website").properties.status` |
| `html(text)` | A value that is drawn as HTML | `html("<b>bold</b>")` |
| `icon(name)` | An icon value. It is shown as its name | `icon("star")` |
| `if(test, then, else)` | `then` when `test` counts as true, otherwise `else`. Without `else`, nothing | `if(done, "Yes", "No")` |
| `image(source)` | A picture, from a web address, a path, a link or a file | `image("https://example.com/cover.jpg")` |
| `link(target, display)` | A link to a file, or to a web address when `target` is one. `display` is optional | `link("https://example.com", "Site")` |
| `list(value)` | The value as a list: a list stays as it is, one value becomes a list of one, nothing becomes an empty list | `list("a")` gives a list holding `a` |
| `max(a, b, …)` | The largest of the numbers. Lists are opened up and empty values skipped | `max(1, 5, 3)` gives `5` |
| `min(a, b, …)` | The smallest of the numbers | `min(1, 5, 3)` gives `1` |
| `now()` | The date and time at this moment | `file.mtime > now() - "1 week"` |
| `number(value)` | A number from text, a checkbox (1 or 0), a date or a duration (both in milliseconds) | `number("3.4")` gives `3.4` |
| `random()` | A number from 0 up to, but not reaching, 1 | `random()` |
| `today()` | Today's date, with no time | `due < today()` |

`if()` only works out the side it picks.

### Any Value

| Function | What it does | Example |
|---|---|---|
| `isEmpty()` | True for nothing, empty text, an empty list and an empty mapping | `"".isEmpty()` gives `true` |
| `isTruthy()` | Whether the value [counts as true](#what-counts-as-true) | `(0).isTruthy()` gives `false` |
| `isType(name)` | Whether the value is of the named kind | `(5).isType("number")` gives `true` |
| `toString()` | The value as the text a cell would show | `[1, 2].toString()` gives `1, 2` |

The names `isType()` knows: `string` or `text`, `number`, `boolean` or `checkbox`, `date` or `datetime`, `duration`, `list` or `array`, `link`, `url`, `file`, `object`, `null`, `regexp` or `regex`, `tag`, `html`, `image` and `icon`.

### Text

These also work on a web address and on a tag. Matching is exact: upper and lower case are different.

| Function | What it does | Example |
|---|---|---|
| `contains(text)` | Whether the text holds the given text | `"hello".contains("ell")` gives `true` |
| `containsAll(a, b, …)` | Whether it holds all of them | `"hello".containsAll("h", "e")` gives `true` |
| `containsAny(a, b, …)` | Whether it holds at least one of them | `"hello".containsAny("x", "e")` gives `true` |
| `endsWith(text)` | Whether it ends with the given text | `"hello".endsWith("lo")` gives `true` |
| `lower()` | The text in lower case | `"HeLLo".lower()` gives `hello` |
| `repeat(count)` | The text, repeated | `"123".repeat(2)` gives `123123` |
| `replace(pattern, replacement)` | The text with every `pattern` replaced. A regular expression replaces the first match only, unless it has the `g` flag | `"a:b:c".replace(":", "-")` gives `a-b-c` |
| `reverse()` | The text backwards | `"hello".reverse()` gives `olleh` |
| `slice(start, end)` | Part of the text, from `start` up to `end`, counted from 0. `end` is optional | `"hello".slice(1, 4)` gives `ell` |
| `split(separator, n)` | A list of the pieces between separators. `n` is optional and keeps the first `n` pieces | `"a,b,c,d".split(",", 3)` gives `a`, `b`, `c` |
| `startsWith(text)` | Whether it starts with the given text | `"hello".startsWith("he")` gives `true` |
| `title()` | The text with each word starting with a capital | `"hello world".title()` gives `Hello World` |
| `trim()` | The text without the spaces at its ends | `"  hi  ".trim()` gives `hi` |
| `upper()` | The text in upper case | `"hello".upper()` gives `HELLO` |

`repeat()` fails when the result would be longer than 1,000,000 characters.

### Numbers

| Function | What it does | Example |
|---|---|---|
| `abs()` | The number without its sign | `(-5).abs()` gives `5` |
| `ceil()` | The number rounded up | `(2.1).ceil()` gives `3` |
| `floor()` | The number rounded down | `(2.9).floor()` gives `2` |
| `round(digits)` | The number rounded to the nearest whole, or to `digits` decimal places | `(2.3333).round(2)` gives `2.33` |
| `toFixed(digits)` | Text with exactly `digits` decimal places | `(3.14159).toFixed(2)` gives `3.14` |

`toFixed()` gives text, not a number. Use `round()` when the result has to be sorted or added up as a number.

### Dates

| Function | What it does | Example |
|---|---|---|
| `date()` | The date without its time | `now().date()` |
| `format(pattern)` | The date as text. See [Date Formats](#date-formats) | `due.format("D MMMM YYYY")` |
| `relative()` | How far the date is from now, in words | `file.mtime.relative()` gives text such as `3 days ago` |
| `time()` | The time as text | `now().time()` gives text such as `23:59:59` |

### Lists

| Function | What it does | Example |
|---|---|---|
| `contains(value)` | Whether the list holds the value | `tags.contains("urgent")` |
| `containsAll(a, b, …)` | Whether it holds all of them | `[1, 2, 3].containsAll(2, 3)` gives `true` |
| `containsAny(a, b, …)` | Whether it holds at least one of them | `[1, 2, 3].containsAny(3, 4)` gives `true` |
| `filter(test)` | The items for which `test` is true | `[1, 2, 3, 4].filter(value > 2)` gives `3`, `4` |
| `flat()` | The list with the lists inside it opened up, one level deep | `[1, [2, 3]].flat()` gives `1`, `2`, `3` |
| `join(separator)` | The items as one piece of text. The separator is a comma when left out | `["a", "b"].join(" and ")` gives `a and b` |
| `map(expression)` | A list of the results of `expression` for each item | `[1, 2, 3].map(value + 1)` gives `2`, `3`, `4` |
| `mean()` | The average of the numbers in the list. Other items are skipped | `[1, 2, 4].mean().round(3)` gives `2.333` |
| `reduce(expression, start)` | One value, built up from `start` by running `expression` for each item | `[1, 2, 3].reduce(acc + value, 0)` gives `6` |
| `reverse()` | The list backwards | `[1, 2, 3].reverse()` gives `3`, `2`, `1` |
| `slice(start, end)` | Part of the list, from `start` up to `end`, counted from 0. `end` is optional | `[1, 2, 3, 4].slice(1, 3)` gives `2`, `3` |
| `sort()` | The list from smallest to largest, with empty items last | `[10, 9, 100].sort()` gives `9`, `10`, `100` |
| `unique()` | The list with repeated values removed | `[1, 2, 2, 3].unique()` gives `1`, `2`, `3` |

The `contains` functions compare the way `==` does. See [Names Inside a Function](#names-inside-a-function) for `value`, `index` and `acc`.

### Links

| Function | What it does | Example |
|---|---|---|
| `asFile()` | The file the link points at, or nothing | `project.asFile().properties.status` |
| `linksTo(file)` | Whether the file the link points at has a link to the given file | `project.linksTo(this.file)` |

`asFile()` is how a value is read from a linked note. With `project: "[[Website]]"` in a note's frontmatter, `project.asFile().properties.status` gives the status of the Website note.

### Files

These are called on `file`, on `this`, or on the result of `file()` or `asFile()`.

| Function | What it does | Example |
|---|---|---|
| `asLink(display)` | A link to the file. `display` is optional | `file.asLink("Open")` |
| `hasLink(target)` | Whether the file links to the target: a file, a link or a name | `file.hasLink("Textbook")` |
| `hasProperty(name)` | Whether the frontmatter has the property, even with nothing in it | `file.hasProperty("status")` |
| `hasTag(a, b, …)` | Whether the file has at least one of the tags | `file.hasTag("book", "article")` |
| `inFolder(folder)` | Whether the file is in the folder, or in a folder inside it | `file.inFolder("Projects")` |

Details:

- **`hasTag()`.** The `#` is optional and case is ignored. A tag covers the tags nested under it: `file.hasTag("book")` is true for `#book/fiction`, and false for `#books`.
- **`inFolder()`.** The folder is a path from the top of the vault. Case is ignored. `file.inFolder("Reading")` is true for a file in `Reading/2025`, and false for one in `Notes/Reading`.
- **`hasLink()`.** A link to a note that does not exist still counts as a link to that name.

### Mappings

| Function | What it does | Example |
|---|---|---|
| `keys()` | A list of the keys | `file.properties.keys()` |
| `values()` | A list of the values | `address.values()` |

### Regular Expressions

| Function | What it does | Example |
|---|---|---|
| `matches(text)` | Whether the text matches the expression | `/^\d+/.matches(file.name)` |

## Summaries

A summary is one value worked out from a column, such as its total. It is shown in a table, in a row under the rows it covers. A grouped table has a summary row under each group and one for the whole table at the bottom.

A summary is shown under its own column, so the property has to be in the view's `order`. Cards and lists do not show summaries.

### Built-In Summaries

| Name | Gives |
|---|---|
| `Average` | The average of the numbers |
| `Min` | The smallest number |
| `Max` | The largest number |
| `Sum` | The numbers added up |
| `Range` | The largest number minus the smallest. In a column of dates, the time from the earliest to the latest |
| `Median` | The middle number. With an even count, the average of the two in the middle |
| `Stddev` | The standard deviation of the numbers, taken as the whole set |
| `Earliest` | The earliest date |
| `Latest` | The latest date |
| `Checked` | How many cells are `true` |
| `Unchecked` | How many cells are `false` |
| `Empty` | How many cells are empty |
| `Filled` | How many cells are not empty |
| `Unique` | How many different values there are, not counting empty cells |

Things to know:

- The name can be written in any letter case.
- The number summaries count text that holds a number, such as the result of `toFixed()`. Other values are skipped.
- A summary with nothing to work on, such as `Average` over a column with no numbers, is empty.
- A cell that failed counts as empty.

### Custom Summaries

A formula in the base's `summaries` is a summary of your own. Inside it, `values` is the list of the column's values, one for each row shown.

```yaml
summaries:
  rounded: values.mean().round(1)
  share done: '(values.filter(value == true).length / values.length * 100).round() + "%"'
views:
  - type: table
    order:
      - file.name
      - price
      - done
    summaries:
      price: rounded
      done: share done
```

A summary formula is not run for a row, so a plain property name holds nothing in it. Work from `values`.

If a custom summary has the name of a built-in one, the custom one is used. A name that is neither gives the error `There is no summary called "…"` in the summary row.

## View Types

A view's `type` is `table`, `cards` or `list`. The keys of a view that each type uses:

| Key | Table | Cards | List |
|---|---|---|---|
| `filters`, `order`, `sort`, `limit` | Yes | Yes | Yes |
| `groupBy`, `groupOrder` | Yes | Yes | Yes |
| `summaries` | Yes | No | No |
| `image` | No | Yes | No |

### Table

A table has a row for each file and a column for each property in `order`.

- Click a column heading to [sort](#sorting-by-a-column).
- With `groupBy`, each group starts with a row that holds its value and its number of rows.
- [Summaries](#summaries) are shown under the rows.

### Cards

A cards view shows each file as a card in a grid. A card holds:

- A cover, when the view has an `image` key. See below.
- The name of the file, as a link that opens it.
- A line for each property in `order`, with its display name and its value. `file.name`, `file.basename` and the cover property are left out, and so is a property with no value.

With `groupBy`, each group has a heading with its value and its number of cards.

**Covers.** `image` names the property that holds the cover: `image: formula.cover`. A picture is drawn when the value comes from `image()`, or is text built by a formula, and its address starts with `http://` or `https://`. A web address written in frontmatter is read as a web address, not as a picture, and shows as a link. A picture kept in the vault shows as a link too. To show covers from a `cover` property that holds web addresses, pass it through `image()`:

```yaml
formulas:
  cover: image(note.cover)
views:
  - type: cards
    name: Shelf
    image: formula.cover
    order:
      - file.name
      - author
```

### List

A list view has one line for each file. The line holds the values of the properties in `order`, side by side, with the first one in front. Empty values are left out. With `groupBy`, each group has a heading with its value and its number of lines.

### Other Kinds

Table, cards and list are the views that are drawn. A view of any other type is shown as a table, with a line above it that says so:

| Type | Line shown |
|---|---|
| `kanban` | `A kanban view is shown as a table here.` |
| `map` | `A map view is shown as a table here.` |
| Anything else, such as `gantt` | `"gantt" is not a kind of view this app knows; it is shown as a table.` |

The view's `order`, `sort`, `groupBy`, `groupOrder`, `limit` and `summaries` still apply. A kanban view grouped by status is a table grouped by status.

## Errors

A mistake in a base does not stop the rest of it from being drawn, unless the file as a whole cannot be read.

### A File That Cannot Be Read

When the YAML is broken, or a key holds the wrong kind of value, no view is drawn. The base shows one line that starts with `This base cannot be read:` followed by the reason. With **Edit as text** on, the reason is also under the text box.

| Reason shown | Cause |
|---|---|
| `This base is not valid YAML: …` | The text is not YAML, for example a bracket that is not closed or a key written twice |
| `A base must be a mapping with keys such as "filters" and "views", not a list.` | The file is a list or plain text |
| `"views" must be a list, not text.` | A key holds the wrong kind of value. The message names the key |
| `"filters" has the key "any". A filter can only hold "and", "or" or "not".` | A filter group with another key |
| `"views[0].sort[0].direction" must be ASC or DESC, not "up".` | A direction that is neither. `views[0]` is the first view |
| `"views[0].limit" must be a number, not text.` | A limit that is not a number |

### A Filter That Fails

A filter statement can fail for one file and work for the others: for example `price * 2 > 5` in a vault where one note has `price: five`. A statement that cannot be read at all, such as `price >`, fails for every file.

- A line above the view gives the reason, the statement in brackets, and the number of files when it failed on more than one: `Cannot multiply text and a number (price * 2 > 5)`.
- The file is left out, unless the other statements settle the matter without the one that failed. In an `or`, a file is kept when another statement is true. In an `and`, it is dropped when another statement is false.

A property that a note does not have is not a failure. The statement is false for that note, and nothing is reported.

### A Formula That Fails

A formula that fails for a row shows a warning sign in that row's cell. Point at the sign to read the reason. The other cells and rows are drawn as usual.

| Reason | Cause |
|---|---|
| `There is no function called toFixd()` | A function name that does not exist |
| `Cannot divide by zero` | A division by 0 in that row |
| `Cannot divide text and a number` | A value of the wrong kind in that row |
| `toFixed() cannot be used on text` | A function called on the wrong kind of value |
| `Formula "total": Missing ")"` | The formula cannot be read. Every row shows the sign, and a line above the view names the formula |
| `Formula "a" refers to itself` | Formulas that lead back to themselves |
| `There is no formula called "total"` | `formula.total` is used and no such formula is defined |

A cell that failed is sorted last, is grouped under `None`, and counts as empty in a summary.

### Other Messages

| Message | Means |
|---|---|
| `Reading the vault…` | The files of the vault are being read. The view follows |
| `The vault could not be read.` | Reading the files failed. Click **Refresh** to try again |
| `No files match this view.` | The filters of the base and the view leave no file |
| `Nothing matches the filter.` | No row shows the text in the **Filter** box |
| `There is no view called "Cards". Showing "Table".` | An embed asks for a view the base does not have |
| `This base could not be read.` | The file of an embedded base could not be read |
| `This base is no longer there.` | The file of the base in this tab could not be found |
| `A base needs an open vault.` | A `base` block is drawn with no vault open |

## Limits

- **No visual editor.** Views, filters, formulas and display names are changed in the YAML.
- **Three kinds of view.** Kanban, map and other kinds are shown as tables.
- **Read-only.** A base shows values and does not change notes.
- **Unused settings.** In a view, only the keys listed under [Views](#views) do anything. In `properties`, only `displayName` does. Other keys are ignored.
- **Cover pictures** are drawn only from the web, and a web address in frontmatter has to go through `image()` first. A picture in the vault shows as a link.
- **Icons.** `icon()` shows the icon's name, not a drawing.
- **`file.embeds`** is always empty.
- **Links in properties** are not counted by `file.links`, `file.backlinks` or `file.hasLink()`.
- **Files that are not notes** have no size or dates.
- **Opening a link.** A file's name always opens the file. A link in another column is found the way a [wiki-link](../features/wiki-links.md#how-resolution-works) is, by name as well as by path, in a base's tab and inside a note. The part after `#` is not used: the file opens at its top.
- **Date formats** use English month and weekday names.
- **Long frontmatter.** Frontmatter longer than 64 KiB is not read, and the note is listed with no properties.
- **Refreshing** is by hand, with the **Refresh** button.

## Examples

### Reading List

A table of the notes tagged `book`, grouped by status. A formula works out the price per page, and the summary rows give the total pages, the average price and the share of books that are finished.

```yaml
filters:
  and:
    - file.hasTag("book")
    - 'status != "dropped"'
formulas:
  per_page: (price / pages).toFixed(3)
properties:
  note.author:
    displayName: Author
  formula.per_page:
    displayName: Price per page
summaries:
  share done: '(values.filter(value == true).length / values.length * 100).round() + "%"'
views:
  - type: table
    name: Reading list
    order:
      - file.name
      - author
      - pages
      - price
      - formula.per_page
      - finished
    sort:
      - property: author
      - property: file.name
    groupBy:
      property: status
      direction: ASC
    summaries:
      pages: Sum
      price: Average
      finished: share done
```

A book with no `price` or no `pages` has an empty price per page. A book with `pages: 0` shows a warning sign there.

### Open Tasks

The 20 tasks that are due soonest, from the files in the `Tasks` folder that are not done. One formula counts the days left and another marks the tasks that are late. Tasks with no `due` date come last.

```yaml
filters:
  and:
    - file.inFolder("Tasks")
    - 'status != "Done"'
formulas:
  days_left: (due - today()).days
  late: 'if(due < today(), "Overdue", "")'
views:
  - type: table
    name: Open tasks
    order:
      - file.name
      - due
      - formula.days_left
      - formula.late
    sort:
      - property: due
        direction: ASC
    limit: 20
```

### Cards and a List

One base with two views of the notes tagged `recipe`. The first shows them as cards, best rated first, with a cover taken from the web address in each note's `cover` property. The second is a plain list.

```yaml
filters:
  and:
    - file.hasTag("recipe")
formulas:
  cover: image(note.cover)
views:
  - type: cards
    name: Gallery
    image: formula.cover
    order:
      - file.name
      - cuisine
      - rating
    sort:
      - property: rating
        direction: DESC
  - type: list
    name: Titles
    order:
      - file.name
      - cuisine
```

Embed the second view in a note with `![[Recipes.base#Titles]]`.

### Notes That Link Here

A `base` block that lists the ten most recently changed files that link to the note it is written in. Because it uses `this`, the same block gives a different list in each note.

````markdown
```base
filters:
  and:
    - file.hasLink(this.file)
views:
  - type: list
    name: Linked here
    order:
      - file.name
      - file.folder
    sort:
      - property: file.mtime
        direction: DESC
    limit: 10
```
````

## Tips

- **Start from Create New Base.** The file it makes is a working base. Change one key at a time with **Edit as text** and watch the view.
- **Watch the `Not saved` label.** It stays while the text does not read as a base. Fix the line the message names, and the base saves itself.
- **Quote a statement when in doubt.** Single quotes around a filter or formula keep YAML from reading it its own way.
- **Filter on the extension** to keep images and other files out of a base: `file.ext == "md"`.
- **Use `file.hasTag()` for tags.** It sees tags in the text and in the frontmatter, and nested tags.
- **Keep numbers as numbers.** `toFixed()` gives text. Use `round()` for a column that has to be sorted, or added up in a summary of your own.
