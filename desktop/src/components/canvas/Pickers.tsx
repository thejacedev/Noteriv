"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { headingSubpath, normalizeWebUrl, vaultFolders, type VaultFolder } from "@/lib/canvas-utils";

/**
 * Escape closes the dialog and goes no further. Left to travel on, it would
 * reach the canvas's own handler, which closes the whole canvas.
 */
function closeOnEscape(e: React.KeyboardEvent, onClose: () => void) {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  onClose();
}

/** Asks for the address of a web page, for a new card or to change one. */
export function AddressPrompt({
  title,
  initial,
  action,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  /** The label of the button that accepts the address. */
  action: string;
  onSubmit: (url: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [refused, setRefused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const url = normalizeWebUrl(value);
    if (url) onSubmit(url);
    else setRefused(true);
  };

  return (
    <div className="canvas-file-picker" onClick={onClose} onKeyDown={(e) => closeOnEscape(e, onClose)}>
      <div className="canvas-file-picker-inner canvas-prompt" onClick={(e) => e.stopPropagation()}>
        <div className="canvas-prompt-title">{title}</div>
        <input
          ref={inputRef}
          className="canvas-prompt-input"
          type="text"
          inputMode="url"
          spellCheck={false}
          value={value}
          placeholder="https://example.com"
          onChange={(e) => {
            setValue(e.target.value);
            setRefused(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        {refused && (
          <div className="canvas-prompt-error">
            Enter the address of a web page, such as https://example.com
          </div>
        )}
        <div className="canvas-prompt-actions">
          <button type="button" className="canvas-card-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="canvas-card-button primary" onClick={submit}>
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A list of the vault's folders. Choosing one adds a card for each note in it. */
export function FolderPicker({
  vaultPath,
  onSelect,
  onClose,
}: {
  vaultPath: string;
  /** `files` is every file of the vault, so the caller need not list them again. */
  onSelect: (folder: string, files: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    let gone = false;
    (window.electronAPI?.listVaultFiles(vaultPath) ?? Promise.resolve([]))
      .catch(() => [] as string[])
      .then((all) => {
        if (!gone) setFiles(all);
      });
    return () => {
      gone = true;
    };
  }, [vaultPath]);

  const folders = useMemo(() => vaultFolders(files ?? []), [files]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? folders.filter((f) => f.path.toLowerCase().includes(q)) : folders;
  }, [folders, query]);
  const active = Math.min(selectedIndex, Math.max(filtered.length - 1, 0));

  const choose = (folder: VaultFolder) => onSelect(folder.path, files ?? []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(Math.min(active + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(Math.max(active - 1, 0));
    } else if (e.key === "Enter" && filtered[active]) {
      e.preventDefault();
      choose(filtered[active]);
    }
  };

  return (
    <div className="canvas-file-picker" onClick={onClose} onKeyDown={(e) => closeOnEscape(e, onClose)}>
      <div className="canvas-file-picker-inner" onClick={(e) => e.stopPropagation()}>
        <div className="canvas-prompt-title">Add notes from a folder</div>
        <div className="canvas-file-picker-header">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="var(--text-muted)" strokeWidth="1.3" />
            <path d="M11 11l3 3" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search folders..."
          />
        </div>
        <div className="canvas-file-picker-list">
          {filtered.map((folder, i) => (
            <button
              key={folder.path}
              className={`canvas-file-picker-item${i === active ? " active" : ""}`}
              onClick={() => choose(folder)}
            >
              <span>{folder.path || "Top of the vault"}</span>
              <span className="file-path">
                {folder.notes} {folder.notes === 1 ? "note" : "notes"}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="canvas-picker-empty">
              {files === null ? "Loading…" : folders.length === 0 ? "This vault has no notes yet" : "No matching folders"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The list a note card's heading button opens: the whole note, or one of its headings. */
export function HeadingMenu({
  x,
  y,
  headings,
  current,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  headings: string[];
  /** What the card is narrowed to now (its subpath); nothing for the whole note. */
  current: string | undefined;
  /** null shows the whole note again. */
  onPick: (heading: string | null) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Caught before the canvas's own handler, which would close the canvas.
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div
      className="canvas-context-menu canvas-heading-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className={`canvas-context-item${current ? "" : " active"}`} onClick={() => onPick(null)}>
        Whole note
      </button>
      {headings.length > 0 && <div className="canvas-context-divider" />}
      {headings.map((heading, i) => (
        <button
          key={`${i}-${heading}`}
          className={`canvas-context-item${headingSubpath(heading) === current ? " active" : ""}`}
          onClick={() => onPick(heading)}
        >
          {heading}
        </button>
      ))}
    </div>
  );
}
