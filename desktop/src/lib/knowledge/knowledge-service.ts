import { analyzeLocally } from "./local-analysis";
import {
  buildRelativeNotePath,
  joinVaultPath,
  normalizeRelativePath,
  sanitizeNoteTitle,
  validateRelativeFolder,
  validateRelativeNotePath,
} from "./path-safety";
import { findRelatedNotes, type VaultKnowledgeNote } from "./related-notes";
import {
  knowledgeIngestionRequestSchema,
  knowledgeProposalSchema,
  type KnowledgeIngestionRequest,
  type KnowledgeProposal,
  type NoteChange,
  type SuggestedFlashcard,
  type SuggestedWikiLink,
} from "./schemas";

export interface KnowledgeVaultFile {
  absolutePath: string;
  relativePath: string;
  fileName: string;
}

export interface KnowledgeVaultAdapter {
  listFiles(vaultPath: string): Promise<KnowledgeVaultFile[]>;
  readFile(absolutePath: string): Promise<string>;
  applyChange(change: KnowledgeAdapterChange): Promise<KnowledgeAdapterApplyResult>;
}

export interface KnowledgeDestination {
  id: string;
  path: string;
}

export interface KnowledgeAdapterChange {
  vaultId: string;
  vaultPath: string;
  targetPath: string;
  kind: "create" | "update";
  baseHash: string | null;
  content: string;
}

export interface KnowledgeAdapterApplyResult {
  status: "written" | "conflict" | "error";
  absolutePath: string;
  message?: string;
}

export interface KnowledgeApplyResult {
  changedFiles: string[];
  rejectedChangeIds: string[];
  conflicts: Array<{ changeId: string; targetPath: string; reason: string }>;
  errors: Array<{ changeId: string; targetPath: string; message: string }>;
}

export interface SafeApprovalState {
  changeIds: string[];
  linkIds: string[];
  flashcardIds: string[];
  contradictionIds: string[];
}

const MAX_ANALYSIS_FILES = 5_000;
const MAX_ANALYSIS_NOTE_BYTES = 1_000_000;
const MAX_ANALYSIS_TOTAL_BYTES = 32_000_000;

function createId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now().toString(36)}-${randomId}`;
}

export async function hashContent(content: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure content hashing is unavailable in this environment");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  return `sha256-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function yamlString(value: string): string {
  return JSON.stringify(value.replace(/\r?\n/g, " "));
}

function provenanceFrontmatter(request: KnowledgeIngestionRequest): string {
  const fields = [
    `noteriv-source-title: ${yamlString(request.source.title)}`,
    `noteriv-source-type: ${request.source.type}`,
    `noteriv-ingested-at: ${request.source.capturedAt}`,
    `noteriv-processing-mode: ${request.processingMode}`,
  ];
  if (request.source.sourcePath) {
    fields.push(`noteriv-source-path: ${yamlString(request.source.sourcePath)}`);
  }
  if (request.source.sourceVaultId) {
    fields.push(`noteriv-source-vault-id: ${yamlString(request.source.sourceVaultId)}`);
  }
  if (request.source.sourceUrl) {
    fields.push(`noteriv-source-url: ${yamlString(request.source.sourceUrl)}`);
  }
  return `---\n${fields.join("\n")}\n---`;
}

function provenanceComment(request: KnowledgeIngestionRequest, proposalId: string): string {
  const data = JSON.stringify({
    proposalId,
    sourceTitle: request.source.title,
    sourceType: request.source.type,
    sourceVaultId: request.source.sourceVaultId,
    sourcePath: request.source.sourcePath,
    ingestedAt: request.source.capturedAt,
  }).replace(/-->/g, "--\\u003e");
  return `<!-- noteriv-provenance: ${data} -->`;
}

