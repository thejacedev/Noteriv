import { Decoration, WidgetType, EditorView } from "@codemirror/view";
import { extractHeadings } from "@/lib/toc-utils";

class TocWidget extends WidgetType {
  constructor(readonly headings: { level: number; text: string; line: number }[]) {
    super();
  }

  toDOM(view: EditorView) {
    const container = document.createElement("nav");
    container.className = "md-toc";
    container.style.cssText = "background:#313244;border:1px solid #45475a;border-radius:8px;padding:12px 16px;margin:4px 0";

    const title = document.createElement("div");
    title.style.cssText = "font-size:11px;font-weight:600;color:#a6adc8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px";
    title.textContent = "Table of Contents";
    container.appendChild(title);

    if (this.headings.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#585b70;font-size:12px";
      empty.textContent = "No headings found";
      container.appendChild(empty);
      return container;
    }

    const minLevel = Math.min(...this.headings.map((h) => h.level));
    const ul = document.createElement("ul");
    ul.style.cssText = "list-style:none;padding:0;margin:0;font-size:13px;line-height:1.8";

    for (const h of this.headings) {
      const li = document.createElement("li");
      li.style.marginLeft = `${(h.level - minLevel) * 16}px`;

      const link = document.createElement("a");
      link.style.cssText = "color:#89b4fa;text-decoration:none;cursor:pointer";
      link.textContent = h.text;
      link.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const docLine = view.state.doc.line(h.line);
        view.dispatch({
          selection: { anchor: docLine.from },
          scrollIntoView: true,
        });
        view.focus();
      });

      li.appendChild(link);
      ul.appendChild(li);
    }

    container.appendChild(ul);
    return container;
  }

  ignoreEvent() { return false; }

  eq(other: TocWidget) {
    if (this.headings.length !== other.headings.length) return false;
    for (let i = 0; i < this.headings.length; i++) {
      const a = this.headings[i], b = other.headings[i];
      if (a.level !== b.level || a.text !== b.text || a.line !== b.line) return false;
    }
    return true;
  }
}

/**
 * Process a [TOC] line — call from buildDecorations in plugin.ts.
 * Returns true if the line was a [TOC] block and was handled.
 */
export function processTocLine(
  builder: import("@codemirror/state").RangeSetBuilder<Decoration>,
  line: import("@codemirror/state").Line,
  text: string,
  isCursorLine: boolean,
  fullDoc: string
): boolean {
  if (text.trim() !== "[TOC]") return false;
  if (isCursorLine) return true; // Show raw [TOC] when cursor is on it

  const headings = extractHeadings(fullDoc);

  builder.add(
    line.from,
    line.to,
    Decoration.replace({
      widget: new TocWidget(headings),
    })
  );

  return true;
}
