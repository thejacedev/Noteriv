import { WidgetType } from "@codemirror/view";

/** A CodeMirror widget that renders arbitrary HTML inline. */
export class RenderedMarkdownWidget extends WidgetType {
  constructor(readonly html: string, readonly className: string) {
    super();
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.className;
    span.innerHTML = this.html;
    return span;
  }
  ignoreEvent(e: Event) {
    // Let images handle their own clicks (for resize/select)
    if (this.className === "md-image") return true;
    // Let click events through for interactive elements (wikilinks, links, etc)
    if (e.type === "mousedown") {
      const target = e.target as HTMLElement;
      if (target.closest(".md-img-wrapper")) return true;
    }
    return false;
  }
}
