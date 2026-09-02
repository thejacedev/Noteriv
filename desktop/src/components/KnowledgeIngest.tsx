"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyKnowledgeProposal,
  createLocalKnowledgeProposal,
  type KnowledgeApplyResult,
  type KnowledgeVaultAdapter,
} from "@/lib/knowledge/knowledge-service";
import {
  knowledgeIngestionRequestSchema,
  type KnowledgeProposal,
  type KnowledgeSource,
} from "@/lib/knowledge/schemas";
import { joinVaultPath } from "@/lib/knowledge/path-safety";
import KnowledgeReview from "./KnowledgeReview";
import "@/styles/knowledge.css";

export interface KnowledgeSourcePreset {
  type: KnowledgeSource["type"];
  title: string;
  content: string;
  sourceVaultId?: string;
  sourcePath?: string;
}

interface KnowledgeIngestProps {
  vaults: Vault[];
  activeVaultId: string;
  initialSource?: KnowledgeSourcePreset | null;
  onClose: () => void;
  onApplied: (changedFiles: string[], destinationVaultId: string) => void | Promise<void>;
  isFileDirty: (absolutePath: string) => boolean;
}

const MODES = [
  { id: "add-new" as const, title: "Add as new knowledge", description: "Create a durable note with source provenance." },
  { id: "merge-existing" as const, title: "Merge with existing knowledge", description: "Propose an addition to the strongest related note." },
  { id: "research" as const, title: "Research mode", description: "Preserve a summary, focus, and source material." },
  { id: "study-only" as const, title: "Generate study material only", description: "Create a source summary and useful review cards." },
];

