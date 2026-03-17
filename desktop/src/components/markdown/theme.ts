import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Theme for rendered markdown elements (non-cursor lines). */
export const markdownRenderTheme = EditorView.baseTheme({
  // Headings
  ".md-h1": { fontSize: "2em", fontWeight: "700", color: "var(--accent)", lineHeight: "1.3", padding: "0.3em 0" },
  ".md-h2": { fontSize: "1.5em", fontWeight: "600", color: "#cba6f7", lineHeight: "1.3", padding: "0.2em 0" },
  ".md-h3": { fontSize: "1.25em", fontWeight: "600", color: "#a6e3a1", lineHeight: "1.3", padding: "0.15em 0" },
  ".md-h4": { fontSize: "1.1em", fontWeight: "600", color: "#f9e2af", lineHeight: "1.3" },
  ".md-h5": { fontSize: "1.05em", fontWeight: "600", color: "#fab387", lineHeight: "1.3" },
  ".md-h6": { fontSize: "1em", fontWeight: "600", color: "#f38ba8", lineHeight: "1.3" },

  // Inline formatting
  "& .md-bold strong": { fontWeight: "700", color: "#cdd6f4" },
  "& .md-italic em": { fontStyle: "italic", color: "#cdd6f4" },
  "& .md-bold-italic strong em": { fontWeight: "700", fontStyle: "italic" },
  "& .md-strikethrough del": { textDecoration: "line-through", opacity: "0.6" },
  "& .md-inline-code code": {
    background: "#313244",
    padding: "0.15em 0.4em",
    borderRadius: "4px",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "0.9em",
    color: "#cba6f7",
  },

  // Links
  "& .md-link-wrapper a, & .md-link": {
    color: "var(--accent)",
    textDecoration: "none",
    borderBottom: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
    cursor: "pointer",
  },

  // Images
  "& .md-image img, & .md-inline-img": {
    maxWidth: "100%",
    borderRadius: "6px",
    margin: "0.5em 0",
    display: "block",
  },

  // Blockquote
  ".md-blockquote": {
    borderLeft: "3px solid var(--accent)",
    paddingLeft: "1em",
    color: "#a6adc8",
    background: "color-mix(in srgb, var(--accent) 5%, transparent)",
  },

  // Lists
  ".md-list-item": { paddingLeft: "0.5em" },
  "& .md-bullet": { color: "var(--accent)", fontWeight: "bold" },

  // Checkboxes
  "& .md-checkbox-wrapper": { display: "inline" },
  "& .md-table-checkbox": { display: "inline", cursor: "pointer" },
  "& .md-table-checkbox .md-cb-box": { marginRight: "0" },
  "& .md-table-checkbox.checked .md-cb-box": {
    background: "var(--accent)",
    borderColor: "var(--accent)",
    color: "#1e1e2e",
  },
  "& .md-cb-box": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "16px",
    height: "16px",
    border: "2px solid #6c7086",
    borderRadius: "3px",
    marginRight: "6px",
    fontSize: "12px",
    verticalAlign: "middle",
    position: "relative",
    top: "-1px",
  },
  "& .md-checkbox.checked .md-cb-box": {
    background: "var(--accent)",
    borderColor: "var(--accent)",
    color: "#1e1e2e",
  },

  // Horizontal rule
  "& .md-hr hr": {
    border: "none",
    borderTop: "1px solid #313244",
    margin: "0.5em 0",
  },

  // Legacy code block classes (kept for compatibility)
  ".md-code-fence": {
    color: "var(--text-muted)",
    fontSize: "0.85em",
  },
  ".md-code-block-line": {
    background: "color-mix(in srgb, var(--bg-secondary) 60%, transparent)",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "0.9em",
  },

  // New custom code block widget
  "& .md-codeblock": {
    borderRadius: "8px",
    overflow: "hidden",
    margin: "2px 0",
    border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
    width: "100%",
  },
  "& .md-codeblock-header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 12px",
    background: "color-mix(in srgb, var(--bg-secondary) 90%, transparent)",
    borderBottom: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
    fontSize: "12px",
  },
  "& .md-codeblock-lang": {
    color: "var(--text-muted)",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  "& .md-codeblock-copy": {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "none",
    border: "1px solid color-mix(in srgb, var(--text-muted) 30%, transparent)",
    borderRadius: "4px",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: "2px 8px",
    fontSize: "11px",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    transition: "all 0.15s ease",
  },
  "& .md-codeblock-copy:hover": {
    color: "var(--text-primary)",
    borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
    background: "color-mix(in srgb, var(--accent) 8%, transparent)",
  },
  "& .md-codeblock-copy.copied": {
    color: "var(--green)",
    borderColor: "color-mix(in srgb, var(--green) 40%, transparent)",
  },
  ".md-codeblock-hidden": {
    fontSize: "0 !important",
    lineHeight: "0 !important",
    height: "0 !important",
    padding: "0 !important",
    margin: "0 !important",
    overflow: "hidden",
    minHeight: "0 !important",
    maxHeight: "0 !important",
  },
  "& .md-codeblock-pre": {
    margin: "0",
    padding: "10px 16px",
    background: "color-mix(in srgb, var(--bg-secondary) 60%, transparent)",
    overflow: "auto",
  },
  "& .md-codeblock-code": {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "13px",
    lineHeight: "1.35",
    color: "var(--text-primary)",
    tabSize: "2",
  },
  "& .md-codeblock-line": {
    display: "block",
    lineHeight: "1.35",
  },

  // Syntax highlighting tokens
  "& .tok-keyword": { color: "var(--mauve)" },
  "& .tok-string": { color: "var(--green)" },
  "& .tok-comment": { color: "var(--text-muted)", fontStyle: "italic" },
  "& .tok-number": { color: "var(--peach, #fab387)" },
  "& .tok-type": { color: "var(--yellow)" },
  "& .tok-function": { color: "var(--accent)" },
  "& .tok-meta": { color: "var(--red)" },

  // Tables
  ".md-table-row": {
    background: "color-mix(in srgb, var(--bg-tertiary) 20%, transparent)",
  },
  "& .md-table-row-inner": {
    display: "inline-flex",
    gap: "0",
    width: "100%",
  },
  "& .md-table-cell": {
    padding: "0.25em 0.75em",
    borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
    flex: "1",
    minWidth: "0",
  },
  "& .md-table-divider": {
    color: "var(--border)",
    padding: "0 2px",
    opacity: "0.4",
  },
  "& .md-table-sep-wrapper": {
    display: "inline-block",
    width: "100%",
  },
  "& .md-table-sep": {
    height: "2px",
    background: "linear-gradient(to right, transparent, var(--border), transparent)",
    margin: "2px 0",
  },

  // Callouts
  "& .md-callout": {
    display: "inline-block",
    width: "100%",
  },
  "& .md-callout-header": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "0.4em 0.75em",
    borderRadius: "6px",
    borderLeft: "3px solid var(--callout-color, var(--accent))",
    background: "color-mix(in srgb, var(--accent) 5%, transparent)",
  },
  "& .md-callout-icon": {
    fontSize: "1.1em",
    flexShrink: "0",
  },
  "& .md-callout-type": {
    fontWeight: "600",
    color: "var(--callout-color, var(--accent))",
    textTransform: "uppercase",
    fontSize: "0.75em",
    letterSpacing: "0.05em",
  },
  "& .md-callout-title": {
    color: "#cdd6f4",
    fontWeight: "500",
  },

  // Math
  ".md-math-fence": {
    color: "#6c7086",
    fontSize: "0.85em",
  },
  ".md-math-block-line": {
    background: "rgba(203, 166, 247, 0.04)",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "0.9em",
    color: "#cba6f7",
  },
  "& .md-math-inline": {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "0.9em",
    color: "#cba6f7",
    background: "rgba(203, 166, 247, 0.08)",
    padding: "0.1em 0.35em",
    borderRadius: "3px",
  },

  // Footnotes
  ".md-footnote-def": {
    fontSize: "0.9em",
    color: "#a6adc8",
    borderLeft: "2px solid #6c7086",
    paddingLeft: "0.75em",
  },
  "& .md-footnote-label": {
    fontWeight: "600",
    color: "var(--accent)",
    fontSize: "0.85em",
  },
  "& .md-footnote-ref": {
    color: "var(--accent)",
    fontWeight: "600",
    fontSize: "0.75em",
    cursor: "pointer",
    verticalAlign: "super",
  },

  // Wikilinks
  "& .md-wikilink": {
    color: "var(--accent)",
    borderBottom: "1px dashed color-mix(in srgb, var(--accent) 40%, transparent)",
    cursor: "pointer",
  },
  "& .md-embed": {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    color: "#a6adc8",
    background: "color-mix(in srgb, var(--accent) 6%, transparent)",
    padding: "0.15em 0.5em",
    borderRadius: "4px",
    border: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)",
    fontSize: "0.9em",
  },
  "& .md-embed-icon": {
    fontSize: "0.85em",
    opacity: "0.6",
  },

  // Highlight
  "& .md-highlight mark": {
    background: "rgba(249, 226, 175, 0.2)",
    color: "#f9e2af",
    padding: "0.05em 0.2em",
    borderRadius: "2px",
  },

  // Superscript / Subscript
  "& .md-superscript sup": {
    color: "#89dceb",
    fontSize: "0.8em",
  },
  "& .md-subscript sub": {
    color: "#89dceb",
    fontSize: "0.8em",
  },

  // Tags
  "& .md-tag": {
    color: "#a6e3a1",
    background: "rgba(166, 227, 161, 0.08)",
    padding: "0.1em 0.4em",
    borderRadius: "3px",
    fontSize: "0.9em",
    cursor: "pointer",
  },

  // Inline HTML (<kbd>, <mark>, etc.)
  "& .md-inline-html": {
    display: "inline",
  },
  "& .md-inline-html kbd": {
    display: "inline-block",
    padding: "0.1em 0.45em",
    fontSize: "0.85em",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    color: "#cdd6f4",
    background: "#313244",
    border: "1px solid #45475a",
    borderBottom: "2px solid #45475a",
    borderRadius: "4px",
    boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
    lineHeight: "1.2",
  },
  "& .md-inline-html mark": {
    background: "rgba(249, 226, 175, 0.2)",
    color: "#f9e2af",
    padding: "0.05em 0.2em",
    borderRadius: "2px",
  },
  "& .md-inline-html u": {
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
    textUnderlineOffset: "2px",
  },
  "& .md-inline-html abbr": {
    borderBottom: "1px dotted #6c7086",
    cursor: "help",
  },
  "& .md-inline-html small": {
    fontSize: "0.85em",
    opacity: "0.8",
  },

  // Block-level HTML
  ".md-html-hidden": {
    fontSize: "0 !important",
    lineHeight: "0 !important",
    height: "0 !important",
    padding: "0 !important",
    margin: "0 !important",
    overflow: "hidden",
  },
  ".md-html-block": {
    background: "rgba(49, 50, 68, 0.15)",
    borderLeft: "2px solid rgba(108, 112, 134, 0.3)",
    paddingLeft: "0.75em",
  },
  "& .md-html-inline-block": {
    display: "inline-block",
    width: "100%",
  },

  // Definition lists
  ".md-definition": {
    paddingLeft: "1.5em",
    color: "#a6adc8",
  },
  "& .md-def-marker": {
    display: "inline-block",
    width: "0.5em",
    marginRight: "0.5em",
  },
  "& .md-def-marker::before": {
    content: '""',
    display: "inline-block",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#6c7086",
    marginRight: "6px",
    verticalAlign: "middle",
  },
});

