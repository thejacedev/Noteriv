import { Decoration, WidgetType, EditorView } from "@codemirror/view";
import { RenderedMarkdownWidget } from "../widget";
import type { BlockRenderer, BlockContext } from "../types";

const tableRowRegex = /^\|(.+)\|\s*$/;
const separatorRegex = /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|\s*$/;
const checkboxInCellRegex = /\[([xX ])\]/g;

interface CellCheckbox {
  pos: number;    // absolute document position of '['
  checked: boolean;
}

/** Render cell text — converts [ ] / [x] to visual checkbox spans */
function renderCell(cell: string): string {
  return cell.replace(/\[([xX ])\]/g, (_, state) => {
    const checked = state.toLowerCase() === "x";
    return `<span class="md-table-checkbox ${checked ? "checked" : ""}"><span class="md-cb-box">${checked ? "\u2713" : ""}</span></span>`;
  });
}

class TableRowWidget extends WidgetType {
  constructor(
    readonly cellsHtml: string,
    readonly checkboxes: CellCheckbox[]
  ) {
    super();
  }

  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "md-table-row-inner";
    span.innerHTML = this.cellsHtml;

    const cbEls = span.querySelectorAll<HTMLElement>(".md-table-checkbox");
    cbEls.forEach((el, i) => {
      const cb = this.checkboxes[i];
      if (!cb) return;
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const newChar = cb.checked ? " " : "x";
        view.dispatch({ changes: { from: cb.pos + 1, to: cb.pos + 2, insert: newChar } });
      });
    });

    return span;
  }

  eq(other: TableRowWidget) {
    return (
      this.cellsHtml === other.cellsHtml &&
      this.checkboxes.length === other.checkboxes.length &&
      this.checkboxes.every((c, i) => c.pos === other.checkboxes[i].pos && c.checked === other.checkboxes[i].checked)
    );
  }

  ignoreEvent(e: Event) {
    if (e.type === "mousedown") {
      const target = e.target as HTMLElement;
      if (target.closest(".md-table-checkbox")) return true;
    }
    return false;
  }
}

export const tableRenderer: BlockRenderer = {
  name: "tables",
  process(ctx: BlockContext): boolean {
    const match = ctx.text.match(tableRowRegex);
    if (!match) return false;

    // Separator rows (|---|---|)
    if (separatorRegex.test(ctx.text)) {
      ctx.builder.add(
        ctx.line.from,
        ctx.line.to,
        Decoration.replace({
          widget: new RenderedMarkdownWidget(
            '<div class="md-table-sep"></div>',
            "md-table-sep-wrapper"
          ),
        })
      );
      return true;
    }

    // Collect checkbox positions from raw line text
    const checkboxes: CellCheckbox[] = [];
    checkboxInCellRegex.lastIndex = 0;
    let cbMatch: RegExpExecArray | null;
    while ((cbMatch = checkboxInCellRegex.exec(ctx.text)) !== null) {
      checkboxes.push({
        pos: ctx.line.from + cbMatch.index,
        checked: cbMatch[1].toLowerCase() === "x",
      });
    }

    // Build cell HTML
    const cells = match[1].split("|").map((c) => c.trim());
    const cellsHtml = cells
      .map((cell) => `<span class="md-table-cell">${renderCell(cell)}</span>`)
      .join('<span class="md-table-divider">|</span>');

    ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-table-row" }));
    ctx.builder.add(
      ctx.line.from,
      ctx.line.to,
      Decoration.replace({
        widget: new TableRowWidget(cellsHtml, checkboxes),
      })
    );

    return true;
  },
};
