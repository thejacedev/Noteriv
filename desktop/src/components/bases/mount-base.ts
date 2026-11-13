/**
 * Draws a base: its views as a table, cards or a list, with a search box
 * and a way to switch between views. Plain DOM rather than React, because
 * the same drawing is used in a tab of its own and inside a note, where the
 * editor hands over an element and nothing more.
 *
 * A base is shown, not edited, here: there is no writer for the YAML, so a
 * change to a view is made in the file's text.
 */

import {
  VIEW_TYPES,
  formatValue,
  isError,
  isKind,
  parseBase,
  runView,
  toCsv,
  type BaseFile,
  type BaseValue,
  type NoteRow,
  type SortDirection,
  type ViewColumn,
  type ViewResult,
  type ViewRow,
} from "@/lib/bases";
import { loadBaseRows } from "@/lib/bases-data";
import { sanitizeHtml } from "@/lib/sanitize-html";

export interface BaseMountOptions {
  vaultPath: string;
  /** The file `this` stands for in a formula, as a path inside the vault: the note the base is in, or the base itself. */
  thisFile?: string;
  /** The view to open on, by name. */
  view?: string;
  /**
   * Opens a file of the vault. Without it a link is marked the way a wiki
   * link in a note is, and the editor around it opens it.
   */
  onOpen?: (relativePath: string) => void;
  /** Inside a note: kept to a modest height. */
  embedded?: boolean;
}

