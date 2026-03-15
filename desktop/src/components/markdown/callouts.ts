import {
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { renderAllLines } from "./plugin";
import type { Extension } from "@codemirror/state";

// ── Callout type definitions ──

/** Regex to match the first line of a callout: > [!type](+|-)? Optional Title */
const calloutHeaderRegex = /^>\s*\[!(\w+)\]([+-])?\s*(.*)?$/;

/** Regex for continuation lines in a blockquote/callout */
const calloutContRegex = /^>\s?(.*)$/;

/** Color mapping for each callout type */
const calloutColors: Record<string, string> = {
  note: "#89b4fa",
  info: "#89b4fa",
  todo: "#89b4fa",
  abstract: "#89b4fa",
  tip: "#a6e3a1",
  hint: "#a6e3a1",
  success: "#a6e3a1",
  important: "#cba6f7",
  example: "#cba6f7",
  warning: "#f9e2af",
  caution: "#f9e2af",
  question: "#f9e2af",
  danger: "#f38ba8",
  error: "#f38ba8",
  bug: "#f38ba8",
  failure: "#f38ba8",
  quote: "#a6adc8",
};

/** SVG icon paths (16x16 viewBox) for each callout type */
const calloutIcons: Record<string, string> = {
  note: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.5 2.5L13.5 4.5L5.5 12.5L2 13.5L3 10L11.5 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 4L12 6" stroke="currentColor" stroke-width="1.3"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M8 7V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="5" r="0.75" fill="currentColor"/></svg>`,
  tip: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 13H10M7 13V11.5C7 10.5 5 9 5 7C5 4.79 6.34 3 8 3C9.66 3 11 4.79 11 7C11 9 9 10.5 9 11.5V13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  hint: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 13H10M7 13V11.5C7 10.5 5 9 5 7C5 4.79 6.34 3 8 3C9.66 3 11 4.79 11 7C11 9 9 10.5 9 11.5V13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warning: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2L14 13H2L8 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 6V9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg>`,
  caution: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2L14 13H2L8 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 6V9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg>`,
  danger: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 2L2 5V11L5 14H11L14 11V5L11 2H5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 5V8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg>`,
  error: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  bug: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="8" cy="9.5" rx="3.5" ry="4" stroke="currentColor" stroke-width="1.3"/><path d="M6 6C6 4.9 6.9 3.5 8 3.5C9.1 3.5 10 4.9 10 6" stroke="currentColor" stroke-width="1.3"/><path d="M3 8H5M11 8H13M3.5 11L5 10.5M12.5 11L11 10.5M4 6L5.5 7M12 6L10.5 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  example: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M6 5H10M6 8H10M6 11H8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  quote: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 9.5C3 7.5 4.5 5 7 4L7.5 5C6 5.8 5.2 7 5 8H6.5C7.3 8 7.5 8.5 7.5 9V11.5C7.5 12 7 12.5 6.5 12.5H4.5C3.7 12.5 3 12 3 11V9.5Z" fill="currentColor"/><path d="M9 9.5C9 7.5 10.5 5 13 4L13.5 5C12 5.8 11.2 7 11 8H12.5C13.3 8 13.5 8.5 13.5 9V11.5C13.5 12 13 12.5 12.5 12.5H10.5C9.7 12.5 9 12 9 11V9.5Z" fill="currentColor"/></svg>`,
  success: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 8L7.5 10L11 5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  question: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M6 6.5C6 5.4 6.9 4.5 8 4.5C9.1 4.5 10 5.4 10 6.5C10 7.6 9 7.8 8 8.5V9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11.5" r="0.75" fill="currentColor"/></svg>`,
  failure: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  important: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M8 5V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.5" r="0.85" fill="currentColor"/></svg>`,
  todo: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 8L7 9.5L10.5 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  abstract: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M6 5H10M6 7.5H10M6 10H8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
};

// ── Callout block detection ──

interface CalloutBlock {
  type: string;
  title: string;
  foldable: "+" | "-" | null;
  headerLineNumber: number;
  bodyLineNumbers: number[];
}

/**
 * Scan the document and find all callout blocks.
 * A callout starts with `> [!type]` and continues with consecutive `> ` lines.
 */
function findCalloutBlocks(doc: EditorState["doc"]): CalloutBlock[] {
  const blocks: CalloutBlock[] = [];

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const match = line.text.match(calloutHeaderRegex);
    if (!match) continue;

    const type = match[1].toLowerCase();
    const foldable = (match[2] as "+" | "-") || null;
    const customTitle = match[3]?.trim() || "";
    const title =
      customTitle || type.charAt(0).toUpperCase() + type.slice(1);

    const bodyLines: number[] = [];
    // Collect continuation lines
    for (let j = i + 1; j <= doc.lines; j++) {
      const nextLine = doc.line(j);
      if (calloutContRegex.test(nextLine.text)) {
        bodyLines.push(j);
      } else {
        break;
      }
    }

    blocks.push({
      type,
      title,
      foldable,
      headerLineNumber: i,
      bodyLineNumbers: bodyLines,
    });

    // Skip past body lines so we don't double-detect
    i += bodyLines.length;
  }

  return blocks;
}

