"use client";

import { useState, useRef } from "react";
import "../styles/bookmarks.css";
import {
  addGroup,
  bookmarkLabel,
  groupedBookmarks,
  moveBookmark,
  removeBookmark,
  removeGroup,
  type Bookmark,
  type BookmarkStore,
} from "@/lib/bookmarks";

interface BookmarksPanelProps {
  store: BookmarkStore;
  vaultPath: string;
  currentFile: string | null;
  /** Open what a bookmark points at. */
  onOpen: (bookmark: Bookmark) => void;
  onChange: (store: BookmarkStore) => void;
  visible: boolean;
}

const ICONS: Record<Bookmark["kind"], string> = {
  file: "M8 2l1.8 3.6L14 6.3l-3 2.9.7 4.1L8 11.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L8 2z",
  folder: "M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z",
  search: "M7 2.5a4.5 4.5 0 103 7.9l3.3 3.3M7 2.5a4.5 4.5 0 014.5 4.5",
  heading: "M4 3v10M12 3v10M4 8h8",
};

export default function BookmarksPanel({ store, vaultPath, currentFile, onOpen, onChange, visible }: BookmarksPanelProps) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);
  const cancelledRef = useRef(false);
  const [newGroup, setNewGroup] = useState("");

  if (!visible) return null;

  const sections = groupedBookmarks(store);
  const toggleSection = (group: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const submitGroup = () => {
    // Escape has already closed the box by the time it loses the cursor.
    if (!naming || cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    onChange(addGroup(store, newGroup));
    setNewGroup("");
    setNaming(false);
  };

  const renderItem = (bookmark: Bookmark) => {
    const { name, detail } = bookmarkLabel(bookmark, vaultPath);
    const isActive = bookmark.kind === "file" && currentFile === bookmark.target;
    return (
      <div
        key={`${bookmark.kind}:${bookmark.target}`}
        className={`bm-item ${isActive ? "bm-item-active" : ""}`}
        onClick={() => onOpen(bookmark)}
        title={bookmark.target}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="bm-star" aria-hidden="true">
          <path
            d={ICONS[bookmark.kind]}
            stroke="currentColor"
            strokeWidth="1.2"
            fill={bookmark.kind === "file" ? "currentColor" : "none"}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <div className="bm-item-info">
          <span className="bm-item-name">{name}</span>
          {detail && <span className="bm-item-path">{detail}</span>}
        </div>
        {store.groups.length > 0 && (
          <select
            className="bm-group-select"
            value={bookmark.group ?? ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChange(moveBookmark(store, bookmark, e.target.value || null))}
            aria-label="Move to group"
            title="Move to group"
          >
            <option value="">No group</option>
            {store.groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}
        <button
          className="bm-remove-btn"
          onClick={(e) => {
            e.stopPropagation();
            onChange(removeBookmark(store, bookmark));
          }}
          title="Remove bookmark"
          aria-label="Remove bookmark"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div className="bm-panel">
      <div className="bm-header">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="bm-header-icon" aria-hidden="true">
          <path d={ICONS.file} stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
        </svg>
        <span className="bm-header-label">Bookmarks</span>
        <span className="bm-header-count">{store.items.length}</span>
        <button className="bm-add-group" onClick={() => setNaming(true)} title="New group" aria-label="New bookmark group">
          +
        </button>
      </div>

      {naming && (
        <div className="bm-group-new">
          <input
            autoFocus
            value={newGroup}
            placeholder="Group name"
            aria-label="New group name"
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitGroup();
              if (e.key === "Escape") {
                cancelledRef.current = true;
                setNewGroup("");
                setNaming(false);
              }
            }}
            onBlur={submitGroup}
          />
        </div>
      )}

      <div className="bm-list">
        {store.items.length === 0 && store.groups.length === 0 ? (
          <div className="bm-empty">
            <p>No bookmarks yet.</p>
            <p className="bm-empty-hint">Use Ctrl+Shift+B to bookmark the open note. Folders, searches and headings can be bookmarked too.</p>
          </div>
        ) : (
          sections.map((section) =>
            section.group === null ? (
              section.items.map(renderItem)
            ) : (
              <div key={section.group} className="bm-group">
                <div className="bm-group-header">
                  <button
                    className="bm-group-toggle"
                    onClick={() => toggleSection(section.group as string)}
                    aria-expanded={!closed.has(section.group)}
                  >
                    <span className="bm-group-arrow">{closed.has(section.group) ? "▸" : "▾"}</span>
                    <span className="bm-group-name">{section.group}</span>
                    <span className="bm-header-count">{section.items.length}</span>
                  </button>
                  <button
                    className="bm-remove-btn bm-group-remove"
                    onClick={() => onChange(removeGroup(store, section.group as string))}
                    title="Remove group (its bookmarks are kept)"
                    aria-label={`Remove group ${section.group}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                {!closed.has(section.group) && section.items.map(renderItem)}
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}