export interface MountedBase {
  /** Draw again from new text. */
  update(source: string): void;
  /** Read the vault again and redraw. */
  refresh(): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const NOTE = /\.(md|markdown)$/i;

export function mountBase(container: HTMLElement, initialSource: string, options: BaseMountOptions): MountedBase {
  let source = initialSource;
  let rows: NoteRow[] | null = null;
  let failed = false;
  let destroyed = false;
  /** The view on show, by position; null until the first draw picks one. */
  let viewIndex: number | null = null;
  let search = "";
  /** A sort chosen by clicking a column, for this sitting only. */
  let sortBy: { property: string; direction: SortDirection } | null = null;
  let lastResult: ViewResult | null = null;

  container.classList.add("base-root");
  if (options.embedded) container.classList.add("base-embedded");
  const toolbar = el("div", "base-toolbar");
  const tabs = el("div", "base-tabs");
  const searchBox = el("input", "base-search");
  searchBox.type = "search";
  searchBox.placeholder = "Filter";
  searchBox.spellcheck = false;
  const count = el("span", "base-count");
  const copy = el("button", "base-btn", "Copy as CSV");
  copy.title = "Copy the rows on show, for a spreadsheet";
  const reload = el("button", "base-btn", "Refresh");
  reload.title = "Read the vault again";
  toolbar.append(tabs, searchBox, count, copy, reload);
  const notices = el("div", "base-notices");
  const body = el("div", "base-body");
  container.append(toolbar, notices, body);

  const openLink = (relativePath: string, text: string): HTMLElement => {
    const link = el("span", "base-link", text);
    link.title = relativePath;
    if (options.onOpen) {
      link.dataset.baseOpen = relativePath;
    } else {
      // The editor opens anything marked like a wiki link.
      link.classList.add("md-wikilink");
      link.dataset.target = relativePath.replace(NOTE, "");
    }
    return link;
  };

  /** One value, drawn as what it is. */
  const drawValue = (value: BaseValue, into: HTMLElement, depth = 0): void => {
    if (value === null) return;
    if (Array.isArray(value)) {
      if (depth > 3) {
        into.append(formatValue(value));
        return;
      }
      value.forEach((item, i) => {
        if (i > 0) into.append(", ");
        drawValue(item, into, depth + 1);
      });
      return;
    }
    if (typeof value === "boolean") {
      const box = el("input", "base-check");
      box.type = "checkbox";
      box.checked = value;
      box.disabled = true;
      into.append(box);
      return;
    }
    if (typeof value !== "object") {
      into.append(formatValue(value));
      return;
    }
    if (isError(value)) {
      const mark = el("span", "base-error", "⚠");
      mark.title = value.message;
      into.append(mark);
    } else if (isKind(value, "link")) {
      const shown = value.display === null ? value.path.split("/").pop()?.replace(NOTE, "") || value.path : formatValue(value.display);
      into.append(openLink(value.path + (value.subpath ?? ""), shown));
    } else if (isKind(value, "file")) {
      into.append(openLink(value.row.file.path, value.row.file.basename));
    } else if (isKind(value, "url")) {
      const link = el("a", "base-url", value.display === null ? value.href : formatValue(value.display));
      link.dataset.baseHref = value.href;
      link.title = value.href;
      into.append(link);
    } else if (isKind(value, "tag")) {
      into.append(el("span", "base-tag", `#${value.name}`));
    } else if (isKind(value, "html")) {
      const span = el("span", "base-html");
      span.innerHTML = sanitizeHtml(value.html);
      into.append(span);
    } else if (isKind(value, "image")) {
      // Only pictures from the web are shown; one in the vault is named.
      if (/^https?:\/\//i.test(value.src)) {
        const img = el("img", "base-img");
        img.src = value.src;
        img.loading = "lazy";
        img.alt = "";
        into.append(img);
      } else {
        into.append(openLink(value.src, value.src.split("/").pop() || value.src));
      }
    } else {
      into.append(formatValue(value));
    }
  };

  const drawCell = (row: ViewRow, column: ViewColumn, into: HTMLElement): void => {
    // The file's name is the way into the file.
    if (column.id === "file.name" || column.id === "file.basename") {
      into.append(openLink(row.path, column.id === "file.name" ? row.row.file.basename : formatValue(row.cells[column.id])));
      return;
    }
    drawValue(row.cells[column.id] ?? null, into);
  };

  const drawTable = (result: ViewResult): void => {
    const table = el("table", "base-table");
    const head = el("tr");
    for (const column of result.columns) {
      const th = el("th", "base-th", column.displayName);
      const sorted = sortBy?.property === column.id ? sortBy.direction : null;
      if (sorted) th.append(el("span", "base-sort", sorted === "ASC" ? " ▲" : " ▼"));
      th.title = "Click to sort by this column";
      th.addEventListener("click", () => {
        // Up, then down, then back to the order the view asks for.
        if (sortBy?.property !== column.id) sortBy = { property: column.id, direction: "ASC" };
        else if (sortBy.direction === "ASC") sortBy = { property: column.id, direction: "DESC" };
        else sortBy = null;
        draw();
      });
      head.append(th);
    }
    const thead = el("thead");
    thead.append(head);
    const tbody = el("tbody");
    const addRows = (list: ViewRow[]) => {
      for (const row of list) {
        const tr = el("tr", "base-tr");
        for (const column of result.columns) {
          const td = el("td", "base-td");
          drawCell(row, column, td);
          tr.append(td);
        }
        tbody.append(tr);
      }
    };
    const summaryRow = (summaries: ViewResult["summaries"], className: string) => {
      if (!result.columns.some((c) => summaries[c.id])) return;
      const tr = el("tr", className);
      for (const column of result.columns) {
        const td = el("td", "base-td");
        const summary = summaries[column.id];
        if (summary) {
          td.append(el("span", "base-summary-name", `${summary.name} `));
          drawValue(summary.value, td);
        }
        tr.append(td);
      }
      tbody.append(tr);
    };
    if (result.groups) {
      for (const group of result.groups) {
        const tr = el("tr", "base-group");
        const td = el("td", "base-group-cell");
        td.colSpan = Math.max(1, result.columns.length);
        td.append(el("span", "base-group-label", group.label), el("span", "base-group-count", String(group.rows.length)));
        tr.append(td);
        tbody.append(tr);
        addRows(group.rows);
        summaryRow(group.summaries, "base-summary base-summary-group");
      }
    } else {
      addRows(result.rows);
    }
    summaryRow(result.summaries, "base-summary");
    table.append(thead, tbody);
    body.append(table);
  };

  const drawCards = (result: ViewResult): void => {
    const drawGroup = (list: ViewRow[]) => {
      const grid = el("div", "base-cards");
      for (const row of list) {
        const card = el("div", "base-card");
        const cover = result.imageProperty ? row.cells[result.imageProperty] : null;
        if (cover !== null && cover !== undefined) {
          const holder = el("div", "base-card-cover");
          drawValue(isKind(cover, "image") || typeof cover !== "string" ? cover : { kind: "image", src: cover }, holder);
          card.append(holder);
        }
        const title = el("div", "base-card-title");
        title.append(openLink(row.path, row.row.file.basename));
        card.append(title);
        for (const column of result.columns) {
          if (column.id === "file.name" || column.id === "file.basename" || column.id === result.imageProperty) continue;
          const value = row.cells[column.id];
          if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) continue;
          const line = el("div", "base-card-line");
          line.append(el("span", "base-card-key", column.displayName));
          const shown = el("span", "base-card-value");
          drawValue(value, shown);
          line.append(shown);
          card.append(line);
        }
        grid.append(card);
      }
      body.append(grid);
    };
    forEachGroup(result, drawGroup);
  };

  const drawList = (result: ViewResult): void => {
    const drawGroup = (list: ViewRow[]) => {
      const ul = el("ul", "base-list");
      for (const row of list) {
        const li = el("li", "base-list-item");
        const columns = result.columns.length > 0 ? result.columns : [];
        if (columns.length === 0) li.append(openLink(row.path, row.row.file.basename));
        columns.forEach((column, i) => {
          const part = el("span", i === 0 ? "base-list-main" : "base-list-extra");
          drawCell(row, column, part);
          if (part.childNodes.length > 0) li.append(part);
        });
        ul.append(li);
      }
      body.append(ul);
    };
    forEachGroup(result, drawGroup);
  };

