"use client";

import { useEffect, useRef, useCallback } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting } from "@codemirror/language";
import {
  liveMarkdownPlugin,
  markdownRenderTheme,
  mdHighlightStyle,
  editorTheme,
  renderAllLines,
} from "./markdown";

interface ReadOnlyViewProps {
  content: string;
  className?: string;
}

export default function ReadOnlyView({ content, className = "" }: ReadOnlyViewProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const createEditor = useCallback(() => {
    if (!editorRef.current) return;
    if (viewRef.current) viewRef.current.destroy();

    const state = EditorState.create({
      doc: content,
      extensions: [
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(mdHighlightStyle),
        editorTheme,
        markdownRenderTheme,
        liveMarkdownPlugin,
        renderAllLines.of(true),
        EditorView.lineWrapping,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.theme({
          ".cm-cursor": { display: "none !important" },
          ".cm-activeLine": { background: "transparent !important" },
          ".cm-content": { cursor: "text" },
        }),
      ],
    });

    viewRef.current = new EditorView({ state, parent: editorRef.current });
  }, []);

  useEffect(() => {
    createEditor();
    return () => { viewRef.current?.destroy(); };
  }, [createEditor]);

  useEffect(() => {
    if (!viewRef.current) return;
    const current = viewRef.current.state.doc.toString();
    if (current !== content) {
      viewRef.current.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  }, [content]);

  return (
    <div ref={editorRef} className={`h-full overflow-hidden ${className}`} />
  );
}
