"use client";

import { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import {
  liveMarkdownPlugin,
  markdownRenderTheme,
  mdHighlightStyle,
  editorTheme,
} from "./markdown";

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onViewReady?: (view: EditorView) => void;
  className?: string;
}

export default function Editor({ content, onChange, onViewReady, className = "" }: EditorProps) {
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
        drawSelection(),
        closeBrackets(),
        history(),
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

  return (
    <div ref={editorRef} className={`h-full overflow-hidden ${className}`} />
  );
}
