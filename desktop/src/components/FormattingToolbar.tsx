"use client";

import type { HotkeyAction } from "@/lib/hotkeys";

interface FormattingToolbarProps {
  onAction: (action: HotkeyAction) => void;
}

const actions: { action: HotkeyAction; label: string; shortcut?: string; content: string; className?: string }[] = [
  { action: "toggleBold", label: "Bold", content: "B", className: "formatting-toolbar-bold" },
  { action: "toggleItalic", label: "Italic", shortcut: "Ctrl+I", content: "I", className: "formatting-toolbar-italic" },
  { action: "toggleStrikethrough", label: "Strikethrough", content: "S", className: "formatting-toolbar-strike" },
  { action: "toggleCode", label: "Inline code", shortcut: "Ctrl+`", content: "<>" },
  { action: "insertLink", label: "Insert link", shortcut: "Ctrl+K", content: "Link" },
  { action: "insertImage", label: "Insert image", content: "Image" },
  { action: "insertBlockquote", label: "Blockquote", content: "Quote" },
  { action: "insertCodeBlock", label: "Code block", content: "Code" },
  { action: "insertTaskList", label: "Task list", content: "Task" },
  { action: "insertTable", label: "Insert table", content: "Table" },
  { action: "insertHorizontalRule", label: "Horizontal rule", content: "Rule" },
];

export default function FormattingToolbar({ onAction }: FormattingToolbarProps) {
  return (
    <div className="formatting-toolbar" aria-label="Formatting toolbar">
      {actions.map(({ action, label, shortcut, content, className }) => (
        <button
          key={action}
          type="button"
          className={`formatting-toolbar-button ${className || ""}`}
          title={shortcut ? `${label} (${shortcut})` : label}
          aria-label={label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(action)}
        >
          {content}
        </button>
      ))}
    </div>
  );
}
