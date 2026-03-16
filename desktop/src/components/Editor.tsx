"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap } from "@codemirror/search";
import {
  liveMarkdownPlugin,
  markdownRenderTheme,
  mdHighlightStyle,
  editorTheme,
} from "./markdown";
import { wikilinkAutocompletion } from "@/lib/wikilink-completion";
import { setEditorViewForImages } from "./markdown/renderers/images";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onViewReady?: (view: EditorView) => void;
  vaultPath?: string;
  className?: string;
  focusMode?: boolean;
}

export default function Editor({ content, onChange, onViewReady, vaultPath, className = "", focusMode = false }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const vaultPathRef = useRef(vaultPath);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => { vaultPathRef.current = vaultPath; }, [vaultPath]);

  const createEditor = useCallback(() => {
    if (!editorRef.current) return;
    if (viewRef.current) viewRef.current.destroy();

    const state = EditorState.create({
      doc: content,
      extensions: [
        drawSelection(),
        closeBrackets(),
        history(),
        ...(vaultPath ? [wikilinkAutocompletion(vaultPath)] : []),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(mdHighlightStyle),
        editorTheme,
        markdownRenderTheme,
        liveMarkdownPlugin,
        search({ top: true }),
        keymap.of([
          ...searchKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...closeBracketsKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    viewRef.current = new EditorView({ state, parent: editorRef.current });
    setEditorViewForImages(viewRef.current);
    onViewReady?.(viewRef.current);
  }, []);

  useEffect(() => {
    createEditor();
    return () => { viewRef.current?.destroy(); };
  }, [createEditor]);

  // Sync external content changes
  useEffect(() => {
    if (!viewRef.current) return;
    const current = viewRef.current.state.doc.toString();
    if (current !== content) {
      viewRef.current.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  }, [content]);

  // Toggle focus mode via CSS class on editor container
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.classList.toggle("editor-focus-mode", focusMode);
  }, [focusMode]);

  // Image drag & drop — native DOM on the container div, NOT inside CodeMirror
  // This works because the container div wraps the entire CodeMirror instance
  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;

    let dragCounter = 0;

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      dragCounter++;
      setIsDragOver(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = () => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsDragOver(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      setIsDragOver(false);

      const vp = vaultPathRef.current;
      if (!vp || !window.electronAPI || !viewRef.current || !e.dataTransfer) return;

      const files = Array.from(e.dataTransfer.files);
      const imgs = files.filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() || "";
        return IMAGE_EXTENSIONS.has(ext);
      });
      if (imgs.length === 0) return;

      (async () => {
        const api = window.electronAPI!;
        const attachDir = `${vp}/.imgs`;
        await api.createDir(attachDir);

        let insertText = "";

        for (const file of imgs) {
          const ext = file.name.split(".").pop() || "png";
          const baseName = file.name.replace(/\.[^.]+$/, "");
          let destName = file.name;
          let destPath = `${attachDir}/${destName}`;

          let counter = 1;
          while (true) {
            const existing = await api.readFile(destPath);
            if (existing === null) break;
            destName = `${baseName}-${counter}.${ext}`;
            destPath = `${attachDir}/${destName}`;
            counter++;
          }

          const electronPath = (file as any).path as string | undefined;
          let success = false;

          if (electronPath) {
            success = await api.copyFile(electronPath, destPath);
          }

          if (!success) {
            try {
              const buffer = await file.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = "";
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              const base64 = btoa(binary);
              success = await api.writeBinaryFile?.(destPath, base64) ?? false;
            } catch {}
          }

          if (success) {
            insertText += `![](.imgs/${destName})\n`;
          }
        }

        if (insertText && viewRef.current) {
          const pos = viewRef.current.state.selection.main.head;
          viewRef.current.dispatch({ changes: { from: pos, insert: insertText } });
        }
      })();
    };

    // Use capture phase to get the event before CodeMirror
    container.addEventListener("dragenter", onDragEnter);
    container.addEventListener("dragover", onDragOver);
    container.addEventListener("dragleave", onDragLeave);
    container.addEventListener("drop", onDrop, true);

    return () => {
      container.removeEventListener("dragenter", onDragEnter);
      container.removeEventListener("dragover", onDragOver);
      container.removeEventListener("dragleave", onDragLeave);
      container.removeEventListener("drop", onDrop, true);
    };
  }, []);

  return (
    <div
      ref={editorRef}
      className={`h-full overflow-hidden ${className}${isDragOver ? " editor-drop-active" : ""}`}
    />
  );
}
