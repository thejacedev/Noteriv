"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { mergeNotes, splitByHeadings, sanitizeFileName } from "@/lib/note-composer-utils";
import "@/styles/note-composer.css";

interface NoteComposerProps {
  vaultPath: string;
  currentFile: string | null;
  currentContent: string;
  onClose: () => void;
  onFileSelect: (filePath: string) => void;
  onContentChange: (content: string) => void;
}

type Mode = "merge" | "split";

interface VaultFile {
  filePath: string;
  fileName: string;
  relativePath: string;
}

export default function NoteComposer({
  vaultPath,
  currentFile,
  currentContent,
  onClose,
  onFileSelect,
  onContentChange,
}: NoteComposerProps) {
  const [mode, setMode] = useState<Mode>("merge");
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Merge state ──
  const [allFiles, setAllFiles] = useState<VaultFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [addHeadings, setAddHeadings] = useState(true);
  const [deleteAfterMerge, setDeleteAfterMerge] = useState(false);
  const [merging, setMerging] = useState(false);

  // ── Split state ──
  const [splitLevel, setSplitLevel] = useState<1 | 2>(2);
  const [splitPreview, setSplitPreview] = useState<{ title: string; content: string }[]>([]);
  const [splitting, setSplitting] = useState(false);

  // Load all files on mount
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.listAllFiles(vaultPath).then((files) => {
      // Exclude the current file from the merge list
      const filtered = files.filter((f) => f.filePath !== currentFile);
      setAllFiles(filtered);
    });
  }, [vaultPath, currentFile]);

  // Update split preview when content or level changes
  useEffect(() => {
    if (mode === "split") {
      const sections = splitByHeadings(currentContent, splitLevel);
      setSplitPreview(sections);
    }
  }, [mode, currentContent, splitLevel]);

  // Backdrop click
  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  // Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // ── Merge logic ──

  const filteredFiles = searchQuery.trim()
    ? allFiles.filter(
        (f) =>
          f.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.relativePath.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allFiles;

  const toggleFile = (filePath: string) => {
    setSelectedFiles((prev) =>
      prev.includes(filePath)
        ? prev.filter((p) => p !== filePath)
        : [...prev, filePath]
    );
  };

  const handleMerge = async () => {
    if (!window.electronAPI || selectedFiles.length === 0) return;
    setMerging(true);

    try {
      // Read selected files
      const contents: { name: string; content: string }[] = [];
      for (const filePath of selectedFiles) {
        const content = await window.electronAPI.readFile(filePath);
        if (content !== null) {
          const name = filePath.split("/").pop() || "Untitled";
          contents.push({ name, content });
        }
      }

      // Merge into current content
      const mergedPart = mergeNotes(contents, addHeadings);
      const newContent = currentContent.trimEnd() + "\n\n" + mergedPart;
      onContentChange(newContent);

      // Delete source files if option is checked
      if (deleteAfterMerge) {
        for (const filePath of selectedFiles) {
          await window.electronAPI.deleteFile(filePath);
        }
      }

      onClose();
    } catch (err) {
      console.error("Merge failed:", err);
    } finally {
      setMerging(false);
    }
  };

  // ── Split logic ──

  const handleSplit = async () => {
    if (!window.electronAPI || !currentFile || splitPreview.length <= 1) return;
    setSplitting(true);

    try {
      const dir = currentFile.substring(0, currentFile.lastIndexOf("/"));

      for (const section of splitPreview) {
        const fileName = sanitizeFileName(section.title) + ".md";
        const filePath = `${dir}/${fileName}`;

        // Avoid overwriting the current file
        if (filePath === currentFile) continue;

        await window.electronAPI.writeFile(filePath, section.content + "\n");
      }

      // Open the first created file
      const firstSection = splitPreview[0];
      if (firstSection) {
        const firstPath = `${dir}/${sanitizeFileName(firstSection.title)}.md`;
        if (firstPath !== currentFile) {
          onFileSelect(firstPath);
        }
      }

      onClose();
    } catch (err) {
      console.error("Split failed:", err);
    } finally {
      setSplitting(false);
    }
  };

  const currentFileName = currentFile
    ? (currentFile.split("/").pop() || "Untitled").replace(/\.(md|markdown)$/i, "")
    : "No file selected";

  return (
    <div ref={overlayRef} className="nc-overlay" onClick={handleBackdrop}>
      <div className="nc-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="nc-header">
          <div className="nc-header-left">
            <h2 className="nc-title">Note Composer</h2>
            <div className="nc-mode-toggle">
              <button
                className={`nc-mode-btn${mode === "merge" ? " nc-mode-active" : ""}`}
                onClick={() => setMode("merge")}
              >
                Merge
              </button>
              <button
                className={`nc-mode-btn${mode === "split" ? " nc-mode-active" : ""}`}
                onClick={() => setMode("split")}
              >
                Split
              </button>
            </div>
          </div>
          <button onClick={onClose} className="nc-close-btn">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Current file indicator */}
        <div className="nc-current-file">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
            <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span>{currentFileName}</span>
        </div>

        {/* Content */}
        <div className="nc-body">
          {mode === "merge" ? (
            <div className="nc-merge">
              {/* Search */}
              <div className="nc-search-wrap">
                <svg width="14" height="14" viewBox="0 0 14 14" className="nc-search-icon">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                  <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files to merge..."
                  className="nc-search-input"
                  autoFocus
                />
                {selectedFiles.length > 0 && (
                  <span className="nc-selected-count">{selectedFiles.length} selected</span>
                )}
              </div>

              {/* File list */}
              <div className="nc-file-list">
                {filteredFiles.map((f) => {
                  const isSelected = selectedFiles.includes(f.filePath);
                  return (
                    <button
                      key={f.filePath}
                      className={`nc-file-item${isSelected ? " nc-file-selected" : ""}`}
                      onClick={() => toggleFile(f.filePath)}
                    >
                      <span className="nc-file-check">
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 12 12">
                            <path d="M2.5 6l2.5 2.5L9.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          </svg>
                        )}
                      </span>
                      <span className="nc-file-name">
                        {f.fileName.replace(/\.(md|markdown)$/i, "")}
                      </span>
                      <span className="nc-file-path">{f.relativePath}</span>
                    </button>
                  );
                })}
                {filteredFiles.length === 0 && (
                  <div className="nc-empty">No files found</div>
                )}
              </div>

              {/* Merge options */}
              <div className="nc-options">
                <label className="nc-option">
                  <input
                    type="checkbox"
                    checked={addHeadings}
                    onChange={(e) => setAddHeadings(e.target.checked)}
                  />
                  <span>Add filename as heading (h2) between merged content</span>
                </label>
                <label className="nc-option">
                  <input
                    type="checkbox"
                    checked={deleteAfterMerge}
                    onChange={(e) => setDeleteAfterMerge(e.target.checked)}
                  />
                  <span className="nc-option-danger">Delete source files after merge</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="nc-split">
              {/* Split level selector */}
              <div className="nc-split-controls">
                <span className="nc-split-label">Split at:</span>
                <div className="nc-split-level-toggle">
                  <button
                    className={`nc-split-level-btn${splitLevel === 1 ? " nc-split-level-active" : ""}`}
                    onClick={() => setSplitLevel(1)}
                  >
                    H1 headings
                  </button>
                  <button
                    className={`nc-split-level-btn${splitLevel === 2 ? " nc-split-level-active" : ""}`}
                    onClick={() => setSplitLevel(2)}
                  >
                    H2 headings
                  </button>
                </div>
              </div>

              {/* Split preview */}
              <div className="nc-split-preview">
                {splitPreview.length <= 1 ? (
                  <div className="nc-empty">
                    No {splitLevel === 1 ? "H1" : "H2"} headings found to split on
                  </div>
                ) : (
                  splitPreview.map((section, idx) => (
                    <div key={idx} className="nc-split-section">
                      <div className="nc-split-section-header">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        <span className="nc-split-section-title">
                          {sanitizeFileName(section.title)}.md
                        </span>
                      </div>
                      <div className="nc-split-section-preview">
                        {section.content.slice(0, 200)}
                        {section.content.length > 200 ? "..." : ""}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="nc-footer">
          <button onClick={onClose} className="nc-cancel-btn">
            Cancel
          </button>
          {mode === "merge" ? (
            <button
              onClick={handleMerge}
              disabled={selectedFiles.length === 0 || merging || !currentFile}
              className="nc-action-btn"
            >
              {merging ? "Merging..." : `Merge ${selectedFiles.length} file${selectedFiles.length !== 1 ? "s" : ""}`}
            </button>
          ) : (
            <button
              onClick={handleSplit}
              disabled={splitPreview.length <= 1 || splitting || !currentFile}
              className="nc-action-btn"
            >
              {splitting ? "Splitting..." : `Split into ${splitPreview.length} file${splitPreview.length !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
