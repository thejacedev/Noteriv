---
title: Reference
order: 1
---

# Reference

This section contains detailed reference documentation for Noteriv's supported syntax, file formats, and configuration options. Use these pages as a lookup when you need to check a specific feature or format.

## Pages in This Section

### [Markdown Syntax](./markdown-syntax.md)

A complete reference for every markdown syntax that Noteriv supports, from standard formatting (headings, bold, italic) through extended features (wiki-links, callouts, math, Mermaid diagrams, dataview queries, flashcards, and more). Includes examples for every syntax element.

### [Frontmatter](./frontmatter.md)

YAML frontmatter fields that Noteriv recognizes and uses. Covers built-in fields like `title`, `tags`, `due`, `status`, and `board`, as well as custom fields that can be queried via dataview.

### [Callouts](./callouts.md)

All 14 callout types with their syntax, icons, colors, and collapsible variants. Callouts are styled blockquotes that visually distinguish notes, warnings, tips, and other information types.

### [File Types](./file-types.md)

Every file type that Noteriv handles: markdown notes, canvas files, drawing files, and board notes. Also covers the `.noteriv/` directory structure and the configuration files stored within it.

## Quick Links

- Standard markdown: [Markdown Syntax](./markdown-syntax.md)
- Wiki-links and embeds: [Markdown Syntax - Wiki-Links](./markdown-syntax.md#wiki-links)
- Math (LaTeX/KaTeX): [Markdown Syntax - Math](./markdown-syntax.md#math)
- Mermaid diagrams: [Markdown Syntax - Mermaid](./markdown-syntax.md#mermaid-diagrams)
- Dataview queries: [Markdown Syntax - Dataview](./markdown-syntax.md#dataview)
- Flashcards: [Markdown Syntax - Flashcards](./markdown-syntax.md#flashcards)
- YAML frontmatter: [Frontmatter](./frontmatter.md)
- Callout types: [Callouts](./callouts.md)
- File extensions: [File Types](./file-types.md)

## How to Use This Section

This reference section is designed for quick lookup, not sequential reading. Each page covers one topic comprehensively with syntax examples, parameter tables, and behavior notes. If you are looking for a tutorial-style introduction to a feature, check the [Features](../features/) or [Getting Started](../getting-started/) sections instead.

### Finding What You Need

**I want to format text**: Start with [Markdown Syntax](./markdown-syntax.md). It covers everything from basic bold/italic to advanced features like math, diagrams, and dataview queries.

**I want to add metadata to a note**: See [Frontmatter](./frontmatter.md) for the YAML fields that Noteriv recognizes, including `title`, `tags`, `due`, `status`, and `board`.

**I want to highlight important information**: See [Callouts](./callouts.md) for the 14 callout types (note, tip, info, warning, danger, bug, example, quote, success, question, abstract, todo, failure, important) with their syntax and color coding.

**I want to understand file formats**: See [File Types](./file-types.md) for documentation of `.md`, `.canvas`, `.drawing`, and the `.noteriv/` configuration directory.

## Conventions Used in This Section

- **Code blocks** show exact syntax. Copy them directly into your notes.
- **Tables** list available options, parameters, or types.
- **Inline code** marks syntax elements, filenames, and field names.
- Markdown examples use fenced code blocks with the `markdown` language identifier. When a code block needs to contain another code block (e.g., demonstrating dataview syntax), four backticks are used for the outer fence.

## Syntax Compatibility

Noteriv's markdown parser is designed to be compatible with CommonMark and GitHub Flavored Markdown (GFM) with the following extensions:

| Extension | Standard |
|---|---|
| Headings, bold, italic, links, images, lists, blockquotes | CommonMark |
| Tables, task lists, strikethrough | GFM |
| Footnotes | PHP Markdown Extra |
| Definition lists | PHP Markdown Extra |
| Highlight (`==text==`) | Noteriv extension |
| Superscript (`^text^`), Subscript (`~text~`) | Noteriv extension |
| Wiki-links (`[[note]]`), Embeds (`![[note]]`) | Noteriv extension |
| Callouts (`> [!type]`) | Noteriv extension |
| Math (`$...$`, `$$...$$`) | Noteriv extension (KaTeX) |
| Mermaid diagrams | Noteriv extension |
| Dataview queries | Noteriv extension |
| Flashcards (Q:/A:, {{cloze}}) | Noteriv extension |

Notes created in Noteriv can be opened in any markdown editor. Standard markdown renders correctly everywhere. Noteriv-specific extensions (wiki-links, callouts, math, dataview) will appear as plain text in editors that do not support them, but the files remain valid and editable.

## Keyboard Shortcut Quick Reference

These are the most commonly needed shortcuts when working with the syntax documented in this section:

| Shortcut | Action |
|---|---|
| `Ctrl+B` | Bold (`**text**`) |
| `Ctrl+I` | Italic (`*text*`) |
| `Ctrl+K` | Insert link (`[text](url)`) |
| `Ctrl+Shift+K` | Insert code block |
| `Ctrl+Shift+M` | Insert math block |
| `Ctrl+Shift+X` | Strikethrough (`~~text~~`) |
| `Ctrl+Shift+H` | Highlight (`==text==`) |
| `Ctrl+Shift+T` | Insert table |
| `Ctrl+Shift+]` | Increase heading level |
| `Ctrl+Shift+[` | Decrease heading level |
| `Ctrl+Enter` | Toggle task checkbox |

## Related Documentation

For documentation on how Noteriv processes and renders these syntax elements:

- **Editor**: See [Editor Overview](../editor/) for how Live mode renders markdown inline while you type.
- **Themes**: See [Themes](../themes/) for how code blocks, callouts, and other elements are colored by the active theme.
- **Plugins**: See [Plugins](../plugins/) for how plugins can extend markdown processing with custom blocks and syntax.
- **MCP Server**: See [MCP Tools](../mcp/tools.md) for how AI assistants can read and write markdown in your vault.
