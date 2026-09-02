import { describe, expect, it } from "vitest";
import { knowledgeSourceSchema, parseKnowledgeAnalysis } from "../schemas";

function validAnalysis() {
  return {
    schemaVersion: 1,
    summary: "A concise source summary.",
    concepts: [],
    facts: [],
    relationships: [],
    existingNoteMatches: [],
    missingKnowledge: [],
    contradictions: [],
    suggestedWikiLinks: [],
    suggestedFlashcards: [],
  };
}

describe("knowledge analysis schema", () => {
  it("accepts a complete structured result", () => {
    expect(parseKnowledgeAnalysis(validAnalysis()).summary).toBe("A concise source summary.");
  });

  it("rejects malformed confidence scores and unknown fields", () => {
    expect(() => parseKnowledgeAnalysis({
      ...validAnalysis(),
      concepts: [{
        name: "Ownership",
        description: "A resource-management model.",
        importance: "high",
        suggestedNoteTitle: "Ownership",
        existingRelatedNotes: [],
        confidence: 1.5,
      }],
    })).toThrow();

    expect(() => parseKnowledgeAnalysis({ ...validAnalysis(), unsafeAction: "write-vault" })).toThrow();
  });

  it("rejects invalid cloze cards", () => {
    expect(() => parseKnowledgeAnalysis({
      ...validAnalysis(),
      suggestedFlashcards: [{
        id: "card-1",
        type: "cloze",
        text: "This card has no deletion.",
        question: "This card has [...].",
        answer: "deletion",
        confidence: 0.8,
      }],
    })).toThrow(/cloze deletion/i);
  });

  it("requires note provenance without trimming source content", () => {
    const source = {
      type: "note" as const,
      title: "Formatting",
      content: "    indented code\n",
      capturedAt: "2026-09-01T12:00:00.000Z",
    };
    expect(() => knowledgeSourceSchema.parse(source)).toThrow(/vault-relative path/i);
    expect(knowledgeSourceSchema.parse({ ...source, sourcePath: "Formatting.md" }).content)
      .toBe("    indented code\n");
  });
});
