"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  priority: "#f38ba8",
  urgent: "#f38ba8",
  bug: "#f38ba8",
  feature: "#89b4fa",
  enhancement: "#89b4fa",
  blocked: "#f9e2af",
  review: "#cba6f7",
  default: "#a6adc8",
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] || TAG_COLORS.default;
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

  // Sync from external content changes
  useEffect(() => {
    setBoard(parseBoard(content));
  }, [content]);

  const emitChange = useCallback((newBoard: BoardData) => {
    setBoard(newBoard);
    onChange(serializeBoard(newBoard));
  }, [onChange]);

  // Drag handlers
  const handleDragStart = useCallback((cardId: string, colId: string) => {
    setDragCard({ cardId, colId });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colId: string, index: number) => {
    e.preventDefault();
    setDropTarget({ colId, index });
  }, []);

  const handleDrop = useCallback(() => {
    if (!dragCard || !dropTarget) return;

    const newColumns = board.columns.map((col) => ({ ...col, cards: [...col.cards] }));
    const fromCol = newColumns.find((c) => c.id === dragCard.colId);
    const toCol = newColumns.find((c) => c.id === dropTarget.colId);
    if (!fromCol || !toCol) return;

    const cardIdx = fromCol.cards.findIndex((c) => c.id === dragCard.cardId);
    if (cardIdx === -1) return;

    const [card] = fromCol.cards.splice(cardIdx, 1);
    let insertIdx = dropTarget.index;
    if (fromCol.id === toCol.id && cardIdx < insertIdx) insertIdx--;
    toCol.cards.splice(Math.max(0, insertIdx), 0, card);

    emitChange({ ...board, columns: newColumns });
    setDragCard(null);
    setDropTarget(null);
  }, [board, dragCard, dropTarget, emitChange]);

  const handleDragEnd = useCallback(() => {
    setDragCard(null);
    setDropTarget(null);
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

  const handleRemoveColumn = useCallback((colId: string) => {
    const col = board.columns.find((c) => c.id === colId);
    if (col && col.cards.length > 0) {
      if (!confirm(`Delete "${col.title}" and its ${col.cards.length} cards?`)) return;
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
        background: "#1e1e2e",
      }}
    >
      {board.columns.map((col) => (
        <div
          key={col.id}
          style={{
            minWidth: 260,
            maxWidth: 300,
            background: "#181825",
            borderRadius: 8,
            border: "1px solid #313244",
            display: "flex",
            flexDirection: "column",
            maxHeight: "100%",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            handleDragOver(e, col.id, col.cards.length);
          }}
          onDrop={handleDrop}
        >
          {/* Column header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderBottom: "1px solid #313244",
          }}>
            <span style={{ color: "#cdd6f4", fontSize: 13, fontWeight: 600 }}>
              {col.title}
              <span style={{ marginLeft: 6, color: "#585b70", fontWeight: 400, fontSize: 11 }}>{col.cards.length}</span>
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => setAddingToCol(col.id)}
                style={iconBtnStyle}
                title="Add card"
              >+</button>
              <button
                onClick={() => handleRemoveColumn(col.id)}
                style={{ ...iconBtnStyle, color: "#f38ba8" }}
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
                  <div style={{ height: 2, background: "#89b4fa", borderRadius: 1, margin: "4px 0" }} />
                )}
                <div
                  draggable
                  onDragStart={() => handleDragStart(card.id, col.id)}
                  onDragOver={(e) => handleDragOver(e, col.id, cardIdx)}
                  onDragEnd={handleDragEnd}
                  style={{
                    background: dragCard?.cardId === card.id ? "#45475a" : "#313244",
                    borderRadius: 6,
                    padding: "8px 10px",
                    marginBottom: 6,
                    cursor: "grab",
                    opacity: dragCard?.cardId === card.id ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <button
                      onClick={() => handleToggleCard(col.id, card.id)}
                      style={{
                        width: 16, height: 16, borderRadius: 3, marginTop: 1,
                        border: card.completed ? "none" : "1.5px solid #585b70",
                        background: card.completed ? "#a6e3a1" : "transparent",
                        color: "#1e1e2e", fontSize: 10, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}
                    >{card.completed ? "\u2713" : ""}</button>

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
                            width: "100%", background: "#1e1e2e", border: "1px solid #89b4fa",
                            borderRadius: 3, padding: "2px 4px", color: "#cdd6f4", fontSize: 12,
                            outline: "none",
                          }}
                        />
                      ) : (
                        <span
                          onDoubleClick={() => handleStartEdit(col.id, card)}
                          style={{
                            color: card.completed ? "#585b70" : "#cdd6f4",
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
                            background: getTagColor(tag) + "22", color: getTagColor(tag),
                          }}>#{tag}</span>
                        ))}
                        {card.dueDate && (
                          <span style={{
                            fontSize: 10, padding: "1px 6px", borderRadius: 10,
                            background: "#f9e2af22", color: "#f9e2af",
                          }}>{card.dueDate}</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveCard(col.id, card.id)}
                      style={{ ...iconBtnStyle, fontSize: 12, color: "#585b70", padding: 0, width: 16, height: 16 }}
                    >&times;</button>
                  </div>
                </div>
              </div>
            ))}

            {/* Trailing drop indicator */}
            {dropTarget?.colId === col.id && dropTarget.index === col.cards.length && dragCard && (
              <div style={{ height: 2, background: "#89b4fa", borderRadius: 1, margin: "4px 0" }} />
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
                    width: "100%", background: "#1e1e2e", border: "1px solid #45475a",
                    borderRadius: 4, padding: "6px 8px", color: "#cdd6f4", fontSize: 12,
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
                borderTop: "1px solid #313244",
                background: "transparent",
                color: "#585b70",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
              }}
            >+ Add card</button>
          )}
        </div>
      ))}

      {/* Add column */}
      <div style={{ minWidth: 260 }}>
        {addingColumn ? (
          <div style={{
            background: "#181825", borderRadius: 8, border: "1px solid #313244", padding: 12,
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
                width: "100%", background: "#1e1e2e", border: "1px solid #45475a",
                borderRadius: 4, padding: "6px 8px", color: "#cdd6f4", fontSize: 13,
                outline: "none", marginBottom: 8,
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleAddColumn}
                style={{
                  padding: "4px 12px", borderRadius: 4, border: "none",
                  background: "#89b4fa", color: "#1e1e2e", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >Add</button>
              <button
                onClick={() => setAddingColumn(false)}
                style={{
                  padding: "4px 12px", borderRadius: 4, border: "1px solid #45475a",
                  background: "transparent", color: "#a6adc8", fontSize: 12, cursor: "pointer",
                }}
              >Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingColumn(true)}
            style={{
              width: 260, padding: "12px", borderRadius: 8,
              border: "1px dashed #45475a", background: "transparent",
              color: "#585b70", fontSize: 13, cursor: "pointer",
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
  color: "#a6adc8",
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};
