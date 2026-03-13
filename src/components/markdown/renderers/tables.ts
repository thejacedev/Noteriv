import { Decoration } from "@codemirror/view";
import { RenderedMarkdownWidget } from "../widget";
import type { BlockRenderer, BlockContext } from "../types";

const tableRowRegex = /^\|(.+)\|$/;
const separatorRegex = /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/;

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

    // Data rows — render cells
    const cells = match[1].split("|").map((c) => c.trim());
    const cellsHtml = cells
      .map((cell) => `<span class="md-table-cell">${cell}</span>`)
      .join('<span class="md-table-divider">|</span>');

    ctx.builder.add(ctx.line.from, ctx.line.from, Decoration.line({ class: "md-table-row" }));
    ctx.builder.add(
      ctx.line.from,
      ctx.line.to,
      Decoration.replace({
        widget: new RenderedMarkdownWidget(cellsHtml, "md-table-row-inner"),
      })
    );

    return true;
  },
};
