"use client";

import "../styles/bookmarks.css";

interface BookmarksPanelProps {
  bookmarks: string[]; // file paths
  vaultPath: string;
  currentFile: string | null;
  onFileSelect: (filePath: string) => void;
  onBookmarkRemove: (filePath: string) => void;
  visible: boolean;
}

/**
 * Extract just the filename (without extension) from a full file path.
 */
function getFileName(filePath: string): string {
  const name = filePath.split("/").pop() || filePath;
  return name.replace(/\.(md|markdown)$/i, "");
}

/**
 * Get relative path from the vault root for display.
 */
function getRelativePath(filePath: string, vaultPath: string): string {
  if (filePath.startsWith(vaultPath)) {
    const rel = filePath.slice(vaultPath.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return filePath;
}

export default function BookmarksPanel({
  bookmarks,
  vaultPath,
  currentFile,
  onFileSelect,
  onBookmarkRemove,
  visible,
}: BookmarksPanelProps) {
  if (!visible) return null;

  return (
    <div className="bm-panel">
      <div className="bm-header">
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          className="bm-header-icon"
        >
          <path
            d="M8 2l1.8 3.6L14 6.3l-3 2.9.7 4.1L8 11.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L8 2z"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
            strokeLinejoin="round"
          />
        </svg>
        <span className="bm-header-label">Bookmarks</span>
        <span className="bm-header-count">{bookmarks.length}</span>
      </div>

      <div className="bm-list">
        {bookmarks.length === 0 ? (
          <div className="bm-empty">
            <svg
              width="24"
              height="24"
              viewBox="0 0 16 16"
              fill="none"
              className="bm-empty-icon"
            >
              <path
                d="M8 2l1.8 3.6L14 6.3l-3 2.9.7 4.1L8 11.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L8 2z"
                stroke="currentColor"
                strokeWidth="1"
                fill="none"
                strokeLinejoin="round"
              />
            </svg>
            <p>No bookmarks yet.</p>
            <p className="bm-empty-hint">
              Right-click a file or use Ctrl+B to bookmark.
            </p>
          </div>
        ) : (
          bookmarks.map((filePath) => {
            const isActive = currentFile === filePath;
            const displayName = getFileName(filePath);
            const relativePath = getRelativePath(filePath, vaultPath);

            return (
              <div
                key={filePath}
                className={`bm-item ${isActive ? "bm-item-active" : ""}`}
                onClick={() => onFileSelect(filePath)}
                title={relativePath}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="bm-star"
                >
                  <path
                    d="M8 2l1.8 3.6L14 6.3l-3 2.9.7 4.1L8 11.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L8 2z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="currentColor"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="bm-item-info">
                  <span className="bm-item-name">{displayName}</span>
                  {relativePath !== displayName + ".md" && (
                    <span className="bm-item-path">{relativePath}</span>
                  )}
                </div>
                <button
                  className="bm-remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBookmarkRemove(filePath);
                  }}
                  title="Remove bookmark"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
