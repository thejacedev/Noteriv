import type {
  ExistingNoteMatch,
  KnowledgeAnalysis,
  KnowledgeConcept,
  KnowledgeFact,
  SuggestedFlashcard,
} from "./schemas";

interface MarkdownSection {
  title: string;
  body: string;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2 $1")
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSections(content: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;

  for (const line of stripFrontmatter(content).split(/\r?\n/)) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: cleanMarkdown(heading[1]), body: "" };
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) sections.push(current);
  return sections.filter((section) => section.title && cleanMarkdown(section.body));
}

function firstUsefulParagraph(content: string, maxLength = 500): string {
  const paragraph = stripFrontmatter(content)
    .split(/\r?\n\s*\r?\n/)
    .map(cleanMarkdown)
    .find((item) => item.length >= 30);
  return (paragraph || cleanMarkdown(content) || "The source contains structured knowledge for review.")
    .slice(0, maxLength);
}

function stableId(prefix: string, value: string): string {
  let firstHash = 2166136261;
  let secondHash = 2246822519;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    firstHash ^= code;
    firstHash = Math.imul(firstHash, 16777619);
    secondHash ^= code;
    secondHash = Math.imul(secondHash, 3266489917);
  }
  return `${prefix}-${(firstHash >>> 0).toString(36)}${(secondHash >>> 0).toString(36)}`;
}

function extractConcepts(
  content: string,
  matches: ExistingNoteMatch[],
): KnowledgeConcept[] {
  const relatedPaths = matches.slice(0, 5).map((match) => match.notePath);
  return splitSections(content).slice(0, 20).map((section, index) => ({
    name: section.title.slice(0, 200),
    description: firstUsefulParagraph(section.body, 600),
    importance: index < 3 ? "high" as const : "medium" as const,
    suggestedNoteTitle: section.title.slice(0, 200),
    existingRelatedNotes: relatedPaths,
    confidence: 0.65,
  }));
}

function extractFacts(content: string): KnowledgeFact[] {
  const candidates = stripFrontmatter(content)
    .split(/\r?\n/)
    .map((line) => cleanMarkdown(line.replace(/^\s*(?:[-*+] |\d+[.)]\s+)/, "")))
    .filter((line) => line.length >= 35 && line.length <= 600)
    .filter((line) => /\b(is|are|means|requires|uses|prevents|causes|allows|includes|supports)\b/i.test(line));

  return [...new Set(candidates)].slice(0, 20).map((text) => ({
    text,
    sourceExcerpt: text,
    confidence: 0.6,
  }));
}

function extractFlashcards(content: string, sourcePath?: string): SuggestedFlashcard[] {
  const cards: SuggestedFlashcard[] = [];
  const lines = stripFrontmatter(content).split(/\r?\n/);

  for (let i = 0; i < lines.length - 1; i++) {
    const question = lines[i].match(/^Q:\s*(.+)$/i)?.[1]?.trim();
    const answer = lines[i + 1].match(/^A:\s*(.+)$/i)?.[1]?.trim();
    if (!question || !answer) continue;
    if (question.length > 1000 || answer.length > 4000) continue;
    cards.push({
      id: stableId("knowledge-card", `${question}:${answer}`),
      type: "qa",
      question,
      answer,
      sourceNotePath: sourcePath,
      confidence: 0.95,
    });
    i++;
  }

  const clozeRegex = /[^\n]*\{\{([^}]+)\}\}[^\n]*/g;
  let cloze: RegExpExecArray | null;
  while ((cloze = clozeRegex.exec(content)) !== null) {
    const text = cloze[0].trim();
    const answer = cloze[1].trim();
    if (!answer || text.length > 4000 || answer.length > 2000) continue;
    cards.push({
      id: stableId("knowledge-card", text),
      type: "cloze",
      text,
      question: text.replace(/\{\{[^}]+\}\}/g, "[...]"),
      answer,
      sourceNotePath: sourcePath,
      confidence: 0.95,
    });
  }

  for (const section of splitSections(content)) {
    const sectionTitle = section.title.slice(0, 200);
    const answer = firstUsefulParagraph(section.body, 700);
    if (answer.length < 45) continue;
    const question = /[?]$/.test(sectionTitle)
      ? sectionTitle.slice(0, 1000)
      : `How would you explain ${sectionTitle} in this context?`.slice(0, 1000);
    cards.push({
      id: stableId("knowledge-card", `${question}:${answer}`),
      type: "qa",
      question,
      answer,
      sourceConcept: sectionTitle,
      sourceNotePath: sourcePath,
      confidence: 0.62,
    });
  }

  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = card.type === "qa" ? `${card.question}\n${card.answer}` : card.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

export function analyzeLocally(
  title: string,
  content: string,
  targetPath: string,
  matches: ExistingNoteMatch[],
  sourcePath?: string,
): KnowledgeAnalysis {
  const concepts = extractConcepts(content, matches);
  const summaryParagraphs = stripFrontmatter(content)
    .split(/\r?\n\s*\r?\n/)
    .map(cleanMarkdown)
    .filter((paragraph) => paragraph.length >= 30)
    .slice(0, 2);

  return {
    schemaVersion: 1,
    summary: summaryParagraphs.join(" ").slice(0, 1200) || firstUsefulParagraph(content, 1200),
    concepts,
    facts: extractFacts(content),
    relationships: [],
    existingNoteMatches: matches,
    missingKnowledge: [],
    contradictions: [],
    suggestedWikiLinks: matches
      .filter((match) => match.notePath.replace(/\\/g, "/").toLowerCase() !== targetPath.replace(/\\/g, "/").toLowerCase())
      .slice(0, 5)
      .map((match) => ({
      id: stableId("knowledge-link", `${targetPath}:${match.notePath}`),
      sourceNotePath: targetPath,
      targetNotePath: match.notePath,
      reason: match.whyItMatches,
      confidence: match.relevanceScore,
    })),
    suggestedFlashcards: extractFlashcards(content, sourcePath || targetPath),
  };
}
