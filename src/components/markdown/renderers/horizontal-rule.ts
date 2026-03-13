import { Decoration } from "@codemirror/view";
import { RenderedMarkdownWidget } from "../widget";
import type { BlockRenderer, BlockContext } from "../types";

const hrRegex = /^(---|\*\*\*|___)$/;

export const horizontalRuleRenderer: BlockRenderer = {
  name: "horizontal-rule",
  process(ctx: BlockContext): boolean {
    if (!hrRegex.test(ctx.text)) return false;

    ctx.builder.add(
      ctx.line.from,
      ctx.line.to,
      Decoration.replace({
        widget: new RenderedMarkdownWidget("<hr/>", "md-hr"),
      })
    );

    return true;
  },
};
