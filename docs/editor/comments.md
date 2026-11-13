---
title: Comments
order: 12
---

# Comments

A comment is a note to yourself inside a note: a reminder, a question, a paragraph you have not decided about. It stays in the file, but it is hidden when the note is read and left out when the note is exported. Noteriv uses the same `%%` syntax as Obsidian. Comments are a feature of the desktop app. Versions up to 2.4.13 show comments as ordinary text.

## Syntax

For a comment inside a line, put `%%` before and after it:

```markdown
The launch is on Friday. %%check the date with Sam%%
```

For a comment of several lines, put `%%` on a line of its own before and after it:

```markdown
%%
Rewrite this section.
Sources still to add.
%%
```

A few rules:

- An inline comment starts and ends on the same line.
- A block comment needs both `%%` lines. If the closing line is missing, the editor does not treat the lines as a comment, but a published page or a PDF leaves out everything after the opening line.
- `%%` inside inline code or a fenced code block is not a comment. It is shown as written.
- Markdown inside a comment is not rendered.

## Where Comments Are Shown

| Where | What happens to a comment |
|---|---|
| Live mode | Shown as written, dimmed and in italics |
| Source mode | Shown as plain text, like the rest of the note |
| View mode | Hidden |
| Publish Note as HTML | Left out |
| Export as PDF | Left out |
| A note shown inside another with `![[note]]` | Left out |

In a published page or a PDF, a line that held nothing but a comment is removed with it, so no empty line is left behind.

## Comments Are Still Text

A comment is part of the note file. That means:

- [Vault Search](../features/search.md) finds text inside comments.
- The word count in the status bar includes them.
- Anyone who opens the `.md` file can read them. Do not put anything in a comment that you would not put in the note.
