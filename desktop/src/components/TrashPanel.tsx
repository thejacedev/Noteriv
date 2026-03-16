"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listTrash,
  restoreFile,
  permanentDelete,
  emptyTrash,
  type TrashItem,
} from "@/lib/trash-utils";

interface TrashPanelProps {
  vaultPath: string;
  onClose: () => void;
  onRestored?: () => void;
}

export default function TrashPanel({ vaultPath, onClose, onRestored }: TrashPanelProps) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const trashItems = await listTrash(vaultPath);
    setItems(trashItems);
    setLoading(false);
  }, [vaultPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRestore = useCallback(async (id: string) => {
    const success = await restoreFile(vaultPath, id);
    if (success) {
      await refresh();
      onRestored?.();
    }
  }, [vaultPath, refresh, onRestored]);

  const handlePermanentDelete = useCallback(async (id: string) => {
    const success = await permanentDelete(vaultPath, id);
    if (success) await refresh();
  }, [vaultPath, refresh]);

  const handleEmptyTrash = useCallback(async () => {
    await emptyTrash(vaultPath);
    await refresh();
  }, [vaultPath, refresh]);

  const filtered = items.filter((item) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      item.fileName.toLowerCase().includes(q) ||
      item.originalPath.toLowerCase().includes(q)
    );
  });

  const getDaysRemaining = (deletedAt: string): number => {
    const deleted = new Date(deletedAt).getTime();
    const expiry = deleted + 30 * 24 * 60 * 60 * 1000;
    const remaining = Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(0, remaining);
  };

  const formatDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const getRelativePath = (fullPath: string): string => {
    if (fullPath.startsWith(vaultPath)) {
      return fullPath.slice(vaultPath.length + 1);
    }
    return fullPath;
  };

  return (
    <div className="trash-overlay" onClick={onClose}>
      <div className="trash-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="trash-header">
          <div className="trash-header-left">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M8 7v5M10 7v5M4 4l.5 9a1 1 0 001 1h5a1 1 0 001-1L12 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2>Trash</h2>
            <span className="trash-count">{items.length} {items.length === 1 ? "item" : "items"}</span>
          </div>
          <div className="trash-header-right">
            {items.length > 0 && (
              <button className="trash-empty-btn" onClick={handleEmptyTrash}>
                Empty Trash
              </button>
            )}
            <button className="trash-close-btn" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="trash-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter trash..."
            className="trash-search-input"
            autoFocus
          />
        </div>

        {/* List */}
        <div className="trash-list">
          {loading ? (
            <div className="trash-empty-state">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="trash-empty-state">
              {items.length === 0 ? "Trash is empty" : "No matches"}
            </div>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className="trash-item">
                <div className="trash-item-info">
                  <div className="trash-item-name">{item.fileName}</div>
                  <div className="trash-item-meta">
                    <span className="trash-item-path">{getRelativePath(item.originalPath)}</span>
                    <span className="trash-item-date">{formatDate(item.deletedAt)}</span>
                    <span className="trash-item-days">{getDaysRemaining(item.deletedAt)}d remaining</span>
                  </div>
                </div>
                <div className="trash-item-actions">
                  <button
                    className="trash-action-btn trash-restore-btn"
                    onClick={() => handleRestore(item.id)}
                    title="Restore file"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8a6 6 0 0110.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      <path d="M12 2v3h-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 8a6 6 0 01-10.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    className="trash-action-btn trash-delete-btn"
                    onClick={() => handlePermanentDelete(item.id)}
                    title="Delete permanently"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="trash-footer">
          Files are automatically removed after 30 days
        </div>
      </div>
    </div>
  );
}
