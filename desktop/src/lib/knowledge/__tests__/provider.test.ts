import { describe, expect, it } from "vitest";
import { KnowledgeProviderError, runKnowledgeProvider, type KnowledgeProvider } from "../provider";
import type { KnowledgeIngestionRequest } from "../schemas";

const request: KnowledgeIngestionRequest = {
  schemaVersion: 1,
  source: {
    type: "pasted-text",
    title: "Source",
    content: "Durable source content.",
    capturedAt: "2026-09-01T12:00:00.000Z",
  },
  destinationVaultId: "vault-1",
  destinationVaultPath: "/vault",
  destinationFolder: "Knowledge",
  processingMode: "add-new",
  instruction: "",
  relatedNoteLimit: 5,
};

describe("knowledge provider boundary", () => {
  it("wraps provider failures predictably", async () => {
    const provider: KnowledgeProvider = {
      id: "failing-provider",
      kind: "ai",
      async analyze() {
        throw new Error("Provider unavailable");
      },
    };
    await expect(runKnowledgeProvider(provider, request, { relatedNotes: [] }))
      .rejects.toBeInstanceOf(KnowledgeProviderError);
  });

  it("rejects an invalid structured provider response", async () => {
    const provider: KnowledgeProvider = {
      id: "invalid-provider",
      kind: "ai",
      async analyze() {
        return { summary: "Missing the versioned result fields." };
      },
    };
    await expect(runKnowledgeProvider(provider, request, { relatedNotes: [] }))
      .rejects.toThrow(/schemaVersion|Invalid input/i);
  });
});
