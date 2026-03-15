"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { generatePublishHTML } from "@/lib/publish";

interface PublishPreviewProps {
  content: string;
  title: string;
  vaultPath: string;
  onClose: () => void;
}

interface VaultFile {
  filePath: string;
  relativePath: string;
}

export default function PublishPreview({ content, title, vaultPath, onClose }: PublishPreviewProps) {
  const [html, setHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Multi-note selection
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [mergedContent, setMergedContent] = useState(content);
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  // Load vault files
  useEffect(() => {
    async function load() {
      if (!window.electronAPI) return;
      const files = await window.electronAPI.listAllFiles(vaultPath);
      setVaultFiles(files.filter((f) => f.filePath.match(/\.(md|markdown)$/i)));
    }
    load();
  }, [vaultPath]);

  // Rebuild merged content when selection changes
  useEffect(() => {
    async function merge() {
      if (selectedFiles.length === 0) {
        setMergedContent(content);
        return;
      }
      if (!window.electronAPI) return;

      let combined = content;
      for (const fp of selectedFiles) {
        const noteContent = await window.electronAPI.readFile(fp);
        if (noteContent) {
          const name = fp.split("/").pop()?.replace(/\.(md|markdown)$/i, "") || "";
          combined += `\n\n---\n\n# ${name}\n\n${noteContent}`;
        }
      }
      setMergedContent(combined);
    }
    merge();
  }, [content, selectedFiles]);

  // Generate HTML from merged content
  useEffect(() => {
    const publishTitle = selectedFiles.length > 0
      ? `${title} + ${selectedFiles.length} more`
      : title;
    setHtml(generatePublishHTML(mergedContent, publishTitle));
  }, [mergedContent, title, selectedFiles.length]);

  // Update iframe
  useEffect(() => {
    if (iframeRef.current && html && tab === "preview") {
      iframeRef.current.srcdoc = html;
    }
  }, [html, tab]);

  const toggleFile = useCallback((filePath: string) => {
    setSelectedFiles((prev) =>
      prev.includes(filePath)
        ? prev.filter((f) => f !== filePath)
        : [...prev, filePath]
    );
  }, []);

  const handleSave = async () => {
    if (!window.electronAPI || !html) return;
    setSaving(true);
    const defaultPath = `${title.replace(/[^a-zA-Z0-9-_ ]/g, "")}.html`;
    const filePath = await window.electronAPI.saveHtmlDialog(defaultPath);
    if (filePath) {
      const success = await window.electronAPI.writeFile(filePath, html);
      if (success) {
        setSaved(filePath);
        try { await window.electronAPI.openPath(filePath); } catch {}
      }
    }
    setSaving(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(html);
    setSaved("clipboard");
    setTimeout(() => setSaved(null), 2000);
  };

  const filteredFiles = vaultFiles.filter((f) => {
    const name = f.relativePath.toLowerCase();
    return name.includes(search.toLowerCase()) && f.filePath !== `${vaultPath}/${title}.md`;
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 90,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#1e1e2e", borderRadius: 12, border: "1px solid #313244",
        width: "90vw", height: "85vh", maxWidth: 1100, maxHeight: 750,
        display: "flex", overflow: "hidden",
      }} onClick={(e) => e.stopPropagation()}>

        {/* Sidebar — note picker */}
        <div style={{
          width: showPicker ? 260 : 0, overflow: "hidden",
          borderRight: showPicker ? "1px solid #313244" : "none",
          display: "flex", flexDirection: "column",
          transition: "width 0.15s ease",
          flexShrink: 0,
        }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #313244" }}>
            <div style={{ color: "#a6adc8", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Add Notes</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              style={{
                width: "100%", background: "#313244", border: "1px solid #45475a",
                borderRadius: 4, padding: "4px 8px", color: "#cdd6f4", fontSize: 12,
                outline: "none",
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
            {filteredFiles.map((f) => {
              const name = f.relativePath.replace(/\.(md|markdown)$/i, "");
              const isSelected = selectedFiles.includes(f.filePath);
              return (
                <button
                  key={f.filePath}
                  onClick={() => toggleFile(f.filePath)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    width: "100%", textAlign: "left",
                    padding: "4px 8px", border: "none", borderRadius: 4,
                    background: isSelected ? "#45475a" : "transparent",
                    color: isSelected ? "#cdd6f4" : "#a6adc8",
                    fontSize: 12, cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                    border: isSelected ? "none" : "1.5px solid #585b70",
                    background: isSelected ? "#89b4fa" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#1e1e2e", fontSize: 9,
                  }}>{isSelected ? "\u2713" : ""}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                </button>
              );
            })}
          </div>
          {selectedFiles.length > 0 && (
            <div style={{ padding: "6px 12px", borderTop: "1px solid #313244", fontSize: 11, color: "#a6adc8" }}>
              {selectedFiles.length} note{selectedFiles.length !== 1 ? "s" : ""} added
              <button
                onClick={() => setSelectedFiles([])}
                style={{ marginLeft: 8, border: "none", background: "transparent", color: "#f38ba8", fontSize: 11, cursor: "pointer" }}
              >Clear</button>
            </div>
          )}
        </div>

        {/* Main area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 16px", borderBottom: "1px solid #313244", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setShowPicker((s) => !s)}
                title="Add more notes"
                style={{
                  ...btnStyle,
                  background: showPicker ? "#45475a" : undefined,
                  fontWeight: 600,
                }}
              >+ Notes</button>
              <div style={{ display: "flex", background: "#313244", borderRadius: 4, padding: 1 }}>
                <button onClick={() => setTab("preview")} style={{
                  ...tabBtnStyle,
                  background: tab === "preview" ? "#45475a" : "transparent",
                  color: tab === "preview" ? "#cdd6f4" : "#585b70",
                }}>Preview</button>
                <button onClick={() => setTab("code")} style={{
                  ...tabBtnStyle,
                  background: tab === "code" ? "#45475a" : "transparent",
                  color: tab === "code" ? "#cdd6f4" : "#585b70",
                }}>HTML</button>
              </div>
              <span style={{ color: "#585b70", fontSize: 11 }}>
                {title}{selectedFiles.length > 0 ? ` + ${selectedFiles.length}` : ""}.html
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCopy} style={btnStyle}>
                {saved === "clipboard" ? "Copied!" : "Copy HTML"}
              </button>
              <button onClick={handleSave} disabled={saving} style={{
                ...btnStyle,
                background: "#89b4fa", color: "#1e1e2e", fontWeight: 600, border: "none",
                opacity: saving ? 0.6 : 1,
              }}>
                {saving ? "Saving..." : "Save as HTML"}
              </button>
              <button onClick={onClose} style={btnStyle}>&times;</button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: "hidden", background: "#181825" }}>
            {tab === "preview" ? (
              <iframe
                ref={iframeRef}
                sandbox="allow-same-origin"
                style={{ width: "100%", height: "100%", border: "none" }}
              />
            ) : (
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                spellCheck={false}
                style={{
                  width: "100%", height: "100%", resize: "none",
                  background: "#1e1e2e", color: "#a6adc8", border: "none",
                  padding: 16, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  outline: "none", lineHeight: 1.6,
                }}
              />
            )}
          </div>

          {/* Saved confirmation */}
          {saved && saved !== "clipboard" && (
            <div style={{
              padding: "6px 16px", borderTop: "1px solid #313244",
              fontSize: 11, color: "#a6e3a1", flexShrink: 0,
            }}>
              Saved to {saved}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "4px 12px", border: "1px solid #45475a", borderRadius: 6,
  background: "transparent", color: "#a6adc8", fontSize: 12, cursor: "pointer",
};

const tabBtnStyle: React.CSSProperties = {
  padding: "3px 10px", border: "none", borderRadius: 3,
  fontSize: 11, cursor: "pointer",
};
