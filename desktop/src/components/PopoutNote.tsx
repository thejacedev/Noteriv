"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@/components/Editor";
import { applySettings, mergeSettings } from "@/lib/settings";
import { BUILT_IN_THEMES, applyTheme, loadCustomThemes } from "@/lib/theme-utils";
import { setVaultPrefs } from "@/lib/vault-prefs";
import { hashContent } from "@/lib/knowledge/knowledge-service";
import "@/styles/popout.css";

const NOTE = /\.(md|markdown)$/i;

/**
 * One note in a window of its own. It is a small editor rather than the
 * whole app: it loads the note, saves what is typed a moment after typing
 * stops, and takes up changes made to the file elsewhere (in the main
 * window, by sync) as long as nothing here is waiting to be saved.
 */
export default function PopoutNote({ initialPath }: { initialPath: string }) {
  const [path, setPath] = useState(initialPath);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  // The note as read and as typed, with the path it belongs to: text read
  // for one note is never shown, or saved, as another's.
  const [doc, setDoc] = useState<{ path: string; content: string; saved: string } | null>(null);
  const [problem, setProblem] = useState<{ path: string; text: string } | null>(null);
  // A save that was refused, until the user says which version to keep.
  const [stuck, setStuck] = useState<{ path: string; text: string } | null>(null);
  const content = doc?.path === path ? doc.content : null;
  const saved = doc?.path === path ? doc.saved : "";
  const contentRef = useRef<string | null>(null);
  const savedRef = useRef("");
  const stuckRef = useRef(false);
  useEffect(() => {
    contentRef.current = content;
    savedRef.current = saved;
    stuckRef.current = stuck?.path === path;
  });
  const setContent = useCallback(
    (text: string) => setDoc((d) => (d && d.path === path ? { ...d, content: text } : d)),
    [path]
  );

  // The look of the main window: its settings and theme.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const api = window.electronAPI;
      if (!api) return;
      const settings = mergeSettings(await api.loadSettings());
      const vault = await api.getActiveVault();
      if (cancelled) return;
      applySettings(settings);
      setVaultPrefs({ excludedFiles: settings.excludedFiles, attachmentFolder: settings.attachmentFolder });
      setVaultPath(vault?.path ?? null);
      const builtIn = BUILT_IN_THEMES.find((t) => t.id === settings.theme);
      if (builtIn) applyTheme(builtIn);
      else if (vault && settings.theme) {
        const custom = (await loadCustomThemes(vault.path)).find((t) => t.id === settings.theme);
        if (custom && !cancelled) applyTheme(custom);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Read the note, and again whenever the window moves to another one.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.readFile(path).then((text) => {
      if (cancelled) return;
      if (text === null) setProblem({ path, text: "This note is no longer there." });
      else setDoc({ path, content: text, saved: text });
    });
    const name = path.split(/[\\/]/).pop()?.replace(NOTE, "") || "Note";
    document.title = `${name} - Noteriv`;
    return () => {
      cancelled = true;
    };
  }, [path]);

  // Save a moment after typing stops. The save is refused when the file is
  // no longer what this window read: another window, or a sync, wrote it in
  // the meantime, or it was moved or deleted. Saving then would overwrite
  // the other change, or bring a deleted note back, so it stops and asks.
  useEffect(() => {
    if (content === null || content === saved || stuck?.path === path) return;
    const timer = setTimeout(async () => {
      const text = content;
      const api = window.electronAPI;
      if (!api) return;
      const result = await api.writeFileGuarded(path, text, await hashContent(saved));
      if (result.status === "written") {
        setDoc((d) => (d && d.path === path ? { ...d, saved: text } : d));
      } else {
        setStuck({
          path,
          text:
            result.status === "conflict"
              ? "This note was changed somewhere else. What you typed here is not saved."
              : "This note could not be saved. It may have been moved or deleted.",
        });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [content, saved, path, stuck]);

  // Take up a change made to the file elsewhere, unless something here is unsaved.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden || contentRef.current === null || contentRef.current !== savedRef.current) return;
      const text = await window.electronAPI?.readFile(path);
      if (text === undefined) return;
      if (text === null) {
        setProblem({ path, text: "This note is no longer there." });
        return;
      }
      if (contentRef.current === savedRef.current && text !== savedRef.current) {
        setDoc((d) => (d && d.path === path && d.content === d.saved ? { path, content: text, saved: text } : d));
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [path]);

  // The save waits a moment after typing stops. When the window loses the
  // user (they switch away, or close it) there may be no later moment, so
  // what is pending is saved at once, with the same check as any other save.
  useEffect(() => {
    const flush = () => {
      const text = contentRef.current;
      const before = savedRef.current;
      if (text === null || text === before || stuckRef.current) return;
      void (async () => {
        const result = await window.electronAPI?.writeFileGuarded(path, text, await hashContent(before));
        if (result?.status === "written") setDoc((d) => (d && d.path === path ? { ...d, saved: text } : d));
      })();
    };
    window.addEventListener("blur", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("blur", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [path]);

  /** After a refused save: take the file as it is now, giving up what was typed here. */
  const loadAgain = useCallback(async () => {
    const text = await window.electronAPI?.readFile(path);
    if (text === null || text === undefined) {
      setProblem({ path, text: "This note is no longer there." });
    } else {
      setDoc({ path, content: text, saved: text });
      setProblem(null);
    }
    setStuck(null);
  }, [path]);

  /** After a refused save: write what is here over whatever is on disk. */
  const saveAnyway = useCallback(async () => {
    const text = contentRef.current;
    if (text === null) return;
    if (await window.electronAPI?.writeFile(path, text)) {
      setDoc((d) => (d && d.path === path ? { ...d, saved: text } : d));
      setProblem(null);
      setStuck(null);
    }
  }, [path]);

  // A click on a link to another note shows that note here.
  const followLink = useCallback(
    async (event: React.MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLElement>(".md-wikilink[data-target]");
      const target = link?.getAttribute("data-target");
      if (!target || !vaultPath || !window.electronAPI) return;
      const wanted = target.split("#")[0].replace(NOTE, "").replace(/\\/g, "/").toLowerCase();
      if (!wanted) return;
      // On the press, and kept from the editor: it would move the cursor
      // onto the link's line, which shows the line as written and takes the
      // link away before a click could reach it.
      event.preventDefault();
      event.stopPropagation();
      const files = await window.electronAPI.listAllFiles(vaultPath);
      const strip = (text: string) => text.replace(NOTE, "").replace(/\\/g, "/").toLowerCase();
      const found = files.find((f) => strip(f.fileName) === wanted || strip(f.relativePath) === wanted);
      if (found && found.filePath !== path) {
        // What is typed here is saved before the window moves on.
        if (contentRef.current !== null && contentRef.current !== savedRef.current) {
          const result = await window.electronAPI.writeFileGuarded(
            path,
            contentRef.current,
            await hashContent(savedRef.current)
          );
          // Stay on this note when it could not be saved: leaving would lose the text.
          if (result.status !== "written") return;
        }
        setPath(found.filePath);
      }
    },
    [vaultPath, path]
  );

  const name = path.split(/[\\/]/).pop()?.replace(NOTE, "") || "Note";
  return (
    <div className="popout" data-vault-path={vaultPath ?? ""} data-open-file={path} onMouseDownCapture={followLink}>
      <div className="popout-bar">
        <span className="popout-name" title={path}>
          {name}
        </span>
        {stuck?.path === path ? (
          <span className="popout-stuck">
            <span className="popout-state popout-warning">{stuck.text}</span>
            <button className="popout-btn" onClick={() => void loadAgain()} title="Show the note as it is on disk now">
              Load the other version
            </button>
            <button className="popout-btn" onClick={() => void saveAnyway()} title="Write what is in this window over it">
              Save mine anyway
            </button>
          </span>
        ) : (
          <span className="popout-state">
            {problem?.path === path ? problem.text : content === null ? "" : content === saved ? "Saved" : "Saving…"}
          </span>
        )}
      </div>
      <div className="popout-editor">
        {content !== null && (
          <Editor key={path} content={content} onChange={setContent} vaultPath={vaultPath ?? undefined} />
        )}
      </div>
    </div>
  );
}
