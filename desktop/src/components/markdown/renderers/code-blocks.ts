import { Decoration, WidgetType } from "@codemirror/view";
import { Text } from "@codemirror/state";
import type { BlockContext } from "../types";

// Simple token-based syntax highlighting
// Each language defines regex patterns with associated CSS classes

interface TokenRule {
  regex: RegExp;
  className: string;
}

const LANG_TOKENS: Record<string, TokenRule[]> = {
  javascript: [
    { regex: /\/\/.*$/gm, className: "tok-comment" },
    { regex: /\/\*[\s\S]*?\*\//gm, className: "tok-comment" },
    { regex: /(["'`])(?:(?!\1|\\).|\\.)*\1/g, className: "tok-string" },
    { regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|void|delete|null|undefined|true|false)\b/g, className: "tok-keyword" },
    { regex: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/g, className: "tok-number" },
    { regex: /\b([A-Z]\w*)\b/g, className: "tok-type" },
    { regex: /(\w+)(?=\s*\()/g, className: "tok-function" },
  ],
  typescript: [],
  python: [
    { regex: /#.*$/gm, className: "tok-comment" },
    { regex: /("""[\s\S]*?"""|'''[\s\S]*?''')/gm, className: "tok-string" },
    { regex: /(["'])(?:(?!\1|\\).|\\.)*\1/g, className: "tok-string" },
    { regex: /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|and|or|not|is|in|True|False|None|self|async|await|print)\b/g, className: "tok-keyword" },
    { regex: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/g, className: "tok-number" },
    { regex: /\b([A-Z]\w*)\b/g, className: "tok-type" },
    { regex: /@\w+/g, className: "tok-meta" },
    { regex: /(\w+)(?=\s*\()/g, className: "tok-function" },
  ],
  rust: [
    { regex: /\/\/.*$/gm, className: "tok-comment" },
    { regex: /\/\*[\s\S]*?\*\//gm, className: "tok-comment" },
    { regex: /(["'])(?:(?!\1|\\).|\\.)*\1/g, className: "tok-string" },
    { regex: /\b(fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|crate|self|super|match|if|else|for|while|loop|return|break|continue|where|as|in|ref|move|async|await|unsafe|extern|type|dyn|true|false)\b/g, className: "tok-keyword" },
    { regex: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/g, className: "tok-number" },
    { regex: /\b([A-Z]\w*)\b/g, className: "tok-type" },
    { regex: /(\w+)(?=\s*[({<])/g, className: "tok-function" },
    { regex: /&|'[a-z]\w*/g, className: "tok-meta" },
  ],
  go: [
    { regex: /\/\/.*$/gm, className: "tok-comment" },
    { regex: /\/\*[\s\S]*?\*\//gm, className: "tok-comment" },
    { regex: /(["'`])(?:(?!\1|\\).|\\.)*\1/g, className: "tok-string" },
    { regex: /\b(func|var|const|type|struct|interface|map|chan|package|import|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|true|false|nil|make|len|append|cap|new|delete)\b/g, className: "tok-keyword" },
    { regex: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/g, className: "tok-number" },
    { regex: /\b([A-Z]\w*)\b/g, className: "tok-type" },
    { regex: /(\w+)(?=\s*\()/g, className: "tok-function" },
  ],
  html: [
    { regex: /<!--[\s\S]*?-->/gm, className: "tok-comment" },
    { regex: /(["'])(?:(?!\1).)*\1/g, className: "tok-string" },
    { regex: /(&\w+;|&#\d+;)/g, className: "tok-meta" },
    { regex: /<\/?(\w+)/g, className: "tok-keyword" },
    { regex: /\b(\w+)(?==)/g, className: "tok-type" },
  ],
  css: [
    { regex: /\/\*[\s\S]*?\*\//gm, className: "tok-comment" },
    { regex: /(["'])(?:(?!\1).)*\1/g, className: "tok-string" },
    { regex: /#[\da-fA-F]{3,8}\b/g, className: "tok-number" },
    { regex: /\b(\d+\.?\d*)(px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/g, className: "tok-number" },
    { regex: /@\w+/g, className: "tok-meta" },
    { regex: /\b(var|calc|rgb|rgba|hsl|hsla|linear-gradient|radial-gradient)\b/g, className: "tok-function" },
    { regex: /[.#][\w-]+(?=\s*[{,])/g, className: "tok-type" },
    { regex: /\b[\w-]+(?=\s*:)/g, className: "tok-keyword" },
  ],
  json: [
    { regex: /(["'])(?:(?!\1|\\).|\\.)*\1(?=\s*:)/g, className: "tok-keyword" },
    { regex: /(["'])(?:(?!\1|\\).|\\.)*\1/g, className: "tok-string" },
    { regex: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/g, className: "tok-number" },
    { regex: /\b(true|false|null)\b/g, className: "tok-keyword" },
  ],
  bash: [
    { regex: /#.*$/gm, className: "tok-comment" },
    { regex: /(["'])(?:(?!\1|\\).|\\.)*\1/g, className: "tok-string" },
    { regex: /\$\w+|\$\{[^}]+\}/g, className: "tok-meta" },
    { regex: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|in|export|local|readonly|set|unset|shift|exit|echo|cd|ls|cat|grep|sed|awk|find|mkdir|rm|cp|mv|chmod|chown|sudo|apt|npm|yarn|git|docker|curl|wget)\b/g, className: "tok-keyword" },
    { regex: /\b(\d+)\b/g, className: "tok-number" },
  ],
  shell: [],
  sh: [],
  java: [
    { regex: /\/\/.*$/gm, className: "tok-comment" },
    { regex: /\/\*[\s\S]*?\*\//gm, className: "tok-comment" },
    { regex: /(["'])(?:(?!\1|\\).|\\.)*\1/g, className: "tok-string" },
    { regex: /\b(public|private|protected|static|final|abstract|class|interface|extends|implements|new|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|import|package|void|int|long|float|double|boolean|char|byte|short|String|null|true|false|this|super|enum|instanceof)\b/g, className: "tok-keyword" },
    { regex: /\b(\d+\.?\d*(?:e[+-]?\d+)?[fFdDlL]?)\b/g, className: "tok-number" },
    { regex: /\b([A-Z]\w*)\b/g, className: "tok-type" },
    { regex: /@\w+/g, className: "tok-meta" },
    { regex: /(\w+)(?=\s*\()/g, className: "tok-function" },
  ],
  c: [
    { regex: /\/\/.*$/gm, className: "tok-comment" },
    { regex: /\/\*[\s\S]*?\*\//gm, className: "tok-comment" },
    { regex: /(["'])(?:(?!\1|\\).|\\.)*\1/g, className: "tok-string" },
    { regex: /#\s*(include|define|ifdef|ifndef|endif|if|else|elif|pragma)\b.*/gm, className: "tok-meta" },
    { regex: /\b(int|char|float|double|void|long|short|unsigned|signed|struct|union|enum|typedef|static|extern|const|volatile|return|if|else|for|while|do|switch|case|break|continue|sizeof|NULL|true|false)\b/g, className: "tok-keyword" },
    { regex: /\b(\d+\.?\d*(?:e[+-]?\d+)?[fFlLuU]*)\b/g, className: "tok-number" },
    { regex: /(\w+)(?=\s*\()/g, className: "tok-function" },
  ],
  cpp: [],
  csharp: [],
  cs: [],
  jsx: [],
  tsx: [],
  yml: [],
  yaml: [
    { regex: /#.*$/gm, className: "tok-comment" },
    { regex: /(["'])(?:(?!\1|\\).|\\.)*\1/g, className: "tok-string" },
    { regex: /^[\w.-]+(?=\s*:)/gm, className: "tok-keyword" },
    { regex: /\b(true|false|null|yes|no)\b/g, className: "tok-keyword" },
    { regex: /\b(\d+\.?\d*)\b/g, className: "tok-number" },
  ],
  sql: [
    { regex: /--.*$/gm, className: "tok-comment" },
    { regex: /\/\*[\s\S]*?\*\//gm, className: "tok-comment" },
    { regex: /(["'])(?:(?!\1|\\).|\\.)*\1/g, className: "tok-string" },
    { regex: /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|VIEW|JOIN|INNER|LEFT|RIGHT|OUTER|ON|AND|OR|NOT|IN|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|INTO|VALUES|SET|DISTINCT|COUNT|SUM|AVG|MIN|MAX|LIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|BEGIN|COMMIT|ROLLBACK|PRIMARY|KEY|FOREIGN|REFERENCES|INT|VARCHAR|TEXT|BOOLEAN|DATE|TIMESTAMP)\b/gi, className: "tok-keyword" },
    { regex: /\b(\d+\.?\d*)\b/g, className: "tok-number" },
    { regex: /(\w+)(?=\s*\()/g, className: "tok-function" },
  ],
  markdown: [
    { regex: /^#{1,6}\s+.*/gm, className: "tok-keyword" },
    { regex: /\*\*[^*]+\*\*/g, className: "tok-keyword" },
    { regex: /\*[^*]+\*/g, className: "tok-string" },
    { regex: /`[^`]+`/g, className: "tok-type" },
    { regex: /\[([^\]]+)\]\([^)]+\)/g, className: "tok-function" },
  ],
  md: [],
};

// Fill aliases
LANG_TOKENS.typescript = LANG_TOKENS.javascript;
LANG_TOKENS.shell = LANG_TOKENS.bash;
LANG_TOKENS.sh = LANG_TOKENS.bash;
LANG_TOKENS.cpp = LANG_TOKENS.c;
LANG_TOKENS.csharp = LANG_TOKENS.java;
LANG_TOKENS.cs = LANG_TOKENS.java;
LANG_TOKENS.jsx = LANG_TOKENS.javascript;
LANG_TOKENS.tsx = LANG_TOKENS.javascript;
LANG_TOKENS.yml = LANG_TOKENS.yaml;
LANG_TOKENS.md = LANG_TOKENS.markdown;

/** Apply token-based highlighting to a line of code */
function highlightLine(text: string, lang: string): string {
  const rules = LANG_TOKENS[lang.toLowerCase()];
  if (!rules || rules.length === 0) return escapeHtml(text);

  const chars = new Array(text.length).fill(null);

  for (const rule of rules) {
    const re = new RegExp(rule.regex.source, rule.regex.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      let free = true;
      for (let i = m.index; i < m.index + m[0].length; i++) {
        if (chars[i] !== null) { free = false; break; }
      }
      if (free) {
        for (let i = m.index; i < m.index + m[0].length; i++) {
          chars[i] = rule.className;
        }
      }
    }
  }

  let html = "";
  let currentClass: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const cls = chars[i];
    if (cls !== currentClass) {
      if (currentClass !== null) html += "</span>";
      if (cls !== null) html += `<span class="${cls}">`;
      currentClass = cls;
    }
    html += escapeHtml(text[i]);
  }
  if (currentClass !== null) html += "</span>";

  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Full code block widget ──

interface CodeBlockInfo {
  lang: string;
  code: string;
  openLine: number;
  closeLine: number;
}

class DataviewWidget extends WidgetType {
  constructor(readonly query: string) {
    super();
  }

  toDOM() {
    const container = document.createElement("div");
    container.className = "md-dataview";
    container.style.cssText = "background:#313244;border:1px solid #45475a;border-radius:8px;padding:12px;margin:4px 0;font-size:12px;color:#cdd6f4";

    const header = document.createElement("div");
    header.style.cssText = "font-size:10px;font-weight:700;color:#89b4fa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px";
    header.textContent = "DATAVIEW";
    container.appendChild(header);

    const loading = document.createElement("div");
    loading.style.cssText = "color:#a6adc8;font-size:12px";
    loading.textContent = "Running query...";
    container.appendChild(loading);

    // Execute query async
    this.runQuery(container, loading);

    return container;
  }

  private async runQuery(container: HTMLElement, loading: HTMLElement) {
    try {
      if (!window.electronAPI) {
        loading.textContent = "Electron API not available";
        loading.style.color = "#f38ba8";
        return;
      }

      // Dynamic import to avoid circular deps
      const { parseQuery, executeQuery, parseNoteData } = await import("@/lib/dataview");

      const parsed = parseQuery(this.query);
      if ("error" in parsed) {
        loading.textContent = `Error: ${parsed.error}`;
        loading.style.color = "#f38ba8";
        return;
      }

      // Get vault path from the DOM (stored on the editor container)
      const vaultPath = document.querySelector("[data-vault-path]")?.getAttribute("data-vault-path");
      if (!vaultPath) {
        loading.textContent = "No vault path found";
        loading.style.color = "#f38ba8";
        return;
      }

      const files = await window.electronAPI.listAllFiles(vaultPath);
      const notes = [];
      for (const file of files) {
        if (!file.filePath.match(/\.(md|markdown)$/i)) continue;
        const content = await window.electronAPI.readFile(file.filePath);
        if (content === null) continue;
        notes.push(parseNoteData(file.filePath, content, { created: "", modified: "", size: content.length }));
      }

      const result = executeQuery(parsed, notes);

      // Clear loading
      container.removeChild(loading);

      if (result.type === "TABLE") {
        const table = document.createElement("table");
        table.style.cssText = "width:100%;border-collapse:collapse;font-size:12px";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        for (const f of result.fields) {
          const th = document.createElement("th");
          th.style.cssText = "text-align:left;padding:4px 8px;color:#a6adc8;font-size:11px;font-weight:600;border-bottom:1px solid #45475a";
          th.textContent = f;
          headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        for (const row of result.rows) {
          const tr = document.createElement("tr");
          tr.style.borderTop = "1px solid #313244";
          for (const f of result.fields) {
            const td = document.createElement("td");
            td.style.cssText = "padding:4px 8px;color:#cdd6f4";
            if (f === "file.name") {
              const link = document.createElement("span");
              link.className = "md-wikilink";
              link.style.cssText = "color:#89b4fa;cursor:pointer";
              link.textContent = row[f] || "";
              link.setAttribute("data-target", row["file.path"] || "");
              td.appendChild(link);
            } else {
              td.textContent = row[f] || "";
            }
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        container.appendChild(table);

        const footer = document.createElement("div");
        footer.style.cssText = "font-size:10px;color:#585b70;margin-top:8px;text-align:right";
        footer.textContent = `${result.rows.length} results`;
        container.appendChild(footer);

      } else if (result.type === "LIST") {
        const ul = document.createElement("ul");
        ul.style.cssText = "list-style:none;padding:0;margin:0";
        for (const row of result.rows) {
          const li = document.createElement("li");
          li.style.padding = "3px 0";
          const link = document.createElement("span");
          link.className = "md-wikilink";
          link.style.cssText = "color:#89b4fa;cursor:pointer";
          link.textContent = row["file.name"] || "";
          link.setAttribute("data-target", row["file.path"] || "");
          li.appendChild(link);
          ul.appendChild(li);
        }
        container.appendChild(ul);

        const footer = document.createElement("div");
        footer.style.cssText = "font-size:10px;color:#585b70;margin-top:8px;text-align:right";
        footer.textContent = `${result.rows.length} results`;
        container.appendChild(footer);

      } else if (result.type === "TASK" && result.tasks) {
        const ul = document.createElement("ul");
        ul.style.cssText = "list-style:none;padding:0;margin:0";
        for (const task of result.tasks) {
          const li = document.createElement("li");
          li.style.cssText = `display:flex;align-items:flex-start;gap:6px;padding:3px 0;color:${task.completed ? "#585b70" : "#cdd6f4"};font-size:12px`;
          const check = document.createElement("span");
          check.style.cssText = `width:14px;height:14px;border-radius:3px;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:9px;${task.completed ? "background:#a6e3a1;color:#1e1e2e" : "border:1.5px solid #585b70"}`;
          check.textContent = task.completed ? "\u2713" : "";
          li.appendChild(check);
          const text = document.createElement("span");
          text.style.textDecoration = task.completed ? "line-through" : "none";
          text.textContent = task.text;
          li.appendChild(text);
          const file = document.createElement("span");
          file.className = "md-wikilink";
          file.style.cssText = "color:#89b4fa;cursor:pointer;font-size:10px;opacity:0.6;margin-left:auto";
          file.textContent = task.fileName;
          file.setAttribute("data-target", task.filePath);
          li.appendChild(file);
          ul.appendChild(li);
        }
        container.appendChild(ul);

        const footer = document.createElement("div");
        footer.style.cssText = "font-size:10px;color:#585b70;margin-top:8px;text-align:right";
        footer.textContent = `${result.tasks.length} tasks`;
        container.appendChild(footer);
      }
    } catch (err) {
      loading.textContent = `Error: ${err}`;
      loading.style.color = "#f38ba8";
    }
  }

  ignoreEvent() { return false; }

  eq(other: DataviewWidget) {
    return this.query === other.query;
  }
}

class CodeBlockWidget extends WidgetType {
  constructor(readonly lang: string, readonly code: string) {
    super();
  }

  toDOM() {
    // Dataview blocks get a special widget
    if (this.lang === "dataview") {
      return new DataviewWidget(this.code).toDOM();
    }

    // Mermaid blocks get rendered as diagrams
    if (this.lang === "mermaid") {
      return this.renderMermaid();
    }

    const container = document.createElement("div");
    container.className = "md-codeblock";

    // Header
    const header = document.createElement("div");
    header.className = "md-codeblock-header";

    if (this.lang) {
      const langLabel = document.createElement("span");
      langLabel.className = "md-codeblock-lang";
      langLabel.textContent = this.lang;
      header.appendChild(langLabel);
    } else {
      header.appendChild(document.createElement("span"));
    }

    const copyBtn = document.createElement("button");
    copyBtn.className = "md-codeblock-copy";
    copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" stroke-width="1.3"/></svg><span>Copy</span>';
    copyBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(this.code).then(() => {
        const span = copyBtn.querySelector("span")!;
        span.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          span.textContent = "Copy";
          copyBtn.classList.remove("copied");
        }, 1500);
      });
    });
    header.appendChild(copyBtn);
    container.appendChild(header);

    // Code body
    const pre = document.createElement("pre");
    pre.className = "md-codeblock-pre";
    const codeEl = document.createElement("code");
    codeEl.className = "md-codeblock-code";

    const lines = this.code.split("\n");
    const hasHighlighting = this.lang && LANG_TOKENS[this.lang.toLowerCase()];

    codeEl.innerHTML = lines
      .map((line) => {
        const highlighted = hasHighlighting ? highlightLine(line, this.lang) : escapeHtml(line);
        return `<span class="md-codeblock-line">${highlighted || " "}</span>`;
      })
      .join("\n");

    pre.appendChild(codeEl);
    container.appendChild(pre);

    return container;
  }

  private renderMermaid(): HTMLElement {
    const container = document.createElement("div");
    container.className = "mermaid-widget";

    const header = document.createElement("div");
    header.className = "mermaid-header";
    header.innerHTML = '<span class="mermaid-label"><span class="mermaid-label-icon">&#9670;</span> Mermaid</span>';
    container.appendChild(header);

    const inner = document.createElement("div");
    inner.className = "mermaid-widget-inner";
    inner.innerHTML = '<div class="mermaid-loading"><div class="mermaid-loading-spinner"></div>Rendering diagram...</div>';
    container.appendChild(inner);

    // Lazy-load mermaid and render
    (async () => {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        if (!(mermaid as any).__initialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            themeVariables: {
              darkMode: true,
              primaryColor: "#313244",
              primaryTextColor: "#cdd6f4",
              primaryBorderColor: "#89b4fa",
              lineColor: "#6c7086",
              secondaryColor: "#45475a",
              tertiaryColor: "#1e1e2e",
              background: "#1e1e2e",
              mainBkg: "#313244",
              nodeBorder: "#89b4fa",
              clusterBkg: "#181825",
              clusterBorder: "#45475a",
              titleColor: "#cdd6f4",
              edgeLabelBackground: "#181825",
              nodeTextColor: "#cdd6f4",
            },
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            securityLevel: "loose",
          });
          (mermaid as any).__initialized = true;
        }
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const { svg } = await mermaid.render(id, this.code);
        if (container.isConnected) {
          inner.innerHTML = svg;
        }
      } catch (err: any) {
        if (container.isConnected) {
          inner.innerHTML = `<div class="mermaid-error"><div class="mermaid-error-title">&#9888; Diagram Error</div><div class="mermaid-error-message">${escapeHtml(err?.message || String(err))}</div></div>`;
        }
      }
    })();

    return container;
  }

  ignoreEvent() { return true; }

  eq(other: CodeBlockWidget) {
    return this.lang === other.lang && this.code === other.code;
  }
}

// ── Code Block Tracker ──

export class CodeBlockTracker {
  private blocks: CodeBlockInfo[] = [];
  private blockByLine = new Map<number, CodeBlockInfo>();
  inCodeBlock = false;
  currentLang = "";
  codeLines: string[] = [];
  fenceStartLine = 0;

  preScan(doc: Text) {
    this.blocks = [];
    this.blockByLine.clear();
    let inBlock = false;
    let lang = "";
    let lines: string[] = [];
    let openLine = 0;

    for (let i = 1; i <= doc.lines; i++) {
      const text = doc.line(i).text.trimStart();
      if (text.startsWith("```")) {
        if (!inBlock) {
          inBlock = true;
          lang = text.slice(3).trim();
          lines = [];
          openLine = i;
        } else {
          inBlock = false;
          const info: CodeBlockInfo = { lang, code: lines.join("\n"), openLine, closeLine: i };
          this.blocks.push(info);
          // Map every line in this block to the info
          for (let j = openLine; j <= i; j++) {
            this.blockByLine.set(j, info);
          }
        }
        continue;
      }
      if (inBlock) lines.push(doc.line(i).text);
    }
  }

  /** Check if any line in a block has the cursor */
  private blockHasCursor(info: CodeBlockInfo, cursorLines: Set<number>): boolean {
    for (let i = info.openLine; i <= info.closeLine; i++) {
      if (cursorLines.has(i)) return true;
    }
    return false;
  }

  process(ctx: BlockContext, isCursorLine: boolean, cursorLines?: Set<number>): "fence" | "inside" | null {
    const info = this.blockByLine.get(ctx.lineNumber);
    if (!info) {
      this.inCodeBlock = false;
      return null;
    }

    // If ANY line in this block has the cursor, show raw markdown for the whole block
    const blockEditing = cursorLines ? this.blockHasCursor(info, cursorLines) : isCursorLine;

    if (ctx.lineNumber === info.openLine) {
      this.inCodeBlock = true;

      if (!blockEditing) {
        ctx.builder.add(
          ctx.line.from,
          ctx.line.to,
          Decoration.replace({
            widget: new CodeBlockWidget(info.lang, info.code),
          })
        );
      }

      return "fence";
    }

    if (ctx.lineNumber === info.closeLine) {
      this.inCodeBlock = false;

      if (!blockEditing) {
        ctx.builder.add(
          ctx.line.from,
          ctx.line.from,
          Decoration.line({ class: "md-codeblock-hidden" })
        );
      }

      return "fence";
    }

    // Inside the code block
    this.inCodeBlock = true;

    if (!blockEditing) {
      ctx.builder.add(
        ctx.line.from,
        ctx.line.from,
        Decoration.line({ class: "md-codeblock-hidden" })
      );
    }

    return "inside";
  }
}
