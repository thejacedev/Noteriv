---
title: Importing Notes
order: 8
---

# Importing Notes

Noteriv can bring in notes you kept in another app. An import reads an export that the other app made and writes Markdown notes into a folder of your vault. It reads exports from Evernote, Notion, Google Keep, Roam Research, Logseq and Bear, and it reads Textbundle files, HTML files and CSV tables.

Importing is in the desktop app only, and is newer than version 2.4.13.

Each format is supported as its app documents it. The importers were written from those descriptions and checked with sample exports made for testing, not with real exports from every app. After an import, look over the notes before you rely on them, and keep the export until you have.

## Open the import dialog

1. Open the vault the notes should go into.
2. Open the command palette (`Ctrl+Shift+P`) and run **Import Notes from Another App**.

The command has no default shortcut. You can give it one in Settings > Shortcuts.

The dialog is titled **Import notes**. The sources are listed down its left side. Beside them are a line that says how to get the export out of the selected app, and the fields described below.

## Steps in the dialog

1. Pick the source in the list: **Evernote**, **Notion**, **Google Keep**, **Roam Research**, **Logseq**, **Bear**, **Textbundle**, **HTML files** or **CSV table**. Evernote is selected when the dialog opens.
2. Under **Export**, click **Choose file** or **Choose folder** and pick the export in the file dialog.
3. Under **Folder in the vault**, check where the notes will go.
4. Set the source's own option, if it has one.
5. Click **Import**.

