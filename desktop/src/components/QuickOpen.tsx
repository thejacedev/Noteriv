"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface QuickOpenFile {
  filePath: string;
  fileName: string;
  relativePath: string;
}

interface QuickOpenProps {
  vaultPath: string;
  onSelect: (filePath: string) => void;
  onClose: () => void;
}

export default function QuickOpen({ vaultPath, onSelect, onClose }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<QuickOpenFile[]>([]);
  const [filtered, setFiltered] = useState<QuickOpenFile[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load all files on mount
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.listAllFiles(vaultPath).then(setFiles);
  }, [vaultPath]);

  // Filter files as query changes
  useEffect(() => {
    if (!query.trim()) {
      setFiltered(files.slice(0, 50));
      setSelectedIdx(0);
      return;
    }
    const lower = query.toLowerCase();
    const matches = files
      .filter(
        (f) =>
          f.fileName.toLowerCase().includes(lower) ||
          f.relativePath.toLowerCase().includes(lower)
      )
      .slice(0, 50);
    setFiltered(matches);
    setSelectedIdx(0);
  }, [query, files]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected into view
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
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIdx]) {
          onSelect(filtered[selectedIdx].filePath);
          onClose();
        }
      }
    },
    [filtered, selectedIdx, onSelect, onClose]
  );

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
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
            placeholder="Type to search files..."
            className="palette-input"
          />
        </div>

        <div className="palette-list" ref={listRef}>
          {filtered.map((f, i) => (
            <button
              key={f.filePath}
              className={`palette-item ${i === selectedIdx ? "palette-item-active" : ""}`}
              onClick={() => { onSelect(f.filePath); onClose(); }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span className="palette-item-name">{f.fileName}</span>
              <span className="palette-item-path">
                {f.relativePath.replace(/\.(md|markdown)$/i, "")}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="palette-empty">No files found</div>
          )}
        </div>
      </div>
    </div>
  );
}
