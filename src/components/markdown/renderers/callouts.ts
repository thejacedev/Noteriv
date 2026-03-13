import { Decoration } from "@codemirror/view";
import { RenderedMarkdownWidget } from "../widget";
import type { BlockRenderer, BlockContext } from "../types";

// Obsidian-style callouts: > [!type] content
const calloutRegex = /^>\s*\[!(\w+)\]\s*(.*)$/;
// Continuation line inside a callout: > text
const calloutContRegex = /^>\s?(.*)$/;

const calloutIcons: Record<string, string> = {
  note: "&#9998;",      // pencil
  tip: "&#128161;",     // lightbulb
  info: "&#8505;",      // info
  warning: "&#9888;",   // warning
  danger: "&#9762;",    // skull
  bug: "&#128027;",     // bug
  example: "&#128196;", // page
  quote: "&#10078;",    // quote mark
  success: "&#10004;",  // checkmark
  question: "&#10067;", // question
  abstract: "&#128203;",// clipboard
  todo: "&#9744;",      // checkbox
  failure: "&#10008;",  // x mark
  important: "&#10071;",// exclamation
};

const calloutColors: Record<string, string> = {
  note: "#89b4fa",
  tip: "#a6e3a1",
  info: "#89b4fa",
  warning: "#f9e2af",
  danger: "#f38ba8",
  bug: "#f38ba8",
  example: "#cba6f7",
  quote: "#a6adc8",
  success: "#a6e3a1",
  question: "#f9e2af",
  abstract: "#89dceb",
  todo: "#89b4fa",
  failure: "#f38ba8",
  important: "#cba6f7",
};

export const calloutRenderer: BlockRenderer = {
  name: "callouts",
  process(ctx: BlockContext): boolean {
    const match = ctx.text.match(calloutRegex);
    if (!match) return false;

    const type = match[1].toLowerCase();
    const content = match[2];
    const icon = calloutIcons[type] || "&#8505;";
    const color = calloutColors[type] || "#89b4fa";

    ctx.builder.add(
      ctx.line.from,
      ctx.line.to,
      Decoration.replace({
        widget: new RenderedMarkdownWidget(
          `<span class="md-callout-header" style="--callout-color: ${color}">` +
          `<span class="md-callout-icon">${icon}</span>` +
          `<span class="md-callout-type">${type.charAt(0).toUpperCase() + type.slice(1)}</span>` +
          (content ? `<span class="md-callout-title">${content}</span>` : "") +
          `</span>`,
          "md-callout"
        ),
      })
    );

    return true;
  },
};