// ── Widgets ──

/** Chevron SVG for fold toggle */
const chevronDown = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const chevronRight = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Widget that replaces the callout header line */
class CalloutHeaderWidget extends WidgetType {
  constructor(
    readonly type: string,
    readonly title: string,
    readonly foldable: "+" | "-" | null,
    readonly collapsed: boolean
  ) {
    super();
  }

  toDOM() {
    const color = calloutColors[this.type] || "#89b4fa";
    const icon = calloutIcons[this.type] || calloutIcons.note;

    const wrapper = document.createElement("span");
    wrapper.className = "cm-callout-header";
    wrapper.style.setProperty("--callout-color", color);

    // Icon
    const iconEl = document.createElement("span");
    iconEl.className = "cm-callout-icon";
    iconEl.innerHTML = icon;
    iconEl.style.color = color;
    wrapper.appendChild(iconEl);

    // Title
    const titleEl = document.createElement("span");
    titleEl.className = "cm-callout-title";
    titleEl.style.color = color;
    titleEl.textContent = this.title;
    wrapper.appendChild(titleEl);

    // Fold toggle (only if foldable)
    if (this.foldable) {
      const foldEl = document.createElement("span");
      foldEl.className = "cm-callout-fold";
      foldEl.innerHTML = this.collapsed ? chevronRight : chevronDown;
      foldEl.style.color = color;
      wrapper.appendChild(foldEl);
    }

    return wrapper;
  }

  ignoreEvent() {
    return false;
  }

  eq(other: CalloutHeaderWidget) {
    return (
      this.type === other.type &&
      this.title === other.title &&
      this.foldable === other.foldable &&
      this.collapsed === other.collapsed
    );
  }
}

/** Widget that replaces callout body line content (stripping the `> ` prefix) */
class CalloutBodyWidget extends WidgetType {
  constructor(readonly content: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-callout-body-text";
    span.textContent = this.content;
    return span;
  }

  ignoreEvent() {
    return false;
  }

  eq(other: CalloutBodyWidget) {
    return this.content === other.content;
  }
}

// ── Decoration building ──

/** Track collapsed state per callout (keyed by line position) */
const collapsedCallouts = new Set<string>();

function getCursorLines(state: EditorState): Set<number> {
  if (state.facet(renderAllLines)) return new Set();
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let i = startLine; i <= endLine; i++) {
      lines.add(i);
    }
  }
  return lines;
}

function buildCalloutDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLines = getCursorLines(view.state);
  const doc = view.state.doc;
  const blocks = findCalloutBlocks(doc);

  for (const block of blocks) {
    const color = calloutColors[block.type] || "#89b4fa";
    const headerLine = doc.line(block.headerLineNumber);

    // Check if any line in this callout has the cursor
    const cursorOnHeader = cursorLines.has(block.headerLineNumber);
    const cursorOnBody = block.bodyLineNumbers.some((ln) =>
      cursorLines.has(ln)
    );

    // Determine collapsed state
    const calloutKey = `${block.headerLineNumber}`;
    let isCollapsed = false;
    if (block.foldable) {
      if (collapsedCallouts.has(calloutKey)) {
        isCollapsed = true;
      } else if (block.foldable === "-" && !collapsedCallouts.has(`expanded:${calloutKey}`)) {
        isCollapsed = true;
      }
    }

    // If cursor is on the header line, show raw markdown
    if (cursorOnHeader) {
      // Still apply the callout line class for styling context
      builder.add(
        headerLine.from,
        headerLine.from,
        Decoration.line({
          class: "cm-callout-line cm-callout-line-header",
          attributes: { style: `--callout-color: ${color}` },
        })
      );
    } else {
      // Replace header with widget
      builder.add(
        headerLine.from,
        headerLine.from,
        Decoration.line({
          class: "cm-callout-line cm-callout-line-header",
          attributes: { style: `--callout-color: ${color}` },
        })
      );
      builder.add(
        headerLine.from,
        headerLine.to,
        Decoration.replace({
          widget: new CalloutHeaderWidget(
            block.type,
            block.title,
            block.foldable,
            isCollapsed
          ),
        })
      );
    }

    // Body lines
    for (const lineNum of block.bodyLineNumbers) {
      const bodyLine = doc.line(lineNum);

      if (isCollapsed && !cursorOnBody) {
        // Hide the line content when collapsed
        builder.add(
          bodyLine.from,
          bodyLine.from,
          Decoration.line({
            class: "cm-callout-line cm-callout-line-body cm-callout-collapsed",
            attributes: { style: `--callout-color: ${color}` },
          })
        );
        continue;
      }

      if (cursorLines.has(lineNum)) {
        // Show raw markdown on cursor line
        builder.add(
          bodyLine.from,
          bodyLine.from,
          Decoration.line({
            class: "cm-callout-line cm-callout-line-body",
            attributes: { style: `--callout-color: ${color}` },
          })
        );
      } else {
        // Strip the `> ` prefix and show styled content
        const contMatch = bodyLine.text.match(calloutContRegex);
        const content = contMatch ? contMatch[1] : bodyLine.text;

        builder.add(
          bodyLine.from,
          bodyLine.from,
          Decoration.line({
            class: "cm-callout-line cm-callout-line-body",
            attributes: { style: `--callout-color: ${color}` },
          })
        );
        builder.add(
          bodyLine.from,
          bodyLine.to,
          Decoration.replace({
            widget: new CalloutBodyWidget(content),
          })
        );
      }
    }
  }

  return builder.finish();
}

// ── Extension export ──

/**
 * CodeMirror extension for Obsidian-style callouts/admonitions.
 *
 * Detects blockquote lines starting with `> [!type]` and renders them
 * as styled callout boxes with colored borders, icons, and optional
 * fold/collapse behavior.
 */
export function calloutExtension(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildCalloutDecorations(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged
        ) {
          this.decorations = buildCalloutDecorations(update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown: (e, view) => {
          // Handle fold toggle clicks
          const target = e.target as HTMLElement;
          const foldEl = target.closest(".cm-callout-fold");
          if (!foldEl) return false;

          e.preventDefault();
          e.stopPropagation();

          // Find which callout this fold belongs to
          const headerEl = foldEl.closest(".cm-callout-header");
          if (!headerEl) return false;

          // Find the position in the document
          const pos = view.posAtDOM(headerEl);
          const line = view.state.doc.lineAt(pos);
          const lineNum = line.number;
          const calloutKey = `${lineNum}`;

          // Determine the callout's foldable state from the source
          const headerMatch = line.text.match(calloutHeaderRegex);
          // If cursor line, the widget might reconstruct — check nearby
          // We need to find the actual header for this callout
          // The header widget replaces the line, so posAtDOM gives us the line start

          // Toggle collapsed state
          if (collapsedCallouts.has(calloutKey)) {
            collapsedCallouts.delete(calloutKey);
            // For `-` type callouts, mark explicitly expanded
            if (headerMatch && headerMatch[2] === "-") {
              collapsedCallouts.add(`expanded:${calloutKey}`);
            }
          } else {
            // Check if it's expanded from a `-` default
            const expandedKey = `expanded:${calloutKey}`;
            if (collapsedCallouts.has(expandedKey)) {
              collapsedCallouts.delete(expandedKey);
            } else {
              collapsedCallouts.add(calloutKey);
            }
          }

          // Force redraw
          view.dispatch({ effects: [] });

          return true;
        },
      },
    }
  );

  return [plugin];
}
