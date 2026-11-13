---
title: Footnotes
order: 16
---

# Footnotes

A footnote keeps a source or an aside out of the sentence it belongs to. Noteriv reads two ways of writing one, and has a panel that lists the footnotes of the open note.

## Numbered Footnotes

Put a reference where the footnote belongs, and the text on a line of its own:

```markdown
This claim needs a source.[^1]

[^1]: Smith et al., 2024.
```

The label between `[^` and `]` can be a number or a word, without spaces. See [Markdown Syntax](../reference/markdown-syntax.md#footnotes).

## Inline Footnotes

An inline footnote is written in place, with no separate line and no label:

```markdown
The meeting moved to Friday.^[Sam asked for the extra day.]
```

In live mode and view mode the text is shown where it is written, small and raised, in square brackets. A published page and a PDF also show it raised, in square brackets.

An inline footnote has to start and end on one line, and its text cannot contain `]`. Inline footnotes are read by the desktop app. Versions up to 2.4.13 show `^[...]` as ordinary text.

## Footnotes Panel

The footnotes panel lists every footnote in the open note. Open the command palette (`Ctrl+Shift+P`) and run **Toggle Footnotes**. Run it again, or click the X in the panel's header, to close it. The command has no default shortcut; you can give it one in Settings > Shortcuts. The panel is in the desktop app, and was added after 2.4.13.

The header shows how many footnotes the note has. Below it, the footnotes are listed in the order of the lines they are on:

| Footnote | What its row shows |
|---|---|
| Numbered, with text | The label, the text, and how often it is referred to, such as `×2`. A footnote nothing refers to is marked `unused` |
| Inline | `in place` and the text |
| A reference with no definition | The label and a message that no line defines this footnote |

Click a row to jump to the footnote in the note:

- A numbered footnote takes you to the line that defines it.
- An inline footnote takes you to where it is written.
- A reference with no definition takes you to the first place the label is used.

The panel follows the editor, so it updates as you type. It is there for notes only: it does not show for a PDF, a canvas or a drawing.

A few details:

- Footnotes inside fenced code blocks and inline code are not listed.
- If two lines define the same label, the first one is used.
- A definition with nothing after the colon is listed as `(empty)`.
