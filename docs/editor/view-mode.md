---
title: View Mode
order: 4
---

# View Mode

View mode renders your note as a fully formatted, read-only document. All Markdown is converted to styled HTML, providing a clean reading experience that closely matches how the note would appear if exported or published. The editor itself is not editable in this mode -- it acts as a previewer -- but certain interactive elements remain functional.

## Rendered Output

In view mode, every Markdown construct is rendered to its final visual form:

### Text Formatting

- **Bold** (`**text**`): Rendered with bold weight.
- *Italic* (`*text*`): Rendered with italic style.
- ~~Strikethrough~~ (`~~text~~`): Rendered with a line through the text.
- ==Highlight== (`==text==`): Rendered with a background color matching your theme's highlight color.
- `Inline code` (`` `text` ``): Rendered in a monospaced font with a background tint.

### Headings

Headings (`#` through `######`) are rendered at their proper sizes and weights. An anchor ID is generated for each heading, which enables linking to specific sections via `[link](#heading-name)` syntax.

### Links

- **Standard links** (`[text](url)`): Rendered as clickable hyperlinks. Clicking opens the URL in your default browser.
- **Wiki-links** (`[[note]]`): Rendered as internal links. Clicking navigates to the referenced note in the editor. If the note does not exist, the link is styled differently to indicate a broken reference.
- **Wiki-link aliases** (`[[note|display]]`): Only the display text is shown.
- **Autolinks**: Bare URLs in the text are automatically converted to clickable links.

### Images

Images (`![alt](url)`) are rendered inline at their natural size, constrained to the editor width. Alt text is used as a tooltip. Both local vault images and external URLs are supported. Local images are resolved relative to the vault root or the note's directory depending on your link format settings.

### Code Blocks

Fenced code blocks are rendered with syntax highlighting for the specified language. A language label appears in the top-right corner of the block. A copy button allows you to copy the block contents to the clipboard with one click.

### Math

- **Inline math** (`$...$`): Rendered inline using KaTeX.
- **Display math** (`$$...$$`): Rendered as a centered block using KaTeX.
- **Error handling**: If a math expression has a syntax error, the raw LaTeX source is shown with an error message instead of rendering broken output.

### Tables

Tables are rendered with borders, alternating row backgrounds, and header styling. Column alignment (`:---`, `:---:`, `---:`) is respected. Tables support horizontal scrolling if they exceed the editor width.

### Lists

- **Unordered lists** (`-`, `*`, `+`): Rendered with bullet points, with nested items indented.
- **Ordered lists** (`1.`, `2.`, etc.): Rendered with sequential numbers.
- **Task lists** (`- [ ]`, `- [x]`): Rendered as checkboxes (see Interactive Elements below).

### Blockquotes

Blockquotes are rendered with a left border and indented text. Nested blockquotes show progressively deeper indentation with distinct border colors.

### Horizontal Rules

`---`, `***`, and `___` are rendered as full-width horizontal dividers.

### Footnotes

Footnote references (`[^1]`) appear as superscript numbers that link to footnote definitions at the bottom of the document. Clicking a footnote reference scrolls to its definition, and the definition includes a back-link to return to the reference point.

### Embedded Content

If you use Noteriv's embed syntax (`![[note]]`), the embedded note's content is rendered inline within the parent document, visually distinguished with a border and background.

### Frontmatter

YAML frontmatter blocks are hidden in view mode by default. The metadata they contain (title, tags, date, etc.) is not displayed in the rendered output. If you want to see frontmatter, switch to source mode.

## Interactive Elements

Although view mode is read-only, certain elements remain interactive:

### Task List Checkboxes

Checkboxes in task lists (`- [ ]` and `- [x]`) are rendered as clickable checkbox inputs. Clicking a checkbox toggles its state, and the change is written back to the underlying Markdown file immediately. This means you can use view mode to review and check off tasks without switching to an editable mode.

### Table Checkboxes

If you use checkboxes inside table cells (`| [ ] Task |`), they are also interactive in view mode. Clicking toggles the state and updates the file, just like standalone task list checkboxes.

### Links

All links -- standard Markdown links, wiki-links, and autolinks -- are clickable in view mode. Internal links navigate within Noteriv; external links open in your default browser.

### Code Block Copy Button

Each code block has a copy button that copies the block content to the clipboard. This is useful for grabbing code snippets from your notes.

## Scroll Position

View mode preserves your scroll position when you switch to it from live or source mode. If you were looking at a specific section, you will still be looking at that section after the mode switch. Similarly, switching away from view mode and back restores the position.

## Search in View Mode

You can use `Ctrl+F` to search within the rendered content. The search highlights matches in the rendered output and supports case-insensitive matching and regular expressions.

## Printing and Export

View mode's rendered output is the basis for Noteriv's print and PDF export features. When you print a note (`Ctrl+Shift+P` or File > Print), the view mode rendering is used, ensuring the printed output matches what you see on screen. Export to PDF uses the same rendering pipeline.

## When to Use View Mode

View mode is ideal for:

- **Reviewing completed notes**: Read through a finished note with all formatting rendered, without the distraction of Markdown syntax.
- **Checking off tasks**: Use interactive checkboxes to mark tasks complete without entering edit mode.
- **Presenting notes**: Share your screen or present a note that looks clean and formatted.
- **Verifying formatting**: Confirm that complex Markdown (tables, math, nested lists) renders as expected before sharing or exporting.
- **Reading reference material**: Open reference notes in view mode while editing a different note in a split pane.

## Switching to View Mode

- **Status bar**: Click the mode indicator and select View.
- **Command palette**: Search for "Toggle View Mode".
- **Context menu**: Right-click in the editor and select View mode.
- **Per-file default**: Right-click and set View as the default mode for this file. This is especially useful for reference notes that you read often but rarely edit.

## Comparison with Live Mode

| Feature | View Mode | Live Mode |
|---|---|---|
| Editing | Not available | Full editing |
| Rendering | Entire document | Non-cursor lines only |
| Interactive checkboxes | Yes | Yes |
| Frontmatter | Hidden | Visible on cursor line |
| Best for | Reading, reviewing | Writing, composing |
