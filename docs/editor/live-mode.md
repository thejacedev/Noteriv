---
title: Live Mode
order: 2
---

# Live Mode

Live mode is Noteriv's default editing experience. It combines the immediacy of a rich text editor with the precision of raw Markdown by rendering formatted output inline while you type, but revealing the underlying syntax on the line where your cursor sits.

## How It Works

When a document is open in live mode, every line that does not contain the cursor is rendered as styled output directly inside the editor. The moment you move your cursor to a line, it switches back to raw Markdown so you can edit the syntax. When you move away, the line is re-rendered.

This per-line toggling is handled by a custom CodeMirror 6 decoration plugin that watches the cursor position and rebuilds decorations on each state update. Because decorations are applied at the line level rather than the document level, the rendering cost is proportional to the visible viewport, not the total document length, which keeps performance smooth even in large notes.

## What Gets Rendered

Live mode renders the following Markdown constructs inline:

### Headings

Heading lines (`#` through `######`) are displayed with their corresponding font size and weight. The hash characters and the space after them are hidden on non-cursor lines, so you see styled heading text without the markup.

### Bold and Italic

`**bold**` text is rendered as **bold** and `*italic*` text is rendered as *italic*. The delimiter characters (`**`, `*`, `__`, `_`) are hidden when the cursor is elsewhere. Nested formatting like `***bold italic***` is supported.

### Strikethrough

`~~strikethrough~~` text is rendered with a line through it, with the tilde delimiters hidden.

### Highlights

`==highlighted==` text is rendered with a background highlight color that matches your current theme. The `==` delimiters are hidden on non-cursor lines.

### Inline Code

`` `inline code` `` is rendered with a monospaced font and a subtle background, matching the style you see in view mode.

### Code Blocks

Fenced code blocks (`` ``` ``) are syntax-highlighted using the language specified after the opening fence. The fence markers and language identifier are dimmed but remain visible to maintain context. Supported languages include JavaScript, TypeScript, Python, Rust, Go, HTML, CSS, JSON, YAML, TOML, SQL, Bash, and many more via CodeMirror's language support packages.

### Math

Inline math (`$...$`) and display math (`$$...$$`) are rendered using KaTeX. Inline math appears in the flow of text, while display math is centered on its own block. The dollar sign delimiters are hidden on non-cursor lines. If a math expression contains a syntax error, the raw LaTeX source is displayed with an error indicator instead of a broken rendering.

### Images

Image syntax (`![alt](url)`) is replaced with the actual image, rendered inline in the document. The image is sized to fit the editor width with a maximum height constraint so that a single large image does not push the rest of your content out of view. When you place your cursor on the image line, the raw syntax is revealed for editing the alt text or URL.

### Links

`[text](url)` links are rendered as clickable styled text. The URL portion is hidden on non-cursor lines. You can `Ctrl+Click` a link to open it in your default browser or navigate to it if it is an internal wiki-link.

### Wiki-Links

`[[note name]]` wiki-links are rendered as styled internal links. They are clickable and open the referenced note in the editor. Aliases (`[[note name|display text]]`) are supported -- only the display text is shown when rendered.

### Task Lists

Lines starting with `- [ ]` or `- [x]` are rendered as checkbox items. The checkbox is interactive: clicking it toggles the state between checked and unchecked, and the underlying Markdown is updated to match. This works even on non-cursor lines.

### Blockquotes

Lines starting with `>` are rendered with a left border and indentation matching the blockquote depth. Nested blockquotes (`>>`, `>>>`, etc.) are supported with progressively indented styling.

### Horizontal Rules

Lines containing only `---`, `***`, or `___` are rendered as a horizontal divider.

### Tables

Markdown tables are rendered with aligned columns, borders, and header styling. The table remains editable -- placing your cursor on any cell reveals the raw pipe-delimited syntax for that row.

### Footnotes

Footnote references (`[^1]`) are rendered as superscript links, and footnote definitions are rendered at the bottom of the viewport with a separator line.

## Cursor Behavior

The cursor line always displays raw Markdown. This is a deliberate design choice:

- It gives you immediate access to the syntax for editing without an extra interaction step.
- It avoids the jarring experience of the line layout shifting while you type.
- It means you never have to guess what Markdown syntax produced a particular rendering.

When the cursor moves to a new line, the previous line is re-rendered and the new line switches to raw mode. The transition is instantaneous and happens within a single CodeMirror state update, so there is no visible flicker.

## Multi-Cursor Support

Live mode works with CodeMirror's multi-cursor feature. Each cursor line shows raw Markdown, and all other lines are rendered. If you have multiple cursors on different lines, all of those lines show raw syntax simultaneously.

## Performance

The decoration plugin is designed for large documents:

- Only visible lines are decorated. Off-screen lines are not processed until they scroll into view.
- Decoration rebuilds are batched within CodeMirror's update cycle, so rapid cursor movement does not cause redundant work.
- KaTeX rendering is cached per expression to avoid re-parsing unchanged math.
- Image elements are reused across decoration rebuilds to prevent unnecessary network requests and layout shifts.

## When to Use Live Mode

Live mode is the best choice for most writing tasks. Use it when:

- You want to see formatted output as you write.
- You are composing prose, lists, or mixed-content notes.
- You want interactive checkboxes and clickable links while editing.
- You need a quick visual check of heading hierarchy, emphasis, or math rendering without switching to a separate preview.

If you need to see all raw syntax at once -- for example, when debugging a complex table or adjusting nested list indentation -- switch to [Source Mode](./source-mode.md).
