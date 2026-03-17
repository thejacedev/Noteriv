/**
 * Publish a note as a standalone HTML page.
 * Uses a simple markdown-to-HTML converter with Catppuccin-style theming.
 */

export function generatePublishHTML(markdown: string, title: string): string {
  const body = markdownToHTML(markdown);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #1e1e2e;
    color: #cdd6f4;
    line-height: 1.7;
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 24px;
    font-size: 15px;
  }
  h1 { font-size: 2em; margin: 1.2em 0 0.6em; font-weight: 700; }
  h2 { font-size: 1.5em; margin: 1.1em 0 0.5em; font-weight: 600; border-bottom: 1px solid #313244; padding-bottom: 4px; }
  h3 { font-size: 1.25em; margin: 1em 0 0.4em; font-weight: 600; }
  h4, h5, h6 { font-size: 1.1em; margin: 0.8em 0 0.3em; color: #a6adc8; font-weight: 600; }
  p { margin: 0.6em 0; }
  a { color: #89b4fa; text-decoration: none; }
  a:hover { text-decoration: underline; }
  strong { font-weight: 600; }
  del { color: #6c7086; }
  code {
    background: #313244;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', Menlo, monospace;
    font-size: 0.9em;
  }
  pre {
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    margin: 12px 0;
  }
  pre code { background: none; padding: 0; font-size: 13px; }
  blockquote {
    border-left: 3px solid #89b4fa;
    padding: 4px 16px;
    margin: 12px 0;
    color: #a6adc8;
    background: #181825;
    border-radius: 0 6px 6px 0;
  }
  ul, ol { padding-left: 24px; margin: 8px 0; }
  li { margin: 4px 0; }
  hr { border: none; border-top: 1px solid #313244; margin: 24px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
  th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #313244; color: #a6adc8; font-weight: 600; }
  td { padding: 8px 12px; border-bottom: 1px solid #181825; }
  img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
  mark { background: rgba(249, 226, 175, 0.2); color: #f9e2af; padding: 1px 4px; border-radius: 3px; }
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #313244;
    font-size: 12px;
    color: #6c7086;
    text-align: center;
  }
</style>
</head>
<body>
${body}
<div class="footer">Published with <a href="https://github.com/thejacedev/Noteriv">Noteriv</a></div>
</body>
</html>`;
}

function markdownToHTML(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (line.match(/^```/)) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++;
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      html.push(`<pre><code${langAttr}>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    // Horizontal rule
    if (line.match(/^(\*{3,}|-{3,}|_{3,})\s*$/)) {
      html.push('<hr>');
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.match(/^>\s?/)) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].match(/^>\s?/)) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote><p>${inlineFormat(quoteLines.join('\n'))}</p></blockquote>`);
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^\|?\s*[-:]+[-|:\s]*$/)) {
      const headers = parseTableRow(lines[i]);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      const ths = headers.map((h) => `<th>${inlineFormat(h)}</th>`).join('');
      const trs = rows.map((r) => `<tr>${r.map((c) => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`).join('\n');
      html.push(`<table>\n<thead><tr>${ths}</tr></thead>\n<tbody>\n${trs}\n</tbody>\n</table>`);
      continue;
    }

    // Unordered list
    if (line.match(/^(\s*)([-*+])\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^(\s*)([-*+])\s/)) {
        const text = lines[i].replace(/^(\s*)([-*+])\s/, '');
        const taskMatch = text.match(/^\[([ xX])\]\s*(.*)/);
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === 'x';
          items.push(`<li><input type="checkbox" ${checked ? 'checked' : ''} disabled> ${inlineFormat(taskMatch[2])}</li>`);
        } else {
          items.push(`<li>${inlineFormat(text)}</li>`);
        }
        i++;
      }
      html.push(`<ul>\n${items.join('\n')}\n</ul>`);
      continue;
    }

    // Ordered list
    if (line.match(/^(\s*)\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^(\s*)\d+\.\s/)) {
        const text = lines[i].replace(/^(\s*)\d+\.\s/, '');
        items.push(`<li>${inlineFormat(text)}</li>`);
        i++;
      }
      html.push(`<ol>\n${items.join('\n')}\n</ol>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].match(/^>\s?/) &&
      !lines[i].match(/^```/) &&
      !lines[i].match(/^(\*{3,}|-{3,}|_{3,})\s*$/) &&
      !lines[i].match(/^(\s*)([-*+])\s/) &&
      !lines[i].match(/^(\s*)\d+\.\s/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      html.push(`<p>${inlineFormat(paraLines.join('\n'))}</p>`);
    }
  }

  return html.join('\n');
}

function inlineFormat(text: string): string {
  let r = escapeHtml(text);
  r = r.replace(/`([^`]+)`/g, '<code>$1</code>');
  r = r.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  r = r.replace(/\*{3}(.+?)\*{3}/g, '<strong><em>$1</em></strong>');
  r = r.replace(/\*{2}(.+?)\*{2}/g, '<strong>$1</strong>');
  r = r.replace(/\*(.+?)\*/g, '<em>$1</em>');
  r = r.replace(/~~(.+?)~~/g, '<del>$1</del>');
  r = r.replace(/==(.+?)==/g, '<mark>$1</mark>');
  r = r.replace(/\n/g, '<br>');
  return r;
}

function parseTableRow(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
