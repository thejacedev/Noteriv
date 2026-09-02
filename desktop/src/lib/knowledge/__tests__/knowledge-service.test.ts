import { describe, expect, it, vi } from "vitest";
import {
  applyKnowledgeProposal,
  containsWikiLink,
  createLocalKnowledgeProposal,
  getSafeApprovalState,
  hashContent,
  materializeApprovedSuggestions,
  type KnowledgeVaultAdapter,
} from "../knowledge-service";
import type { KnowledgeIngestionRequest, KnowledgeProposal } from "../schemas";

function request(overrides: Partial<KnowledgeIngestionRequest> = {}): KnowledgeIngestionRequest {
  return {
    schemaVersion: 1,
    source: {
      type: "pasted-text",
      title: "Rust Ownership",
      content: "# Borrowing\n\nBorrowing controls mutable and immutable references so Rust can prevent data races without a garbage collector.",
      capturedAt: "2026-09-01T12:00:00.000Z",
    },
    destinationVaultId: "vault-1",
    destinationVaultPath: "/vault",
    destinationFolder: "Knowledge",
    processingMode: "add-new",
    instruction: "Focus on architecture",
    relatedNoteLimit: 5,
    ...overrides,
  };
}

function mockAdapter(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const snapshots = vi.fn(async (...args: [string, string]) => { void args; });
  const applyChange = vi.fn(async (change: Parameters<KnowledgeVaultAdapter["applyChange"]>[0]) => {
    const absolutePath = `${change.vaultPath.replace(/\/+$/, "")}/${change.targetPath}`;
    const currentContent = files.get(absolutePath);
    if (change.kind === "create" && currentContent !== undefined) {
      return { status: "conflict" as const, absolutePath, message: "A note now exists at this path" };
    }
    if (change.kind === "update") {
      if (currentContent === undefined) {
        return { status: "conflict" as const, absolutePath, message: "The note no longer exists" };
      }
      if (await hashContent(currentContent) !== change.baseHash) {
        return { status: "conflict" as const, absolutePath, message: "The note changed after analysis" };
      }
      await snapshots(absolutePath, currentContent);
    }
    files.set(absolutePath, change.content);
    return { status: "written" as const, absolutePath };
  });
  const adapter: KnowledgeVaultAdapter = {
    listFiles: async (vaultPath) => [...files.keys()].map((absolutePath) => ({
      absolutePath,
      relativePath: absolutePath.slice(vaultPath.length + 1),
      fileName: absolutePath.split("/").pop()!.replace(/\.(md|markdown)$/i, ""),
    })),
    readFile: async (path) => {
      const content = files.get(path);
      if (content === undefined) throw new Error("File not found");
      return content;
    },
    applyChange,
  };
  return { adapter, files, applyChange, snapshots };
}

const destination = { id: "vault-1", path: "/vault" };

function createProposal(input: KnowledgeIngestionRequest, adapter: KnowledgeVaultAdapter) {
  return createLocalKnowledgeProposal(input, destination, adapter);
}

