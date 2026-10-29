"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { confirmDialog } from "./ConfirmDialog";
import {
  parseBoard,
  serializeBoard,
  addCard,
  removeCard,
  addColumn,
  removeColumn,
  updateCard,
  toggleCard,
  type BoardData,
  type BoardCard,
} from "@/lib/board-utils";

interface BoardViewProps {
  content: string;
  onChange: (newContent: string) => void;
}

const TAG_COLORS: Record<string, string> = {
  priority: "var(--red)",
  urgent: "var(--red)",
  bug: "var(--red)",
  feature: "var(--accent)",
  enhancement: "var(--accent)",
  blocked: "var(--yellow)",
  review: "var(--mauve)",
  default: "var(--text-secondary)",
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] || TAG_COLORS.default;
}

// Movement (px) before a pointer-down becomes a drag. Below this, treat as a click.
const DRAG_THRESHOLD = 4;

interface DragState {
  cardId: string;
  colId: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  active: boolean;
  drop: { colId: string; index: number } | null;
}

export default function BoardView({ content, onChange }: BoardViewProps) {
  const [board, setBoard] = useState<BoardData>(() => parseBoard(content));
  const [dragCard, setDragCard] = useState<{ cardId: string; colId: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ colId: string; index: number } | null>(null);
  const [editingCard, setEditingCard] = useState<{ colId: string; cardId: string } | null>(null);
  const [editText, setEditText] = useState("");
  const [addingToCol, setAddingToCol] = useState<string | null>(null);
  const [newCardText, setNewCardText] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState("");

  const boardRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newCardInputRef = useRef<HTMLInputElement>(null);

  // Mutable drag state — document-level listeners read this without closure staleness.
  const dragRef = useRef<DragState | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  // Sync from external content changes
  useEffect(() => {
    setBoard(parseBoard(content));
  }, [content]);

  const emitChange = useCallback((newBoard: BoardData) => {
    setBoard(newBoard);
    onChange(serializeBoard(newBoard));
  }, [onChange]);

  // Indirection so document listeners always call the latest version.
  const performDropRef = useRef<(target: { colId: string; index: number }, fromColId: string, cardId: string) => void>(() => {});
  performDropRef.current = (target, fromColId, cardId) => {
    const newColumns = board.columns.map((col) => ({ ...col, cards: [...col.cards] }));
    const fromCol = newColumns.find((c) => c.id === fromColId);
    const toCol = newColumns.find((c) => c.id === target.colId);
    if (!fromCol || !toCol) return;
    const cardIdx = fromCol.cards.findIndex((c) => c.id === cardId);
    if (cardIdx === -1) return;
    const [card] = fromCol.cards.splice(cardIdx, 1);
    let insertIdx = target.index;
    if (fromCol.id === toCol.id && cardIdx < insertIdx) insertIdx--;
    toCol.cards.splice(Math.max(0, insertIdx), 0, card);
    emitChange({ ...board, columns: newColumns });
  };

  // Document-level pointer listeners. HTML5 drag-and-drop is broken in
  // WebKitGTK (Tauri's Linux webview), so we hand-roll DnD with pointer
  // events — uniform behavior across macOS, Windows, and Linux.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const s = dragRef.current;
      if (!s) return;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      if (!s.active) {
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        s.active = true;
        setDragCard({ cardId: s.cardId, colId: s.colId });
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      } else if (ghostRef.current) {
        const x = e.clientX - s.offsetX;
        const y = e.clientY - s.offsetY;
        ghostRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el) return;
      const colEl = el.closest<HTMLElement>("[data-col-id]");
      if (!colEl) return;
      const colId = colEl.dataset.colId!;
      const cardEl = el.closest<HTMLElement>("[data-card-id]");

      let drop: { colId: string; index: number };
      if (cardEl && colEl.contains(cardEl)) {
        const rect = cardEl.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        const idx = parseInt(cardEl.dataset.cardIndex || "0", 10);
        drop = { colId, index: before ? idx : idx + 1 };
      } else {
        const len = parseInt(colEl.dataset.colLength || "0", 10);
        drop = { colId, index: len };
      }
      s.drop = drop;
      setDropTarget(drop);
    }

    function onUp() {
      const s = dragRef.current;
      if (!s) {
        return;
      }
      if (s.active && s.drop) {
        performDropRef.current(s.drop, s.colId, s.cardId);
      }
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      dragRef.current = null;
      setDragCard(null);
      setDropTarget(null);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const handleCardPointerDown = useCallback((e: React.PointerEvent, cardId: string, colId: string) => {
    if (e.button !== 0) return;
    // Don't start a drag from interactive children (checkbox, close, edit input).
    const target = e.target as HTMLElement;
    if (target.closest("button, input")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      cardId,
      colId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      active: false,
      drop: null,
    };
  }, []);

  // Card operations
  const handleAddCard = useCallback((colId: string) => {
    if (!newCardText.trim()) return;
    emitChange(addCard(board, colId, newCardText.trim()));
    setNewCardText("");
    setAddingToCol(null);
  }, [board, newCardText, emitChange]);

  const handleRemoveCard = useCallback((colId: string, cardId: string) => {
    emitChange(removeCard(board, colId, cardId));
  }, [board, emitChange]);

  const handleToggleCard = useCallback((colId: string, cardId: string) => {
    emitChange(toggleCard(board, colId, cardId));
  }, [board, emitChange]);

  const handleStartEdit = useCallback((colId: string, card: BoardCard) => {
    setEditingCard({ colId, cardId: card.id });
    setEditText(card.text);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingCard) return;
    emitChange(updateCard(board, editingCard.colId, editingCard.cardId, editText.trim()));
    setEditingCard(null);
  }, [board, editingCard, editText, emitChange]);

  // Column operations
  const handleAddColumn = useCallback(() => {
    if (!newColTitle.trim()) return;
    emitChange(addColumn(board, newColTitle.trim()));
    setNewColTitle("");
    setAddingColumn(false);
  }, [board, newColTitle, emitChange]);

  const handleRemoveColumn = useCallback(async (colId: string) => {
    const col = board.columns.find((c) => c.id === colId);
    if (col && col.cards.length > 0) {
      const confirmed = await confirmDialog({
        title: `Delete "${col.title}"?`,
        message: `The column and its ${col.cards.length} ${col.cards.length === 1 ? "card" : "cards"} will be removed.`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!confirmed) return;
    }
    emitChange(removeColumn(board, colId));
  }, [board, emitChange]);

  useEffect(() => {
    if (addingToCol && newCardInputRef.current) newCardInputRef.current.focus();
  }, [addingToCol]);

  return (
    <div
      ref={boardRef}
      style={{
        display: "flex",
        gap: 12,
        padding: 16,
        height: "100%",
        overflowX: "auto",
        overflowY: "hidden",
        background: "var(--bg-primary)",
      }}
    >
      {board.columns.map((col) => (
        <div
          key={col.id}
          data-col-id={col.id}
          data-col-length={col.cards.length}
          style={{
            minWidth: 260,
            maxWidth: 300,
            background: "var(--bg-secondary)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "100%",
          }}
        >
          {/* Column header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
          }}>
            <span style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>
              {col.title}
              <span style={{ marginLeft: 6, color: "var(--text-muted)", fontWeight: 400, fontSize: 11 }}>{col.cards.length}</span>
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => setAddingToCol(col.id)}
                style={iconBtnStyle}
                title="Add card"
              >+</button>
              <button
                onClick={() => handleRemoveColumn(col.id)}
                style={{ ...iconBtnStyle, color: "var(--red)" }}
                title="Delete column"
              >&times;</button>
            </div>
          </div>

          {/* Cards */}
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {col.cards.map((card, cardIdx) => (
              <div key={card.id}>
                {/* Drop indicator */}
                {dropTarget?.colId === col.id && dropTarget.index === cardIdx && dragCard && (
                  <div style={{
                    height: 3, background: "var(--accent)", borderRadius: 2,
                    margin: "4px 0", boxShadow: "0 0 8px var(--accent)",
                  }} />
                )}
                <div
                  data-card-id={card.id}
                  data-card-index={cardIdx}
                  onPointerDown={(e) => handleCardPointerDown(e, card.id, col.id)}
                  style={{
                    background: "var(--bg-tertiary)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    marginBottom: 6,
                    cursor: "grab",
                    opacity: dragCard?.cardId === card.id ? 0.25 : 1,
                    transform: dragCard?.cardId === card.id ? "scale(0.98)" : "scale(1)",
                    transition: "opacity 0.12s ease-out, transform 0.12s ease-out",
                    touchAction: "none",
                    userSelect: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <button
                      onClick={() => handleToggleCard(col.id, card.id)}
                      style={{
                        width: 16, height: 16, borderRadius: 3, marginTop: 1, padding: 0,
                        border: card.completed ? "none" : "1.5px solid var(--text-muted)",
                        background: card.completed ? "var(--green)" : "transparent",
                        cursor: "pointer", lineHeight: 0,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}
                    >{card.completed && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                        <path d="M2 5.2 L4.2 7.4 L8 3.4" stroke="var(--bg-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}</button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingCard?.cardId === card.id ? (
                        <input
                          ref={editInputRef}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit();
                            if (e.key === "Escape") setEditingCard(null);
                          }}
                          onBlur={handleSaveEdit}
                          style={{
                            width: "100%", background: "var(--bg-primary)", border: "1px solid var(--accent)",
                            borderRadius: 3, padding: "2px 4px", color: "var(--text-primary)", fontSize: 12,
                            outline: "none",
                          }}
                        />
                      ) : (
                        <span
                          onDoubleClick={() => handleStartEdit(col.id, card)}
                          style={{
                            color: card.completed ? "var(--text-muted)" : "var(--text-primary)",
                            fontSize: 12,
                            textDecoration: card.completed ? "line-through" : "none",
                            wordBreak: "break-word",
                          }}
                        >{card.text}</span>
                      )}

                      {/* Tags & due date */}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                        {card.tags.map((tag) => (
                          <span key={tag} style={{
                            fontSize: 10, padding: "1px 6px", borderRadius: 10,
                            background: `color-mix(in srgb, ${getTagColor(tag)} 13%, transparent)`,
                            color: getTagColor(tag),
                          }}>#{tag}</span>
                        ))}
                        {card.dueDate && (
                          <span style={{
                            fontSize: 10, padding: "1px 6px", borderRadius: 10,
                            background: "color-mix(in srgb, var(--yellow) 13%, transparent)",
                            color: "var(--yellow)",
                          }}>{card.dueDate}</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveCard(col.id, card.id)}
                      style={{ ...iconBtnStyle, fontSize: 12, color: "var(--text-muted)", padding: 0, width: 16, height: 16 }}
                    >&times;</button>
                  </div>
                </div>
              </div>
            ))}

            {/* Trailing drop indicator */}
            {dropTarget?.colId === col.id && dropTarget.index === col.cards.length && dragCard && (
              <div style={{
                height: 3, background: "var(--accent)", borderRadius: 2,
                margin: "4px 0", boxShadow: "0 0 8px var(--accent)",
              }} />
            )}

            {/* Add card input */}
            {addingToCol === col.id && (
              <div style={{ marginTop: 4 }}>
                <input
                  ref={newCardInputRef}
                  value={newCardText}
                  onChange={(e) => setNewCardText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddCard(col.id);
                    if (e.key === "Escape") setAddingToCol(null);
                  }}
                  onBlur={() => { if (!newCardText.trim()) setAddingToCol(null); }}
                  placeholder="Card text..."
                  style={{
                    width: "100%", background: "var(--bg-primary)", border: "1px solid var(--border)",
                    borderRadius: 4, padding: "6px 8px", color: "var(--text-primary)", fontSize: 12,
                    outline: "none",
                  }}
                />
              </div>
            )}
          </div>

          {/* Add card button */}
          {addingToCol !== col.id && (
            <button
              onClick={() => setAddingToCol(col.id)}
              style={{
                display: "block",
                width: "100%",
                padding: "8px",
                border: "none",
                borderTop: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-muted)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
              }}
            >+ Add card</button>
          )}
        </div>
      ))}

      {/* Floating drag ghost */}
      {dragCard && dragRef.current && (() => {
        const s = dragRef.current;
        const draggedCard = board.columns
          .find((c) => c.id === dragCard.colId)
          ?.cards.find((c) => c.id === dragCard.cardId);
        if (!draggedCard) return null;
        const initialX = s.lastX - s.offsetX;
        const initialY = s.lastY - s.offsetY;
        return (
          <div
            ref={ghostRef}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: s.width,
              transform: `translate3d(${initialX}px, ${initialY}px, 0)`,
              pointerEvents: "none",
              zIndex: 9999,
              willChange: "transform",
            }}
          >
            <div style={{
              background: "var(--bg-tertiary)",
              borderRadius: 6,
              padding: "8px 10px",
              transform: "rotate(2deg) scale(1.03)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.45), 0 4px 10px rgba(0,0,0,0.3)",
              border: "1px solid var(--accent)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 3, marginTop: 1, flexShrink: 0,
                  border: draggedCard.completed ? "none" : "1.5px solid var(--text-muted)",
                  background: draggedCard.completed ? "var(--green)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {draggedCard.completed && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                      <path d="M2 5.2 L4.2 7.4 L8 3.4" stroke="var(--bg-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    color: draggedCard.completed ? "var(--text-muted)" : "var(--text-primary)",
                    fontSize: 12,
                    textDecoration: draggedCard.completed ? "line-through" : "none",
                    wordBreak: "break-word",
                  }}>{draggedCard.text}</span>
                  {(draggedCard.tags.length > 0 || draggedCard.dueDate) && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                      {draggedCard.tags.map((tag) => (
                        <span key={tag} style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 10,
                          background: `color-mix(in srgb, ${getTagColor(tag)} 13%, transparent)`,
                          color: getTagColor(tag),
                        }}>#{tag}</span>
                      ))}
                      {draggedCard.dueDate && (
                        <span style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 10,
                          background: "color-mix(in srgb, var(--yellow) 13%, transparent)",
                          color: "var(--yellow)",
                        }}>{draggedCard.dueDate}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add column */}
      <div style={{ minWidth: 260 }}>
        {addingColumn ? (
          <div style={{
            background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border)", padding: 12,
          }}>
            <input
              value={newColTitle}
              onChange={(e) => setNewColTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddColumn();
                if (e.key === "Escape") setAddingColumn(false);
              }}
              autoFocus
              placeholder="Column title..."
              style={{
                width: "100%", background: "var(--bg-primary)", border: "1px solid var(--border)",
                borderRadius: 4, padding: "6px 8px", color: "var(--text-primary)", fontSize: 13,
                outline: "none", marginBottom: 8,
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleAddColumn}
                style={{
                  padding: "4px 12px", borderRadius: 4, border: "none",
                  background: "var(--accent)", color: "var(--bg-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >Add</button>
              <button
                onClick={() => setAddingColumn(false)}
                style={{
                  padding: "4px 12px", borderRadius: 4, border: "1px solid var(--border)",
                  background: "transparent", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer",
                }}
              >Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingColumn(true)}
            style={{
              width: 260, padding: "12px", borderRadius: 8,
              border: "1px dashed var(--border)", background: "transparent",
              color: "var(--text-muted)", fontSize: 13, cursor: "pointer",
              textAlign: "center",
            }}
          >+ Add column</button>
        )}
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  border: "none",
  borderRadius: 3,
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};
