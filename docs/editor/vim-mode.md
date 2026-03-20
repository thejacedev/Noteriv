---
title: Vim Mode
order: 7
---

# Vim Mode

Noteriv includes full Vim keybinding support through the [`@replit/codemirror-vim`](https://github.com/replit/codemirror-vim) package, which implements a Vim emulation layer on top of CodeMirror 6. When enabled, the editor behaves like Vim with Normal, Insert, and Visual modes, giving you access to the modal editing workflow that Vim users rely on for efficient text manipulation.

## Enabling Vim Mode

Open **Settings** and navigate to the **Editor** section. Toggle **Vim Mode** on. The change takes effect immediately in all open editor panes. A mode indicator appears in the status bar showing the current Vim mode (NORMAL, INSERT, VISUAL, etc.).

To disable Vim mode, return to Settings and toggle it off. The editor reverts to the standard keymap immediately.

## Modes

### Normal Mode

Normal mode is the default state when Vim mode is active. Keystrokes are interpreted as commands rather than text input. You can navigate, delete, copy, paste, and manipulate text without modifier keys. Press `Escape` from any other mode to return to Normal mode.

The cursor appears as a block cursor in Normal mode, positioned on a character rather than between characters, matching standard Vim behavior.

### Insert Mode

Insert mode allows you to type text normally, just like the editor behaves without Vim mode. Enter Insert mode with any of the standard Vim insert commands:

| Key | Action |
|---|---|
| `i` | Insert before cursor |
| `I` | Insert at beginning of line |
| `a` | Append after cursor |
| `A` | Append at end of line |
| `o` | Open new line below |
| `O` | Open new line above |
| `s` | Substitute character (delete and enter insert) |
| `S` | Substitute line (delete line and enter insert) |
| `c{motion}` | Change (delete motion and enter insert) |
| `C` | Change to end of line |

The cursor changes to a thin line cursor in Insert mode. Press `Escape` or `Ctrl+[` to return to Normal mode.

### Visual Mode

Visual mode lets you select text for operations. There are three variants:

| Key | Action |
|---|---|
| `v` | Character-wise visual mode |
| `V` | Line-wise visual mode |
| `Ctrl+V` | Block (column) visual mode |

In visual mode, the selection is highlighted and you can extend it with any motion command. Apply an operator (`d` to delete, `y` to yank, `c` to change, `>` to indent, `<` to unindent) to act on the selection.

### Command-Line Mode

Press `:` in Normal mode to enter command-line mode. A command input appears at the bottom of the editor. Supported commands include:

| Command | Action |
|---|---|
| `:w` | Save the current note |
| `:q` | Close the current tab |
| `:wq` | Save and close |
| `:x` | Save and close (same as `:wq`) |
| `:e {file}` | Open a file (triggers the file switcher) |
| `:{number}` | Jump to line number |
| `:%s/old/new/g` | Find and replace across the document |
| `:s/old/new/g` | Find and replace on the current line |
| `:noh` | Clear search highlighting |

## Motion Commands

Standard Vim motion commands work as expected:

### Character and Word Motions

| Key | Action |
|---|---|
| `h` | Move left |
| `j` | Move down |
| `k` | Move up |
| `l` | Move right |
| `w` | Move to start of next word |
| `W` | Move to start of next WORD (whitespace-delimited) |
| `b` | Move to start of previous word |
| `B` | Move to start of previous WORD |
| `e` | Move to end of current/next word |
| `E` | Move to end of current/next WORD |
| `0` | Move to start of line |
| `^` | Move to first non-blank character of line |
| `$` | Move to end of line |

### Line and Document Motions

| Key | Action |
|---|---|
| `gg` | Go to first line |
| `G` | Go to last line |
| `{number}G` | Go to specific line number |
| `{` | Move to previous blank line (paragraph up) |
| `}` | Move to next blank line (paragraph down) |
| `H` | Move to top of visible screen |
| `M` | Move to middle of visible screen |
| `L` | Move to bottom of visible screen |
| `Ctrl+U` | Scroll up half page |
| `Ctrl+D` | Scroll down half page |
| `Ctrl+F` | Scroll down full page |
| `Ctrl+B` | Scroll up full page |

### Search Motions

| Key | Action |
|---|---|
| `f{char}` | Find next occurrence of character on line |
| `F{char}` | Find previous occurrence of character on line |
| `t{char}` | Move to just before next occurrence of character |
| `T{char}` | Move to just after previous occurrence of character |
| `;` | Repeat last `f`/`F`/`t`/`T` motion |
| `,` | Repeat last `f`/`F`/`t`/`T` motion in reverse |
| `/` | Search forward |
| `?` | Search backward |
| `n` | Next search match |
| `N` | Previous search match |
| `*` | Search forward for word under cursor |
| `#` | Search backward for word under cursor |

## Operators

Operators act on motions or selections:

| Key | Action |
|---|---|
| `d{motion}` | Delete |
| `dd` | Delete entire line |
| `D` | Delete to end of line |
| `c{motion}` | Change (delete and enter insert mode) |
| `cc` | Change entire line |
| `C` | Change to end of line |
| `y{motion}` | Yank (copy) |
| `yy` | Yank entire line |
| `Y` | Yank entire line |
| `p` | Paste after cursor |
| `P` | Paste before cursor |
| `>` | Indent |
| `<` | Unindent |
| `=` | Auto-indent |
| `~` | Toggle case |
| `gu{motion}` | Lowercase |
| `gU{motion}` | Uppercase |

## Text Objects

Text objects can be used with operators in the form `{operator}{a/i}{object}`:

| Object | Description |
|---|---|
| `w` | Word |
| `W` | WORD |
| `s` | Sentence |
| `p` | Paragraph |
| `"`, `'`, `` ` `` | Quoted string |
| `(`, `)`, `b` | Parentheses |
| `[`, `]` | Square brackets |
| `{`, `}`, `B` | Curly braces |
| `<`, `>` | Angle brackets |
| `t` | HTML/XML tag |

For example, `ci"` changes the content inside double quotes, and `dap` deletes an entire paragraph including surrounding blank lines.

## Registers and Marks

- **Registers**: `"a` through `"z` for named registers, `"0` for the yank register, `""` for the default register. Use `"{register}{operator}` to specify a register.
- **Marks**: `m{a-z}` to set a mark, `` `{a-z} `` to jump to a mark's exact position, `'{a-z}` to jump to the beginning of the marked line.

## Macros

Record macros with `q{register}` and play them back with `@{register}`. Repeat the last macro with `@@`. Macros can include any sequence of Normal mode commands, motions, and Insert mode text entry.

## Interaction with Noteriv Features

Vim mode integrates with Noteriv's features:

- **Formatting shortcuts**: `Ctrl+B`, `Ctrl+I`, and other formatting shortcuts work in Insert mode.
- **Command palette**: `Ctrl+P` opens the command palette from any Vim mode.
- **Focus mode**: `Ctrl+Shift+D` toggles focus mode regardless of Vim mode state.
- **Split editor**: `Ctrl+\` works for split editor control.
- **Wiki-link navigation**: In Normal mode, pressing `gd` on a wiki-link opens the linked note (go to definition).
- **Live mode rendering**: Live mode's inline rendering works normally with Vim mode. Non-cursor lines are rendered, and the cursor line shows raw Markdown.

## Limitations

The Vim emulation is extensive but not identical to full Vim:

- **Vimscript**: Vimscript (`.vimrc`) is not supported. Configuration is done through Noteriv's settings.
- **Plugins**: Vim plugins are not supported. Features like surround, commentary, etc. are not available unless Noteriv implements them natively.
- **Ex commands**: Only a subset of Ex commands (`:w`, `:q`, `:s`, etc.) are implemented.
- **Split commands**: `:sp` and `:vsp` are not supported. Use Noteriv's split editor instead.
- **Terminal**: `:terminal` is not available.
