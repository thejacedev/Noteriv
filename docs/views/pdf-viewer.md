---
title: PDF Viewer
order: 7
---

# PDF Viewer

Noteriv includes a built-in PDF viewer that opens PDF files inline, directly inside the application. You can read documents, highlight text, add underlines, write text notes, and export all your annotations to a Markdown file with page references. This eliminates the need to switch to an external PDF reader and makes it easy to integrate PDF reading into your note-taking workflow.

## Opening PDFs

Place a PDF file inside your vault (or any subfolder) and click it in the file explorer. Noteriv detects the `.pdf` extension and opens the file in the PDF viewer instead of the text editor. The viewer occupies the same editor pane, so you can have a PDF open in one tab and Markdown notes in another.

PDFs are rendered using [pdf.js](https://mozilla.github.io/pdf.js/), the same engine used by Firefox for its built-in PDF reader. This provides high-fidelity rendering for text, vector graphics, and embedded images.

## Navigation

### Page Scrolling

The PDF is rendered as a continuous vertical scroll of pages. Scroll down to move through the document, just as you would in any PDF reader. A page counter in the toolbar shows your current page and the total page count (e.g., "Page 14 of 42").

### Zoom

Two zoom buttons in the toolbar let you increase or decrease the rendering scale:

- **Zoom in**: Increases the scale by 0.25 per click, up to a maximum of 4x.
- **Zoom out**: Decreases the scale by 0.25 per click, down to a minimum of 0.25x.

The default zoom is 1x (100%), which maps one PDF point to one screen pixel. At 2x, text is large and sharp, suitable for close reading. At 0.5x, you get an overview of the page layout.

## Annotation Tools

The annotation toolbar provides three tools for marking up the PDF:

### Highlight

Select the highlight tool, then click and drag over text to create a colored highlight. The selected text is captured and stored with the annotation. Four highlight colors are available:

| Color | Use Case |
|---|---|
| Yellow | General highlights, key points |
| Green | Agreement, positive notes |
| Blue | References, citations |
| Pink | Questions, items needing review |

Choose the color from the toolbar before creating the highlight. The color can be changed after creation by selecting the annotation and picking a new color.

### Underline

The underline tool works like the highlight tool but draws a colored line under the selected text instead of a filled background. It uses the same four-color palette. Underlines are useful for marking important phrases without obscuring the text with a background color.

### Text Note

The text note tool lets you place a note marker anywhere on a page. Click a location on the page to create a note pin. A text input appears where you can type your comment. The note stores both the selected text (if any) and your comment. Notes are displayed as small icons on the page; click the icon to view or edit the comment.

## Annotation Data Model

Each annotation is stored as a `PDFAnnotation` object with the following fields:

- **id**: A unique identifier (`ann-{timestamp}-{random}`).
- **page**: The 1-based page number.
- **type**: One of `"highlight"`, `"underline"`, or `"note"`.
- **text**: The text content that was selected when the annotation was created.
- **comment**: An optional comment you wrote about the selected text.
- **color**: The hex color string for the annotation.
- **rect**: The bounding rectangle `{ x, y, w, h }` on the PDF page, in PDF coordinate units.
- **created**: A Unix timestamp (milliseconds) of when the annotation was created.

## Storage: Sidecar JSON

Annotations are not embedded inside the PDF file. Instead, they are saved in a **sidecar JSON file** next to the PDF. The sidecar file name is derived from the PDF file name with a dot prefix and `-annotations.json` suffix:

```
/vault/papers/attention-is-all-you-need.pdf
/vault/papers/.attention-is-all-you-need.pdf-annotations.json
```

The leading dot makes the sidecar file hidden on Unix-based systems, keeping the vault tidy. The JSON file contains the full `PDFAnnotationFile` structure:

```json
{
  "pdfPath": "/vault/papers/attention-is-all-you-need.pdf",
  "annotations": [
    {
      "id": "ann-1711234567890-x7k2m1",
      "page": 3,
      "type": "highlight",
      "text": "Attention is all you need",
      "comment": "The core thesis",
      "color": "#f9e2af",
      "rect": { "x": 72, "y": 540, "w": 200, "h": 14 },
      "created": 1711234567890
    }
  ]
}
```

Because annotations live in a separate file, the original PDF is never modified. This is important for shared PDFs where you do not want your personal annotations to alter the source document.

## Exporting Annotations to Markdown

The "Export Annotations" button in the toolbar generates a Markdown note from all annotations in the current PDF. The exported file is saved next to the PDF with the name `{PDF name} - Annotations.md`.

The export groups annotations by type and includes page references:

```markdown
# Annotations: attention-is-all-you-need.pdf

## Highlights

> Attention is all you need -- (page 3)

The core thesis

> Multi-head attention allows the model to jointly attend to information from different representation subspaces -- (page 4)

## Underlines

> self-attention, sometimes called intra-attention -- (page 2)

## Notes

- Clarify relationship between encoder and decoder stacks (page 5)
  The diagram on this page is essential for the architecture overview.
```

Highlights and underlines are formatted as blockquotes with the annotated text and a page reference. Comments appear as regular text below the quote. Notes are formatted as list items with their page reference and comment.

This Markdown file is a regular vault file, so it participates in search, backlinks, and graph view like any other note.

## Loading and Saving

Annotations are loaded automatically when you open a PDF. The viewer checks for the sidecar JSON file and parses it. If no sidecar exists, the viewer starts with an empty annotation set.

Annotations are saved automatically whenever you create, modify, or delete an annotation. The save operation writes the entire `PDFAnnotationFile` to the sidecar path with 2-space indented JSON.

## Annotation Lifecycle

1. **Create**: Select a tool (highlight, underline, or note), interact with the PDF, and the annotation is created and saved immediately.
2. **View**: Annotations are rendered as overlays on the PDF pages. Highlights are semi-transparent rectangles, underlines are colored lines, and notes are icon markers.
3. **Edit**: Click an existing annotation to modify its comment or change its color.
4. **Delete**: Select an annotation and press Delete, or use the context menu to remove it.
5. **Export**: Use the Export button to generate a Markdown summary of all annotations.

## Version Control

The sidecar JSON files are regular files in your vault, so they are tracked by git sync and backed up by folder sync. This means your PDF annotations are versioned alongside your notes and can be restored from history if needed.

Since the sidecar file name starts with a dot, some git configurations may ignore hidden files. Make sure your `.gitignore` does not exclude `.*-annotations.json` files if you want them synced.

## Limitations

- Annotations are stored per-PDF, per-vault. If the same PDF appears in multiple vaults, each vault has its own independent set of annotations.
- The PDF viewer is read-only with respect to the PDF content. You cannot edit the PDF text, add form fields, or sign documents.
- Text selection for highlights depends on the PDF having embedded text. Scanned documents without OCR will not allow text highlighting -- only positional note annotations.
- The viewer renders one page at a time in the visible viewport. Very large PDFs (1000+ pages) may be slow to navigate but do not consume excessive memory.
- PDF annotations are a desktop-only feature. The mobile app does not include a PDF viewer.
