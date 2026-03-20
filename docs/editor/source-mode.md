---
title: Source Mode
order: 3
---

# Source Mode

Source mode displays the raw Markdown of your note with syntax highlighting and line numbers. No inline rendering is performed -- what you see is exactly what is stored in the `.md` file. This mode is built directly on CodeMirror 6's Markdown language support without the custom decoration plugin used in live mode.

## When to Use Source Mode

Source mode is the right choice when you need complete control over the Markdown source:

- **Complex table editing**: Tables with many columns or alignment characters are easier to adjust when you can see every pipe and dash.
- **Nested list surgery**: Deeply nested lists with mixed ordered and unordered items are clearer when indentation levels and markers are fully visible.
- **Frontmatter editing**: YAML frontmatter blocks (`---` delimited) are displayed as plain text with YAML syntax highlighting, making it easy to add or modify metadata fields.
- **Debugging formatting**: If a heading, link, or emphasis is not rendering as expected in live mode, source mode lets you inspect the exact characters and find stray spaces, missing delimiters, or encoding issues.
- **Bulk find-and-replace**: When performing search-and-replace operations across a note, seeing the raw markup ensures you do not accidentally modify rendered content that looks identical but has different underlying syntax.
- **Template authoring**: If you are writing Markdown templates with placeholder syntax or variables, source mode prevents the template markers from being interpreted as Markdown.

## Syntax Highlighting

Source mode uses CodeMirror 6's `@codemirror/lang-markdown` extension to tokenize the document and apply syntax highlighting. The color scheme adapts to your active Noteriv theme. The following elements are highlighted:

| Element | Highlighting |
|---|---|
| Headings (`#` - `######`) | Bold, scaled color by level |
| Bold (`**...**`) | Bold style applied to delimiters and content |
| Italic (`*...*`) | Italic style applied to delimiters and content |
| Strikethrough (`~~...~~`) | Dimmed with line-through style on delimiters |
| Inline code (`` `...` ``) | Monospaced font, background tint |
| Code block fences (`` ``` ``) | Dimmed fence markers, language label highlighted |
| Code block body | Language-specific highlighting (JS, Python, etc.) |
| Links (`[text](url)`) | Text in link color, URL dimmed |
| Wiki-links (`[[...]]`) | Brackets dimmed, note name in link color |
| Images (`![alt](url)`) | Alt text highlighted, URL dimmed |
| Blockquote markers (`>`) | Marker in accent color |
| List markers (`-`, `*`, `1.`) | Marker in accent color |
| Task checkboxes (`[ ]`, `[x]`) | Bracket and check character highlighted |
| Horizontal rules (`---`) | Full line in muted color |
| Math delimiters (`$`, `$$`) | Delimiters in accent color |
| HTML tags | Tag name, attributes, and values colored |
| YAML frontmatter | Keys, values, and delimiters colored |
| Footnote references (`[^1]`) | Superscript-style coloring |

### Nested Language Highlighting

Code blocks with a language identifier receive full syntax highlighting for that language. For example, a block marked as `` ```javascript `` is highlighted with JavaScript tokenization rules, including keywords, strings, comments, and operators. This is handled by CodeMirror's nested language parsing, which loads the appropriate language grammar on demand.

Supported languages include: JavaScript, TypeScript, JSX, TSX, Python, Rust, Go, C, C++, Java, HTML, CSS, SCSS, JSON, YAML, TOML, SQL, Bash/Shell, Lua, Ruby, PHP, Swift, Kotlin, Dart, Haskell, and others supported by CodeMirror's language ecosystem.

## Line Numbers

Source mode displays line numbers in a gutter on the left side of the editor. Line numbers serve several purposes:

- **Navigation**: Jump to a specific line using `Ctrl+G` (Go to Line).
- **Reference**: When discussing a note with someone or referencing a section, line numbers provide an unambiguous location.
- **Debugging**: Error messages from linters or build tools that reference line numbers map directly to what you see.

The line number gutter width adjusts automatically based on the total number of lines in the document.

## Active Line Highlight

The line containing the cursor is highlighted with a subtle background color to help you keep track of your position. This is especially useful in long documents or dense tables where the cursor can be hard to spot.

## Bracket and Delimiter Matching

When your cursor is adjacent to a bracket, parenthesis, or brace, the matching pair is highlighted. This applies to:

- Parentheses in links: `[text](url)`
- Brackets in wiki-links: `[[note]]`
- Curly braces in frontmatter or template syntax
- Code fence delimiters (the opening and closing `` ``` `` are paired)

## Indentation Guides

Vertical indentation guides are drawn at each indentation level, making it easy to see the nesting depth of lists, blockquotes, and code blocks. These guides are subtle lines that align with the indentation stops.

## Folding

Source mode supports code folding for sections and blocks:

- **Heading sections**: Click the fold indicator next to a heading to collapse everything between it and the next heading of the same or higher level.
- **Code blocks**: Fenced code blocks can be folded to a single line showing the language identifier.
- **Frontmatter**: The YAML frontmatter block can be folded to its opening delimiter.
- **Lists**: Top-level list items with nested children can be folded.

Folded regions show a placeholder indicator. Click it or use `Ctrl+Shift+[` to unfold.

## Word Wrap

By default, long lines wrap at the editor width. Source mode does not add hard line breaks -- the wrapping is purely visual. You can toggle word wrap from Settings or the command palette. When word wrap is off, long lines extend beyond the visible area and you can scroll horizontally.

## Whitespace and Invisible Characters

Source mode can optionally show invisible characters like tabs, trailing spaces, and non-breaking spaces. Enable this in Settings under Editor > Show Invisible Characters. This is useful for diagnosing formatting issues caused by unexpected whitespace.

## Minimap

When enabled in settings, a minimap appears on the right side of the editor showing a condensed overview of the entire document. You can click or drag on the minimap to navigate quickly. The minimap respects syntax highlighting colors, giving you a visual sense of the document structure at a glance.

## Keyboard Shortcuts in Source Mode

All standard editor keyboard shortcuts work in source mode, including formatting shortcuts (`Ctrl+B` for bold, `Ctrl+I` for italic, etc.). These insert the Markdown delimiters around the selection or at the cursor position. The full shortcut reference is in the [Editor Overview](./index.md#keyboard-shortcuts-reference).

## Comparison with Live Mode

| Feature | Source Mode | Live Mode |
|---|---|---|
| Raw Markdown visible | Always | Only on cursor line |
| Inline rendering | None | All non-cursor lines |
| Line numbers | Yes | No |
| Syntax highlighting | Yes | Yes (on cursor line) |
| Interactive checkboxes | No | Yes |
| Clickable links | No | Yes |
| Best for | Precise editing, debugging | General writing |

## Switching to Source Mode

- **Status bar**: Click the mode indicator and select Source.
- **Command palette**: Search for "Toggle Source Mode".
- **Context menu**: Right-click in the editor and select Source mode.
- **Per-file default**: Right-click and set Source as the default mode for this file. The setting is persisted in your workspace configuration and applied automatically when you open the file.
