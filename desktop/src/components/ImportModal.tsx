"use client";

import { useEffect, useState } from "react";
import {
  IMPORT_FORMATS,
  defaultImportFolder,
  importSummary,
  type ImportFormat,
  type ImportOutcome,
} from "@/lib/importers";
import "@/styles/workspaces.css";
import "@/styles/import.css";

interface ImportModalProps {
  vaultPath: string;
  /** Notes were written: the file list and anything built from the vault should be read again. */
  onImported: (folder: string) => void;
  onClose: () => void;
}

/** Bring notes in from another app: choose where they come from, the export, and where they go. */
export default function ImportModal({ vaultPath, onImported, onClose }: ImportModalProps) {
  const [format, setFormat] = useState<ImportFormat>(IMPORT_FORMATS[0]);
  const [source, setSource] = useState("");
  const [folder, setFolder] = useState(defaultImportFolder(IMPORT_FORMATS[0]));
  const [folderEdited, setFolderEdited] = useState(false);
  const [titleColumn, setTitleColumn] = useState("");
  const [includeTrashed, setIncludeTrashed] = useState(false);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, running]);

  const chooseFormat = (next: ImportFormat) => {
    setFormat(next);
    setSource("");
    setOutcome(null);
    if (!folderEdited) setFolder(defaultImportFolder(next));
  };

  const choose = async (asFolder: boolean) => {
    const picked = await window.electronAPI.showOpenDialog({
      title: asFolder ? `Choose the ${format.name} folder` : `Choose the ${format.name} export`,
      properties: [asFolder ? "openDirectory" : "openFile"],
      filters: asFolder ? undefined : [{ name: format.name, extensions: format.fileTypes }],
    });
    if (!picked.canceled && picked.filePaths[0]) {
      setSource(picked.filePaths[0]);
      setOutcome(null);
    }
  };

  const run = async () => {
    if (!source || running) return;
    setRunning(true);
    setOutcome(null);
    try {
      const result = await window.electronAPI.importNotes({
        kind: format.kind,
        sourcePath: source,
        vaultPath,
        destFolder: folder.trim(),
        options: {
          titleColumn: format.kind === "csv" && titleColumn.trim() ? titleColumn.trim() : undefined,
          includeTrashed: format.trash ? includeTrashed : undefined,
        },
      });
      setOutcome(result);
      if (result.ok) onImported(result.folder);
    } catch {
      setOutcome({ ok: false, error: "The import could not be started.", notes: 0, attachments: 0, skipped: [], folder: "" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="ws-overlay" onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
      <div className="ws-modal im-modal" role="dialog" aria-label="Import notes">
        <div className="ws-title">Import notes</div>
        <div className="ws-hint">
          Notes are copied into a folder of this vault as Markdown. Nothing in the export is changed, and no file
          already in the vault is replaced.
        </div>

        <div className="im-body">
          <div className="im-formats" role="listbox" aria-label="Where the notes come from">
            {IMPORT_FORMATS.map((f) => (
              <button
                key={f.kind}
                role="option"
                aria-selected={f.kind === format.kind}
                className={`im-format${f.kind === format.kind ? " im-format-on" : ""}`}
                disabled={running}
                onClick={() => chooseFormat(f)}
              >
                {f.name}
              </button>
            ))}
          </div>

          <div className="im-form">
            <p className="im-howto">{format.howTo}</p>

            <div className="im-label">Export</div>
            <div className="im-row">
              {format.fileTypes.length > 0 && (
                <button className="ws-btn" disabled={running} onClick={() => void choose(false)}>
                  Choose file
                </button>
              )}
              {format.folder && (
                <button className="ws-btn" disabled={running} onClick={() => void choose(true)}>
                  Choose folder
                </button>
              )}
              <span className={`im-source${source ? "" : " im-source-none"}`} title={source}>
                {source ? source.split(/[\\/]/).slice(-2).join("/") : "Nothing chosen yet"}
              </span>
            </div>

            <div className="im-label">Folder in the vault</div>
            <input
              className="ws-input"
              value={folder}
              disabled={running}
              spellCheck={false}
              placeholder="Leave empty for the top of the vault"
              onChange={(e) => {
                setFolder(e.target.value);
                setFolderEdited(true);
              }}
            />

            {format.kind === "csv" && (
              <>
                <div className="im-label">Column that names each note</div>
                <input
                  className="ws-input"
                  value={titleColumn}
                  disabled={running}
                  spellCheck={false}
                  placeholder="The first column, unless you name another"
                  onChange={(e) => setTitleColumn(e.target.value)}
                />
              </>
            )}
            {format.trash && (
              <label className="im-check">
                <input
                  type="checkbox"
                  checked={includeTrashed}
                  disabled={running}
                  onChange={(e) => setIncludeTrashed(e.target.checked)}
                />
                Import the notes in the trash too
              </label>
            )}

            {outcome && (
              <div className={`im-result${outcome.ok ? "" : " im-result-error"}`}>
                <div>{outcome.ok ? importSummary(outcome) : outcome.error || "Nothing was imported."}</div>
                {outcome.skipped.length > 0 && (
                  <ul className="im-skipped">
                    {outcome.skipped.slice(0, 200).map((item, i) => (
                      <li key={`${item.name}:${i}`}>
                        <span className="im-skipped-name">{item.name}</span> {item.reason}
                      </li>
                    ))}
                    {outcome.skipped.length > 200 && <li>and {outcome.skipped.length - 200} more</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="im-actions">
          <button className="ws-btn" disabled={running} onClick={onClose}>
            {outcome?.ok ? "Done" : "Cancel"}
          </button>
          <button className="ws-btn ws-btn-primary" disabled={!source || running} onClick={() => void run()}>
            {running ? "Importing…" : outcome?.ok ? "Import again" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
