"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap } from "@codemirror/search";
import { isAppHotkey } from "@/lib/hotkeys";
import { replaceDocument } from "@/lib/replace-document";
import {
  liveMarkdownPlugin,
  markdownRenderTheme,
  mdHighlightStyle,
  editorTheme,
  mathExtension,
} from "./markdown";
import { wikilinkAutocompletion } from "@/lib/wikilink-completion";
import { notePathSetting } from "@/lib/note-path";
import { setEditorViewForImages } from "./markdown/renderers/images";
import { folding, multipleCursors } from "@/lib/editor-extensions";
import { imagePaste, listenForImageDrops, type ImageTarget } from "@/lib/editor-images";

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onViewReady?: (view: EditorView) => void;
  vaultPath?: string;
  /** The full path of the note being edited: a link in it can be a path from its folder. */
  notePath?: string;
  className?: string;
  focusMode?: boolean;
}

export default function Editor({ content, onChange, onViewReady, vaultPath, notePath, className = "", focusMode = false }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const historyConfig = useRef(new Compartment());
  const [noteSetting] = useState(() => notePathSetting(notePath));
  const onChangeRef = useRef(onChange);
  const vaultPathRef = useRef(vaultPath);
  const notePathRef = useRef(notePath);
  const [isDragOver, setIsDragOver] = useState(false);
  // Where a pasted or dropped picture goes: asked for when it arrives, since
  // the same editor shows whichever note's tab is in front.
  const [imageTarget] = useState<ImageTarget>(() => ({
    vaultPath: () => vaultPathRef.current,
    notePath: () => notePathRef.current,
    ownLine: true,
  }));

  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => { vaultPathRef.current = vaultPath; }, [vaultPath]);
  useEffect(() => { notePathRef.current = notePath; }, [notePath]);

  const createEditor = useCallback(() => {
    if (!editorRef.current) return;
    if (viewRef.current) viewRef.current.destroy();

    const state = EditorState.create({
      doc: content,
      extensions: [
        drawSelection(),
        multipleCursors(),
        closeBrackets(),
        historyConfig.current.of(history()),
        noteSetting.extension,
        ...(vaultPath ? [wikilinkAutocompletion(vaultPath)] : []),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        // The properties are edited as values above the note, so the YAML starts folded.
        folding("inline", { foldProperties: true }),
        syntaxHighlighting(mdHighlightStyle),
        editorTheme,
        markdownRenderTheme,
        liveMarkdownPlugin,
        mathExtension(),
        search({ top: true }),
        imagePaste(imageTarget),
        // App shortcuts win over the editor's own bindings for the same keys.
        // The key press still reaches the app's handler on the window.
        Prec.highest(EditorView.domEventHandlers({ keydown: (e) => isAppHotkey(e) })),
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
      replaceDocument(viewRef.current, historyConfig.current, content);
    }
  }, [content]);

  // The same editor shows whichever note's tab is in front.
  useEffect(() => {
    if (viewRef.current) noteSetting.set(viewRef.current, notePath);
  }, [noteSetting, notePath]);

  // Toggle focus mode via CSS class on editor container
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.classList.toggle("editor-focus-mode", focusMode);
  }, [focusMode]);

  // A picture dragged in from outside the app is saved in the attachment
  // folder and linked where it is dropped.
  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;
    return listenForImageDrops(container, () => viewRef.current, imageTarget, setIsDragOver);
  }, [imageTarget]);

  return (
    <div
      ref={editorRef}
      data-note-path={notePath}
      className={`h-full overflow-hidden ${className}${isDragOver ? " editor-drop-active" : ""}`}
    />
  );
}
