"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  SEARCH_OPERATORS,
  SEARCH_SORTS,
  highlightPieces,
  resultsAsText,
  searchRows,
  type SearchSort,
  type VaultSearchResult,
} from "@/lib/vault-search";

interface VaultSearchProps {
  vaultPath: string;
  /** Opens a note, at a line when the result was a line. */
  onSelect: (filePath: string, line?: number) => void;
  onClose: () => void;
  /** A search to start with, from a bookmarked search. */
  initialQuery?: string;
  isBookmarked?: (query: string) => boolean;
  onToggleBookmark?: (query: string) => void;
}

const EMPTY: VaultSearchResult = { files: [], totalFiles: 0, error: null };

export default function VaultSearch({
  vaultPath,
  onSelect,
  onClose,
  initialQuery = "",
  isBookmarked,
  onToggleBookmark,
}: VaultSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<VaultSearchResult>(EMPTY);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [sort, setSort] = useState<SearchSort>("nameAsc");
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search. A newer search replaces an older one that is still running.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || !window.electronAPI) {
      debounceRef.current = setTimeout(() => {
        setResult(EMPTY);
        setSelectedIdx(0);
        setSearching(false);
      }, 0);
      return;
    }
    let cancelled = false;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await window.electronAPI.searchVault(vaultPath, query, { caseSensitive, sort });
        if (cancelled) return;
        setResult(res);
        setSelectedIdx(0);
      } catch {
        if (!cancelled) setResult({ files: [], totalFiles: 0, error: "The search could not be run." });
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, vaultPath, caseSensitive, sort]);

  const rows = useMemo(() => searchRows(result), [result]);

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-row="${selectedIdx}"]`);
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const open = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      onSelect(row.file.filePath, row.kind === "line" ? row.line.line : undefined);
      onClose();
    },
    [rows, onSelect, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, rows.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        open(selectedIdx);
      }
    },
    [rows.length, selectedIdx, open, onClose]
  );

  const copyResults = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(resultsAsText(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The clipboard can be refused; there is nothing useful to do about it.
    }
  }, [result]);

  const lineCount = result.files.reduce((n, f) => n + f.lines.length + f.moreLines, 0);
  const shown = result.files.length;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette palette-wide" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" className="palette-icon">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search across all files..."
            className="palette-input"
            aria-label="Search the vault"
          />
          {searching && <span className="palette-spinner" />}
        </div>

        <div className="vs-options">
          <button
            type="button"
            className={`vs-toggle${caseSensitive ? " vs-toggle-on" : ""}`}
            onClick={() => setCaseSensitive((c) => !c)}
            title="Match case"
            aria-pressed={caseSensitive}
          >
            Aa
          </button>
          <select
            className="vs-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SearchSort)}
            aria-label="Sort results"
          >
            {SEARCH_SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            type="button"
            className={`vs-toggle${showHelp ? " vs-toggle-on" : ""}`}
            onClick={() => setShowHelp((h) => !h)}
            aria-expanded={showHelp}
          >
            Search options
          </button>
          <span className="vs-count">
            {query.trim() && !result.error && !searching &&
              (result.totalFiles === 0
                ? ""
                : `${lineCount} ${lineCount === 1 ? "match" : "matches"} in ${result.totalFiles} ${result.totalFiles === 1 ? "note" : "notes"}` +
                  (result.totalFiles > shown ? `, first ${shown} shown` : ""))}
          </span>
          {shown > 0 && (
            <button type="button" className="vs-toggle" onClick={copyResults}>
              {copied ? "Copied" : "Copy results"}
            </button>
          )}
          {onToggleBookmark && query.trim() && !result.error && (
            <button
              type="button"
              className={`vs-toggle${isBookmarked?.(query.trim()) ? " vs-toggle-on" : ""}`}
              onClick={() => onToggleBookmark(query.trim())}
              title={isBookmarked?.(query.trim()) ? "Remove this search from the bookmarks" : "Bookmark this search"}
              aria-pressed={!!isBookmarked?.(query.trim())}
            >
              ★
            </button>
          )}
        </div>

        {showHelp && (
          <div className="vs-help">
            {SEARCH_OPERATORS.map((op) => (
              <button
                key={op.example}
                type="button"
                className="vs-help-row"
                onClick={() => {
                  setQuery((q) => (q.trim() ? `${q.trim()} ${op.example}` : op.example));
                  inputRef.current?.focus();
                }}
                title="Add to the search"
              >
                <code>{op.example}</code>
                <span>{op.meaning}</span>
              </button>
            ))}
          </div>
        )}

        <div className="palette-list palette-list-tall" ref={listRef}>
          {rows.map((row, i) =>
            row.kind === "file" ? (
              <button
                key={`f:${row.file.filePath}`}
                data-row={i}
                className={`palette-item vs-file ${i === selectedIdx ? "palette-item-active" : ""}`}
                onClick={() => open(i)}
                onMouseEnter={() => setSelectedIdx(i)}
                title={row.file.relativePath}
              >
                <span className="search-result-file">{row.file.name.replace(/\.(md|markdown)$/i, "")}</span>
                <span className="vs-file-path">
                  {row.file.relativePath.includes("/")
                    ? row.file.relativePath.slice(0, row.file.relativePath.lastIndexOf("/"))
                    : ""}
                </span>
                {row.file.moreLines > 0 && <span className="vs-more">+{row.file.moreLines} more lines</span>}
              </button>
            ) : (
              <button
                key={`l:${row.file.filePath}:${row.line.line}`}
                data-row={i}
                className={`palette-item vs-line ${i === selectedIdx ? "palette-item-active" : ""}`}
                onClick={() => open(i)}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="search-result-line">{row.line.line}</span>
                <span className="search-result-text">
                  {highlightPieces(row.line.text.trimStart(), shiftRanges(row.line.text, row.line.ranges)).map((p, k) =>
                    p.match ? <mark key={k} className="search-highlight">{p.text}</mark> : <span key={k}>{p.text}</span>
                  )}
                </span>
              </button>
            )
          )}
          {result.error && <div className="palette-empty vs-error">{result.error}</div>}
          {!searching && query.trim() && !result.error && rows.length === 0 && (
            <div className="palette-empty">No results found</div>
          )}
          {!query.trim() && (
            <div className="palette-empty">Start typing to search across all files</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A line is shown without its indentation, so its match positions move left by that much. */
function shiftRanges(text: string, ranges: [number, number][]): [number, number][] {
  const indent = text.length - text.trimStart().length;
  if (indent === 0) return ranges;
  return ranges.map(([from, to]) => [Math.max(0, from - indent), Math.max(0, to - indent)]);
}
