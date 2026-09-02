import {
  knowledgeAnalysisSchema,
  type KnowledgeAnalysis,
  type KnowledgeIngestionRequest,
} from "./schemas";
import type { VaultKnowledgeNote } from "./related-notes";

export interface KnowledgeProviderContext {
  relatedNotes: VaultKnowledgeNote[];
  signal?: AbortSignal;
}

export interface KnowledgeProvider {
  id: string;
  kind: "local" | "ai";
  model?: string;
  analyze(
    request: KnowledgeIngestionRequest,
    context: KnowledgeProviderContext,
  ): Promise<unknown>;
}

export class KnowledgeProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "KnowledgeProviderError";
  }
}

export async function runKnowledgeProvider(
  provider: KnowledgeProvider,
  request: KnowledgeIngestionRequest,
  context: KnowledgeProviderContext,
): Promise<KnowledgeAnalysis> {
  try {
    const result = await provider.analyze(request, context);
    return knowledgeAnalysisSchema.parse(result);
  } catch (error) {
    if (error instanceof KnowledgeProviderError) throw error;
    throw new KnowledgeProviderError(
      error instanceof Error ? error.message : "Knowledge analysis failed",
      error,
    );
  }
}