function createBaseNoteContent(
  request: KnowledgeIngestionRequest,
  analysisSummary: string,
  title: string,
): string {
  const focus = request.instruction
    ? `\n> [!info] Processing focus\n> ${request.instruction.replace(/\r?\n/g, "\n> ")}\n`
    : "";

  if (request.processingMode === "research") {
    return ensureFinalNewline(`${provenanceFrontmatter(request)}\n# ${title}\n${focus}\n## Source summary\n\n${analysisSummary}\n\n## Source material\n\n${request.source.content}`);
  }
  if (request.processingMode === "study-only") {
    return `${provenanceFrontmatter(request)}\n# ${title}\n${focus}\n## Source summary\n\n${analysisSummary}\n`;
  }
  return ensureFinalNewline(`${provenanceFrontmatter(request)}\n# ${title}\n${focus}\n${request.source.content}`);
}

function ensureFinalNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function appendMarkdownSection(content: string, section: string): string {
  const separator = content.endsWith("\n\n") ? "" : content.endsWith("\n") ? "\n" : "\n\n";
  return `${content}${separator}${section}`;
}

function appendMergeSection(
  baseContent: string,
  request: KnowledgeIngestionRequest,
  proposalId: string,
): string {
  const heading = sanitizeNoteTitle(request.source.title);
  const instruction = request.instruction
    ? `\n> Focus: ${request.instruction.replace(/\r?\n/g, " ")}\n`
    : "";
  return ensureFinalNewline(appendMarkdownSection(
    baseContent,
    `## ${heading}\n\n${provenanceComment(request, proposalId)}${instruction}\n${request.source.content}`,
  ));
}

function titleForMode(request: KnowledgeIngestionRequest): string {
  const base = sanitizeNoteTitle(request.source.title);
  if (request.processingMode === "research") return `${base} Research`;
  if (request.processingMode === "study-only") return `${base} Study`;
  return base;
}

function uniqueCreatePath(candidate: string, files: KnowledgeVaultFile[]): string {
  const existing = new Set(files.map((file) => normalizeRelativePath(file.relativePath).toLocaleLowerCase()));
  if (!existing.has(candidate.toLocaleLowerCase())) return candidate;
  const extension = candidate.match(/\.(md|markdown)$/i)?.[0] || ".md";
  const stem = candidate.slice(0, -extension.length);
  for (let suffix = 2; suffix < 10_000; suffix++) {
    const next = `${stem} ${suffix}${extension}`;
    if (!existing.has(next.toLocaleLowerCase())) return next;
  }
  throw new Error("Could not find an available note name");
}

async function loadVaultNotes(
  vaultPath: string,
  adapter: KnowledgeVaultAdapter,
): Promise<{ files: KnowledgeVaultFile[]; notes: VaultKnowledgeNote[] }> {
  const files = (await adapter.listFiles(vaultPath)).flatMap((file) => {
    try {
      const relativePath = validateRelativeNotePath(file.relativePath);
      return [{
        ...file,
        relativePath,
        absolutePath: joinVaultPath(vaultPath, relativePath),
      }];
    } catch {
      return [];
    }
  }).sort((left, right) => left.relativePath.localeCompare(right.relativePath)).slice(0, MAX_ANALYSIS_FILES);
  const notes: VaultKnowledgeNote[] = [];
  let totalBytes = 0;

  for (let i = 0; i < files.length && totalBytes < MAX_ANALYSIS_TOTAL_BYTES; i += 10) {
    const batch = files.slice(i, i + 10);
    const contents = await Promise.allSettled(batch.map((file) => adapter.readFile(file.absolutePath)));
    batch.forEach((file, index) => {
      const readResult = contents[index];
      if (readResult.status !== "fulfilled") return;
      const contentBytes = new TextEncoder().encode(readResult.value).byteLength;
      if (contentBytes > MAX_ANALYSIS_NOTE_BYTES || totalBytes + contentBytes > MAX_ANALYSIS_TOTAL_BYTES) return;
      totalBytes += contentBytes;
      const fileName = file.relativePath.replace(/\\/g, "/").split("/").pop() || file.fileName;
      notes.push({
        absolutePath: file.absolutePath,
        relativePath: normalizeRelativePath(file.relativePath),
        title: fileName.replace(/\.(md|markdown)$/i, ""),
        content: readResult.value,
      });
    });
  }
  return { files, notes };
}

