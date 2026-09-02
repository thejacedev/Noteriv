"use client";

import { useMemo, useState } from "react";
import { diffStrings } from "@/lib/note-history";
import {
  getSafeApprovalState,
  materializeApprovedSuggestions,
  type KnowledgeApplyResult,
} from "@/lib/knowledge/knowledge-service";
import type {
  KnowledgeProposal,
  SuggestedFlashcard,
} from "@/lib/knowledge/schemas";

interface KnowledgeReviewProps {
  proposal: KnowledgeProposal;
  onBack: () => void;
  onClose: () => void;
  onApply: (proposal: KnowledgeProposal) => Promise<KnowledgeApplyResult>;
  onApplied: (changedFiles: string[]) => void | Promise<void>;
  onApplyingChange: (applying: boolean) => void;
  onRejected: () => void;
}

type EditableCard = SuggestedFlashcard & { accepted: boolean };

function toSuggestedFlashcard(card: EditableCard): SuggestedFlashcard {
  const suggestion: Partial<EditableCard> = { ...card };
  delete suggestion.accepted;
  return suggestion as SuggestedFlashcard;
}

export default function KnowledgeReview({
  proposal,
  onBack,
  onClose,
  onApply,
  onApplied,
  onApplyingChange,
  onRejected,
}: KnowledgeReviewProps) {
  const initialChange = proposal.noteChanges[0];
  const safeApprovals = useMemo(() => getSafeApprovalState(proposal), [proposal]);
  const [accepted, setAccepted] = useState(() => safeApprovals.changeIds.includes(initialChange.id));
  const [targetPath, setTargetPath] = useState(initialChange.targetPath);
  const [content, setContent] = useState(initialChange.proposedContent);
  const [selectedLinks, setSelectedLinks] = useState(
    () => new Set(safeApprovals.linkIds),
  );
  const [cards, setCards] = useState<EditableCard[]>(
    () => proposal.analysis.suggestedFlashcards.map((card) => ({
      ...card,
      accepted: safeApprovals.flashcardIds.includes(card.id),
    })),
  );
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<KnowledgeApplyResult | null>(null);
  const [applyError, setApplyError] = useState("");
  const applied = Boolean(applyResult?.changedFiles.length);

  const approvedLinks = useMemo(
    () => proposal.analysis.suggestedWikiLinks.filter((link) => selectedLinks.has(link.id)),
    [proposal.analysis.suggestedWikiLinks, selectedLinks],
  );
  const approvedCards = useMemo(
    () => cards.filter((card) => card.accepted).map(toSuggestedFlashcard),
    [cards],
  );
  const finalContent = useMemo(
    () => materializeApprovedSuggestions(content, approvedLinks, approvedCards),
    [content, approvedLinks, approvedCards],
  );
  const diff = useMemo(
    () => initialChange.kind === "update"
      ? diffStrings(initialChange.baseContent || "", finalContent)
      : [],
    [initialChange.kind, initialChange.baseContent, finalContent],
  );

  const toggleLink = (id: string) => {
    setSelectedLinks((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateCard = (id: string, update: Partial<EditableCard>) => {
    setCards((current) => current.map((card) => card.id === id ? { ...card, ...update } as EditableCard : card));
  };

  const handleApply = async () => {
    setApplying(true);
    onApplyingChange(true);
    setApplyResult(null);
    setApplyError("");
    try {
      const nextProposal: KnowledgeProposal = {
        ...proposal,
        analysis: {
          ...proposal.analysis,
          suggestedWikiLinks: approvedLinks,
          suggestedFlashcards: approvedCards,
        },
        noteChanges: [{
          ...initialChange,
          targetPath,
          proposedContent: finalContent,
          accepted,
        }],
      };
      const result = await onApply(nextProposal);
      setApplyResult(result);
      if (result.changedFiles.length > 0) await onApplied(result.changedFiles);
      else if (!accepted && result.rejectedChangeIds.length > 0) onRejected();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "The reviewed proposal could not be applied.");
    } finally {
      setApplying(false);
      onApplyingChange(false);
    }
  };

  const acceptAllSafe = () => {
    setAccepted(safeApprovals.changeIds.includes(initialChange.id));
    setSelectedLinks(new Set(safeApprovals.linkIds));
    setCards((current) => current.map((card) => ({
      ...card,
      accepted: safeApprovals.flashcardIds.includes(card.id),
    })));
  };

  return (
    <div className="knowledge-review">
      <div className="knowledge-review-toolbar">
        <button type="button" className="knowledge-text-button" onClick={onBack} disabled={applying}>Back to source</button>
        <div className="knowledge-local-badge">Local analysis</div>
        <button type="button" className="knowledge-text-button" onClick={acceptAllSafe} disabled={applying}>Accept all safe changes</button>
      </div>

      <section className="knowledge-summary-card">
        <div>
          <span className="knowledge-eyebrow">Source summary</span>
          <p>{proposal.analysis.summary}</p>
        </div>
        <div className="knowledge-summary-stats">
          <span><strong>{proposal.analysis.concepts.length}</strong> concepts</span>
          <span><strong>{proposal.analysis.existingNoteMatches.length}</strong> related notes</span>
          <span><strong>{proposal.analysis.suggestedFlashcards.length}</strong> cards</span>
        </div>
      </section>

      <div className="knowledge-review-grid">
        <main className="knowledge-review-main">
          <section className={`knowledge-review-section${accepted ? "" : " is-rejected"}`}>
            <div className="knowledge-section-heading">
              <div>
                <span className="knowledge-eyebrow">
                  {initialChange.kind === "create" ? "New note" : "Existing note update"}
                </span>
                <h3>{targetPath}</h3>
              </div>
              <label className="knowledge-decision">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                {accepted ? "Accepted" : "Rejected"}
              </label>
            </div>

            {initialChange.kind === "create" && (
              <label className="knowledge-field compact">
                <span>Destination path</span>
                <input value={targetPath} onChange={(event) => setTargetPath(event.target.value)} spellCheck={false} />
              </label>
            )}

            <p className="knowledge-rationale">{initialChange.rationale}</p>

            {initialChange.kind === "update" && (
              <div className="knowledge-diff" aria-label="Proposed note diff">
                {diff.map((line, index) => (
                  <div key={`${index}-${line.type}`} className={`knowledge-diff-line ${line.type}`}>
                    <span>{line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}</span>
                    <code>{line.text || " "}</code>
                  </div>
                ))}
              </div>
            )}

            <label className="knowledge-field">
              <span>{initialChange.kind === "create" ? "Proposed note" : "Edit proposed result"}</span>
              <textarea
                className="knowledge-proposal-editor"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                spellCheck={false}
              />
            </label>
          </section>

          <section className="knowledge-review-section">
            <div className="knowledge-section-heading">
              <div>
                <span className="knowledge-eyebrow">Wiki links</span>
                <h3>Suggested connections</h3>
              </div>
              <span className="knowledge-count">{selectedLinks.size} accepted</span>
            </div>
            {proposal.analysis.suggestedWikiLinks.length === 0 ? (
              <p className="knowledge-empty">No strong link suggestions were found.</p>
            ) : (
              <div className="knowledge-suggestion-list">
                {proposal.analysis.suggestedWikiLinks.map((link) => (
                  <label key={link.id} className="knowledge-suggestion-row">
                    <input type="checkbox" checked={selectedLinks.has(link.id)} onChange={() => toggleLink(link.id)} />
                    <span>
                      <strong>{link.targetNotePath}</strong>
                      <small>{link.reason}</small>
                    </span>
                    <em>{Math.round(link.confidence * 100)}%</em>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="knowledge-review-section">
            <div className="knowledge-section-heading">
              <div>
                <span className="knowledge-eyebrow">Flashcards</span>
                <h3>Study suggestions</h3>
              </div>
              <span className="knowledge-count">{approvedCards.length} accepted</span>
            </div>
            {cards.length === 0 ? (
              <p className="knowledge-empty">The local analyzer did not find enough context for a useful card.</p>
            ) : (
              <div className="knowledge-card-list">
                {cards.map((card) => (
                  <article key={card.id} className={`knowledge-flashcard${card.accepted ? "" : " is-rejected"}`}>
                    <label className="knowledge-card-toggle">
                      <input type="checkbox" checked={card.accepted} onChange={(event) => updateCard(card.id, { accepted: event.target.checked })} />
                      {card.type === "qa" ? "Question / answer" : "Cloze"}
                    </label>
                    {card.type === "qa" ? (
                      <>
                        <input value={card.question} onChange={(event) => updateCard(card.id, { question: event.target.value })} aria-label="Flashcard question" />
                        <textarea value={card.answer} onChange={(event) => updateCard(card.id, { answer: event.target.value })} aria-label="Flashcard answer" />
                      </>
                    ) : (
                      <textarea value={card.text} onChange={(event) => updateCard(card.id, { text: event.target.value })} aria-label="Cloze card" />
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="knowledge-review-section contradiction-section">
            <div className="knowledge-section-heading">
              <div>
                <span className="knowledge-eyebrow">Contradictions</span>
                <h3>Requires explicit review</h3>
              </div>
            </div>
            {proposal.analysis.contradictions.length === 0 ? (
              <p className="knowledge-empty">Local analysis does not infer contradictions. No claims were automatically resolved.</p>
            ) : (
              proposal.analysis.contradictions.map((contradiction) => (
                <article key={contradiction.id} className="knowledge-contradiction">
                  <strong>{contradiction.existingNotePath}</strong>
                  <p>Existing: {contradiction.existingClaim}</p>
                  <p>New: {contradiction.newClaim}</p>
                </article>
              ))
            )}
          </section>
        </main>

        <aside className="knowledge-review-aside">
          <section>
            <span className="knowledge-eyebrow">Related knowledge</span>
            {proposal.analysis.existingNoteMatches.length === 0 ? (
              <p className="knowledge-empty">No related notes crossed the local relevance threshold.</p>
            ) : proposal.analysis.existingNoteMatches.map((match) => (
              <article key={match.notePath} className="knowledge-match">
                <div><strong>{match.noteTitle}</strong><em>{Math.round(match.relevanceScore * 100)}%</em></div>
                <p>{match.whyItMatches}</p>
                <small>{match.suggestedAction.replace(/-/g, " ")}</small>
              </article>
            ))}
          </section>

          <section>
            <span className="knowledge-eyebrow">Concepts</span>
            <div className="knowledge-concept-list">
              {proposal.analysis.concepts.slice(0, 12).map((concept) => (
                <div key={concept.name}>
                  <strong>{concept.name}</strong>
                  <small>{concept.importance}</small>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {(applyError || (applyResult && (applyResult.conflicts.length > 0 || applyResult.errors.length > 0))) && (
        <div className="knowledge-apply-error" role="alert">
          {applyError || (applyResult
            ? [...applyResult.conflicts.map((item) => item.reason), ...applyResult.errors.map((item) => item.message)].join(" ")
            : "")}
        </div>
      )}

      <footer className="knowledge-review-footer">
        <span>Nothing is written until you apply this reviewed proposal.</span>
        <div>
          <button type="button" className="knowledge-secondary-button" onClick={onClose} disabled={applying}>Cancel</button>
          <button type="button" className="knowledge-primary-button" onClick={handleApply} disabled={applying || applied}>
            {applying ? "Applying..." : applied ? "Applied" : accepted ? "Apply reviewed change" : "Reject proposal"}
          </button>
        </div>
      </footer>
    </div>
  );
}
