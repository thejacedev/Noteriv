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
  ignoreEvent() {
    return false;
  }
}