| Field | What it does |
|---|---|
| **Export** | **Choose file** opens a file dialog that offers the file endings the source accepts. **Choose folder** opens one for folders. Roam Research has **Choose file** only; every other source has both. Until you choose something, `Nothing chosen yet` is shown beside the buttons. After that, the name of what you chose and the folder it is in are shown |
| **Folder in the vault** | The folder the notes go into, as a path inside the vault such as `Imported/Evernote`. It starts as `Imported/` followed by the name of the source, and follows the source you pick until you edit it. The folder is created if it does not exist. An empty box reads `Leave empty for the top of the vault`, and that is where the notes then go |
| **Column that names each note** | Shown for CSV table. See [CSV table](#csv-table) |
| **Import the notes in the trash too** | A checkbox shown for Google Keep and Bear. It is off to begin with |

Things to know:

- **Import** cannot be clicked until an export is chosen.
- Picking another source clears the export you chose.
- While an import runs, the button reads `Importing…` and the dialog cannot be closed.
- **Cancel**, `Esc` or a click outside the dialog closes it.

## The result

When the import ends, the result is shown in the dialog, under the fields.

If notes were imported, a sentence says how many and where:

```text
Imported 12 notes and 3 attachments into Imported/Notion.
```

Attachments are counted only when there are any. If something was left out, the sentence goes on with `1 item was left out.` or, for example, `4 items were left out.`, and a list under it gives each item's name and the reason. The list shows the first 200 items and ends with `and 12 more` when there are more.

The buttons change to **Done** and **Import again**. The file list is read again, and the destination's top folder is opened in it.

**Import again** runs the same import a second time. Nothing is replaced, so the notes are imported again under numbered names.

If the import could not be done, the reason is shown in place of the sentence. The buttons stay **Cancel** and **Import**. See [When an import is refused](#when-an-import-is-refused).

## Where the notes go

Every import writes into one folder of the vault, the one named in **Folder in the vault**. These rules apply to every source:

- **Nothing is replaced.** A file is created only if its name is free. No file that is already in the vault is overwritten or changed.
- **The export is not changed.** A zip file is read in place and is not unpacked.
- **One problem does not stop the import.** A note or attachment that cannot be read or written is left out and listed with the reason, and the import goes on. An import fails as a whole only when there is nothing to import.
- **An import that writes nothing leaves nothing behind.** Folders it created for the destination are removed again.

### Names

A note is named after its title. Characters that cannot be part of a file name on every system, or that would be read as link syntax inside `[[...]]`, are changed:

| In the title | In the name |
|---|---|
| `/`, `\` and `\|` | Replaced with `-` |
| `:` | Removed at the end of a word and replaced with `-` inside one. `Meeting: plan` becomes `Meeting plan`, and `10:30 call` becomes `10-30 call` |
| `*`, `?`, `"`, `<`, `>`, `[`, `]`, `#` and `^` | Removed |
| Dots, spaces and dashes at the start, dots and spaces at the end | Removed |
| More than 120 characters | Cut to 120 characters, or to 180 bytes if that comes first |
| Nothing that can be used | `Untitled` |

When a title had to be changed like this, notes from Evernote, Google Keep and Roam Research, and pages from Logseq, keep the original title in a `title` property.

A note's name is unique among all the notes in the vault, not only in its folder, because a `[[Note]]` link finds a note by name anywhere in the vault. Upper and lower case are not told apart. If a name is taken, a number is added: `Plan 2`, `Plan 3` and so on. Hidden folders, whose names start with a dot, and `node_modules` are not looked at.

### Attachments

Attachments are saved in a folder named `attachments` inside the destination folder, such as `Imported/Evernote/attachments`. This is the import's own folder. The [Attachment folder](../features/file-settings.md#attachment-folder) setting is not used.

An attachment keeps its file name, cleaned the same way as a note's name. Its name is unique among the other files in the vault, and a taken name is numbered: `photo 2.png`.

In the note, a picture is embedded as `![[photo.png]]` and any other file is linked as `[[paper.pdf]]`. Files ending in `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `bmp` or `avif` count as pictures. See [Embedding](../features/wiki-links.md#embedding-with).

### Links between imported notes

Every note's final name is settled before any note is written. A link from one imported note to another is then written with the name the other note really got, and keeps its text. A link to a note titled `Plans: 2024` becomes `[[Plans 2024|Plans: 2024]]`.

### Properties and dates

Details such as dates, tags and the address a note came from are written as [properties](../features/properties.md) in the note's [frontmatter](../reference/frontmatter.md). Dates are written in the form `2021-01-31T12:34:56Z`.

Evernote tags, Google Keep labels and the `tags` property of a Logseq page go into the note's `tags` list. A space inside a tag becomes a dash, so the label `To Do` becomes the tag `To-Do`. See [Tags](../features/tags.md).

For Evernote, Google Keep, Roam Research and Bear, the file's modified time is also set to the time the note was last changed in the other app, where the file system allows it. Notes from the other sources are dated when they are imported.

## Evernote

The dialog says: "In Evernote, right-click a notebook and choose Export Notebook, as ENEX. Choose the .enex file, or a folder of them."

| Button | What to pick |
|---|---|
| **Choose file** | One `.enex` file. Its notes go straight into the destination folder |
| **Choose folder** | A folder of `.enex` files. Only files directly in the folder are read. Each file's notes go into a folder named after the file, and a file named `Stack@@@Notebook.enex` goes into `Stack/Notebook` |

The file is read piece by piece, so a large export does not have to fit in memory.

| In Evernote | In Noteriv |
|---|---|
| Title | The note's name |
| Text | Converted to Markdown. See [How HTML is converted](#how-html-is-converted) |
| Checkboxes, in both the older and the newer form | Task lines: `- [ ]` and `- [x]` |
| Code blocks | Fenced code blocks, with the language when Evernote names one |
| Highlighted text | `==highlight==` |
| Tags | `tags` |
| Created and updated dates | `created` and `updated` |
| Source address and author | `source` and `author` |
| Location | `location`, as latitude and longitude |
| Reminder time | `reminder` |
| Attachments | Saved under their file names. An attachment with no file name is named after its note. One that the text does not show is linked at the end of the note. A file attached to several notes is saved once |
| Pictures written into the note itself | Saved as attachments named after the note |
| Links to other notes | `[[Note]]` links, when the text of the link is the title of a note in the import. Case is ignored. If several notes have that title, the link goes to the first |
| Tasks from the task list | Task lines at the end of the note, with the due date added as `(due 2024-03-05)` |

Not carried over:

- **Encrypted text.** It is not decrypted. The note gets this line in its place: `*(Encrypted text: decrypt it in Evernote and copy it here.)*`
- **Ink notes.**
- **Whether a reminder is done.**
- **A link to a note that is not in the import.** It stays a link into Evernote.

## Notion

The dialog says: "In Notion, choose Export, with the format Markdown & CSV. Choose the zip it gives you, or the folder if you have unpacked it."

| Button | What to pick |
|---|---|
| **Choose file** | The `.zip` file Notion made |
| **Choose folder** | The folder the zip was unpacked into |

An export that Notion split into several part archives is read as one, whether the parts are inside the zip or in the folder. An archive inside the export is opened one level deep. A part archive inside the zip that is larger than 512 MB is left out, with a message that says to unzip the export and import the folder.

| In Notion | In Noteriv |
|---|---|
| Pages | A note for each page. The note is named after the page's first line when that is a top-level heading, and otherwise after the file |
| The ids Notion adds to file and folder names | Dropped. `Home 0123456789abcdef0123456789abcdef.md` becomes `Home.md` |
| Pages inside pages | Folders. A page's sub-pages are in a folder named after it, beside its note |
| Links to pages and databases | `[[Note]]` links |
| Links to `notion.so` and `notion.site` addresses | `[[Note]]` links, when the address names a page that is in the export |
| Pictures and files a page links to | Copied to the attachments folder the first time something links to them |
| Databases | A note with a table of the rows. The first cell of a row links to the row's page when it has one. When the export has an `_all.csv` file for the database, the table is made from that one |
| The properties of a database row | Properties of the row's note. These are the "Name: value" lines right under the page's title that name a column of the database |

Not carried over:

- **The `.csv` files.** They are read to make the database notes and are not copied.
- **Comments.**
- **Files that nothing links to.**
- **A link to a page or file that is not in the export.** It stays as written.

Notion's HTML export is not read. See [When an import is refused](#when-an-import-is-refused).

## Google Keep

The dialog says: "Ask Google Takeout for your Keep data. Choose the zip it sends, or the unpacked Takeout folder."

| Button | What to pick |
|---|---|
| **Choose file** | The `.zip` file from Takeout |
| **Choose folder** | The folder the zip was unpacked into |

Only the `.json` files are read. If the export has a folder named `Keep`, the notes are taken from there. If it has none, every `.json` file is looked at, and one that is not a Keep note is listed as left out. All the notes go straight into the destination folder.

| In Google Keep | In Noteriv |
|---|---|
| Title | The note's name. A note with no title is named after the first 60 characters of its first line, or after its file if it has no text |
| Text | The note's text |
| Checklist | A task list: `- [ ]` and `- [x]` |
| Labels | `tags` |
| Pinned and archived | `pinned: true` and `archived: true`. A note that is neither has neither property |
| Colour | `color`, in lower case. Left out for the default colour |
| Created and edited dates | `created` and `updated` |
| Attachments | Copied. Pictures are embedded and other files, such as recordings, are linked |
| Link previews | A list of links at the end of the note |

Not carried over:

- **The indentation of checklist items, and reminders.** Keep does not export them.
- **Who a note was shared with.**

### Notes in Keep's trash

**Import the notes in the trash too** is off to begin with. When it is off, a note that is in Keep's trash is left out and listed with the reason `It is in the trash in Google Keep.` When it is on, the note is imported with the property `trashed: true`.

## Roam Research

The dialog says: "In Roam, choose Export All, as JSON. Choose the .json file, or the zip it came in."

This source has **Choose file** only. Pick the `.json` file or the `.zip` file. In a zip, every `.json` file is read.

| In Roam | In Noteriv |
|---|---|
| Pages | A note for each page that has text in it |
| Blocks | List items, nested as in Roam |
| Heading blocks, levels 1 to 3 | A heading inside the list item |
| `[[Page]]`, `#[[Page]]` and `[text]([[Page]])` | Links to the note, by its final name |
| `((uid))` | A link to the block. The block gets a `^id` at its end so the link has a target |
| `{{[[TODO]]}}` and `{{[[DONE]]}}` | Task boxes: `[ ]` and `[x]` |
| `{{[[embed]]: ((uid))}}` | An embed of the block |
| `{{[[video]]: url}}`, and the same with `youtube`, `iframe`, `pdf` or `audio` | The address |
| Any other `{{...}}` | Kept as inline code |
| `^^text^^` and `__text__` | `==text==` and `*text*` |
| `Name:: value` at the start of a block | `**Name:** value` |
| Daily notes, titled like `January 21st, 2021` | Named `2021-01-21`. Links to them follow, and the Roam title is kept in the `title` property |
| Created and edited times | `created` and `updated` |

Not carried over:

- **Pages with no text.** They are not written. A link to one stays a link to a note that does not exist yet.
- **Pictures and files.** A Roam export only points at them on Roam's servers. The links are kept.
- **Queries.** They are kept as inline code, like other `{{...}}`.
- **Block text alignment.**

## Logseq

The dialog says: "Choose your Logseq graph folder: the one that holds the pages and journals folders. A zip of it works too."

| Button | What to pick |
|---|---|
| **Choose folder** | The graph folder |
| **Choose file** | A `.zip` file of the graph folder |

The importer reads a graph kept as files, not a database graph. The graph can lie inside another folder in what you pick. The names of the pages and journals folders, the way journal titles are written and the way file names stand for namespaces are read from the graph's `logseq/config.edn`.

| In Logseq | In Noteriv |
|---|---|
| Pages | Notes in the destination folder. A namespace becomes folders: the page `books/Dune` is the note `Dune` in the folder `books` |
| Journals | Notes in a folder `Journals`, named like `2023-01-15` |
| The outline | A nested list. Numbered lists stay numbered |
| Page properties | Properties of the note. `tags` is a list, `alias` becomes the `aliases` list, `created-at` and `updated-at` become `created` and `updated`, and the rest are text. See [Note Aliases](../features/wiki-links.md#note-aliases) |
| Block properties | Kept as lines of the block, apart from `id`, `collapsed` and those that start with `logseq.` |
| `TODO`, `DOING`, `NOW`, `LATER`, `WAIT`, `WAITING` and `IN-PROGRESS` | An open task box |
| `DONE` | A ticked task box |
| `CANCELED` and `CANCELLED` | A ticked task box with the text struck through |
| `[[Page]]`, `#[[Page]]`, `[text]([[Page]])` and links to an alias | Links to the note, by its final name |
| Links to a journal by its title, such as `[[Jan 15th, 2023]]` | Links to the journal's note |
| `((id))` | A link to the block with that id. The block gets a `^id` at its end |
| `{{embed ...}}` | An embed of the page or block |
| `{{video ...}}`, and the same with `youtube`, `vimeo`, `bilibili`, `tweet` or `twitter` | The address |
| `{{cloze ...}}` | Its text |
| Any other `{{...}}` | Kept as inline code |
| `^^text^^` | `==text==` |
| `#+BEGIN_QUOTE` blocks | Quotes |
| `#+BEGIN_SRC` and `#+BEGIN_EXAMPLE` blocks | Code blocks |
| `#+BEGIN_NOTE`, `#+BEGIN_TIP`, `#+BEGIN_IMPORTANT`, `#+BEGIN_WARNING` and `#+BEGIN_CAUTION` blocks | Callouts |
| Files under `assets` that a page shows or links to | Copied to the attachments folder |

Not carried over:

- **Org-mode pages.** They are left out and listed with the reason `Org-mode pages are not supported.`
- **Whiteboards and drawings.**
- **Flashcard scheduling.**
- **PDF highlight data.**
- **Queries.** They stay as their text.
- **`:LOGBOOK:` drawers.** They are dropped.
- **The size written after a picture**, such as `{:height 200, :width 300}`. It is removed.
- **Files under `assets` that nothing points at.**
- **Pages with nothing written on them.**

## Bear

The dialog says: "In Bear, choose File, Export Notes, as Textbundle or as a Bear backup. Choose the file, or the folder the notes were exported to."

| Button | What to pick |
|---|---|
| **Choose file** | A `.bear2bk`, `.textpack`, `.textbundle` or `.zip` file |
| **Choose folder** | A folder that holds the exported notes |

| In Bear | In Noteriv |
|---|---|
| The note | Kept as the Markdown it is. The note is named after its first line when that is a top-level heading, and otherwise after its bundle |
| Files in the note's `assets` folder | Attachments. One that the text never mentions is added at the end of the note |
| Created and modified dates | `created` and `updated` |
| Pinned and archived | `pinned: true` and `archived: true` |
| `[[Other note]]`, `[[Title/Heading]]` and `[[Title\|shown]]` | Links to the other note by its final name, when that note is in the import |
| Links that start with `bear://x-callback-url/open-note?id=` | Links to the other note, when that note is in the import |
| A picture's width, which Bear writes after it as `<!-- {"width":300} -->` | `![[photo.png\|300]]` |

Not carried over:

- **Bear's `ApplicationData.zip` from iOS.** It is a database, not Textbundles, and is not read.
- **Tags.** They stay in the text as written, including `#tags with spaces#`, and are not added to `tags`.
- **Encrypted notes.** A backup holds them only in encrypted form.

### Notes in Bear's trash

**Import the notes in the trash too** is off to begin with. When it is off, a note that is in Bear's trash is left out and listed with the reason `It is in the trash in Bear.` When it is on, the note is imported with the property `trashed: true`.

## Textbundle

The dialog says: "Choose a .textbundle or .textpack, or a folder or zip that holds several."

| Button | What to pick |
|---|---|
| **Choose file** | A `.textpack`, `.textbundle` or `.zip` file |
| **Choose folder** | One Textbundle, or a folder that holds several |

A Textbundle is a folder that holds one note: the text in `text.md`, `text.markdown` or `text.txt`, an `info.json`, and an `assets` folder with the files the note shows. A Textpack is that folder zipped. A folder or zip can hold any mix of the two.

| In the Textbundle | In Noteriv |
|---|---|
| The text | Kept as the Markdown it is. The note is named after its first line when that is a top-level heading, and otherwise after the bundle |
| Files in `assets` | Attachments. `![](assets/photo.png)` becomes an embed and `[paper](assets/paper.pdf)` a link. A file that the text never mentions is added at the end of the note |
| `sourceURL` in `info.json` | `source` |

Bear's exports are Textbundles with more written into `info.json`, so this source reads them too and carries over what [Bear](#bear) does. It has no trash option: a note marked as being in Bear's trash is left out. To bring those in, pick **Bear** as the source.

## HTML files

The dialog says: "Choose one .html file, or a folder or zip of them. Pictures and files the pages link to next to them come along."

| Button | What to pick |
|---|---|
| **Choose file** | One `.html` or `.htm` file, or a `.zip` file of pages |
| **Choose folder** | A folder of pages. Files ending in `.html`, `.htm` and `.xhtml` are read, in the folder and the folders inside it |

| In the page | In Noteriv |
|---|---|
| Each page | A note named after the file, in the same folder it was in |
| The page's `<title>` | `title`, when it says something other than the note's name |
| The address the page names as canonical | `source` |
| The content | Converted to Markdown. When the page has exactly one `<main>` or exactly one `<article>`, only that part is imported. Otherwise the whole page is |
| Pictures that lie next to the page | Copied to the attachments folder and embedded |
| Pictures written into the page as `data:` addresses | Saved as attachments named after the note |
| Pictures on the web | Stay links to the web |
| Links to another page of the same import | Links to that page's note |
| Links to another file next to the page, such as a PDF | The file is copied to the attachments folder and linked |

"Next to the page" is meant strictly. Only files inside the folder you chose are read. For a single page, that is the folder the page is in. A link that leads outside that folder, or a `file:///` address, is left as it is and nothing is copied.

Not carried over:

- **Styling, scripts and forms.**
- **Embedded video and audio.**
- **Pages with no text.** They are left out and listed with the reason `The page has no text in it.`
- **A link to a page that is not part of the import.** It stays as written.
- **Text in most encodings other than UTF-8.** A page that is not valid UTF-8 is read as Windows-1252. Other encodings come out wrong.

### How HTML is converted

Evernote notes and HTML files go through the same converter.

| HTML | Markdown |
|---|---|
| Headings, paragraphs, lists, quotes and horizontal rules | The same in Markdown |
| `<br>` | A plain line break |
| Bold, italics and struck-through text | `**bold**`, `*italics*` and `~~struck~~`, also when the page says it with a style and not a tag |
| `<mark>` | `==highlight==` |
| `<code>`, `<kbd>` and `<samp>` | Inline code |
| `<pre>` | A fenced code block, with the language when the page names one as `class="language-rust"` |
| Tables | Markdown tables. The first row becomes the header row |
| A table inside a table, or a table with one column | Treated as page layout. The cells are written one after another |
| Checkboxes | Task lines |
| `<sup>` and `<sub>` | Kept as those tags |
| Underline, fonts and colours | The text is kept and the styling is lost |
| Links to a place in the same page, and `javascript:` links | The text is kept and the link is dropped |
| `<script>`, `<style>`, `<svg>`, `<math>`, `<iframe>`, `<canvas>`, `<audio>`, `<video>`, `<button>`, `<select>` and `<textarea>` | Left out |

## CSV table

The dialog says: "Choose a .csv file. Every row becomes a note, and every column a property."

| Button | What to pick |
|---|---|
| **Choose file** | One `.csv`, `.tsv` or `.txt` file. Its notes go straight into the destination folder |
| **Choose folder** | A folder of `.csv` files. Only files directly in the folder that end in `.csv` are read. Each file's notes go into a folder named after the file |

How a file is read:

- The first row names the columns. A column with no name is called by its position, such as `Column 3`.
- Every later row becomes a note. A row in which every cell is empty is skipped.
- The separator is whichever of comma, semicolon and tab the first line uses most. With none of them, it is a comma.
- A cell in quotes can hold the separator, line breaks and, written `""`, a quotation mark.

| In the table | In Noteriv |
|---|---|
| Each row | A note with properties and no text |
| Each column | A property named after the column. Characters a property name cannot hold, such as `:`, are removed |
| An empty cell | Left out |
| A number, `true` or `false` | Stays a number or a true/false value. A number with leading zeros, such as `007`, stays text |
| Cells past the last named column | Properties named by position, such as `Column 6` |

### The column that names each note

**Column that names each note** sets which column the notes are named after. The box is empty to begin with and reads `The first column, unless you name another`. To use another column, type its name as it is in the first row. Case is ignored.

A row with nothing in that column is named `Untitled`. If the file has no column of that name, it is not imported, and the reason names the column: `The file has no column named "Email".`

## When an import is refused

An import is refused when the export holds nothing it can import, or when the destination folder cannot be used. The reason is shown in place of the result sentence, and nothing is written to the vault.

| Message | When |
|---|---|
| `This is Notion's HTML export. Export from Notion again and choose "Markdown & CSV" as the format.` | Notion: the export has `.html` files and no pages or databases |
| `No Notion pages were found. Choose the zip file Notion made, or the folder it was unzipped into.` | Notion: nothing in what you chose is a page or a database |
| `No notes were found. The file does not look like an Evernote export (.enex).` | Evernote: the file holds no notes |
| `The folder has no Evernote export (.enex) files in it.` | Evernote: a folder with no `.enex` files directly in it |
| `No Google Keep notes were found. Choose the Takeout zip file, or the folder it was unzipped into.` | Google Keep: the export has no `.json` files |
| `No Roam Research export (.json) was found there.` | Roam Research: the zip has no `.json` file |
| A message that starts with `The file is not a Roam Research JSON export` | Roam Research: the file is not a list of pages |
| `The export has no pages in it.` | Roam Research: the list holds no pages |
| `No Logseq graph was found. Choose the folder that holds the "pages" and "journals" folders.` | Logseq: no `pages`, `journals` or `logseq` folder was found |
| `The graph has no pages with anything written on them.` | Logseq: every page is empty |
| `No notes were found. Choose a Bear backup (.bear2bk), a Textbundle or Textpack, or a folder or zip of them.` | Bear and Textbundle: what you chose holds no `text.md`, `text.markdown` or `text.txt` file, so there is no Textbundle in it |
| `No HTML files were found there.` | HTML files: the folder or zip has no pages |
| `The file is empty.` | CSV table: the file has no rows |
| `The file has a header row and no rows below it.` | CSV table: only the first row is there |
| `The folder has no CSV files in it.` | CSV table: a folder with no `.csv` files directly in it |
| `The file is not a zip archive, or it is damaged.` | A file was chosen where a zip is expected, and it could not be opened as one |
| `The file or folder to import could not be found.` | The export is no longer where it was when you chose it |
| `The destination folder has to be a folder inside the vault, not a full path.` | **Folder in the vault** starts with `/` or a drive letter |
| A folder name in quotes, followed by `cannot be used as a folder name in the destination folder.` | **Folder in the vault** has a part that is `..`, starts with a dot or a space, ends with a dot or a space, or holds one of `:`, `*`, `?`, `"`, `<`, `>` or `\|` |
| `The destination folder is outside the vault.` | The folder is a link that leads out of the vault |

### Reasons in the list of items left out

These do not stop the import. Each is shown beside the name of the note, attachment or file it is about. The reasons include:

| Reason | What was left out |
|---|---|
| `It is in the trash in Google Keep.` and `It is in the trash in Bear.` | A note in the trash, when **Import the notes in the trash too** is off |
| `Org-mode pages are not supported.` | A Logseq page written in Org mode |
| `The page has no text in it.` | An HTML page with nothing to show |
| `It is not a Google Keep note.` | A `.json` file in a Takeout that is something else |
| `The attachment is missing from the export.` | A Google Keep attachment that a note names and the export does not hold |
| `The attachment's data is damaged.` | An Evernote attachment that could not be decoded. The note is still imported |
| A reason that ends with `The notes before that point were imported.` | The rest of an Evernote file that is damaged or cut off part of the way through |
| `The database file is empty.` | A Notion database file with nothing in it |
| `Its path leads out of the archive.` and `Its path is absolute, which an export never needs.` | A file in a zip whose path points outside the zip |
| `The file is too large to read.` | A page, note or data file larger than 256 MB, in a folder or zip read for Notion, Google Keep, Logseq, Bear, Textbundle or HTML files, or in a Roam Research zip. Attachments are copied without this limit |
| `Its content could not be converted to Markdown.` | An Evernote note or an HTML page the converter failed on |
| `A file with this name already exists.` | A note whose name turned out to be taken when it was written |

## Obsidian vaults

An Obsidian vault needs no import. Open the folder as a vault and your notes are there. See [Coming from Obsidian](./from-obsidian.md).