export async function createLocalKnowledgeProposal(
  input: KnowledgeIngestionRequest,
  destination: KnowledgeDestination,
  adapter: KnowledgeVaultAdapter,
): Promise<KnowledgeProposal> {
  const request = knowledgeIngestionRequestSchema.parse({
    ...input,
    destinationVaultPath: destination.path,
    destinationFolder: validateRelativeFolder(input.destinationFolder),
  });
  if (request.destinationVaultId !== destination.id) {
    throw new Error("The ingestion request belongs to a different destination vault");
  }
  if (!destination.path.trim()) {
    throw new Error("The destination vault is no longer available");
  }
  const proposalId = createId("knowledge-proposal");
  const { files, notes } = await loadVaultNotes(destination.path, adapter);
  const excludedSource = request.source.sourceVaultId === request.destinationVaultId
    ? request.source.sourcePath
    : undefined;
  const initialTarget = buildRelativeNotePath(request.destinationFolder, titleForMode(request));
  const matches = findRelatedNotes(
    request.source.title,
    request.source.content,
    notes,
    request.relatedNoteLimit,
    excludedSource,
  );

  let kind: NoteChange["kind"] = "create";
  let targetPath = uniqueCreatePath(initialTarget, files);
  let baseContent: string | null = null;
  let baseHash: string | null = null;

  if (request.processingMode === "merge-existing" && matches[0]) {
    const matchedNote = notes.find((note) => note.relativePath === matches[0].notePath);
    if (matchedNote) {
      kind = "update";
      targetPath = matchedNote.relativePath;
      baseContent = matchedNote.content;
      baseHash = await hashContent(baseContent);
    }
  }

  const analysis = analyzeLocally(
    request.source.title,
    request.source.content,
    targetPath,
    matches,
    request.source.sourcePath,
  );
  const title = titleForMode(request);
  const proposedContent = kind === "update" && baseContent != null
    ? appendMergeSection(baseContent, request, proposalId)
    : createBaseNoteContent(request, analysis.summary, title);

  return knowledgeProposalSchema.parse({
    schemaVersion: 1,
    id: proposalId,
    createdAt: new Date().toISOString(),
    request,
    analyzer: { kind: "local", id: "noteriv-local-v1" },
    analysis,
    noteChanges: [{
      id: createId("note-change"),
      kind,
      targetPath,
      baseHash,
      baseContent,
      proposedContent,
      rationale: kind === "update"
        ? `Append the reviewed source to the strongest related note, ${matches[0]?.noteTitle}.`
        : "Create a durable Markdown note from the reviewed source.",
      accepted: true,
    }],
  });
}

function normalizedWikiTarget(target: string): string {
  return target
    .split("|")[0]
    .split("#")[0]
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.(md|markdown)$/i, "")
    .toLocaleLowerCase();
}

export function containsWikiLink(content: string, targetPath: string): boolean {
  const normalizedTarget = normalizedWikiTarget(targetPath);
  const targetBase = normalizedTarget.split("/").pop();
  const links = content.matchAll(/!?\[\[([^\]]+)\]\]/g);
  for (const link of links) {
    const normalizedLink = normalizedWikiTarget(link[1]);
    if (normalizedLink === normalizedTarget || normalizedLink === targetBase) return true;
  }
  return false;
}

function wikiLinkForPath(path: string): string {
  const target = path.replace(/\\/g, "/").replace(/\.(md|markdown)$/i, "");
  const display = target.split("/").pop() || target;
  return target === display ? `[[${target}]]` : `[[${target}|${display}]]`;
}

export function materializeApprovedSuggestions(
  content: string,
  links: SuggestedWikiLink[],
  flashcards: SuggestedFlashcard[],
): string {
  let result = content;
  const uniqueLinks = links.filter((link, index, all) =>
    all.findIndex((candidate) => normalizedWikiTarget(candidate.targetNotePath) === normalizedWikiTarget(link.targetNotePath)) === index
    && normalizedWikiTarget(link.sourceNotePath) !== normalizedWikiTarget(link.targetNotePath)
    && !containsWikiLink(result, link.targetNotePath)
  );
  if (uniqueLinks.length > 0) {
    result = appendMarkdownSection(
      result,
      `## Related notes\n\n${uniqueLinks.map((link) => `- ${wikiLinkForPath(link.targetNotePath)}`).join("\n")}`,
    );
  }

  const seenCards = new Set<string>();
  const cardMarkdown = flashcards.flatMap((card) => {
    const markdown = card.type === "qa"
      ? `Q: ${card.question.trim()}\nA: ${card.answer.trim()}`
      : card.text.trim();
    if (seenCards.has(markdown) || result.includes(markdown)) return [];
    seenCards.add(markdown);
    return [markdown];
  });
  if (cardMarkdown.length > 0) {
    result = appendMarkdownSection(result, `## Flashcards\n\n${cardMarkdown.join("\n\n")}`);
  }
  return ensureFinalNewline(result);
}

