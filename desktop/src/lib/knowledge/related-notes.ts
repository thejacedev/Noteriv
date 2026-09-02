import type { ExistingNoteMatch } from "./schemas";

export interface VaultKnowledgeNote {
  absolutePath: string;
  relativePath: string;
  title: string;
  content: string;
}

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "been", "before",
  "being", "between", "both", "but", "can", "could", "does", "each", "from", "have",
  "into", "its", "more", "most", "not", "only", "other", "our", "should", "some",
  "such", "than", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "those", "through", "under", "very", "was", "were", "what", "when", "where",
  "which", "while", "will", "with", "would", "you", "your",
]);

export function tokenizeKnowledgeText(text: string): Set<string> {
  const tokens = text
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) ?? [];
  return new Set(tokens.filter((token) => token.length <= 200 && !STOP_WORDS.has(token)));
}

export function findRelatedNotes(
  sourceTitle: string,
  sourceContent: string,
  notes: VaultKnowledgeNote[],
  limit: number,
  excludedRelativePath?: string,
): ExistingNoteMatch[] {
  const sourceTokens = tokenizeKnowledgeText(`${sourceTitle} ${sourceTitle} ${sourceContent}`);
  if (sourceTokens.size === 0) return [];

  const excluded = excludedRelativePath?.replace(/\\/g, "/").toLocaleLowerCase();
  const matches = notes.flatMap((note) => {
    if (note.relativePath.toLocaleLowerCase() === excluded) return [];

    const titleTokens = tokenizeKnowledgeText(note.title);
    const noteTokens = tokenizeKnowledgeText(`${note.title} ${note.title} ${note.content}`);
    const overlap = [...sourceTokens].filter((token) => noteTokens.has(token));
    if (overlap.length === 0) return [];

    const titleOverlap = overlap.filter((token) => titleTokens.has(token)).length;
    const denominator = Math.sqrt(sourceTokens.size * noteTokens.size) || 1;
    const rawScore = Math.min(1, overlap.length / denominator + titleOverlap * 0.08);
    if (rawScore < 0.08) return [];

    const strongestTerms = overlap
      .sort((a, b) => Number(titleTokens.has(b)) - Number(titleTokens.has(a)) || b.length - a.length)
      .slice(0, 5);
    const relevanceScore = Math.round(rawScore * 1000) / 1000;

    return [{
      notePath: note.relativePath,
      noteTitle: note.title.slice(0, 200),
      whyItMatches: `Shared terms: ${strongestTerms.join(", ")}`.slice(0, 1000),
      relevanceScore,
      suggestedAction: relevanceScore >= 0.5 ? "merge-knowledge" as const : "add-link" as const,
    }];
  });

  return matches
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.noteTitle.localeCompare(b.noteTitle))
    .slice(0, Math.max(1, limit));
}
