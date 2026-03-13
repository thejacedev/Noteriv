"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SearchResult {
  filePath: string;
  fileName: string;
  line: number;
  text: string;
}

interface VaultSearchProps {
  vaultPath: string;
  onSelect: (filePath: string) => void;
  onClose: () => void;
}

export default function VaultSearch({ vaultPath, onSelect, onClose }: VaultSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || !window.electronAPI) {
      setResults([]);
      setSelectedIdx(0);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);

    debounceRef.current = setTimeout(async () => {
      const res = await window.electronAPI.searchInFiles(vaultPath, query);
      setResults(res);
      setSelectedIdx(0);
      setSearching(false);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, vaultPath]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIdx] as HTMLElement;
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIdx]) {
          onSelect(results[selectedIdx].filePath);
          onClose();
        }
      }
    },
    [results, selectedIdx, onSelect, onClose]
  );

  // Highlight matching text
  const highlight = (text: string) => {
    if (!query.trim()) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="search-highlight">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  };

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
          />
          {searching && <span className="palette-spinner" />}
        </div>

        <div className="palette-list palette-list-tall" ref={listRef}>
          {results.map((r, i) => (
            <button
              key={`${r.filePath}:${r.line}`}
              className={`palette-item palette-search-item ${i === selectedIdx ? "palette-item-active" : ""}`}
              onClick={() => { onSelect(r.filePath); onClose(); }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <div className="search-result-top">
                <span className="search-result-file">
                  {r.fileName.replace(/\.(md|markdown)$/i, "")}
                </span>
                <span className="search-result-line">:{r.line}</span>
              </div>
              <div className="search-result-text">{highlight(r.text)}</div>
            </button>
          ))}
          {!searching && query && results.length === 0 && (
            <div className="palette-empty">No results found</div>
          )}
          {!query && (
            <div className="palette-empty">Start typing to search across all files</div>
          )}
        </div>
      </div>
    </div>
  );
}
