/**
 * Spaced Repetition / Flashcard system.
 *
 * Extracts flashcards from markdown notes using:
 *   Q: question text
 *   A: answer text
 *
 *   or cloze deletions: {{cloze text}}
 *
 * Uses SM-2 algorithm for scheduling reviews.
 */

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  source: string; // file path
  type: "qa" | "cloze";
}

export interface CardReview {
  cardId: string;
  ease: number;       // easiness factor (starts at 2.5)
  interval: number;   // days until next review
  repetitions: number;
  nextReview: string;  // ISO date string
  lastReview: string;
}

export interface FlashcardDeck {
  cards: Flashcard[];
  reviews: Record<string, CardReview>;
}

const REVIEW_DIR = ".noteriv";
const REVIEW_FILE = "flashcard-reviews.json";

/** Extract flashcards from markdown content */
export function extractCards(content: string, filePath: string): Flashcard[] {
  const cards: Flashcard[] = [];
  const lines = content.split("\n");

  // Q: / A: pairs
  for (let i = 0; i < lines.length; i++) {
    const qMatch = lines[i].match(/^Q:\s*(.+)/i);
    if (qMatch && i + 1 < lines.length) {
      const aMatch = lines[i + 1].match(/^A:\s*(.+)/i);
      if (aMatch) {
        cards.push({
          id: hashCard(qMatch[1], filePath),
          question: qMatch[1].trim(),
          answer: aMatch[1].trim(),
          source: filePath,
          type: "qa",
        });
        i++; // skip the answer line
      }
    }
  }

  // Cloze deletions: {{text}}
  const clozeRegex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = clozeRegex.exec(content)) !== null) {
    const line = content.substring(0, match.index).split("\n").pop() || "";
    const fullLine = line + match[0] + (content.substring(match.index + match[0].length).split("\n")[0] || "");
    const question = fullLine.replace(/\{\{([^}]+)\}\}/g, "[...]");
    const answer = match[1];
    cards.push({
      id: hashCard(question, filePath),
      question,
      answer,
      source: filePath,
      type: "cloze",
    });
  }

  return cards;
}

/** Extract all flashcards from the entire vault */
export async function extractAllCards(vaultPath: string): Promise<Flashcard[]> {
  if (!window.electronAPI) return [];
  const files = await window.electronAPI.listAllFiles(vaultPath);
  const allCards: Flashcard[] = [];

  for (const file of files) {
    if (!file.filePath.match(/\.(md|markdown)$/i)) continue;
    const content = await window.electronAPI.readFile(file.filePath);
    if (!content) continue;
    allCards.push(...extractCards(content, file.filePath));
  }

  return allCards;
}

/** Load review data from vault */
export async function loadReviews(vaultPath: string): Promise<Record<string, CardReview>> {
  if (!window.electronAPI) return {};
  const path = `${vaultPath}/${REVIEW_DIR}/${REVIEW_FILE}`;
  try {
    const content = await window.electronAPI.readFile(path);
    if (!content) return {};
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/** Save review data to vault */
export async function saveReviews(vaultPath: string, reviews: Record<string, CardReview>): Promise<void> {
  if (!window.electronAPI) return;
  await window.electronAPI.createDir(`${vaultPath}/${REVIEW_DIR}`);
  await window.electronAPI.writeFile(
    `${vaultPath}/${REVIEW_DIR}/${REVIEW_FILE}`,
    JSON.stringify(reviews, null, 2)
  );
}

/** Get cards due for review today */
export function getDueCards(cards: Flashcard[], reviews: Record<string, CardReview>): Flashcard[] {
  const today = new Date().toISOString().split("T")[0];
  return cards.filter((card) => {
    const review = reviews[card.id];
    if (!review) return true; // never reviewed
    return review.nextReview <= today;
  });
}

/** SM-2 algorithm: grade a card (0-5) and return updated review */
export function gradeCard(cardId: string, grade: number, reviews: Record<string, CardReview>): CardReview {
  const existing = reviews[cardId];
  const today = new Date().toISOString().split("T")[0];

  let ease = existing?.ease ?? 2.5;
  let interval = existing?.interval ?? 0;
  let reps = existing?.repetitions ?? 0;

  if (grade >= 3) {
    // Correct response
    if (reps === 0) {
      interval = 1;
    } else if (reps === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
    reps++;
    ease = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  } else {
    // Incorrect — reset
    reps = 0;
    interval = 1;
  }

  if (ease < 1.3) ease = 1.3;

  const next = new Date();
  next.setDate(next.getDate() + interval);

  return {
    cardId,
    ease,
    interval,
    repetitions: reps,
    nextReview: next.toISOString().split("T")[0],
    lastReview: today,
  };
}

function hashCard(text: string, source: string): string {
  let hash = 0;
  const str = `${source}:${text}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `fc-${Math.abs(hash).toString(36)}`;
}