/** Syntax highlighting for raw markdown (cursor lines show source). */
export const mdHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: "var(--accent)", fontWeight: "bold", fontSize: "1.4em" },
  { tag: tags.heading2, color: "#cba6f7", fontWeight: "bold", fontSize: "1.2em" },
  { tag: tags.heading3, color: "#a6e3a1", fontWeight: "bold", fontSize: "1.1em" },
  { tag: tags.heading4, color: "#f9e2af", fontWeight: "bold" },
  { tag: tags.heading5, color: "#fab387", fontWeight: "bold" },
  { tag: tags.heading6, color: "#f38ba8", fontWeight: "bold" },
  { tag: tags.strong, color: "#cdd6f4", fontWeight: "bold" },
  { tag: tags.emphasis, color: "#cdd6f4", fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", opacity: "0.6" },
  { tag: tags.monospace, color: "#cba6f7", fontFamily: "monospace" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--accent)", opacity: "0.7" },
  { tag: tags.quote, color: "#a6adc8" },
  { tag: tags.meta, color: "#6c7086" },
  { tag: tags.processingInstruction, color: "#6c7086" },
]);

/** Main editor appearance theme. */
export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    background: "#1e1e2e",
    color: "#cdd6f4",
    fontSize: "15px",
  },
  ".cm-scroller": {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    lineHeight: "1.75",
    padding: "1rem 2rem",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    maxWidth: "800px",
    margin: "0 auto",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent) !important",
    borderLeftWidth: "2px !important",
  },
  ".cm-activeLine": {
    background: "rgba(49, 50, 68, 0.3) !important",
  },
  ".cm-selectionBackground": {
    background: "color-mix(in srgb, var(--accent) 20%, transparent) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    background: "color-mix(in srgb, var(--accent) 30%, transparent) !important",
  },
  ".cm-gutters": { display: "none" },
});
