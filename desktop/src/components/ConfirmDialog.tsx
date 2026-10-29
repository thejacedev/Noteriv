"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Destructive actions get a red confirm button.
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

let enqueue: ((request: PendingConfirm) => void) | null = null;

/**
 * Ask the user to confirm an action. Resolves true only if they pick the
 * confirm button. Falls back to the native prompt when no host is mounted.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const push = enqueue;
  if (!push) {
    const text = options.message ? `${options.title}\n\n${options.message}` : options.title;
    return Promise.resolve(window.confirm(text));
  }
  return new Promise((resolve) => push({ ...options, resolve }));
}

export default function ConfirmDialogHost() {
  const [queue, setQueue] = useState<PendingConfirm[]>([]);
  const current = queue[0] ?? null;
  const currentRef = useRef<PendingConfirm | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    enqueue = (request) => setQueue((q) => [...q, request]);
    return () => {
      enqueue = null;
    };
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    const request = currentRef.current;
    if (!request) return;
    currentRef.current = null;
    request.resolve(confirmed);
    setQueue((q) => (q[0] === request ? q.slice(1) : q));
  }, []);

  useEffect(() => {
    currentRef.current = current;
    if (!current) {
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
      return;
    }
    if (!restoreFocusRef.current && document.activeElement instanceof HTMLElement) {
      restoreFocusRef.current = document.activeElement;
    }
    // Keep Enter from confirming a destructive action by accident.
    (current.danger ? cancelRef : confirmRef).current?.focus();
  }, [current]);

  // Registered once at mount so it runs before the capture listeners that
  // modals add later, keeping Escape and app hotkeys away from them.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!currentRef.current) return;
      e.stopImmediatePropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        const next = document.activeElement === confirmRef.current ? cancelRef.current : confirmRef.current;
        next?.focus();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [settle]);

  if (!current) return null;

  return (
    <div className="confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) settle(false); }}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={current.message ? "confirm-dialog-message" : undefined}
      >
        <h2 id="confirm-dialog-title" className="confirm-title">{current.title}</h2>
        {current.message && (
          <p id="confirm-dialog-message" className="confirm-message">{current.message}</p>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} className="confirm-btn" onClick={() => settle(false)}>
            {current.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmRef}
            className={`confirm-btn ${current.danger ? "confirm-btn-danger" : "confirm-btn-primary"}`}
            onClick={() => settle(true)}
          >
            {current.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