describe("knowledge proposal lifecycle", () => {
  it("creates a reviewed note with provenance, links, and useful flashcards", async () => {
    const { adapter, applyChange } = mockAdapter({
      "/vault/Rust/Borrowing.md": "# Borrowing\n\nRust ownership uses references to prevent data races and control mutable access.",
    });
    const proposal = await createProposal(request(), adapter);

    expect(proposal.noteChanges[0].kind).toBe("create");
    expect(proposal.noteChanges[0].proposedContent).toContain("noteriv-source-title");
    expect(proposal.analysis.existingNoteMatches[0].notePath).toBe("Rust/Borrowing.md");
    expect(proposal.analysis.suggestedFlashcards[0]).toMatchObject({ type: "qa" });
    expect(applyChange).not.toHaveBeenCalled();

    const materialized = materializeApprovedSuggestions(
      proposal.noteChanges[0].proposedContent,
      proposal.analysis.suggestedWikiLinks,
      proposal.analysis.suggestedFlashcards,
    );
    expect(materialized).toContain("[[Rust/Borrowing|Borrowing]]");
    expect(materialized).toContain("Q: How would you explain Borrowing in this context?");
  });

  it("does not add duplicate wiki links", () => {
    const content = "# Ownership\n\nAlready connected to [[Rust/Borrowing|Borrowing]].\n";
    expect(containsWikiLink(content, "Rust/Borrowing.md")).toBe(true);
    const result = materializeApprovedSuggestions(content, [{
      id: "link-1",
      sourceNotePath: "Ownership.md",
      targetNotePath: "Rust/Borrowing.md",
      reason: "Shared terms: borrowing",
      confidence: 0.8,
    }], []);
    expect(result.match(/\[\[Rust\/Borrowing\|Borrowing\]\]/g)).toHaveLength(1);
  });

  it("applies an accepted create and reports the exact file", async () => {
    const { adapter, files } = mockAdapter();
    const proposal = await createProposal(request(), adapter);
    const result = await applyKnowledgeProposal(proposal, destination, adapter);

    expect(result.changedFiles).toEqual(["/vault/Knowledge/Rust Ownership.md"]);
    expect(files.get(result.changedFiles[0])).toContain("# Rust Ownership");
    expect(result.conflicts).toEqual([]);
  });

  it("does not write rejected changes", async () => {
    const { adapter, applyChange } = mockAdapter();
    const proposal = await createProposal(request(), adapter);
    const rejected: KnowledgeProposal = {
      ...proposal,
      noteChanges: proposal.noteChanges.map((change) => ({ ...change, accepted: false })),
    };
    const result = await applyKnowledgeProposal(rejected, destination, adapter);

    expect(result.rejectedChangeIds).toEqual([proposal.noteChanges[0].id]);
    expect(applyChange).not.toHaveBeenCalled();
  });

  it("detects an existing-note edit made after merge analysis", async () => {
    const original = "# Borrowing\n\nRust borrowing controls mutable references and ownership.";
    const { adapter, files, applyChange, snapshots } = mockAdapter({
      "/vault/Rust/Borrowing.md": original,
    });
    const proposal = await createProposal(request({
      processingMode: "merge-existing",
      destinationFolder: "",
    }), adapter);
    expect(proposal.noteChanges[0].kind).toBe("update");

    files.set("/vault/Rust/Borrowing.md", `${original}\n\nNewer user edit.`);
    const result = await applyKnowledgeProposal(proposal, destination, adapter);

    expect(result.conflicts[0].reason).toMatch(/changed after analysis/i);
    expect(applyChange).toHaveBeenCalledOnce();
    expect(snapshots).not.toHaveBeenCalled();
  });

  it("rejects traversal even if an edited proposal contains it", async () => {
    const { adapter, applyChange } = mockAdapter();
    const proposal = await createProposal(request(), adapter);
    const unsafe = {
      ...proposal,
      noteChanges: proposal.noteChanges.map((change) => ({ ...change, targetPath: "../../outside.md" })),
    };
    const result = await applyKnowledgeProposal(unsafe, destination, adapter);

    expect(result.errors[0].message).toMatch(/parent directory/i);
    expect(applyChange).not.toHaveBeenCalled();
  });

  it("never blanket-approves contradictions", async () => {
    const { adapter } = mockAdapter();
    const proposal = await createProposal(request(), adapter);
    const withContradiction: KnowledgeProposal = {
      ...proposal,
      analysis: {
        ...proposal.analysis,
        contradictions: [{
          id: "contradiction-1",
          existingClaim: "Ownership permits unrestricted aliases.",
          newClaim: "Ownership restricts mutable aliases.",
          existingNotePath: "Rust.md",
          sources: ["Rust Ownership"],
          suggestedResolution: "Review both sources.",
          confidence: 0.8,
        }],
      },
    };

    expect(getSafeApprovalState(withContradiction).contradictionIds).toEqual([]);
  });

  it("uses the trusted destination instead of a proposal-supplied vault path", async () => {
    const { adapter, applyChange } = mockAdapter();
    const proposal = await createProposal(request(), adapter);
    const tampered: KnowledgeProposal = {
      ...proposal,
      request: { ...proposal.request, destinationVaultPath: "/outside" },
    };

    const result = await applyKnowledgeProposal(tampered, destination, adapter);

    expect(result.changedFiles).toEqual(["/vault/Knowledge/Rust Ownership.md"]);
    expect(applyChange).toHaveBeenCalledWith(expect.objectContaining({
      vaultId: "vault-1",
      vaultPath: "/vault",
    }));
  });

  it("rejects a fabricated update base before invoking the filesystem adapter", async () => {
    const { adapter, applyChange } = mockAdapter({
      "/vault/Rust/Borrowing.md": "# Borrowing\n\nRust borrowing controls ownership.",
    });
    const proposal = await createProposal(request({
      processingMode: "merge-existing",
      destinationFolder: "",
    }), adapter);
    const tampered: KnowledgeProposal = {
      ...proposal,
      noteChanges: proposal.noteChanges.map((change) => ({
        ...change,
        baseContent: "# Fabricated review base",
      })),
    };

    const result = await applyKnowledgeProposal(tampered, destination, adapter);

    expect(result.errors[0].message).toMatch(/base does not match/i);
    expect(applyChange).not.toHaveBeenCalled();
  });

  it("does not suggest linking a merge target to itself", async () => {
    const { adapter } = mockAdapter({
      "/vault/Rust/Borrowing.md": "# Borrowing\n\nRust borrowing controls mutable references and ownership.",
    });
    const proposal = await createProposal(request({
      processingMode: "merge-existing",
      destinationFolder: "",
    }), adapter);

    expect(proposal.noteChanges[0].targetPath).toBe("Rust/Borrowing.md");
    expect(proposal.analysis.suggestedWikiLinks).not.toContainEqual(
      expect.objectContaining({ targetNotePath: "Rust/Borrowing.md" }),
    );
  });

  it("only excludes a source note when it belongs to the destination vault", async () => {
    const { adapter } = mockAdapter({
      "/vault/Source.md": "# Source\n\nRust ownership and borrowing prevent mutable data races.",
    });
    const proposal = await createProposal(request({
      source: {
        type: "selection",
        title: "Rust ownership selection",
        content: "Rust ownership and borrowing prevent mutable data races.",
        sourceVaultId: "another-vault",
        sourcePath: "Source.md",
        capturedAt: "2026-09-01T12:00:00.000Z",
      },
      processingMode: "merge-existing",
      destinationFolder: "",
    }), adapter);

    expect(proposal.noteChanges[0]).toMatchObject({
      kind: "update",
      targetPath: "Source.md",
    });
  });

  it("preserves significant source indentation", async () => {
    const { adapter } = mockAdapter();
    const sourceContent = "    indented code\n\nTrailing paragraph.  \n";
    const proposal = await createProposal(request({
      source: {
        type: "pasted-text",
        title: "Formatting",
        content: sourceContent,
        capturedAt: "2026-09-01T12:00:00.000Z",
      },
    }), adapter);

    expect(proposal.noteChanges[0].proposedContent).toContain(sourceContent);
  });

  it("uses trusted destination paths while analyzing vault files", async () => {
    const { adapter } = mockAdapter({
      "/vault/Rust/Borrowing.md": "# Borrowing\n\nRust borrowing controls mutable references and ownership.",
    });
    const listFiles = vi.spyOn(adapter, "listFiles");

    const proposal = await createProposal(request({ destinationVaultPath: "/outside" }), adapter);

    expect(listFiles).toHaveBeenCalledWith("/vault");
    expect(proposal.request.destinationVaultPath).toBe("/vault");
  });

  it("keeps merge provenance valid JSON when source text contains a comment terminator", async () => {
    const { adapter } = mockAdapter({
      "/vault/Existing.md": "# Existing\n\nComment terminator provenance source.",
    });
    const proposal = await createProposal(request({
      source: {
        type: "pasted-text",
        title: "Source --> title",
        content: "Comment terminator provenance source.",
        capturedAt: "2026-09-01T12:00:00.000Z",
      },
      processingMode: "merge-existing",
      destinationFolder: "",
    }), adapter);
    const comment = proposal.noteChanges[0].proposedContent.match(/<!-- noteriv-provenance: (.+) -->/);

    expect(comment).not.toBeNull();
    expect(JSON.parse(comment![1])).toMatchObject({ sourceTitle: "Source --> title" });
  });
});
