"use client";

import { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { wikilinkAutocompletion } from "@/lib/wikilink-completion";

const sourceHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: "var(--accent)", fontWeight: "bold", fontSize: "1.2em" },
  { tag: tags.heading2, color: "#cba6f7", fontWeight: "bold", fontSize: "1.1em" },
  { tag: tags.heading3, color: "#a6e3a1", fontWeight: "bold" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, color: "#cba6f7", fontFamily: "monospace" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--accent)", opacity: "0.7" },
  { tag: tags.quote, color: "#a6adc8" },
  { tag: tags.meta, color: "#6c7086" },
]);

const sourceTheme = EditorView.theme({
  "&": { height: "100%", background: "#1e1e2e", color: "#cdd6f4", fontSize: "14px" },
  ".cm-scroller": {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    lineHeight: "1.7",
    padding: "1rem",
    overflow: "auto",
  },
  ".cm-content": { caretColor: "var(--accent)" },
  ".cm-cursor": { borderLeftColor: "var(--accent) !important", borderLeftWidth: "2px !important" },
  ".cm-activeLine": { background: "rgba(49, 50, 68, 0.3) !important" },
  ".cm-selectionBackground": { background: "color-mix(in srgb, var(--accent) 20%, transparent) !important" },
  "&.cm-focused .cm-selectionBackground": { background: "color-mix(in srgb, var(--accent) 30%, transparent) !important" },
  ".cm-gutters": { background: "transparent !important", border: "none !important", color: "#6c7086" },
  ".cm-activeLineGutter": { background: "transparent !important", color: "#a6adc8" },
});

interface SourceEditorProps {
  content: string;
  onChange: (value: string) => void;
  onViewReady?: (view: EditorView) => void;
  vaultPath?: string;
  className?: string;
}

export default function SourceEditor({ content, onChange, onViewReady, vaultPath, className = "" }: SourceEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const createEditor = useCallback(() => {
    if (!editorRef.current) return;
    if (viewRef.current) viewRef.current.destroy();

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        closeBrackets(),
        history(),
        ...(vaultPath ? [wikilinkAutocompletion(vaultPath)] : []),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(sourceHighlight),
        sourceTheme,
        search({ top: true }),
        keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.lineWrapping,
      ],
    });

    viewRef.current = new EditorView({ state, parent: editorRef.current });
    onViewReady?.(viewRef.current);
  }, []);

  useEffect(() => {
    createEditor();
    return () => { viewRef.current?.destroy(); };
  }, [createEditor]);

  useEffect(() => {
    if (!viewRef.current) return;
    const current = viewRef.current.state.doc.toString();
    if (current !== content) {
      viewRef.current.dispatch({ changes: { from: 0, to: current.length, insert: content } });
    }
  }, [content]);

  return <div ref={editorRef} className={`h-full overflow-hidden ${className}`} />;
}
