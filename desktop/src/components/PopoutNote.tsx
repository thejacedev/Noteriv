"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@/components/Editor";
import { applySettings, mergeSettings } from "@/lib/settings";
import { BUILT_IN_THEMES, applyTheme, loadCustomThemes } from "@/lib/theme-utils";
import { setVaultPrefs } from "@/lib/vault-prefs";
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
  const content = doc?.path === path ? doc.content : null;
  const saved = doc?.path === path ? doc.saved : "";
  const contentRef = useRef<string | null>(null);
  const savedRef = useRef("");
  useEffect(() => {
    contentRef.current = content;
    savedRef.current = saved;
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

  // Save a moment after typing stops.
  useEffect(() => {
    if (content === null || content === saved) return;
    const timer = setTimeout(async () => {
      const text = content;
      if (await window.electronAPI?.writeFile(path, text)) {
        setDoc((d) => (d && d.path === path ? { ...d, saved: text } : d));
      } else {
        setProblem({ path, text: "The note could not be saved." });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [content, saved, path]);

  // Take up a change made to the file elsewhere, unless something here is unsaved.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden || contentRef.current === null || contentRef.current !== savedRef.current) return;
      const text = await window.electronAPI?.readFile(path);
      if (text === null || text === undefined) return;
      if (contentRef.current === savedRef.current && text !== savedRef.current) {
        setDoc((d) => (d && d.path === path && d.content === d.saved ? { path, content: text, saved: text } : d));
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [path]);

  // A click on a link to another note shows that note here.
  const followLink = useCallback(
    async (event: React.MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLElement>(".md-wikilink[data-target]");
      const target = link?.getAttribute("data-target");
      if (!target || !vaultPath || !window.electronAPI) return;
      const wanted = target.split("#")[0].replace(NOTE, "").replace(/\\/g, "/").toLowerCase();
      if (!wanted) return;
      event.preventDefault();
      const files = await window.electronAPI.listAllFiles(vaultPath);
      const strip = (text: string) => text.replace(NOTE, "").replace(/\\/g, "/").toLowerCase();
      const found = files.find((f) => strip(f.fileName) === wanted || strip(f.relativePath) === wanted);
      if (found && found.filePath !== path) {
        // What is typed here is saved before the window moves on.
        if (contentRef.current !== null && contentRef.current !== savedRef.current) {
          await window.electronAPI.writeFile(path, contentRef.current);
        }
        setPath(found.filePath);
      }
    },
    [vaultPath, path]
  );

  const name = path.split(/[\\/]/).pop()?.replace(NOTE, "") || "Note";
  return (
    <div className="popout" data-vault-path={vaultPath ?? ""} data-open-file={path} onClick={followLink}>
      <div className="popout-bar">
        <span className="popout-name" title={path}>
          {name}
        </span>
        <span className="popout-state">
          {problem?.path === path ? problem.text : content === null ? "" : content === saved ? "Saved" : "Saving…"}
        </span>
      </div>
      <div className="popout-editor">
        {content !== null && (
          <Editor key={path} content={content} onChange={setContent} vaultPath={vaultPath ?? undefined} />
        )}
      </div>
    </div>
  );
}
