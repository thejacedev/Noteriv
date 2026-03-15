"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  listTemplates,
  loadTemplate,
  processTemplate,
  getTemplateVariables,
} from "@/lib/template-utils";
import "@/styles/templates.css";

interface TemplatePickerProps {
  vaultPath: string;
  noteTitle: string;
  onInsert: (content: string) => void;
  onClose: () => void;
}

interface TemplateEntry {
  name: string;
  path: string;
}

export default function TemplatePicker({
  vaultPath,
  noteTitle,
  onInsert,
  onClose,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [filtered, setFiltered] = useState<TemplateEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [previewRaw, setPreviewRaw] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Load templates on mount ──
  useEffect(() => {
    listTemplates(vaultPath).then((list) => {
      setTemplates(list);
      setFiltered(list);
      setLoading(false);
    });
  }, [vaultPath]);

  // ── Filter as user types ──
  useEffect(() => {
    if (!query.trim()) {
      setFiltered(templates);
      setSelectedIdx(0);
      return;
    }
    const lower = query.toLowerCase();
    const matches = templates.filter((t) =>
      t.name.toLowerCase().includes(lower),
    );
    setFiltered(matches);
    setSelectedIdx(0);
  }, [query, templates]);

  // ── Load preview when selection changes ──
  useEffect(() => {
    const entry = filtered[selectedIdx];
    if (!entry) {
      setPreviewRaw(null);
      return;
    }
    let cancelled = false;
    loadTemplate(entry.path).then((raw) => {
      if (!cancelled) setPreviewRaw(raw);
    });
    return () => {
      cancelled = true;
    };
  }, [filtered, selectedIdx]);

  // ── Focus input on mount ──
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Keep selected item scrolled into view ──
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIdx] as HTMLElement | undefined;
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  // ── Insert the currently-selected template ──
  const insertSelected = useCallback(() => {
    const entry = filtered[selectedIdx];
    if (!entry || previewRaw === null) return;
    const variables = getTemplateVariables(noteTitle);
    const processed = processTemplate(previewRaw, variables);
    onInsert(processed);
    onClose();
  }, [filtered, selectedIdx, previewRaw, noteTitle, onInsert, onClose]);

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        insertSelected();
      }
    },
    [filtered, insertSelected, onClose],
  );

  // ── Compute preview text with variables replaced ──
  const previewText =
    previewRaw !== null
      ? processTemplate(previewRaw, getTemplateVariables(noteTitle))
      : null;

  // ── Render ──
  return (
    <div className="tpl-overlay" onClick={onClose}>
      <div className="tpl-modal" onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="tpl-input-wrap">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            className="tpl-icon"
          >
            <circle
              cx="6"
              cy="6"
              r="4.5"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
            <path
              d="M9.5 9.5L13 13"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search templates..."
            className="tpl-input"
          />
        </div>

        {loading ? (
          <div className="tpl-empty">
            <span className="tpl-empty-desc">Loading templates...</span>
          </div>
        ) : templates.length === 0 ? (
          /* No templates exist at all */
          <div className="tpl-empty">
            <span className="tpl-empty-title">No templates found</span>
            <span className="tpl-empty-desc">
              Create a <code className="tpl-empty-path">Templates/</code> folder
              in your vault and add <code>.md</code> files to use as templates.
            </span>
            <span className="tpl-empty-desc">
              Use variables like{" "}
              <code className="tpl-empty-path">{"{{date}}"}</code>,{" "}
              <code className="tpl-empty-path">{"{{title}}"}</code>,{" "}
              <code className="tpl-empty-path">{"{{time}}"}</code> for dynamic
              content.
            </span>
          </div>
        ) : (
          <>
            <div className="tpl-body">
              {/* Template list */}
              <div className="tpl-list" ref={listRef}>
                {filtered.map((t, i) => (
                  <button
                    key={t.path}
                    className={`tpl-item${i === selectedIdx ? " tpl-item-active" : ""}`}
                    onClick={() => {
                      // Insert directly — don't rely on selectedIdx updating first
                      loadTemplate(t.path).then((raw) => {
                        const variables = getTemplateVariables(noteTitle);
                        const processed = processTemplate(raw, variables);
                        onInsert(processed);
                        onClose();
                      });
                    }}
                    onMouseEnter={() => setSelectedIdx(i)}
                  >
                    <span className="tpl-item-name">{t.name}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="tpl-empty" style={{ padding: "24px 12px" }}>
                    <span className="tpl-empty-desc">
                      No templates match your search
                    </span>
                  </div>
                )}
              </div>

              {/* Preview pane */}
              <div className="tpl-preview">
                {previewText !== null ? (
                  <>
                    <div className="tpl-preview-label">Preview</div>
                    <div className="tpl-preview-content">{previewText}</div>
                  </>
                ) : (
                  <div className="tpl-preview-empty">
                    Select a template to preview
                  </div>
                )}
              </div>
            </div>

            {/* Footer hints */}
            <div className="tpl-footer">
              <div className="tpl-footer-hint">
                <span>
                  <span className="tpl-footer-key">Enter</span> insert
                </span>
                <span>
                  <span className="tpl-footer-key">Esc</span> close
                </span>
                <span>
                  <span className="tpl-footer-key">&uarr;&darr;</span> navigate
                </span>
              </div>
              <div className="tpl-footer-hint">
                {filtered.length} template{filtered.length !== 1 ? "s" : ""}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
