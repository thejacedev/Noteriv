"use client";

import { conflictHeadline, noteLabel, type SyncConflict } from "@/lib/sync-conflicts";
import "@/styles/sync-conflicts.css";

interface SyncConflictNoticeProps {
  /** The open vault's conflicts that have not been dismissed. */
  conflicts: SyncConflict[];
  onOpen: (filePath: string) => void;
  onDismiss: () => void;
}

/**
 * Tells the user that sync kept two versions of a note. Sync often runs on a
 * timer with nobody watching, so the notice stays until it is dismissed, and
 * a later sync with nothing to report leaves it alone.
 */
export default function SyncConflictNotice({ conflicts, onOpen, onDismiss }: SyncConflictNoticeProps) {
  if (conflicts.length === 0) return null;
  const one = conflicts.length === 1;

  return (
    <section className="scn-card" role="status" aria-live="polite" aria-label="Sync conflicts">
      <div className="scn-head">
        <svg className="scn-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1.75l6.5 11.5h-13L8 1.75z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M8 6.5v3.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="11.6" r="0.8" fill="currentColor" />
        </svg>
        <h2 className="scn-title">{conflictHeadline(conflicts)}</h2>
      </div>
      <p className="scn-text">
        {one ? "It was" : "Each was"} different on the two sides and could not be combined. The
        other version is saved as a conflict copy, so nothing is lost.
      </p>
      <ul className="scn-list">
        {conflicts.map((c) => {
          const { name, folder } = noteLabel(c.note);
          return (
            <li key={c.copy} className="scn-row">
              <span className="scn-note" title={c.note}>
                <span className="scn-name">{name}</span>
                {folder && <span className="scn-folder">{folder}</span>}
              </span>
              {c.copyPath ? (
                <button
                  type="button"
                  className="scn-btn"
                  title={c.copy}
                  onClick={() => onOpen(c.copyPath as string)}
                >
                  Open copy
                </button>
              ) : (
                <span className="scn-where" title={c.copy}>Copy is in the target folder</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="scn-foot">
        <span className="scn-hint">Merge by hand, then delete the copy you do not need.</span>
        <button type="button" className="scn-btn scn-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
