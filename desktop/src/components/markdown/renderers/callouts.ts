import { Decoration, WidgetType, type EditorView } from "@codemirror/view";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { RenderedMarkdownWidget } from "../widget";
import { CALLOUT_HEADER, calloutFoldAt, toggleCalloutFold } from "../callout-folds";
import type { BlockRenderer, BlockContext } from "../types";

/**
 * The header of a callout that can be folded (`> [!tip]-` or `> [!tip]+`):
 * the same header, with an arrow at its end that folds and opens it. In the
 * reading view the whole header does, since there is nothing to edit there.
 * In the editor a click anywhere else on the header still puts the cursor on
 * the line, which shows it as written.
 */
class CalloutHeaderWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly folded: boolean,
    readonly reading: boolean
  ) {
    super();
  }

  eq(other: CalloutHeaderWidget) {
    return this.html === other.html && this.folded === other.folded && this.reading === other.reading;
  }

  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className =
      "md-callout md-callout-foldable" +
      (this.folded ? " md-callout-folded" : "") +
      (this.reading ? " md-callout-reading" : "");
    span.innerHTML = sanitizeHtml(this.html);

    const arrow = document.createElement("span");
    arrow.className = "md-callout-fold";
    arrow.setAttribute("role", "button");
    arrow.setAttribute("aria-expanded", String(!this.folded));
    arrow.title = this.folded ? "Open" : "Fold";
    (span.querySelector(".md-callout-header") ?? span).appendChild(arrow);

    (this.reading ? span : arrow).addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      // Where the header is now: the note may have changed since this was drawn.
      const header = view.state.doc.lineAt(view.posAtDOM(span)).from;
      view.dispatch({ effects: toggleCalloutFold.of(header) });
    });
    return span;
  }

  ignoreEvent(event: Event) {
    if (event.type !== "mousedown" && event.type !== "click") return false;
    if (this.reading) return true;
    return event.target instanceof Element && event.target.closest(".md-callout-fold") !== null;
  }
}

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
    const match = ctx.text.match(CALLOUT_HEADER);
    if (!match) return false;

    const type = match[1].toLowerCase();
    // match[2] is the fold mark, `+` or `-`: it is read, not shown.
    const content = match[3];
    const icon = calloutIcons[type] || "&#8505;";
    const color = calloutColors[type] || "#89b4fa";
    const html =
      `<span class="md-callout-header" style="--callout-color: ${color}">` +
      `<span class="md-callout-icon">${icon}</span>` +
      `<span class="md-callout-type">${type.charAt(0).toUpperCase() + type.slice(1)}</span>` +
      (content ? `<span class="md-callout-title">${content}</span>` : "") +
      `</span>`;
    // Null when there is no mark, or nothing under the header to fold.
    const fold = ctx.state ? calloutFoldAt(ctx.state, ctx.line.from) : null;

    ctx.builder.add(
      ctx.line.from,
      ctx.line.to,
      Decoration.replace({
        widget:
          fold === null
            ? new RenderedMarkdownWidget(html, "md-callout")
            : new CalloutHeaderWidget(html, fold === "folded", ctx.reading === true),
      })
    );

    return true;
  },
};
