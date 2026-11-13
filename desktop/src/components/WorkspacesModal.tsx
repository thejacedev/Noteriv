"use client";

import { useEffect, useRef, useState } from "react";
import { cleanLayoutName, describeLayout, layoutNames, type LayoutStore } from "@/lib/workspaces";
import "@/styles/workspaces.css";

interface WorkspacesModalProps {
  store: LayoutStore;
  /** Save what is on screen now under a name, replacing a layout of that name. */
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}

/** The saved layouts of this vault: save the one on screen, bring one back, rename or delete. */
export default function WorkspacesModal({ store, onSave, onLoad, onRename, onDelete, onClose }: WorkspacesModalProps) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const names = layoutNames(store);
  const clean = cleanLayoutName(name);
  const replaces = clean !== "" && clean in store.layouts;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (renaming !== null) setRenaming(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, renaming]);

  const save = () => {
    if (!clean) return;
    onSave(clean);
    setName("");
  };

  const finishRename = () => {
    if (renaming !== null) onRename(renaming, renameTo);
    setRenaming(null);
  };

  return (
    <div className="ws-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ws-modal" role="dialog" aria-label="Workspace layouts">
        <div className="ws-title">Workspace layouts</div>
        <div className="ws-hint">
          A layout remembers the notes that are open, the split, the file list and the side panels.
        </div>
        <div className="ws-save-row">
          <input
            ref={inputRef}
            className="ws-input"
            placeholder="Name for the layout on screen now"
            value={name}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          <button className="ws-btn ws-btn-primary" disabled={!clean} onClick={save}>
            {replaces ? "Replace" : "Save"}
          </button>
        </div>

        <div className="ws-list">
          {names.length === 0 ? (
            <div className="ws-empty">No layouts saved yet.</div>
          ) : (
            names.map((layoutName) => (
              <div key={layoutName} className={`ws-row${store.active === layoutName ? " ws-row-active" : ""}`}>
                {renaming === layoutName ? (
                  <input
                    className="ws-input ws-rename"
                    value={renameTo}
                    autoFocus
                    spellCheck={false}
                    onChange={(e) => setRenameTo(e.target.value)}
                    onBlur={finishRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") finishRename();
                    }}
                  />
                ) : (
                  <button className="ws-name" title="Load this layout" onClick={() => onLoad(layoutName)}>
                    <span className="ws-name-text">
                      {layoutName}
                      {store.active === layoutName && <span className="ws-current">current</span>}
                    </span>
                    <span className="ws-detail">{describeLayout(store.layouts[layoutName])}</span>
                  </button>
                )}
                <div className="ws-actions">
                  <button className="ws-btn" title="Load this layout" onClick={() => onLoad(layoutName)}>
                    Load
                  </button>
                  <button
                    className="ws-btn"
                    title="Replace this layout with what is on screen now"
                    onClick={() => onSave(layoutName)}
                  >
                    Update
                  </button>
                  <button
                    className="ws-btn"
                    title="Rename"
                    onClick={() => {
                      setRenaming(layoutName);
                      setRenameTo(layoutName);
                    }}
                  >
                    Rename
                  </button>
                  <button className="ws-btn ws-btn-danger" title="Delete this layout" onClick={() => onDelete(layoutName)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
