"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mountBase, type MountedBase } from "@/components/bases/mount-base";
import { parseBase } from "@/lib/bases";
import { fromVaultRelative, toVaultRelative } from "@/lib/vault-paths";
import { loadLinkIndex } from "@/lib/vault-links";
import "@/styles/bases.css";

interface BaseViewProps {
  filePath: string;
  vaultPath: string;
  /** Opens a file of the vault by its full path. */
  onOpenFile: (path: string) => void;
}

/** A `.base` file in a tab: its views, and its text for changing them. */
export default function BaseView({ filePath, vaultPath, onOpenFile }: BaseViewProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<MountedBase | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [editing, setEditing] = useState(false);
  const [missing, setMissing] = useState(false);
  const openRef = useRef(onOpenFile);
  useEffect(() => {
    openRef.current = onOpenFile;
  }, [onOpenFile]);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.readFile(filePath).then((content) => {
      if (cancelled) return;
      if (content === null) {
        setMissing(true);
        return;
      }
      setMissing(false);
      setText(content);
      setSaved(content);
    });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // The views are drawn once the file is read, and again from each change to its text.
  const ready = text !== null;
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || !ready) return;
    const self = toVaultRelative(filePath, vaultPath);
    const mounted = mountBase(holder, "", {
      vaultPath,
      thisFile: self ?? undefined,
      onOpen: (relative) => {
        // A link may name a heading too; the file is what opens. A link in a
        // property is often just a note's name, so it is looked up the way
        // a link in a note is before it is taken for a path.
        const target = relative.split("#")[0];
        void loadLinkIndex(vaultPath)
          .then((files) => files.wiki(self ?? "", target) ?? files.note(target))
          .catch(() => null)
          .then((found) => {
            const full = fromVaultRelative(found ?? target, vaultPath);
            if (full) openRef.current(/\.[^./\\]+$/.test(full) ? full : `${full}.md`);
          });
      },
    });
    mountedRef.current = mounted;
    return () => {
      mounted.destroy();
      mountedRef.current = null;
    };
  }, [filePath, vaultPath, ready]);
  useEffect(() => {
    if (text !== null) mountedRef.current?.update(text);
  }, [text, ready]);

  const save = useCallback(async () => {
    if (text === null || text === saved) return;
    if (await window.electronAPI?.writeFile(filePath, text)) setSaved(text);
  }, [filePath, text, saved]);

  // A base that reads correctly is saved a moment after typing stops. One
  // that does not is left until it does, or until the tab is left: then
  // it is written as it is, so that changing tabs never loses what was typed.
  const latest = useRef({ filePath, text, saved });
  useEffect(() => {
    latest.current = { filePath, text, saved };
  });
  useEffect(() => {
    if (text === null || text === saved || !parseBase(text).ok) return;
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [text, saved, save]);
  useEffect(
    () => () => {
      const last = latest.current;
      if (last.text !== null && last.text !== last.saved) void window.electronAPI?.writeFile(last.filePath, last.text);
    },
    [filePath]
  );

  if (missing) return <div className="base-page base-page-empty">This base is no longer there.</div>;

  const dirty = text !== null && text !== saved;
  const parsed = text !== null ? parseBase(text) : null;

  return (
    <div className="base-page">
      <div className="base-page-bar">
        <span className="base-page-name">{filePath.split(/[\\/]/).pop()?.replace(/\.base$/i, "")}</span>
        <span className="base-page-spacer" />
        {dirty && <span className="base-page-dirty">Not saved</span>}
        {editing && (
          <button className="base-btn" disabled={!dirty} onClick={() => void save()} title="Save the base (Ctrl+S)">
            Save
          </button>
        )}
        <button
          className={`base-btn${editing ? " base-btn-on" : ""}`}
          onClick={() => setEditing((e) => !e)}
          title="Views, filters and formulas are written as text"
        >
          {editing ? "Hide the text" : "Edit as text"}
        </button>
      </div>
      <div className={`base-page-main${editing ? " base-page-split" : ""}`}>
        {editing && (
          <div className="base-source">
            <textarea
              className="base-source-text"
              value={text ?? ""}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                  e.preventDefault();
                  e.stopPropagation();
                  void save();
                }
                // Two spaces, as YAML wants, rather than leaving the box.
                if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault();
                  const area = e.currentTarget;
                  const { selectionStart, selectionEnd, value } = area;
                  const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
                  setText(next);
                  requestAnimationFrame(() => area.setSelectionRange(selectionStart + 2, selectionStart + 2));
                }
              }}
            />
            {parsed && !parsed.ok && <div className="base-source-error">{parsed.error}</div>}
          </div>
        )}
        <div className="base-page-view" ref={holderRef} />
      </div>
    </div>
  );
}
