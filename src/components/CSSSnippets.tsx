"use client";

import { useState, useCallback } from "react";
import type { CSSSnippet } from "@/lib/css-snippets";
import {
  toggleSnippet,
  createSnippet,
  deleteSnippet,
  updateSnippetContent,
} from "@/lib/css-snippets";

interface CSSSnippetsProps {
  vaultPath: string;
  snippets: CSSSnippet[];
  onSnippetsChange: (snippets: CSSSnippet[]) => void;
  onClose: () => void;
}

export default function CSSSnippets({
  vaultPath,
  snippets,
  onSnippetsChange,
  onClose,
}: CSSSnippetsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      await toggleSnippet(vaultPath, id, enabled);
      onSnippetsChange(
        snippets.map((s) => (s.id === id ? { ...s, enabled } : s))
      );
    },
    [vaultPath, snippets, onSnippetsChange]
  );

  const handleEdit = useCallback((snippet: CSSSnippet) => {
    setEditingId(snippet.id);
    setEditContent(snippet.content);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId) return;
    await updateSnippetContent(vaultPath, editingId, editContent);
    onSnippetsChange(
      snippets.map((s) =>
        s.id === editingId ? { ...s, content: editContent } : s
      )
    );
    setEditingId(null);
    setEditContent("");
  }, [vaultPath, editingId, editContent, snippets, onSnippetsChange]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditContent("");
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const snippet = await createSnippet(
      vaultPath,
      newName.trim(),
      `/* ${newName.trim()} */\n`
    );
    onSnippetsChange([...snippets, snippet]);
    setNewName("");
    setShowNewForm(false);
    // Open editor for new snippet
    setEditingId(snippet.id);
    setEditContent(snippet.content);
  }, [vaultPath, newName, snippets, onSnippetsChange]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteSnippet(vaultPath, id);
      onSnippetsChange(snippets.filter((s) => s.id !== id));
      setConfirmDelete(null);
      if (editingId === id) {
        setEditingId(null);
        setEditContent("");
      }
    },
    [vaultPath, snippets, onSnippetsChange, editingId]
  );

  const filtered = snippets.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="snippets-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="snippets-modal">
        <div className="snippets-header">
          <h2 className="snippets-title">CSS Snippets</h2>
          <button onClick={onClose} className="snippets-close-btn">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="snippets-toolbar">
          <input
            type="text"
            className="snippets-search"
            placeholder="Search snippets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="snippets-new-btn"
            onClick={() => setShowNewForm(true)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                d="M6 2v8M2 6h8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            New Snippet
          </button>
        </div>

        {showNewForm && (
          <div className="snippet-new-form">
            <input
              type="text"
              className="snippet-new-input"
              placeholder="Snippet name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setShowNewForm(false);
                  setNewName("");
                }
              }}
              autoFocus
            />
            <button className="snippet-create-btn" onClick={handleCreate}>
              Create
            </button>
            <button
              className="snippet-cancel-btn"
              onClick={() => {
                setShowNewForm(false);
                setNewName("");
              }}
            >
              Cancel
            </button>
          </div>
        )}

        <div className="snippets-list">
          {filtered.length === 0 ? (
            <div className="snippet-empty">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              >
                <path d="M4 4h16v16H4z" strokeLinecap="round" />
                <path d="M8 8h3M8 12h8M8 16h5" strokeLinecap="round" />
              </svg>
              <p className="snippet-empty-title">No CSS snippets yet</p>
              <p className="snippet-empty-desc">
                CSS snippets let you customize Noteriv appearance. Create a
                snippet above or place <code>.css</code> files in:
              </p>
              <code className="snippet-path">
                .noteriv/snippets/
              </code>
            </div>
          ) : (
            filtered.map((snippet) => (
              <div key={snippet.id} className="snippet-item">
                <div className="snippet-item-header">
                  <button
                    className={`snippet-toggle${snippet.enabled ? " snippet-toggle-on" : ""}`}
                    onClick={() => handleToggle(snippet.id, !snippet.enabled)}
                    role="switch"
                    aria-checked={snippet.enabled}
                  >
                    <span className="snippet-toggle-thumb" />
                  </button>
                  <div className="snippet-info">
                    <span className="snippet-name">{snippet.name}</span>
                    <span className="snippet-meta">
                      {snippet.filename} &middot;{" "}
                      {snippet.content.split("\n").length} lines
                    </span>
                  </div>
                  <div className="snippet-actions">
                    <button
                      className="snippet-action-btn"
                      onClick={() => handleEdit(snippet)}
                      title="Edit snippet"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M11.5 1.5l3 3L5 14H2v-3z"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {confirmDelete === snippet.id ? (
                      <>
                        <button
                          className="snippet-action-btn snippet-delete-confirm"
                          onClick={() => handleDelete(snippet.id)}
                        >
                          Delete
                        </button>
                        <button
                          className="snippet-action-btn"
                          onClick={() => setConfirmDelete(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="snippet-action-btn snippet-delete-btn"
                        onClick={() => setConfirmDelete(snippet.id)}
                        title="Delete snippet"
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path
                            d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M4 4l1 9a1 1 0 001 1h4a1 1 0 001-1l1-9"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {editingId === snippet.id && (
                  <div className="snippet-editor">
                    <textarea
                      className="snippet-editor-textarea"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      spellCheck={false}
                      rows={Math.min(20, Math.max(6, editContent.split("\n").length + 2))}
                    />
                    <div className="snippet-editor-actions">
                      <button
                        className="snippet-save-btn"
                        onClick={handleSaveEdit}
                      >
                        Save
                      </button>
                      <button
                        className="snippet-cancel-edit-btn"
                        onClick={handleCancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="snippets-footer">
          <span className="snippets-footer-text">
            Snippets are stored in{" "}
            <code>.noteriv/snippets/</code> in your vault
          </span>
        </div>
      </div>
    </div>
  );
}
