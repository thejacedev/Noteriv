/**
 * Note Publish / Share — export a note as a standalone HTML page
 * using the user's current theme colors.
 */

import { markdownToHTML } from "./markdown-to-html";

/** Read the current theme's CSS variables from the document */
function getCurrentThemeColors(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const vars: Record<string, string> = {};
  const names = [
    "bg-primary", "bg-secondary", "bg-tertiary", "border",
    "text-primary", "text-secondary", "text-muted",
    "accent", "green", "red", "yellow", "blue", "mauve", "peach", "teal", "pink",
  ];
  for (const name of names) {
    const val = style.getPropertyValue(`--${name}`).trim();
    if (val) vars[name] = val;
  }
  return vars;
}

/** Generate a complete standalone HTML page from markdown content using current theme */
export function generatePublishHTML(markdown: string, title: string): string {
  const body = markdownToHTML(markdown);
  const c = getCurrentThemeColors();

  const bg = c["bg-primary"] || "#1e1e2e";
  const surface = c["bg-secondary"] || "#313244";
  const overlay = c["bg-tertiary"] || "#45475a";
  const border = c["border"] || "#45475a";
  const text = c["text-primary"] || "#cdd6f4";
  const subtext = c["text-secondary"] || "#a6adc8";
  const muted = c["text-muted"] || "#585b70";
  const blue = c["blue"] || c["accent"] || "#89b4fa";
  const green = c["green"] || "#a6e3a1";
  const red = c["red"] || "#f38ba8";
  const yellow = c["yellow"] || "#f9e2af";
  const mauve = c["mauve"] || "#cba6f7";
  const peach = c["peach"] || "#fab387";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: ${bg};
    --surface: ${surface};
    --overlay: ${overlay};
    --border: ${border};
    --text: ${text};
    --subtext: ${subtext};
    --muted: ${muted};
    --blue: ${blue};
    --green: ${green};
    --red: ${red};
    --yellow: ${yellow};
    --mauve: ${mauve};
    --peach: ${peach};
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.7;
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 24px;
    font-size: 15px;
  }
  h1 { font-size: 2em; margin: 1.2em 0 0.6em; color: var(--text); font-weight: 700; }
  h2 { font-size: 1.5em; margin: 1.1em 0 0.5em; color: var(--text); font-weight: 600; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  h3 { font-size: 1.25em; margin: 1em 0 0.4em; color: var(--text); font-weight: 600; }
  h4, h5, h6 { font-size: 1.1em; margin: 0.8em 0 0.3em; color: var(--subtext); font-weight: 600; }
  p { margin: 0.6em 0; }
  a { color: var(--blue); text-decoration: none; }
  a:hover { text-decoration: underline; }
  strong { color: var(--text); font-weight: 600; }
  em { font-style: italic; }
  del { color: var(--muted); }
  code {
    background: var(--surface);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.9em;
  }
  pre {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    margin: 12px 0;
  }
  pre code { background: none; padding: 0; font-size: 13px; }
  blockquote {
    border-left: 3px solid var(--blue);
    padding: 4px 16px;
    margin: 12px 0;
    color: var(--subtext);
    background: var(--surface);
    border-radius: 0 6px 6px 0;
  }
  ul, ol { padding-left: 24px; margin: 8px 0; }
  li { margin: 4px 0; }
  li input[type="checkbox"] { margin-right: 6px; accent-color: var(--blue); }
  hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
  th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--border); color: var(--subtext); font-weight: 600; }
  td { padding: 8px 12px; border-bottom: 1px solid var(--surface); }
  img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
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

/** Prompt user where to save, write HTML, and open it */
export async function publishNote(content: string, title: string): Promise<string | null> {
  if (!window.electronAPI) return null;
  const html = generatePublishHTML(content, title);
  const defaultPath = `${title.replace(/[^a-zA-Z0-9-_ ]/g, "")}.html`;
  const filePath = await window.electronAPI.saveHtmlDialog(defaultPath);
  if (!filePath) return null;
  const success = await window.electronAPI.writeFile(filePath, html);
  return success ? filePath : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
