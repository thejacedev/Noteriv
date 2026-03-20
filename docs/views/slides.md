---
title: Slide Presentation
order: 5
---

# Slide Presentation

Noteriv can present any Markdown note as a fullscreen slideshow. There is no special file format or separate tool -- you write your content in standard Markdown, separate slides with horizontal rules (`---`), and Noteriv renders each section as a full-screen slide with styled typography, code blocks, images, and task lists.

## Creating a Presentation

Any Markdown file can become a presentation. Structure your note with `---` horizontal rules to mark where one slide ends and the next begins:

```markdown
# My Presentation

Welcome to the talk.

---

## Agenda

- Introduction
- Architecture overview
- Demo
- Q&A

---

## Architecture

The system uses a **microservices** approach with three main components:

1. API Gateway
2. Processing Service
3. Storage Layer

---

## Code Example

```python
def process(data):
    result = transform(data)
    return result
```

---

## Thank You

Questions?
```

This file produces five slides. The first slide shows the title and subtitle, and subsequent slides each show the content between two `---` markers.

## Starting a Presentation

To present a note as slides, use one of these methods:

- **Editor menu**: Open the context menu (right-click in the editor or use the three-dot menu) and select "Present as Slides".
- **Command palette**: Press `Ctrl+P` and search for "Present as Slides".

The presentation opens as a fullscreen overlay. The editor is hidden behind the presentation and is restored when you exit.

## Slide Separator Rules

The slide parser splits on horizontal rules: `---`, `***`, or `___` on their own line. These are standard Markdown horizontal rule syntax. The parser is careful about two edge cases:

### Frontmatter

YAML frontmatter at the top of the file (`---` on line 1, followed by YAML content, followed by another `---`) is not treated as a slide separator. The frontmatter is stripped before parsing.

### Fenced Code Blocks

If `---` appears inside a fenced code block (between `` ``` `` markers), it is not treated as a slide separator. The parser tracks whether it is inside a code fence and only splits on horizontal rules that appear in regular Markdown context.

This means you can safely include code samples with `---` in them without accidentally creating extra slides.

## Slide Rendering

Each slide's Markdown content is converted to HTML for display. The renderer supports:

- **Headings**: `#` through `######`, styled with appropriate sizes and weights.
- **Bold and italic**: `**bold**`, `*italic*`, `***bold italic***`, and their underscore equivalents.
- **Strikethrough**: `~~deleted text~~`.
- **Inline code**: `` `code` `` rendered in a monospace font with a subtle background.
- **Code blocks**: Fenced code blocks with optional language annotations. Syntax highlighting is applied based on the language tag.
- **Lists**: Unordered (`-`, `*`, `+`) and ordered (`1.`, `2.`, etc.) lists, including nested items.
- **Task lists**: `- [ ]` and `- [x]` items rendered with checkbox indicators (checkmark for completed items).
- **Blockquotes**: `>` prefixed lines rendered with a left border accent.
- **Images**: `![alt](url)` rendered inline in the slide. Images are scaled to fit the slide viewport.
- **Links**: `[text](url)` rendered as clickable links.
- **Tables**: Standard Markdown tables with header row and alignment (`:---`, `:---:`, `---:`).

## Speaker Notes

You can add speaker notes to any slide by placing `Note:` or `???` on its own line at the bottom of the slide content. Everything after that marker is extracted as speaker notes and is not displayed in the presentation.

```markdown
## Key Metrics

- Revenue grew 23% year over year
- Customer retention at 94%
- NPS score improved to 72

Note: Emphasize the retention number -- this is the strongest metric we have. Compare with industry average of 85%.
```

The speaker notes are stored in the `Slide` data structure but are not currently displayed in a separate speaker view. They serve as a reference when you are preparing the presentation in the editor.

## Navigation

### Keyboard

| Key | Action |
|---|---|
| Right arrow / Down arrow | Next slide |
| Left arrow / Up arrow | Previous slide |
| `Escape` | Exit presentation |

### Slide Counter

A small counter at the bottom of the screen shows your position (e.g., "3 / 12") so you know how far through the presentation you are.

## Styling

Slides are rendered in a fullscreen container with centered content. The styling is theme-aware, pulling colors from the active Noteriv theme's CSS custom properties. Text is set at a larger size than the editor (optimized for readability at a distance), with generous line spacing and padding.

Code blocks use the same syntax highlighting colors as the editor but are scaled up for slide readability. Tables, blockquotes, and lists are all styled to be legible on a projected display.

## Data Model

Internally, the slide system parses the Markdown document into an array of `Slide` objects:

```typescript
interface Slide {
  content: string;   // raw Markdown for this slide
  html: string;      // rendered HTML
  notes: string;     // speaker notes (extracted from Note: or ???)
  index: number;     // zero-based slide number
}
```

The `parseSlides` function handles splitting, note extraction, and HTML conversion. The `slideToHTML` function performs the Markdown-to-HTML conversion for a single slide, handling all the inline formatting, block elements, and tables described above.

## Tips for Good Presentations

- **Keep slides focused**: One idea per slide. Use the horizontal rule to break at natural transition points.
- **Use headings**: A `##` heading at the top of each slide gives the audience a clear topic label.
- **Code blocks**: Keep code samples short (10-15 lines max). The audience needs to read them from a distance.
- **Images**: Use images to break up text-heavy sections. They render centered in the slide viewport.
- **Task lists**: Use `- [x]` to show completed items in a progress update -- the checkmarks render visually in the slide.
- **Speaker notes**: Add `Note:` sections liberally. Even if there is no speaker view yet, they help you remember what to say when preparing.

## Limitations

- Presentations are read-only. You cannot edit slide content while in presentation mode.
- There is no speaker view or dual-screen support. Notes are only visible in the editor.
- Slide transitions and animations are not supported. Slides change instantly.
- LaTeX math rendering is not currently included in the slide HTML converter. Use the editor's live mode to preview math, then present from the rendered view.
- The presentation does not auto-advance. You must manually navigate with arrow keys.
