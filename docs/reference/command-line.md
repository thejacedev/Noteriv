---
title: Command Line and Links
order: 6
---

# Command Line and Links

Noteriv can be driven from a terminal with the `noteriv` command, and from other programs with `noteriv://` links. A command or a link can open a note, create one, or show a search in the app's window. Other commands print notes, search results and tags in the terminal, with no window at all. Both belong to the desktop app and are newer than version 2.4.13.

## How It Works

Noteriv runs as one copy. If you start it while it is already running, the second copy hands its arguments to the first and ends. That is how a command such as `noteriv open Plan`, or a link you click, reaches the window that is already open.

There are two kinds of command:

| Kind | Commands | Needs the window |
|---|---|---|
| Commands that use the window | `open`, `new`, `daily`, `unique`, `search --open`, `noteriv <file.md>`, and every link | Yes |
| Commands that print | `vaults`, `list`, `read`, `search`, `tags`, `create`, `append`, `help`, `version` | No |

### Commands That Use the Window

- If Noteriv is running, the request is handed to it and its window is brought to the front. The command you typed ends.
- If Noteriv is not running, the command starts it, and the app carries out the request when its window is ready. The command you typed is then the app itself, so it keeps running until you close Noteriv.
- `noteriv` with nothing after it starts Noteriv, or brings its window to the front.

When the app cannot do what was asked, for example because the note is not there, it says so in the status bar at the bottom of its window for eight seconds. Nothing is printed in the terminal.

### Commands That Print

These are carried out by the copy you started, before any window is made. They work whether or not Noteriv is running, and they read and write the files of the vault directly. What you asked for goes to standard output. Messages go to standard error.

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | The command worked. A search that finds nothing also ends with `0` |
| `1` | The command was understood and could not be carried out, for example because there is no such note. The message starts with `noteriv: ` |
| `2` | The command line could not be read: an option the command does not have, a missing value, too many arguments. The message is followed by a `Usage:` line |

```text
$ noteriv read Gamma
noteriv: There is no note "Gamma" in the vault.
$ noteriv read
`noteriv read` needs a note.
Usage: noteriv read <note>
```

Codes `0` and `1` come from the commands that print. Code `2` can come from any command, because the line is read before anything is handed to the app.

Only a line that starts with a command is checked this way. If the first word is not a command, as in `noteriv serach meeting`, there is no error: Noteriv starts, or comes to the front.

## Writing a Command

```text
noteriv <command> [options]
```

| Option | What it does |
|---|---|
| `--vault <name\|id\|folder>` | The vault to use. Without it, the vault that is open in the app |
| `--json` | Print JSON. Taken by `vaults`, `list`, `search` and `tags` |
| `-h`, `--help` | Show help. After a command, show the help for that command |
| `-V`, `--version` | Print the version |

How a line is read:

- A value follows its option after a space or after `=`: `--vault Work` and `--vault=Work` are the same.
- Options can come before or after the command: `noteriv --vault Work list` and `noteriv list --vault Work` are the same.
- An option that takes a value can be given once. Twice is an error.
- A value is taken as it is written, even when it starts with a dash: `--content "- [ ] milk"`.
- Other text that starts with a dash goes after `--`: `noteriv search -- -draft`.
- A name or a query with spaces in it goes in quotes.
- An option a command does not have is an error, for example `--json` with `read`.
- `--version`, `-V`, and `--help` with no command are read only as the first thing on the line.

## Choosing a Vault

`--vault` names the vault a command works in. You can give:

| Form | Example | Notes |
|---|---|---|
| The vault's name | `--vault Work` | Capitals do not matter |
| The vault's id | `--vault mhx3k2p9a1b2c3` | `noteriv vaults --json` prints the ids |
| The vault's folder | `--vault ~/Notes/Work` | The full path of the folder |

The id is tried first, then the name, then the folder.

Without `--vault`, the command uses the vault that is open in the app. When Noteriv is not running, that is the vault it had open last.

A vault is always one of the vaults Noteriv already has (see [Vaults](../getting-started/vaults.md)). Naming some other folder does not make a vault of it.

What happens when no vault can be chosen:

| Case | Message |
|---|---|
| Nothing matches | `There is no vault "Nope". The vaults are: Work, Personal` |
| Two vaults have the name | `More than one vault is named "work". Use its id or its folder instead:` and then each of them with its id and folder |
| No `--vault`, and no vault is open | `No vault is open in Noteriv. Say which to use with --vault.` |
| There are no vaults | `There are no vaults yet. Open Noteriv and create one first.` |
| The vault's folder is gone (commands that print only) | `The folder of the vault "Personal" is not there:` and then the folder |

