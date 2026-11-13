import { registerCodeBlockProcessor } from "@/lib/markdown-code-block-registry";
import { highlightPieces, type VaultSearchResult } from "@/lib/vault-search";

/** How many notes an embedded search shows before it says there are more. */
const MAX_NOTES = 50;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function currentVaultPath(): string | null {
  return document.querySelector("[data-vault-path]")?.getAttribute("data-vault-path") || null;
}

/** Draw a search result as a list of notes with their matching lines. */
function renderResult(container: HTMLElement, result: VaultSearchResult): void {
  container.textContent = "";
  if (result.error) {
    container.appendChild(el("div", "md-query-error", result.error));
    return;
  }
  if (result.files.length === 0) {
    container.appendChild(el("div", "md-query-empty", "No results"));
    return;
  }
  for (const file of result.files.slice(0, MAX_NOTES)) {
    const row = el("div", "md-query-file");
    // A wiki link by path, so a click opens the note like any other link.
    const link = el("span", "md-wikilink", file.name.replace(/\.(md|markdown)$/i, ""));
    link.setAttribute("data-target", file.relativePath.replace(/\.(md|markdown)$/i, ""));
    row.appendChild(link);
    container.appendChild(row);
    for (const line of file.lines.slice(0, 5)) {
      const lineEl = el("div", "md-query-line");
      const indent = line.text.length - line.text.trimStart().length;
      const ranges = line.ranges.map(([from, to]) => [Math.max(0, from - indent), Math.max(0, to - indent)] as [number, number]);
      for (const piece of highlightPieces(line.text.trimStart(), ranges)) {
        lineEl.appendChild(piece.match ? el("mark", "search-highlight", piece.text) : document.createTextNode(piece.text));
      }
      container.appendChild(lineEl);
    }
    const more = file.lines.length - 5 + file.moreLines;
    if (more > 0) container.appendChild(el("div", "md-query-more", `and ${more} more`));
  }
  if (result.totalFiles > MAX_NOTES) {
    container.appendChild(el("div", "md-query-more", `${result.totalFiles - MAX_NOTES} more notes not shown`));
  }
}

/**
 * ```query
 * tag:#work task-todo:call
 * ```
 * shows the notes the search finds, in place, with the same query language
 * as the search panel. The results are found again each time the block is
 * drawn, which is whenever the note is opened or the block edited.
 */
export function registerQueryBlock(): void {
  registerCodeBlockProcessor("core", "query", (source, container) => {
    const query = source.trim();
    container.classList.add("md-query");
    const header = el("div", "md-query-header", query ? `Search: ${query}` : "Search");
    const body = el("div", "md-query-body", query ? "Searching..." : "Write a search between the fences.");
    container.append(header, body);

    const vaultPath = currentVaultPath();
    if (!query || !vaultPath || !window.electronAPI?.searchVault) return;
    let cancelled = false;
    window.electronAPI
      .searchVault(vaultPath, query, { sort: "modifiedNew" })
      .then((result) => {
        if (!cancelled) renderResult(body, result);
      })
      .catch(() => {
        if (!cancelled) body.textContent = "The search could not be run.";
      });
    return () => {
      cancelled = true;
    };
  });
}
