import { z } from "zod";

const confidenceSchema = z.number().min(0).max(1);
const nonEmptyString = z.string().trim().min(1);
const nonBlankContent = z.string().refine(
  (value) => value.trim().length > 0,
  "Content cannot be blank",
);
const reviewedNoteContent = z.string().max(4_000_000);

export const knowledgeSourceSchema = z.object({
  type: z.enum(["pasted-text", "markdown", "note", "selection"]),
  title: nonEmptyString.max(200),
  content: nonBlankContent.max(1_000_000),
  sourceVaultId: z.string().trim().min(1).max(200).optional(),
  sourcePath: z.string().trim().max(1024).optional(),
  sourceUrl: z.string().url().max(4096).optional(),
  capturedAt: z.string().datetime(),
}).strict().superRefine((source, context) => {
  if (source.type === "note" && !source.sourcePath) {
    context.addIssue({
      code: "custom",
      path: ["sourcePath"],
      message: "Note sources must include their vault-relative path",
    });
  }
});

export const knowledgeIngestionRequestSchema = z.object({
  schemaVersion: z.literal(1),
  source: knowledgeSourceSchema,
  destinationVaultId: nonEmptyString.max(200),
  destinationVaultPath: nonEmptyString.max(4096),
  destinationFolder: z.string().trim().max(1024).default(""),
  processingMode: z.enum([
    "add-new",
    "merge-existing",
    "research",
    "study-only",
  ]),
  instruction: z.string().trim().max(2000).default(""),
  relatedNoteLimit: z.number().int().min(1).max(20).default(5),
}).strict();

export const conceptSchema = z.object({
  name: nonEmptyString.max(200),
  description: nonEmptyString.max(2000),
  importance: z.enum(["low", "medium", "high"]),
  suggestedNoteTitle: nonEmptyString.max(200),
  existingRelatedNotes: z.array(z.string().trim().min(1).max(1024)).max(20),
  confidence: confidenceSchema,
}).strict();

export const factSchema = z.object({
  text: nonEmptyString.max(2000),
  sourceExcerpt: z.string().trim().max(2000).optional(),
  confidence: confidenceSchema,
}).strict();

export const relationshipSchema = z.object({
  from: nonEmptyString.max(200),
  to: nonEmptyString.max(200),
  type: z.enum([
    "depends-on",
    "contradicts",
    "example-of",
    "related-to",
    "expands",
  ]),
  explanation: nonEmptyString.max(2000),
  confidence: confidenceSchema,
}).strict();

export const existingNoteMatchSchema = z.object({
  notePath: nonEmptyString.max(1024),
  noteTitle: nonEmptyString.max(200),
  whyItMatches: nonEmptyString.max(1000),
  relevanceScore: confidenceSchema,
  suggestedAction: z.enum([
    "leave-unchanged",
    "add-section",
    "update-section",
    "add-link",
    "merge-knowledge",
    "flag-contradiction",
  ]),
}).strict();

export const missingKnowledgeSchema = z.object({
  concept: nonEmptyString.max(200),
  reason: nonEmptyString.max(1000),
  importance: z.enum(["low", "medium", "high"]),
}).strict();

export const contradictionSchema = z.object({
  id: nonEmptyString.max(200),
  existingClaim: nonEmptyString.max(4000),
  newClaim: nonEmptyString.max(4000),
  existingNotePath: nonEmptyString.max(1024),
  sources: z.array(nonEmptyString.max(1024)).min(1).max(20),
  suggestedResolution: nonEmptyString.max(2000),
  confidence: confidenceSchema,
}).strict();

export const suggestedWikiLinkSchema = z.object({
  id: nonEmptyString.max(200),
  sourceNotePath: nonEmptyString.max(1024),
  targetNotePath: nonEmptyString.max(1024),
  reason: nonEmptyString.max(1000),
  confidence: confidenceSchema,
}).strict();

const flashcardBaseSchema = z.object({
  id: nonEmptyString.max(200),
  sourceConcept: z.string().trim().max(200).optional(),
  sourceNotePath: z.string().trim().max(1024).optional(),
  confidence: confidenceSchema,
});

export const suggestedFlashcardSchema = z.discriminatedUnion("type", [
  flashcardBaseSchema.extend({
    type: z.literal("qa"),
    question: nonEmptyString.max(1000),
    answer: nonEmptyString.max(4000),
  }).strict(),
  flashcardBaseSchema.extend({
    type: z.literal("cloze"),
    text: z.string().trim().min(1).max(4000).refine(
      (value) => /\{\{[^}]+\}\}/.test(value),
      "Cloze cards must contain a {{cloze deletion}}",
    ),
    question: nonEmptyString.max(4000),
    answer: nonEmptyString.max(2000),
  }).strict(),
]);

