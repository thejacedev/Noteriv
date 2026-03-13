/**
 * PDF Export — converts markdown to styled HTML and triggers the browser print dialog.
 */

import { markdownToHTML } from "./markdown-to-html";

/**
 * Print stylesheet for PDF export.
 * Uses serif fonts, proper margins, and page breaks before h1.
 */
const PRINT_STYLES = `
  @page {
    margin: 2cm;
    size: A4;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: "Georgia", "Times New Roman", "Palatino Linotype", serif;
    font-size: 12pt;
    line-height: 1.7;
    color: #1a1a1a;
    background: #fff;
    max-width: 100%;
    padding: 0;
  }

  h1 {
    font-size: 24pt;
    font-weight: 700;
    margin: 1.5em 0 0.5em;
    color: #111;
    border-bottom: 1px solid #ccc;
    padding-bottom: 0.3em;
    page-break-before: always;
  }

  h1:first-child {
    page-break-before: avoid;
  }

  h2 {
    font-size: 18pt;
    font-weight: 600;
    margin: 1.2em 0 0.4em;
    color: #222;
  }

  h3 {
    font-size: 14pt;
    font-weight: 600;
    margin: 1em 0 0.3em;
    color: #333;
  }

  h4, h5, h6 {
    font-size: 12pt;
    font-weight: 600;
    margin: 0.8em 0 0.3em;
    color: #444;
  }

  p {
    margin: 0.6em 0;
  }

  a {
    color: #2563eb;
    text-decoration: underline;
  }

  code {
    font-family: "Courier New", Courier, monospace;
    font-size: 0.9em;
    background: #f3f4f6;
    padding: 0.15em 0.35em;
    border-radius: 3px;
  }

  pre {
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.8em 1em;
    overflow-x: auto;
    margin: 1em 0;
    page-break-inside: avoid;
  }

  pre code {
    background: none;
    padding: 0;
    font-size: 0.85em;
    line-height: 1.5;
  }

  blockquote {
    border-left: 3px solid #9ca3af;
    padding: 0.4em 1em;
    margin: 1em 0;
    color: #4b5563;
    font-style: italic;
    page-break-inside: avoid;
  }

  ul, ol {
    padding-left: 1.5em;
    margin: 0.6em 0;
  }

  li {
    margin: 0.2em 0;
  }

  hr {
    border: none;
    border-top: 1px solid #d1d5db;
    margin: 1.5em 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    page-break-inside: avoid;
  }

  th, td {
    border: 1px solid #d1d5db;
    padding: 0.4em 0.6em;
    text-align: left;
  }

  th {
    background: #f3f4f6;
    font-weight: 600;
  }

  img {
    max-width: 100%;
    page-break-inside: avoid;
  }

  input[type="checkbox"] {
    margin-right: 0.4em;
  }

  del {
    text-decoration: line-through;
    color: #9ca3af;
  }

  .pdf-title {
    font-size: 28pt;
    font-weight: 700;
    margin-bottom: 0.5em;
    color: #111;
    border-bottom: 2px solid #111;
    padding-bottom: 0.3em;
    page-break-before: avoid;
  }
`;

/**
 * Export markdown content as a PDF via the browser's print dialog.
 * Creates a hidden iframe with styled HTML content and triggers printing.
 *
 * @param content - Markdown content to export
 * @param title - Title for the document (displayed at the top)
 */
export async function exportToPDF(
  content: string,
  title: string
): Promise<void> {
  const htmlContent = markdownToHTML(content);

  const displayTitle = title.replace(/\.(md|markdown)$/i, "");

  const fullHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(displayTitle)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="pdf-title">${escapeHtml(displayTitle)}</div>
  ${htmlContent}
</body>
</html>
  `.trim();

  // Create a hidden iframe, write the HTML, and trigger print
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-10000px";
  iframe.style.left = "-10000px";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  return new Promise<void>((resolve) => {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }

    iframeDoc.open();
    iframeDoc.write(fullHTML);
    iframeDoc.close();

    // Wait for content to render before printing
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        // Clean up after a delay to let print dialog close
        setTimeout(() => {
          document.body.removeChild(iframe);
          resolve();
        }, 1000);
      }, 250);
    };

    // Fallback: if onload doesn't fire (inline content), trigger manually
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } catch {
        // Ignore if already printing
      }
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
        resolve();
      }, 1000);
    }, 500);
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