export function getSafeApprovalState(proposal: KnowledgeProposal): SafeApprovalState {
  const parsed = knowledgeProposalSchema.parse(proposal);
  const isLocal = parsed.analyzer.kind === "local";
  return {
    changeIds: isLocal
      ? parsed.noteChanges.flatMap((change) => {
        try {
          validateRelativeNotePath(change.targetPath);
          return [change.id];
        } catch {
          return [];
        }
      })
      : [],
    linkIds: isLocal
      ? parsed.analysis.suggestedWikiLinks
        .filter((link) => link.confidence >= 0.75)
        .filter((link) => normalizedWikiTarget(link.sourceNotePath) !== normalizedWikiTarget(link.targetNotePath))
        .map((link) => link.id)
      : [],
    flashcardIds: isLocal
      ? parsed.analysis.suggestedFlashcards.filter((card) => card.confidence >= 0.9).map((card) => card.id)
      : [],
    contradictionIds: [],
  };
}

export async function applyKnowledgeProposal(
  input: KnowledgeProposal,
  destination: KnowledgeDestination,
  adapter: KnowledgeVaultAdapter,
): Promise<KnowledgeApplyResult> {
  const proposal = knowledgeProposalSchema.parse(input);
  if (proposal.request.destinationVaultId !== destination.id) {
    throw new Error("The reviewed proposal belongs to a different destination vault");
  }
  if (!destination.path.trim()) {
    throw new Error("The destination vault is no longer available");
  }
  const result: KnowledgeApplyResult = {
    changedFiles: [],
    rejectedChangeIds: [],
    conflicts: [],
    errors: [],
  };

  const preparedChanges: Array<{ change: NoteChange; safePath: string }> = [];
  for (const change of proposal.noteChanges) {
    if (!change.accepted) {
      result.rejectedChangeIds.push(change.id);
      continue;
    }

    let safePath: string;
    try {
      safePath = validateRelativeNotePath(change.targetPath);
      joinVaultPath(destination.path, safePath);
      if (change.kind === "update") {
        if (change.baseContent === null || change.baseHash === null) {
          throw new Error("The update proposal is missing its reviewed base");
        }
        const reviewedBaseHash = await hashContent(change.baseContent);
        if (reviewedBaseHash !== change.baseHash) {
          throw new Error("The update proposal base does not match its content");
        }
      }
    } catch (error) {
      result.errors.push({
        changeId: change.id,
        targetPath: change.targetPath,
        message: error instanceof Error ? error.message : "Invalid destination path",
      });
      continue;
    }
    preparedChanges.push({ change, safePath });
  }

  for (const { change, safePath } of preparedChanges) {
    try {
      const applyResult = await adapter.applyChange({
        vaultId: destination.id,
        vaultPath: destination.path,
        targetPath: safePath,
        kind: change.kind,
        baseHash: change.baseHash,
        content: change.proposedContent,
      });
      if (applyResult.status === "written") {
        result.changedFiles.push(applyResult.absolutePath);
      } else if (applyResult.status === "conflict") {
        result.conflicts.push({
          changeId: change.id,
          targetPath: safePath,
          reason: applyResult.message || "The note changed after analysis",
        });
      } else {
        result.errors.push({
          changeId: change.id,
          targetPath: safePath,
          message: applyResult.message || "The note could not be written",
        });
      }
    } catch (error) {
      result.errors.push({
        changeId: change.id,
        targetPath: safePath,
        message: error instanceof Error ? error.message : "The note could not be written",
      });
    }
  }
  return result;
}
