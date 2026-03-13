"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  listAttachments,
  deleteAttachment,
  importAttachment,
  getAttachmentType,
  formatFileSize,
  markdownLinkForAttachment,
  type Attachment,
} from "@/lib/attachment-utils";
import "@/styles/attachments.css";

interface AttachmentManagerProps {
  vaultPath: string;
  onInsert: (markdownLink: string) => void;
  onClose: () => void;
}

type FilterType = "all" | "image" | "audio" | "video" | "pdf" | "other";
type SortField = "name" | "date";

export default function AttachmentManager({
  vaultPath,
  onInsert,
  onClose,
}: AttachmentManagerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);

  const dropRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  // ── Load attachments ──
  const loadAttachments = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listAttachments(vaultPath);
      setAttachments(items);
    } catch {
      setAttachments([]);
    }
    setLoading(false);
  }, [vaultPath]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  // ── Filter and sort ──
  const filtered = attachments
    .filter((a) => filter === "all" || a.type === filter)
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return b.modified - a.modified;
    });

  const imageItems = filtered.filter((a) => a.type === "image");
  const nonImageItems = filtered.filter((a) => a.type !== "image");

  // ── Counts per type ──
  const counts = attachments.reduce(
    (acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // ── Insert link ──
  const handleInsert = useCallback(
    (attachment: Attachment) => {
      const link = markdownLinkForAttachment(attachment.name, attachment.type);
      onInsert(link);
      onClose();
    },
    [onInsert, onClose],
  );

  // ── Delete attachment ──
  const handleDelete = useCallback(
    async (e: React.MouseEvent, attachment: Attachment) => {
      e.stopPropagation();
      const confirmed = window.confirm(
        `Delete "${attachment.name}"? This cannot be undone.`,
      );
      if (!confirmed) return;

      await deleteAttachment(attachment.path);
      setAttachments((prev) => prev.filter((a) => a.path !== attachment.path));
    },
    [],
  );

  // ── Drag & drop ──
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      setImporting(true);
      try {
        for (const file of files) {
          await importAttachment(file, vaultPath);
        }
        await loadAttachments();
      } catch {
        // Silently handle import errors
      }
      setImporting(false);
    },
    [vaultPath, loadAttachments],
  );

  // ── Keyboard ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // ── Toggle sort ──
  const toggleSort = useCallback(() => {
    setSortBy((s) => (s === "name" ? "date" : "name"));
  }, []);

  return (
    <div className="am-overlay" onClick={onClose}>
      <div className="am-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="am-header">
          <span className="am-title">Attachments</span>
          <button className="am-close-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 3L11 11M11 3L3 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="am-toolbar">
          <button
            className={`am-filter-btn${filter === "all" ? " am-filter-btn-active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({attachments.length})
          </button>
          {(counts.image ?? 0) > 0 && (
            <button
              className={`am-filter-btn${filter === "image" ? " am-filter-btn-active" : ""}`}
              onClick={() => setFilter("image")}
            >
              Images ({counts.image})
            </button>
          )}
          {(counts.audio ?? 0) > 0 && (
            <button
              className={`am-filter-btn${filter === "audio" ? " am-filter-btn-active" : ""}`}
              onClick={() => setFilter("audio")}
            >
              Audio ({counts.audio})
            </button>
          )}
          {(counts.video ?? 0) > 0 && (
            <button
              className={`am-filter-btn${filter === "video" ? " am-filter-btn-active" : ""}`}
              onClick={() => setFilter("video")}
            >
              Video ({counts.video})
            </button>
          )}
          {(counts.pdf ?? 0) > 0 && (
            <button
              className={`am-filter-btn${filter === "pdf" ? " am-filter-btn-active" : ""}`}
              onClick={() => setFilter("pdf")}
            >
              PDF ({counts.pdf})
            </button>
          )}
          {(counts.other ?? 0) > 0 && (
            <button
              className={`am-filter-btn${filter === "other" ? " am-filter-btn-active" : ""}`}
              onClick={() => setFilter("other")}
            >
              Other ({counts.other})
            </button>
          )}

          <div className="am-toolbar-spacer" />

          <button className="am-sort-btn" onClick={toggleSort}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 3H10M3 6H9M4 9H8"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            {sortBy === "name" ? "Name" : "Date"}
          </button>
        </div>

        {/* Content */}
        <div
          className="am-content"
          ref={dropRef}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {loading ? (
            <div className="am-loading">Loading attachments...</div>
          ) : (
            <>
              {/* Drag & drop zone */}
              <div
                className={`am-dropzone${isDragging ? " am-dropzone-active" : ""}`}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="am-dropzone-icon"
                >
                  <path
                    d="M12 16V8M12 8L9 11M12 8L15 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M20 16.7V17.8C20 18.9 19.1 19.8 18 19.8H6C4.9 19.8 4 18.9 4 17.8V16.7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="am-dropzone-text">
                  {importing
                    ? "Importing files..."
                    : isDragging
                      ? "Drop files here to add"
                      : "Drag & drop files to add attachments"}
                </span>
                <span className="am-dropzone-hint">
                  Files are saved to the attachments/ folder
                </span>
              </div>

              {filtered.length === 0 && !isDragging ? (
                <div className="am-empty">
                  <span className="am-empty-title">
                    {filter === "all"
                      ? "No attachments yet"
                      : `No ${filter} files found`}
                  </span>
                  <span className="am-empty-desc">
                    {filter === "all"
                      ? "Drag & drop files above, or use the audio recorder to create recordings."
                      : "Try changing the filter to see other attachment types."}
                  </span>
                </div>
              ) : (
                <>
                  {/* Image grid */}
                  {imageItems.length > 0 && (filter === "all" || filter === "image") && (
                    <div className="am-grid">
                      {imageItems.map((a) => (
                        <div
                          key={a.path}
                          className="am-grid-item"
                          onClick={() => handleInsert(a)}
                          title={`Click to insert: ${a.name}`}
                        >
                          <button
                            className="am-delete-btn"
                            onClick={(e) => handleDelete(e, a)}
                            title="Delete attachment"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 12 12"
                              fill="none"
                            >
                              <path
                                d="M2 2L10 10M10 2L2 10"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                          <div className="am-grid-thumb-wrap">
                            <ImageThumbnail attachment={a} />
                          </div>
                          <span className="am-grid-name">{a.name}</span>
                          {a.size > 0 && (
                            <span className="am-grid-size">
                              {formatFileSize(a.size)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Non-image list */}
                  {nonImageItems.length > 0 && (
                    <div className="am-list">
                      {nonImageItems.map((a) => (
                        <div
                          key={a.path}
                          className="am-list-item"
                          onClick={() => handleInsert(a)}
                          title={`Click to insert: ${a.name}`}
                        >
                          <div className="am-list-icon">
                            <FileTypeIcon type={a.type} />
                          </div>
                          <div className="am-list-info">
                            <span className="am-list-name">{a.name}</span>
                            <div className="am-list-meta">
                              <span className="am-list-type-badge">
                                {a.type}
                              </span>
                              {a.size > 0 && (
                                <span>{formatFileSize(a.size)}</span>
                              )}
                            </div>
                          </div>
                          <button
                            className="am-delete-btn"
                            onClick={(e) => handleDelete(e, a)}
                            title="Delete attachment"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 12 12"
                              fill="none"
                            >
                              <path
                                d="M2 2L10 10M10 2L2 10"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="am-footer">
          <span className="am-footer-count">
            {filtered.length} file{filtered.length !== 1 ? "s" : ""}
            {filter !== "all" ? ` (${filter})` : ""}
          </span>
          <div className="am-footer-hint">
            <span>
              <span className="am-footer-key">Click</span> insert
            </span>
            <span>
              <span className="am-footer-key">Esc</span> close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helper: Image thumbnail ── */

function ImageThumbnail({ attachment }: { attachment: Attachment }) {
  // For images we attempt to load via the file path.
  // In Electron with file:// protocol or data URLs this should work.
  // The file might be a data-URL string (from our import), so we try
  // loading the content and check if it starts with "data:".
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSrc() {
      try {
        // Try reading the file — if it's a data-URL saved by our importer,
        // use it directly. Otherwise construct a file:// path.
        const content = await window.electronAPI.readFile(attachment.path);
        if (!cancelled) {
          if (content && content.startsWith("data:")) {
            setSrc(content);
          } else {
            // Use file:// protocol for real binary images
            setSrc(`file://${attachment.path}`);
          }
        }
      } catch {
        if (!cancelled) {
          setSrc(`file://${attachment.path}`);
        }
      }
    }

    loadSrc();
    return () => {
      cancelled = true;
    };
  }, [attachment.path]);

  if (!src) {
    return (
      <div
        className="am-grid-thumb"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: "11px",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <img
      className="am-grid-thumb"
      src={src}
      alt={attachment.name}
      loading="lazy"
      onError={(e) => {
        // Fallback: show placeholder on error
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

/* ── Helper: File type icon ── */

function FileTypeIcon({ type }: { type: Attachment["type"] }) {
  switch (type) {
    case "audio":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M3 6V10H5.5L9 13V3L5.5 6H3Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M11 5.5C11.8 6.3 11.8 9.7 11 10.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "video":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect
            x="2"
            y="4"
            width="9"
            height="8"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M11 7L14 5V11L11 9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "pdf":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect
            x="3"
            y="2"
            width="10"
            height="12"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M6 6H10M6 8H10M6 10H8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect
            x="3"
            y="2"
            width="10"
            height="12"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M6 6H10M6 8H10"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