  const forEachGroup = (result: ViewResult, drawGroup: (rows: ViewRow[]) => void): void => {
    if (!result.groups) {
      drawGroup(result.rows);
      return;
    }
    for (const group of result.groups) {
      const header = el("div", "base-group-heading");
      header.append(el("span", "base-group-label", group.label), el("span", "base-group-count", String(group.rows.length)));
      body.append(header);
      drawGroup(group.rows);
    }
  };

  const drawTabs = (base: BaseFile, current: number): void => {
    tabs.textContent = "";
    if (base.views.length < 2) return;
    base.views.forEach((view, i) => {
      const tab = el("button", `base-tab${i === current ? " base-tab-active" : ""}`, view.name || `View ${i + 1}`);
      tab.addEventListener("click", () => {
        viewIndex = i;
        sortBy = null;
        draw();
      });
      tabs.append(tab);
    });
  };

  const notice = (text: string, className = "base-notice"): void => {
    notices.append(el("div", className, text));
  };

  function draw(): void {
    if (destroyed) return;
    body.textContent = "";
    notices.textContent = "";
    count.textContent = "";
    lastResult = null;
    const parsed = parseBase(source);
    if (!parsed.ok) {
      tabs.textContent = "";
      notice(`This base cannot be read: ${parsed.error}`, "base-notice base-notice-error");
      return;
    }
    if (failed) {
      notice("The vault could not be read.", "base-notice base-notice-error");
      return;
    }
    if (!rows) {
      body.append(el("div", "base-empty", "Reading the vault…"));
      return;
    }
    let base = parsed.base;
    // The view named by whoever embedded the base, the first time round.
    let chosen: string | number | undefined = viewIndex ?? options.view;
    if (typeof chosen === "number" && chosen >= base.views.length) chosen = undefined;
    if (sortBy && base.views.length > 0) {
      const index = typeof chosen === "number" ? chosen : Math.max(0, base.views.findIndex((v) => v.name === chosen));
      const override = sortBy;
      base = { ...base, views: base.views.map((view, i) => (i === index ? { ...view, sort: [override] } : view)) };
    }
    const thisRow = options.thisFile ? rows.find((row) => row.file.path === options.thisFile) ?? null : null;
    const result = runView(base, chosen, rows, { thisFile: thisRow, search: search.trim() || undefined });
    lastResult = result;
    viewIndex = result.index;
    drawTabs(base, result.index);

    for (const problem of result.problems) {
      const where = problem.source ? ` (${problem.source})` : "";
      const many = problem.count && problem.count > 1 ? `, on ${problem.count} files` : "";
      notice(`${problem.message}${where}${many}`);
    }
    const shown = result.rows.length;
    count.textContent =
      result.limit !== null && result.matchedCount > shown
        ? `${shown} of ${result.matchedCount}`
        : `${shown} ${shown === 1 ? "result" : "results"}`;

    if (shown === 0 && !result.groups?.length) {
      body.append(el("div", "base-empty", search.trim() ? "Nothing matches the filter." : "No files match this view."));
      return;
    }
    if (result.type === "cards") drawCards(result);
    else if (result.type === "list") drawList(result);
    else {
      if (result.type !== "table") {
        notice(
          (VIEW_TYPES as readonly string[]).includes(result.type)
            ? `A ${result.type} view is shown as a table here.`
            : `"${result.type}" is not a kind of view this app knows; it is shown as a table.`
        );
      }
      drawTable(result);
    }
  }

  const load = (): void => {
    failed = false;
    loadBaseRows(options.vaultPath)
      .then((loaded) => {
        rows = loaded;
        draw();
      })
      .catch(() => {
        failed = true;
        draw();
      });
  };

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  searchBox.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      search = searchBox.value;
      draw();
    }, 150);
  });
  copy.addEventListener("click", () => {
    if (!lastResult) return;
    void navigator.clipboard.writeText(toCsv(lastResult)).then(() => {
      copy.textContent = "Copied";
      setTimeout(() => {
        copy.textContent = "Copy as CSV";
      }, 1500);
    });
  });
  reload.addEventListener("click", () => {
    void import("@/lib/vault-index").then(({ invalidateVaultIndex }) => {
      invalidateVaultIndex();
      load();
    });
  });
  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const href = target?.closest<HTMLElement>("[data-base-href]")?.dataset.baseHref;
    if (href) {
      event.preventDefault();
      if (/^(https?:|mailto:)/i.test(href)) void window.electronAPI?.openExternal(href);
      return;
    }
    const open = target?.closest<HTMLElement>("[data-base-open]")?.dataset.baseOpen;
    if (open && options.onOpen) {
      event.preventDefault();
      options.onOpen(open);
    }
  });

  draw();
  load();

  return {
    update(next: string) {
      if (next === source) return;
      source = next;
      draw();
    },
    refresh: load,
    destroy() {
      destroyed = true;
      if (searchTimer) clearTimeout(searchTimer);
      container.textContent = "";
    },
  };
}
