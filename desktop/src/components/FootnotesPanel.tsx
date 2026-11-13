"use client";

import { useMemo } from "react";
import { extractFootnotes } from "@/lib/footnotes";

interface FootnotesPanelProps {
  /** The open note's text. */
  content: string;
  /** Scrolls the editor to a line. */
  onLineClick: (line: number) => void;
  onClose: () => void;
}

/** The footnotes of the open note, each a click away from where it is written. */
export default function FootnotesPanel({ content, onLineClick, onClose }: FootnotesPanelProps) {
  const footnotes = useMemo(() => extractFootnotes(content), [content]);

  return (
    <div className="bl-panel">
      <div className="bl-header">
        <span className="bl-title">Footnotes</span>
        <div className="bl-header-right">
          <span className="bl-count">{footnotes.length}</span>
          <button onClick={onClose} className="bl-close" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="bl-list">
        {footnotes.length === 0 ? (
          <div className="bl-empty">
            This note has no footnotes. Write one as [^1] with a line [^1]: text below, or in place as ^[text].
          </div>
        ) : (
          footnotes.map((note, i) => (
            <div key={`${note.id ?? "inline"}:${note.line}:${i}`} className="bl-row">
              <button className="bl-snippet fn-row" onClick={() => onLineClick(note.line)} title={`Line ${note.line}`}>
                <span className="bl-line-num">{note.id ?? "in place"}</span>
                <span className={`bl-snippet-text${note.missing ? " fn-missing" : ""}`}>
                  {note.missing
                    ? "No text: there is no line that defines this footnote."
                    : note.text || "(empty)"}
                </span>
                {note.id !== null && !note.missing && (
                  <span className="bl-line-num">{note.references === 0 ? "unused" : `×${note.references}`}</span>
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
