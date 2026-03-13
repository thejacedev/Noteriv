"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface DocumentTitleProps {
  filePath: string;
  viewMode: "live" | "source" | "view";
  onRename: (newName: string) => void;
  onViewModeChange: (mode: "live" | "source" | "view") => void;
}

export default function DocumentTitle({ filePath, viewMode, onRename, onViewModeChange }: DocumentTitleProps) {
  const fileName = filePath.split("/").pop() || "";
  const displayName = fileName.replace(/\.(md|markdown)$/i, "");

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(displayName);
    setEditing(false);
  }, [filePath, displayName]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const submit = useCallback(() => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === displayName) {
      setEditValue(displayName);
      setEditing(false);
      return;
    }
    onRename(trimmed);
    setEditing(false);
  }, [editValue, displayName, onRename]);

  const isViewing = viewMode === "view";

  const modeToggle = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onViewModeChange(isViewing ? "live" : "view");
      }}
      className={`doc-mode-btn${isViewing ? " doc-mode-active" : ""}`}
      title={isViewing ? "Switch to Edit" : "Switch to View"}
    >
      {isViewing ? (
        <>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M11.5 2.5l2 2M3 11l-0.5 2.5L5 13l8-8-2-2-8 8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <span>Edit</span>
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5z" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span>View</span>
        </>
      )}
    </button>
  );

  if (editing) {
    return (
      <div className="doc-title-bar">
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              setEditValue(displayName);
              setEditing(false);
            }
          }}
          onBlur={submit}
          className="doc-title-input"
        />
        {modeToggle}
      </div>
    );
  }

  return (
    <div className="doc-title-bar">
      <span
        onClick={() => setEditing(true)}
        className="doc-title-text"
      >
        {displayName}
      </span>
      {modeToggle}
    </div>
  );
}