A command that prints shows the message in the terminal and ends with code `1`. A command that uses the window shows it in the app's status bar.

When a command that uses the window names a vault other than the one that is open, the app switches to that vault first. `--vault` with no command opens the vault:

```bash
noteriv --vault Work
```

## Naming a Note

What a command takes as its note depends on the command:

| Commands | The argument is |
|---|---|
| `open`, `read`, `append` | A note that exists, looked up by its name or by its path inside the vault |
| `new`, `create` | The path of the note to make, from the top of the vault |
| `noteriv <file.md>`, and `open` with a full path or one that starts with `./` or `../` | A file on this computer. See [Opening a File by Path](#opening-a-file-by-path) |

### A Note That Exists

A note is found the way a `[[wiki-link]]` finds it:

| You write | It finds |
|---|---|
| `Alpha` | The note named `Alpha`, in whatever folder it is |
| `Projects/Alpha` | The note at that path from the top of the vault |
| `alpha.md`, `ALPHA` | The same note: `.md` or `.markdown` can be left off, and capitals do not matter |

Things to know:

- A name with a `/` in it is always the whole path from the top of the vault. `Work/Alpha` does not find `Projects/Work/Alpha.md`.
- `\` is read as `/`.
- Only notes are found: files that end in `.md` or `.markdown`. Notes in a hidden folder (one whose name starts with a dot, such as `.noteriv`), in `node_modules`, or behind a symbolic link are not found.
- If two notes have the same name, there is no error. The first of them in path order is used. To be sure which note you get, give its path.
- If nothing is found, the message is `There is no note "Gamma" in the vault.`

`open` also refuses, with exit code `2`, a name that could not be a path inside the vault, such as `Projects/../../Plan` or a name in a hidden folder.

### A Note to Make

For `new` and `create`, the name is where the note will be:

- `.md` is added unless the name already ends in `.md` or `.markdown`. `Meeting 2.5` becomes `Meeting 2.5.md`, and `run.sh` becomes `run.sh.md`.
- Folders in the name are created if they do not exist.
- The name has to stay inside the vault. A full path, a drive letter, a path that starts with `~/`, a `.` or `..` part, an empty part (as in `a//b`) and a part that starts with a dot are all refused.
- On Windows, a name that Windows does not allow for a file is refused as well: one with any of `< > : " | ? *` in it, one that ends in a dot or a space, or a device name such as `CON` or `LPT1`.

## Commands

| Command | What it does | Kind |
|---|---|---|
| `noteriv` | Start Noteriv, or bring its window to the front | Window |
| `noteriv <file.md>` | [Open a note file](#opening-a-file-by-path) | Window |
| `noteriv <noteriv://link>` | [Follow a link](#links) | Window |
| [`open [note]`](#open) | Open a note, or just the vault | Window |
| [`new [name]`](#new) | Create a note, or add text to one | Window |
| [`daily`](#daily) | Open today's daily note | Window |
| [`unique`](#unique) | Create a note named by the date and time | Window |
| [`search [query] --open`](#search) | Show a search in the app | Window |
| [`vaults`](#vaults) | List the vaults | Prints |
| [`list [folder]`](#list) | List the notes in the vault, or in one folder | Prints |
| [`read <note>`](#read) | Print a note | Prints |
| [`search <query>`](#search) | Search the notes | Prints |
| [`tags`](#tags) | List the tags, with how many notes use each | Prints |
| [`create <name>`](#create) | Create a note | Prints |
| [`append <note>`](#append) | Add text to the end of a note | Prints |
| [`help [command]`](#help) | Show the help, or the help for one command | Prints |
| [`version`](#version) | Print the version | Prints |

Every command except `vaults`, `help` and `version` also takes `--vault`. It is left out of the option tables below.

### open

```text
noteriv open [note] [--line N] [--heading TEXT]
```

Opens a note in Noteriv, starting the app if it is not running. With no note, it opens the vault.

| Option | What it does |
|---|---|
| `--line N` | Go to this line. Lines are counted from 1 |
| `--heading TEXT` | Go to this heading |

- The note is [a note that exists](#a-note-that-exists) in the vault. A full path, or a path that starts with `./` or `../`, is [a file on this computer](#opening-a-file-by-path) instead.
- `--heading` takes the text of a heading without its `#`. Capitals do not matter, and the heading can be of any level. If the note has no such heading, the note is opened and nothing more.
- With both `--line` and `--heading`, the line is used.
- `--line` and `--heading` need a note.
- A `#` in the name is part of the name: `noteriv open "C# notes"` opens the note called `C# notes`.

```bash
noteriv open "Projects/Alpha" --line 12
noteriv open Alpha --heading "Next steps" --vault Work
```

### new

```text
noteriv new [name] [--content TEXT] [--silent]
                   [--append | --prepend | --overwrite]
```

Creates a note in Noteriv and opens it.

| Option | What it does |
|---|---|
| `--content TEXT` | The text of the note |
| `--append` | Add the text to the end of the note if it exists |
| `--prepend` | Add the text to the start of the note if it exists |
| `--overwrite` | Replace the note if it exists |
| `--silent` | Do not open the note |

Where the note goes:

- With a name that has a folder in it, such as `Projects/Alpha`, the note is made at [that path](#a-note-to-make) from the top of the vault.
- With a name that has no folder in it, the note goes in the folder set by [New notes go](../features/file-settings.md#where-new-notes-go).
- With no name, the note is called `Untitled.md`, or `Untitled 2.md`, `Untitled 3.md` and so on if that is taken. It goes in the same folder.

If the setting is **Beside the open note**, the folder of the note open in the app is used when the request is for the vault that is open. For another vault, or with no note open, the top of the vault is used.

When a note with that name is already there:

| Option | What happens |
|---|---|
| None of the three | The note is left alone, and the new note takes the next free name: `Plan.md` becomes `Plan 2.md` |
| `--append` | The text is added at the end, on a line of its own |
| `--prepend` | The text is added at the start. If the note begins with a properties block, the text goes below it |
| `--overwrite` | The note's text is replaced by `--content`. With no `--content`, the note is left empty |

Rules:

- Only one of `--append`, `--prepend` and `--overwrite` can be given.
- All three need a name. `--append` and `--prepend` also need `--content`.
- With `--append` or `--prepend`, a note that does not exist is created with the text.

```bash
noteriv new "Projects/Idea" --content "# Idea"
noteriv new Inbox --append --content "- [ ] milk" --silent
```

### daily

```text
noteriv daily
```

Opens today's daily note in Noteriv, creating it if there is none. It does what the app's own command for the daily note does: see [Daily Notes](../features/daily-notes.md). The command takes nothing after it except `--vault`.

```bash
noteriv daily --vault Work
```

### unique

```text
noteriv unique [--content TEXT]
```

Creates a note named by the date and time, such as `202611131045.md`, and opens it in Noteriv. The name is made as described in [Unique Notes](../features/file-settings.md#unique-notes).

| Option | What it does |
|---|---|
| `--content TEXT` | The text of the note |

The note goes in the folder set by [New notes go](../features/file-settings.md#where-new-notes-go), with the same rule for **Beside the open note** as [`new`](#new).

```bash
noteriv unique --content "Call back about the invoice"
```

### search

```text
noteriv search <query> [--json] [--limit N]
noteriv search [query] --open
```

Searches the notes and prints the result. With `--open`, it shows the search in Noteriv instead.

| Option | What it does |
|---|---|
| `--limit N` | Print at most N notes. N is a whole number from 1 up |
| `--json` | Print the result as JSON |
| `--open` | Show the search in Noteriv instead of printing it |

The query is written as in the app's search: see [Search Queries](../features/search.md#search-queries). It is one argument, so put a query with spaces in quotes. A query that starts with a dash goes after `--`.

Each matching line is printed as `path:line: text`. A note that matches by its name, a tag or a property, with no line to show, is printed as its path alone.

```text
$ noteriv search meeting
Projects/Alpha.md:6: Meeting notes for alpha. #work
Projects/Beta.md:1: Beta has no meeting. #Work #todo
$ noteriv search "tag:#todo"
Inbox.md
Projects/Beta.md
```

How the search works:

- Notes are printed in the order of their paths.
- Case is ignored, unless the query uses `match-case:`.
- Only notes are searched, and notes in hidden folders are left out. The [Excluded files](../features/file-settings.md#excluded-files) setting is not applied: the command searches every note.
- At most 500 notes are printed, and 30 matching lines for each note. A line longer than 400 characters is cut off.
- When something is left out, a message on standard error says so, and the exit code is still `0`. These messages are not printed with `--json`:

  ```text
  noteriv: 2 notes match; the first 1 are shown.
  noteriv: 12 more matching lines are not shown.
  ```

- When nothing matches, nothing is printed, and the exit code is `0`.
- A query that cannot be read, for example one with a quote that is not closed, ends with code `1` and the reason.

With `--json`, the result is printed as one JSON object. This is `noteriv search meeting --json --limit 1`:

```json
{
  "files": [
    {
      "filePath": "/home/you/Notes/Work/Projects/Alpha.md",
      "relativePath": "Projects/Alpha.md",
      "name": "Alpha.md",
      "mtime": 1794591000000,
      "ctime": 1794504600000,
      "lines": [
        {
          "line": 6,
          "text": "Meeting notes for alpha. #work",
          "ranges": [
            [
              0,
              7
            ]
          ]
        }
      ],
      "moreLines": 0
    }
  ],
  "totalFiles": 2,
  "error": null
}
```

| Field | Meaning |
|---|---|
| `files` | The matching notes, in the order of their paths, cut to `--limit` if it is given |
| `filePath` | The note's full path |
| `relativePath` | The note's path inside the vault |
| `name` | The note's file name |
| `mtime`, `ctime` | When the note was last changed and when it was created, in milliseconds since the start of 1970 |
| `lines` | The matching lines. `line` is the line number, `text` is the line, and `ranges` holds the start and end of each match in `text`, counted in UTF-16 units |
| `moreLines` | How many more lines of the note match than are listed |
| `totalFiles` | How many notes match, including the ones not listed |
| `error` | Always `null`. A query that cannot be read ends with code `1` and prints no JSON |

`--open` shows the search in the app's Vault Search panel with the query filled in. With no query, it opens the panel. `--json` and `--limit` cannot be used with `--open`.

```bash
noteriv search "path:Projects/ status report" --limit 5
noteriv search "tag:#work task-todo:call" --open
```

### vaults

```text
noteriv vaults [--json]
```

Lists the vaults, one on a line: the name and the folder with a tab between them, and `*` before the vault that is open in the app.

```text
* Work      /home/you/Notes/Work
  Personal  /home/you/Notes/Personal
```

| Option | What it does |
|---|---|
| `--json` | Print them as JSON, with their ids |

```json
[
  {
    "id": "mhx3k2p9a1b2c3",
    "name": "Work",
    "path": "/home/you/Notes/Work",
    "active": true
  },
  {
    "id": "mhx3k4t7d4e5f6",
    "name": "Personal",
    "path": "/home/you/Notes/Personal",
    "active": false
  }
]
```

`active` is `true` for the vault that is open in the app. With no vaults, nothing is printed, or `[]` with `--json`.

### list

```text
noteriv list [folder] [--json]
```

Lists the notes in the vault, or in one folder of it and the folders inside that. Each note is printed as its path inside the vault, in the order of the paths. Hidden folders, such as `.noteriv` and `.git`, are left out.

| Option | What it does |
|---|---|
| `--json` | Print the paths as a JSON list |

```text
$ noteriv list
Inbox.md
Projects/Alpha.md
Projects/Beta.md
$ noteriv list Projects --json
[
  "Projects/Alpha.md",
  "Projects/Beta.md"
]
```

The folder is a path from the top of the vault. Capitals do not matter, and a `/` at the end is ignored. A folder with no notes in it prints nothing. A folder that is not there ends with code `1` and `There is no folder "Nowhere" in the vault.`

### read

```text
noteriv read <note>
```

Prints a note. The text is printed exactly as it is in the file, with nothing added. The note is [a note that exists](#a-note-that-exists).

```bash
noteriv read Alpha
noteriv read "Projects/Alpha" --vault Work
```

### tags

```text
noteriv tags [--json]
```

Lists the [tags](../features/tags.md) in the vault, each with the number of notes that use it. The tag and the number have a tab between them.

```text
Project/Alpha   1
todo            2
work            2
```

| Option | What it does |
|---|---|
| `--json` | Print them as JSON |

```json
[
  {
    "tag": "Project/Alpha",
    "count": 1
  },
  {
    "tag": "todo",
    "count": 2
  },
  {
    "tag": "work",
    "count": 2
  }
]
```

- Tags in a note's text and in its properties both count. A note that has a tag more than once is counted once.
- Capitals do not matter: `#Work` and `#work` are one tag. It is printed the way it is written where it is first found.
- A nested tag such as `Project/Alpha` is listed as a tag of its own.
- Tags are printed without the `#`, in alphabetical order.

### create

```text
noteriv create <name> [--content TEXT | --stdin] [--overwrite]
```

Creates a note and prints its path inside the vault. The name is [the path of the note to make](#a-note-to-make).

| Option | What it does |
|---|---|
| `--content TEXT` | The text of the note |
| `--stdin` | Read the text from standard input |
| `--overwrite` | Replace the note if it exists. Without this, an existing note is left alone and the command fails |

- With neither `--content` nor `--stdin`, the note is empty. The two cannot be used together.
- The note goes where the name says. A name with no folder in it puts the note at the top of the vault. The **New notes go** setting is not used.
- If the note exists and `--overwrite` is not given, the command ends with code `1`:

  ```text
  noteriv: Inbox.md already exists. To replace it use --overwrite; to add to it use `noteriv append`.
  ```

- A name that differs from an existing file only in capitals is refused, with or without `--overwrite`.
- Standard input can hold up to 16 MB of text, and it has to be UTF-8.
- Nothing is written through a symbolic link.

```text
$ noteriv create "Areas/Home/Garden" --content "Roses"
Areas/Home/Garden.md
$ date | noteriv create "Logs/Today" --stdin
Logs/Today.md
```

`create` and [`new`](#new) differ. `new` asks the app to make the note: it opens the note, and gives it another name if the name is taken. `create` writes the file itself, prints the path, and fails if the name is taken.

### append

```text
noteriv append <note> (--content TEXT | --stdin)
```

Adds text to the end of a note, on a new line, and prints the note's path inside the vault.

| Option | What it does |
|---|---|
| `--content TEXT` | The text to add |
| `--stdin` | Read the text from standard input |

- One of the two options has to be given, and not both.
- The note is [a note that exists](#a-note-that-exists). `append` does not create a note: if there is none, the command ends with code `1`.
- If the note does not end with a new line, one is put before the text. Nothing is added after the text.
- Empty text is an error: `There is no text to add.`
- Standard input can hold up to 16 MB of text, and it has to be UTF-8.

```text
$ noteriv append Inbox --content "- [ ] reply to Sam"
Inbox.md
$ echo "Call the baker" | noteriv append "Projects/Alpha" --stdin
Projects/Alpha.md
```

### help

```text
noteriv help [command]
```

Shows the help, or the help for one command. `noteriv --help` and `noteriv -h` show the same help, and `--help` or `-h` after a command shows the help for that command.

```bash
noteriv help search
noteriv create --help
```

### version

```text
noteriv version
```

Prints `noteriv` and the version number on one line. `noteriv --version` and `noteriv -V` do the same.

## Opening a File by Path

```text
noteriv <file.md>
```

Give `noteriv` the path of a note file and the app opens it.

- The path can be a full path or one from the current folder. A `file://` address, which a file manager may pass in place of a path, works too.
- The file has to exist, and its name has to end in `.md` or `.markdown`.
- If the path names no such file, nothing is opened and there is no error: Noteriv starts, or comes to the front.

Where the file is decides how it opens:

| The file is | What happens |
|---|---|
| In one of your vaults | It opens in that vault. If another vault is open, the app switches first. If the file is in two vaults, one inside the other, the inner one is used |
| In no vault | It opens anyway, because you named it yourself. Noteriv is given access to that one file for as long as it runs |

`noteriv open` does the same when its note is a full path, or a path that starts with `./` or `../`, and it can take `--line` and `--heading`:

```bash
noteriv ~/Notes/Work/Inbox.md
noteriv open ./Inbox.md --line 3
```

`noteriv open Inbox.md`, with no `./`, looks for a note called `Inbox` in the vault, not for a file in the current folder. If `open` is given a path where there is no file, the app's status bar says `That file is not in one of your vaults.`

## Links

A `noteriv://` link asks the app to do one thing. It can be put on a web page, in a document or in another program. When it is followed, the system hands it to Noteriv, which starts if it is not running.

```text
noteriv://<action>?<name>=<value>&<name>=<value>
```

| Action | What it does | Parameters |
|---|---|---|
| `open` | Open a note, or just the vault | `vault`, `file`, `path`, `line`, `heading` |
| `new` | Create a note, or add text to one | `vault`, `file`, `name`, `content`, `append`, `prepend`, `silent` |
| `daily` | Open today's daily note | `vault` |
| `unique` | Create a note named by the date and time | `vault`, `content` |
| `search` | Show a search in the app | `vault`, `query` |

Every action is carried out in the app's window, in the same way as the command of the same name. There are no links for the commands that print.

How a link is read:

- `vault` names the vault as [`--vault`](#choosing-a-vault) does: by name, id or folder. Without it, the vault that is open in the app is used.
- Parameter names are written in lower case. A parameter that is not in the table is ignored. If a parameter with a value is given twice, the first value is used.
- The action can be in any capitals, and so can `noteriv` at the start.
- `noteriv://`, with nothing after it, brings Noteriv to the front.
- If a link cannot be read, the app still comes up, and its status bar says `That link could not be followed.` and why.

An AppImage is not installed, so nothing tells the system that `noteriv://` links are for it. It registers the links itself each time it starts: run it once before you follow a link.

### Open Links

```text
noteriv://open?vault=<vault>&file=<note>
```

| Parameter | Meaning |
|---|---|
| `file` | The note, by its name or its path inside the vault, as for [`noteriv open`](#a-note-that-exists) |
| `path` | The full path of a file, in place of `vault` and `file`. The file has to be in one of your vaults |
| `line` | The line to go to, counted from 1 |
| `heading` | The heading to go to |

- With `vault` alone, the link opens that vault.
- A heading can also be written after a `#`: at the end of `file`, where the `#` is written `%23`, or at the very end of the link. `file=Plan%23Tasks` and `file=Plan#Tasks` both open `Plan` at the heading `Tasks`. Because of this, `file` cannot name a note that has a `#` in its name.
- With both `line` and a heading, the line is used.

Two shorter forms open a note as well:

```text
noteriv://vault/<vault>/<path of the note>
noteriv:///<full path of a file>
```

The first is the same as `open` with `vault` and `file`, and the second is the same as `open` with `path`. Both can be followed by `?line=`, `?heading=` or `#Heading`.

### New Links

```text
noteriv://new?file=<note>&content=<text>
```

| Parameter | Meaning |
|---|---|
| `file` | [The path of the note to make](#a-note-to-make), or of the note to add to |
| `name` | The same. It is used when there is no `file` |
| `content` | The text |
| `append` | Add the text to the end of the note |
| `prepend` | Add the text to the start of the note |
| `silent` | Do not open the note |

`append`, `prepend` and `silent` are switched on by being in the link: `&append` and `&append=true` both work. Written with the value `false`, `0`, `no` or `off`, they are off.

A `new` link follows the rules of [`noteriv new`](#new): with no name the note is untitled, a name that is taken gets the next free name, and `append` and `prepend` need a name and `content`. With both `append` and `prepend`, the text is added at the end.

A `new` link cannot use `overwrite` or `path`. See [What a Link Cannot Do](#what-a-link-cannot-do).

### Daily, Unique and Search Links

| Link | What it does |
|---|---|
| `noteriv://daily` | Opens today's daily note, creating it if there is none |
| `noteriv://unique` | Creates a note named by the date and time. `content` is its text |
| `noteriv://search?query=<query>` | Shows the search in the app. With no `query`, it opens the search panel |

### Encoding Values

A value in a link has to be encoded, so that the characters that have a meaning in a link are not taken for part of it.

| To write | In a parameter | In the path of a shorter form |
|---|---|---|
| A space | `%20` or `+` | `%20` |
| `+` | `%2B` | `+` |
| `/` | `/` or `%2F` | `/` or `%2F` |
| `&` | `%26` | `&` |
| `#` | `%23` | `%23` |
| `%` | `%25` | `%25` |
| A new line | `%0A` | Not used |

Other characters, such as accented letters, can be written as they are or as the `%XX` bytes of their UTF-8 form.

In a shorter form, `%23` gives a `#` in the vault's name and in a full path. In the note part of `noteriv://vault/...` it starts a heading, as it does in `file`.

### Example Links

```text
noteriv://open?vault=Work&file=Projects%2FAlpha&line=12
noteriv://vault/Work/Projects/Alpha#Tasks
noteriv://new?file=Inbox&append=true&content=Buy%20milk
noteriv://search?vault=Work&query=tag%3A%23work%20meeting
```

The first opens `Projects/Alpha` in the vault `Work` at line 12. The second opens the same note at the heading `Tasks`. The third adds `Buy milk` to the end of `Inbox`, after asking. The fourth shows a search for `tag:#work meeting`.

To try a link from a terminal, give it to the command in quotes:

```bash
noteriv "noteriv://open?vault=Work&file=Projects%2FAlpha"
```

### What a Link Cannot Do

A link can be made by anyone and can reach you from any web page, so Noteriv does not trust it. A link that is refused does nothing at all: it is not turned into a milder request.

| A link cannot | What happens |
|---|---|
| Do anything but the five actions | `Noteriv links cannot do "delete". They can open, new, daily, unique and search.` |
| Name a note outside the vault | `file` and `name` have to be paths inside the vault, by the rules in [A Note to Make](#a-note-to-make): no full path, no `..`, nothing in a hidden folder such as `.noteriv` |
| Open a file outside your vaults | `path` is only for opening, and only for a file that is in one of your vaults. A file in a hidden folder, or one that a symbolic link takes out of the vault, does not count. The app says `That file is not in one of your vaults.` |
| Create a note by full path | A `new` link with `path` is refused |
| Replace a note | A `new` link with `overwrite` is refused: `This link asks to replace a note. A link is not allowed to do that.` |
| Create anything but a note | The name always gets `.md`, unless it ends in `.md` or `.markdown` |
| Carry more than 1024 KB of text | `content` can be at most 1,048,576 bytes once decoded: `This link carries more text than a link may: the most is 1024 KB.` |
| Write without asking | See [Before a Link Writes](#before-a-link-writes) |

Other sizes are limited too:

| Part of the link | Limit |
|---|---|
| The whole link | 4,194,304 bytes (4 MB). A longer link is not read: `This link is too long to read.` |
| `vault`, `file`, `name`, `heading` | 1,024 bytes each |
| `path`, `query` | 4,096 bytes each |

### Before a Link Writes

Before a link creates a note or adds to one, the app asks. The question names what the link wants to do:

| The link would | The question |
|---|---|
| Create a note with a name | `A link wants to create "Inbox.md"` |
| Create an untitled note | `A link wants to create a new note` |
| Add text to the end of a note | `A link wants to add text to the end of "Inbox.md"` |
| Add text to the start of a note | `A link wants to add text to the start of "Inbox.md"` |
| Create a unique note | `A link wants to create a new note named by the time` |
| Open the daily note | `A link wants to open today's daily note` |

Under the question, the app says:

```text
Links can come from anywhere. Go ahead only if you meant to follow this one.
```

If the link carries text, the first 300 characters of it are shown below that. For the daily note the line reads `The note is created if there is none yet.` instead, and the app asks even when today's note already exists.

The buttons are **Cancel** and **Go ahead**. Nothing is written unless you choose **Go ahead**. Links that open a note or show a search are followed without a question.

## Typed Commands and Links

A command you type is trusted, because you typed it. A link is not, because anything can make one. The same request is treated differently:

| | A command you type | A link |
|---|---|---|
| Create a note, or add to one | Done at once | The app asks first |
| Replace a note | `new --overwrite`, `create --overwrite` | Refused |
| Open a file that is in no vault | Opened | Refused |
| Amount of text | No limit set by Noteriv on `--content`, 16 MB on `--stdin` | 1024 KB |
| Print notes, tags or search results | Yes | No |
| Name a note outside the vault, or in a hidden folder | Refused | Refused |

Two more rules keep the two apart:

- A link given to the `noteriv` command is still a link. Nothing else on that line is read, so `noteriv "noteriv://new?name=Plan" --overwrite` does not overwrite, and the app asks before it creates the note.
- A command you type can carry a link as text. `noteriv append Inbox --content "noteriv://open?file=Plan"` adds that text to the note. It does not follow the link.

## Known Limits

- **Windows.** The output of the commands that print has not been checked in a Windows console. The code for it is compiled only on Windows.
- **macOS.** Links arriving on macOS have not been checked. There a link reaches the app in a different way from the other systems, and the code for it is compiled only on macOS.
- **Flatpak.** The Flatpak needs `--own-name` and `--talk-name` for `com.noteriv.Noteriv.SingleInstance`, and `x-scheme-handler/noteriv` in its desktop file, for the single copy and the links to work there.
- **Messages from the app.** A command that uses the window reports a problem in the app's status bar, not in the terminal.
