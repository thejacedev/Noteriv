"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { lintMarkdown, type LintWarning } from "@/lib/markdown-lint";

interface LintPanelProps {
  content: string;
  vaultPath: string;
  onLineClick: (line: number) => void;
  onClose: () => void;
}

export default function LintPanel({
  content,
  vaultPath,
  onLineClick,
  onClose,
}: LintPanelProps) {
  const [warnings, setWarnings] = useState<LintWarning[]>([]);
  const [fileList, setFileList] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load file list for broken wiki-link detection
  useEffect(() => {
    let cancelled = false;
    async function loadFiles() {
      if (!window.electronAPI || !vaultPath) return;
      try {
        const files = await window.electronAPI.listAllFiles(vaultPath);
        if (!cancelled) {
          setFileList(files.map((f) => f.fileName));
        }
      } catch {}
    }
    loadFiles();
    return () => { cancelled = true; };
  }, [vaultPath]);

  // Run linting with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const results = lintMarkdown(content, vaultPath, fileList);
      setWarnings(results);
    }, 1000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, vaultPath, fileList]);

  // Group by severity
  const grouped = useMemo(() => {
    const errors = warnings.filter((w) => w.type === "error");
    const warns = warnings.filter((w) => w.type === "warning");
    const infos = warnings.filter((w) => w.type === "info");
    return { errors, warns, infos };
  }, [warnings]);

  const errorCount = grouped.errors.length;
  const warnCount = grouped.warns.length;
  const infoCount = grouped.infos.length;

  const handleClick = useCallback((line: number) => {
    onLineClick(line);
  }, [onLineClick]);

  const renderWarning = (w: LintWarning, idx: number) => {
    const icon = w.type === "error" ? "\u274C" : w.type === "warning" ? "\u26A0\uFE0F" : "\u2139\uFE0F";
    return (
      <button
        key={`${w.rule}-${w.line}-${idx}`}
        className={`lint-item lint-item-${w.type}`}
        onClick={() => handleClick(w.line)}
        title={`${w.rule} (line ${w.line})`}
      >
        <span className="lint-icon">{icon}</span>
        <span className="lint-msg">{w.message}</span>
        <span className="lint-line">L{w.line}</span>
      </button>
    );
  };

  return (
    <div className="lint-panel">
      <div className="lint-header">
        <span className="lint-title">Lint</span>
        <div className="lint-header-right">
          <span className="lint-counts">
            {errorCount > 0 && <span className="lint-count-error">{errorCount} error{errorCount !== 1 ? "s" : ""}</span>}
            {warnCount > 0 && <span className="lint-count-warn">{warnCount} warning{warnCount !== 1 ? "s" : ""}</span>}
            {infoCount > 0 && <span className="lint-count-info">{infoCount} info</span>}
            {warnings.length === 0 && <span className="lint-count-ok">No issues</span>}
          </span>
          <button onClick={onClose} className="lint-close" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="lint-list">
        {warnings.length === 0 ? (
          <div className="lint-empty">No issues found</div>
        ) : (
          <>
            {grouped.errors.length > 0 && (
              <div className="lint-group">
                <div className="lint-group-header">Errors</div>
                {grouped.errors.map((w, i) => renderWarning(w, i))}
              </div>
            )}
            {grouped.warns.length > 0 && (
              <div className="lint-group">
                <div className="lint-group-header">Warnings</div>
                {grouped.warns.map((w, i) => renderWarning(w, i))}
              </div>
            )}
            {grouped.infos.length > 0 && (
              <div className="lint-group">
                <div className="lint-group-header">Info</div>
                {grouped.infos.map((w, i) => renderWarning(w, i))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
