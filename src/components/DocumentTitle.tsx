"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface DocumentTitleProps {
  filePath: string;
  onRename: (newName: string) => void;
}

export default function DocumentTitle({ filePath, onRename }: DocumentTitleProps) {
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
    </div>
  );
}