export default function KnowledgeIngest({
  vaults,
  activeVaultId,
  initialSource,
  onClose,
  onApplied,
  isFileDirty,
}: KnowledgeIngestProps) {
  const activeVault = vaults.find((vault) => vault.id === activeVaultId) || vaults[0];
  const [title, setTitle] = useState(initialSource?.title || "");
  const [sourceType] = useState<KnowledgeSource["type"]>(initialSource?.type || "pasted-text");
  const [sourceContent, setSourceContent] = useState(initialSource?.content || "");
  const [sourceVaultId] = useState(initialSource?.sourceVaultId);
  const [sourcePath] = useState(initialSource?.sourcePath);
  const [destinationVaultId, setDestinationVaultId] = useState(activeVault?.id || "");
  const [destinationFolder, setDestinationFolder] = useState("Knowledge");
  const [processingMode, setProcessingMode] = useState<typeof MODES[number]["id"]>("add-new");
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<KnowledgeProposal | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const destinationVault = useMemo(
    () => vaults.find((vault) => vault.id === destinationVaultId) || activeVault,
    [vaults, destinationVaultId, activeVault],
  );

  const requestClose = useCallback(() => {
    if (!applying) onClose();
  }, [applying, onClose]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [requestClose]);

  const createAdapter = (): KnowledgeVaultAdapter => ({
    listFiles: async (vaultPath) => {
      const files = await window.electronAPI.listKnowledgeFiles(vaultPath);
      return files.map((file) => ({
        absolutePath: file.filePath,
        relativePath: file.relativePath,
        fileName: file.fileName,
      }));
    },
    readFile: (path) => window.electronAPI.readTextFile(path),
    applyChange: (change) => window.electronAPI.applyKnowledgeChange(change),
  });

  const handleAnalyze = async () => {
    if (!destinationVault) {
      setError("Choose a destination vault.");
      return;
    }

    const requestResult = knowledgeIngestionRequestSchema.safeParse({
      schemaVersion: 1,
      source: {
        type: sourceType,
        title,
        content: sourceContent,
        sourceVaultId,
        sourcePath,
        capturedAt: new Date().toISOString(),
      },
      destinationVaultId: destinationVault.id,
      destinationVaultPath: destinationVault.path,
      destinationFolder,
      processingMode,
      instruction,
      relatedNoteLimit: 5,
    });
    if (!requestResult.success) {
      setError(requestResult.error.issues[0]?.message || "Check the source and destination fields.");
      return;
    }

    setAnalyzing(true);
    setError("");
    try {
      setProposal(await createLocalKnowledgeProposal(
        requestResult.data,
        { id: destinationVault.id, path: destinationVault.path },
        createAdapter(),
      ));
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "The source could not be analyzed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = async (reviewedProposal: KnowledgeProposal): Promise<KnowledgeApplyResult> => {
    if (!destinationVault) throw new Error("The destination vault is no longer available");
    const dirtyTarget = reviewedProposal.noteChanges.find((change) => {
      if (!change.accepted) return false;
      try {
        return isFileDirty(joinVaultPath(destinationVault.path, change.targetPath));
      } catch {
        return false;
      }
    });
    if (dirtyTarget) {
      throw new Error(`Save or close the unsaved editor for ${dirtyTarget.targetPath} before applying this change.`);
    }
    return applyKnowledgeProposal(
      reviewedProposal,
      { id: destinationVault.id, path: destinationVault.path },
      createAdapter(),
    );
  };

  return (
    <div className="knowledge-overlay" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <div className={`knowledge-container${proposal ? " review-mode" : ""}`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="knowledge-header">
          <div>
            <span className="knowledge-eyebrow">Capture · Understand · Connect</span>
            <h2>{proposal ? "Knowledge Review" : "Ingest into Knowledge Base"}</h2>
          </div>
          <button type="button" className="knowledge-close" onClick={requestClose} disabled={applying} aria-label="Close knowledge ingestion">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {proposal ? (
          <KnowledgeReview
            proposal={proposal}
            onBack={() => { if (!applying) setProposal(null); }}
            onClose={requestClose}
            onApply={handleApply}
            onApplied={(changedFiles) => onApplied(changedFiles, destinationVault.id)}
            onApplyingChange={setApplying}
            onRejected={onClose}
          />
        ) : (
          <div className="knowledge-ingest-body">
            <section className="knowledge-source-panel">
              <div className="knowledge-panel-title">
                <span>01</span>
                <div><h3>Source</h3><p>Provide the material to preserve and connect.</p></div>
              </div>

              <div className="knowledge-source-origin">
                <span>{sourceType.replace(/-/g, " ")}</span>
                {sourcePath && <code>{sourcePath}</code>}
              </div>

              <label className="knowledge-field">
                <span>Source title</span>
                <input autoFocus={!initialSource} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Distributed systems field notes" disabled={analyzing} />
              </label>
              <label className="knowledge-field grow">
                <span>Source material</span>
                <textarea
                  value={sourceContent}
                  onChange={(event) => setSourceContent(event.target.value)}
                  placeholder="Paste text or Markdown here..."
                  spellCheck
                  disabled={analyzing}
                />
              </label>
            </section>

            <section className="knowledge-options-panel">
              <div className="knowledge-panel-title">
                <span>02</span>
                <div><h3>Processing</h3><p>Choose the intended knowledge outcome.</p></div>
              </div>

              <div className="knowledge-mode-grid">
                {MODES.map((mode) => (
                  <label key={mode.id} className={`knowledge-mode${processingMode === mode.id ? " selected" : ""}`}>
                    <input type="radio" name="knowledge-mode" value={mode.id} checked={processingMode === mode.id} onChange={() => setProcessingMode(mode.id)} disabled={analyzing} />
                    <span><strong>{mode.title}</strong><small>{mode.description}</small></span>
                  </label>
                ))}
              </div>

              <div className="knowledge-destination-grid">
                <label className="knowledge-field">
                  <span>Destination vault</span>
                  <select value={destinationVaultId} onChange={(event) => setDestinationVaultId(event.target.value)} disabled={analyzing}>
                    {vaults.map((vault) => <option key={vault.id} value={vault.id}>{vault.name}</option>)}
                  </select>
                </label>
                <label className="knowledge-field">
                  <span>Destination folder</span>
                  <input value={destinationFolder} onChange={(event) => setDestinationFolder(event.target.value)} placeholder="Knowledge" spellCheck={false} disabled={analyzing} />
                </label>
              </div>

              <label className="knowledge-field">
                <span>Optional instruction</span>
                <textarea
                  className="knowledge-instruction"
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder="Focus on architecture, or treat this as research for Project X..."
                  disabled={analyzing}
                />
              </label>

              <div className="knowledge-privacy-note">
                <strong>Local-first analysis</strong>
                <p>This first pass stays on-device. It finds textual connections and drafts study cards without sending vault content to an external provider.</p>
              </div>
            </section>
          </div>
        )}

        {!proposal && (
          <footer className="knowledge-ingest-footer">
            <div>{error && <span className="knowledge-form-error" role="alert">{error}</span>}</div>
            <div>
              <button type="button" className="knowledge-secondary-button" onClick={requestClose}>Cancel</button>
              <button type="button" className="knowledge-primary-button" onClick={handleAnalyze} disabled={analyzing}>
                {analyzing ? "Analyzing vault..." : "Analyze and review"}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
