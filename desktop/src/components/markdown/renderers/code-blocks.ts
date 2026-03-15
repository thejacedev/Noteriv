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

class CodeBlockWidget extends WidgetType {
  constructor(readonly lang: string, readonly code: string) {
    super();
  }

  toDOM() {
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
