"use client";

import { useState, useEffect, useCallback } from "react";
import {
  extractAllCards,
  loadReviews,
  saveReviews,
  getDueCards,
  gradeCard,
  type Flashcard,
  type CardReview,
} from "@/lib/flashcard-utils";

interface FlashcardReviewProps {
  vaultPath: string;
  onClose: () => void;
  onFileSelect?: (filePath: string) => void;
}

export default function FlashcardReview({ vaultPath, onClose, onFileSelect }: FlashcardReviewProps) {
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [reviews, setReviews] = useState<Record<string, CardReview>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, due: 0, reviewed: 0 });

  useEffect(() => {
    async function load() {
      const cards = await extractAllCards(vaultPath);
      const revs = await loadReviews(vaultPath);
      const due = getDueCards(cards, revs);
      setAllCards(cards);
      setReviews(revs);
      setDueCards(due);
      setStats({ total: cards.length, due: due.length, reviewed: 0 });
      setLoading(false);
    }
    load();
  }, [vaultPath]);

  const handleGrade = useCallback(async (grade: number) => {
    const card = dueCards[currentIdx];
    if (!card) return;

    const updated = gradeCard(card.id, grade, reviews);
    const newReviews = { ...reviews, [card.id]: updated };
    setReviews(newReviews);
    await saveReviews(vaultPath, newReviews);

    setShowAnswer(false);
    setStats((s) => ({ ...s, reviewed: s.reviewed + 1 }));

    if (currentIdx + 1 < dueCards.length) {
      setCurrentIdx((i) => i + 1);
    } else {
      // All done — recalculate due cards
      const remaining = getDueCards(allCards, newReviews);
      setDueCards(remaining);
      setCurrentIdx(0);
    }
  }, [dueCards, currentIdx, reviews, vaultPath, allCards]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!showAnswer) setShowAnswer(true);
    }
    if (showAnswer) {
      if (e.key === "1") handleGrade(1);
      if (e.key === "2") handleGrade(2);
      if (e.key === "3") handleGrade(3);
      if (e.key === "4") handleGrade(4);
      if (e.key === "5") handleGrade(5);
    }
    if (e.key === "Escape") onClose();
  }, [showAnswer, handleGrade, onClose]);

  const card = dueCards[currentIdx];
  const done = !loading && (dueCards.length === 0 || !card);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      ref={(el) => el?.focus()}
    >
      <div style={{
        background: "#1e1e2e", borderRadius: 12, border: "1px solid #313244",
        width: 520, maxHeight: "80vh", display: "flex", flexDirection: "column",
        overflow: "hidden",
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid #313244",
        }}>
          <span style={{ color: "#cdd6f4", fontSize: 14, fontWeight: 600 }}>Flashcard Review</span>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#a6adc8" }}>
            <span>{stats.total} cards</span>
            <span style={{ color: "#f9e2af" }}>{stats.due - stats.reviewed} due</span>
            <span style={{ color: "#a6e3a1" }}>{stats.reviewed} done</span>
          </div>
          <button onClick={onClose} style={{
            border: "none", background: "transparent", color: "#585b70",
            fontSize: 18, cursor: "pointer",
          }}>&times;</button>
        </div>

        {/* Card area */}
        <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          {loading && (
            <div style={{ color: "#a6adc8", fontSize: 13 }}>Scanning vault for flashcards...</div>
          )}

          {done && !loading && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>&#127881;</div>
              <div style={{ color: "#a6e3a1", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>All caught up!</div>
              <div style={{ color: "#a6adc8", fontSize: 13 }}>
                {stats.total === 0
                  ? "No flashcards found. Add Q:/A: pairs or {{cloze}} deletions to your notes."
                  : `${stats.reviewed} cards reviewed. Come back tomorrow for more.`
                }
              </div>
            </div>
          )}

          {!loading && card && (
            <>
              {/* Question */}
              <div style={{
                background: "#313244", borderRadius: 10, padding: "20px 24px",
                width: "100%", marginBottom: 16, minHeight: 80,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ color: "#cdd6f4", fontSize: 15, textAlign: "center", lineHeight: 1.6 }}>
                  {card.question}
                </div>
              </div>

              {/* Answer */}
              {showAnswer ? (
                <div style={{
                  background: "#181825", borderRadius: 10, border: "1px solid #45475a",
                  padding: "20px 24px", width: "100%", marginBottom: 16, minHeight: 60,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{ color: "#a6e3a1", fontSize: 15, textAlign: "center", lineHeight: 1.6 }}>
                    {card.answer}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAnswer(true)}
                  style={{
                    padding: "10px 32px", borderRadius: 8, border: "1px solid #45475a",
                    background: "#313244", color: "#cdd6f4", fontSize: 13,
                    cursor: "pointer", marginBottom: 16,
                  }}
                >
                  Show Answer (Space)
                </button>
              )}

              {/* Grade buttons */}
              {showAnswer && (
                <div style={{ display: "flex", gap: 8, width: "100%" }}>
                  {[
                    { grade: 1, label: "Again", color: "#f38ba8", key: "1" },
                    { grade: 2, label: "Hard", color: "#fab387", key: "2" },
                    { grade: 3, label: "OK", color: "#f9e2af", key: "3" },
                    { grade: 4, label: "Good", color: "#89b4fa", key: "4" },
                    { grade: 5, label: "Easy", color: "#a6e3a1", key: "5" },
                  ].map((btn) => (
                    <button
                      key={btn.grade}
                      onClick={() => handleGrade(btn.grade)}
                      style={{
                        flex: 1, padding: "8px 4px", borderRadius: 6,
                        border: `1px solid ${btn.color}44`, background: `${btn.color}11`,
                        color: btn.color, fontSize: 12, fontWeight: 600,
                        cursor: "pointer", textAlign: "center",
                      }}
                    >
                      {btn.label}<br />
                      <span style={{ fontSize: 10, opacity: 0.6 }}>{btn.key}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Source */}
              <button
                onClick={() => { if (onFileSelect) { onFileSelect(card.source); onClose(); } }}
                style={{
                  marginTop: 12, border: "none", background: "transparent",
                  color: "#585b70", fontSize: 10, cursor: "pointer",
                }}
              >
                {card.source.split("/").pop()?.replace(/\.(md|markdown)$/i, "")} &middot; {card.type}
              </button>
            </>
          )}
        </div>

        {/* Progress bar */}
        {dueCards.length > 0 && (
          <div style={{ padding: "0 16px 12px" }}>
            <div style={{ height: 3, background: "#313244", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#89b4fa", borderRadius: 2,
                width: `${Math.min(100, (stats.reviewed / Math.max(1, stats.due)) * 100)}%`,
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