export const knowledgeAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  summary: nonEmptyString.max(4000),
  concepts: z.array(conceptSchema).max(100),
  facts: z.array(factSchema).max(200),
  relationships: z.array(relationshipSchema).max(200),
  existingNoteMatches: z.array(existingNoteMatchSchema).max(100),
  missingKnowledge: z.array(missingKnowledgeSchema).max(100),
  contradictions: z.array(contradictionSchema).max(100),
  suggestedWikiLinks: z.array(suggestedWikiLinkSchema).max(200),
  suggestedFlashcards: z.array(suggestedFlashcardSchema).max(200),
}).strict();

export const noteChangeSchema = z.object({
  id: nonEmptyString.max(200),
  kind: z.enum(["create", "update"]),
  targetPath: nonEmptyString.max(1024),
  baseHash: z.string().trim().min(1).max(200).nullable(),
  baseContent: reviewedNoteContent.nullable(),
  proposedContent: nonBlankContent.max(4_000_000),
  rationale: nonEmptyString.max(2000),
  accepted: z.boolean(),
}).strict().superRefine((change, context) => {
  const hasBase = change.baseHash !== null && change.baseContent !== null;
  if (change.kind === "create" && (change.baseHash !== null || change.baseContent !== null)) {
    context.addIssue({
      code: "custom",
      path: ["baseHash"],
      message: "Create changes cannot include update base data",
    });
  }
  if (change.kind === "update" && !hasBase) {
    context.addIssue({
      code: "custom",
      path: ["baseHash"],
      message: "Update changes require base content and a base hash",
    });
  }
});

function addDuplicateIdIssues(
  values: Array<{ id: string }>,
  path: (string | number)[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.id)) {
      context.addIssue({
        code: "custom",
        path: [...path, index, "id"],
        message: "Proposal item IDs must be unique",
      });
    }
    seen.add(value.id);
  });
}

export const knowledgeProposalSchema = z.object({
  schemaVersion: z.literal(1),
  id: nonEmptyString.max(200),
  createdAt: z.string().datetime(),
  request: knowledgeIngestionRequestSchema,
  analyzer: z.object({
    kind: z.enum(["local", "ai"]),
    id: nonEmptyString.max(200),
    model: z.string().trim().min(1).max(200).optional(),
  }).strict(),
  analysis: knowledgeAnalysisSchema,
  noteChanges: z.array(noteChangeSchema).min(1).max(100),
}).strict().superRefine((proposal, context) => {
  addDuplicateIdIssues(proposal.noteChanges, ["noteChanges"], context);
  addDuplicateIdIssues(proposal.analysis.suggestedWikiLinks, ["analysis", "suggestedWikiLinks"], context);
  addDuplicateIdIssues(proposal.analysis.suggestedFlashcards, ["analysis", "suggestedFlashcards"], context);
  addDuplicateIdIssues(proposal.analysis.contradictions, ["analysis", "contradictions"], context);
});

export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export type KnowledgeIngestionRequest = z.infer<typeof knowledgeIngestionRequestSchema>;
export type KnowledgeConcept = z.infer<typeof conceptSchema>;
export type KnowledgeFact = z.infer<typeof factSchema>;
export type KnowledgeRelationship = z.infer<typeof relationshipSchema>;
export type ExistingNoteMatch = z.infer<typeof existingNoteMatchSchema>;
export type MissingKnowledge = z.infer<typeof missingKnowledgeSchema>;
export type KnowledgeContradiction = z.infer<typeof contradictionSchema>;
export type SuggestedWikiLink = z.infer<typeof suggestedWikiLinkSchema>;
export type SuggestedFlashcard = z.infer<typeof suggestedFlashcardSchema>;
export type KnowledgeAnalysis = z.infer<typeof knowledgeAnalysisSchema>;
export type NoteChange = z.infer<typeof noteChangeSchema>;
export type KnowledgeProposal = z.infer<typeof knowledgeProposalSchema>;

export function parseKnowledgeAnalysis(input: unknown): KnowledgeAnalysis {
  return knowledgeAnalysisSchema.parse(input);
}

export function parseKnowledgeProposal(input: unknown): KnowledgeProposal {
  return knowledgeProposalSchema.parse(input);
}
