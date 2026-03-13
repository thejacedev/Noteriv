"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { findBacklinks } from "@/lib/wiki-link-utils";
import type { Backlink, FileInfo } from "@/lib/wiki-link-utils";

interface BacklinksPanelProps {
  /** Full path of the current file being viewed. */
  filePath: string;
  /** Base path of the vault directory. */
  vaultPath: string;
  /** Called when user clicks a backlink to open the linked file. */
  onFileOpen: (filePath: string) => void;
  /** Called when the panel close button is clicked. */
  onClose: () => void;
}

export default function BacklinksPanel({
  filePath,
  vaultPath,
  onFileOpen,
  onClose,
}: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(true);

  // Extract the file name from the full path
  const currentFileName = useMemo(() => {
    const parts = filePath.split("/");
    return parts[parts.length - 1] || "";
  }, [filePath]);

  // Scan for backlinks when the file changes
  useEffect(() => {
    let cancelled = false;

    async function scan() {
      if (!window.electronAPI || !currentFileName) {
        setBacklinks([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const allFiles: FileInfo[] = await window.electronAPI.listAllFiles(vaultPath);

        const results = await findBacklinks(
          currentFileName,
          vaultPath,
          allFiles.map((f) => ({
            filePath: f.filePath,
            fileName: f.fileName,
            relativePath: f.relativePath,
          })),
          (path: string) => window.electronAPI.readFile(path)
        );

        if (!cancelled) {
          setBacklinks(results);
        }
      } catch (err) {
        console.error("Failed to scan for backlinks:", err);
        if (!cancelled) {
          setBacklinks([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    scan();
    return () => {
      cancelled = true;
    };
  }, [filePath, vaultPath, currentFileName]);

  // Group backlinks by source file
  const grouped = useMemo(() => {
    const groups: Record<string, Backlink[]> = {};
    for (const bl of backlinks) {
      if (!groups[bl.filePath]) {
        groups[bl.filePath] = [];
      }
      groups[bl.filePath].push(bl);
    }
    return groups;
  }, [backlinks]);

  const fileCount = Object.keys(grouped).length;

  const handleBacklinkClick = useCallback(
    (blFilePath: string) => {
      onFileOpen(blFilePath);
    },
    [onFileOpen]
  );

  return (
    <div className="bl-panel">
      <div className="bl-header">
        <span className="bl-title">Backlinks</span>
        <div className="bl-header-right">
          {!loading && (
            <span className="bl-count">
              {backlinks.length} {backlinks.length === 1 ? "link" : "links"}
            </span>
          )}
          <button onClick={onClose} className="bl-close" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                d="M3 3l6 6M9 3l-6 6"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="bl-list">
        {loading ? (
          <div className="bl-loading">
            <div className="bl-spinner" />
            <span>Scanning vault...</span>
          </div>
        ) : backlinks.length === 0 ? (
          <div className="bl-empty">
            No backlinks found for this note.
          </div>
        ) : (
          Object.entries(grouped).map(([sourceFilePath, bls]) => {
            const displayName = bls[0].fileName.replace(/\.md$/i, "");
            const relPath = bls[0].relativePath;

            return (
              <div key={sourceFilePath} className="bl-group">
                <button
                  className="bl-file-header"
                  onClick={() => handleBacklinkClick(sourceFilePath)}
                  title={relPath}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    className="bl-file-icon"
                  >
                    <path
                      d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      fill="none"
                    />
                    <path
                      d="M9 1v4h4"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      fill="none"
                    />
                  </svg>
                  <span className="bl-file-name">{displayName}</span>
                </button>

                {bls.map((bl, idx) => (
                  <button
                    key={`${bl.filePath}:${bl.line}:${idx}`}
                    className="bl-snippet"
                    onClick={() => handleBacklinkClick(bl.filePath)}
                    title={`Line ${bl.line}`}
                  >
                    <span className="bl-line-num">L{bl.line}</span>
                    <span className="bl-snippet-text">{bl.snippet}</span>
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
