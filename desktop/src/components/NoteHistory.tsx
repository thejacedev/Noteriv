"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getFileHistory,
  getFileAtCommit,
  diffStrings,
  type HistoryEntry,
  type DiffLine,
} from "@/lib/note-history";

interface NoteHistoryProps {
  filePath: string;
  vaultPath: string;
  currentContent: string;
  onRestore: (content: string) => void;
  onClose: () => void;
}

export default function NoteHistory({
  filePath,
  vaultPath,
  currentContent,
  onRestore,
  onClose,
}: NoteHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedContent, setSelectedContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  // Fetch history on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const entries = await getFileHistory(vaultPath, filePath);
      if (!cancelled) {
        setHistory(entries);
        setLoading(false);
        if (entries.length > 0) {
          setSelectedIdx(0);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [vaultPath, filePath]);

  // Fetch content for selected commit
  useEffect(() => {
    if (history.length === 0) return;
    let cancelled = false;
    async function load() {
      setLoadingContent(true);
      const entry = history[selectedIdx];
      if (!entry) return;
      const content = await getFileAtCommit(vaultPath, filePath, entry.hash);
      if (!cancelled) {
        setSelectedContent(content);
        setLoadingContent(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedIdx, history, vaultPath, filePath]);

  // Compute diff between selected version and current
  const diffLines = useMemo<DiffLine[]>(() => {
    if (selectedContent === null) return [];
    return diffStrings(selectedContent, currentContent);
  }, [selectedContent, currentContent]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIdx(history.length - 1 - parseInt(e.target.value));
  }, [history.length]);

  const handleRestore = useCallback(() => {
    if (selectedContent !== null) {
      onRestore(selectedContent);
    }
  }, [selectedContent, onRestore]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const selectedEntry = history[selectedIdx] || null;

  // Stats
  const addCount = diffLines.filter((d) => d.type === "add").length;
  const removeCount = diffLines.filter((d) => d.type === "remove").length;

  return (
    <div className="nh-overlay" onClick={onClose}>
      <div className="nh-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="nh-header">
          <div className="nh-header-left">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 4v4l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className="nh-title">Note History</span>
            <span className="nh-file-name">
              {filePath.split("/").pop()?.replace(/\.(md|markdown)$/i, "") || ""}
            </span>
          </div>
          <button onClick={onClose} className="nh-close" title="Close">
            <svg width="14" height="14" viewBox="0 0 12 12">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="nh-loading">
            <div className="nh-spinner" />
            <span>Loading history...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="nh-empty">
            <span>No git history found for this file.</span>
            <span className="nh-empty-hint">
              Make sure the vault is a git repository with committed changes.
            </span>
          </div>
        ) : (
          <>
            {/* Slider */}
            <div className="nh-slider-wrap">
              <span className="nh-slider-label">Oldest</span>
              <input
                type="range"
                className="nh-slider"
                min={0}
                max={history.length - 1}
                value={history.length - 1 - selectedIdx}
                onChange={handleSliderChange}
              />
              <span className="nh-slider-label">Latest</span>
            </div>

            <div className="nh-body">
              {/* Timeline (left) */}
              <div className="nh-timeline">
                <div className="nh-timeline-header">Commits</div>
                <div className="nh-timeline-list">
                  {history.map((entry, idx) => (
                    <button
                      key={entry.hash}
                      className={`nh-commit${idx === selectedIdx ? " nh-commit-active" : ""}`}
                      onClick={() => setSelectedIdx(idx)}
                    >
                      <div className="nh-commit-dot" />
                      <div className="nh-commit-info">
                        <span className="nh-commit-msg">{entry.message || "(no message)"}</span>
                        <span className="nh-commit-meta">
                          <span className="nh-commit-hash">{entry.hash.slice(0, 7)}</span>
                          <span className="nh-commit-date">{formatDate(entry.date)}</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Diff view (right) */}
              <div className="nh-diff">
                <div className="nh-diff-header">
                  <div className="nh-diff-info">
                    {selectedEntry && (
                      <>
                        <span className="nh-diff-title">
                          Changes from <strong>{selectedEntry.hash.slice(0, 7)}</strong> to current
                        </span>
                        <span className="nh-diff-stats">
                          <span className="nh-stat-add">+{addCount}</span>
                          <span className="nh-stat-remove">-{removeCount}</span>
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    className="nh-restore-btn"
                    onClick={handleRestore}
                    disabled={selectedContent === null}
                    title="Replace current content with this version"
                  >
                    Restore this version
                  </button>
                </div>

                <div className="nh-diff-content">
                  {loadingContent ? (
                    <div className="nh-loading">
                      <div className="nh-spinner" />
                      <span>Loading version...</span>
                    </div>
                  ) : (
                    diffLines.map((dl, i) => (
                      <div
                        key={i}
                        className={`nh-diff-line nh-diff-${dl.type}`}
                      >
                        <span className="nh-diff-prefix">
                          {dl.type === "add" ? "+" : dl.type === "remove" ? "-" : " "}
                        </span>
                        <span className="nh-diff-text">{dl.text || "\u00A0"}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
