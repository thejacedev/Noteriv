"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface HoverPreviewProps {
  /** The target file path to preview content from. */
  filePath: string | null;
  /** The display name of the linked note. */
  linkName: string;
  /** Position to render the preview near (absolute, in pixels). */
  position: { x: number; y: number };
  /** Called when the preview should be dismissed. */
  onDismiss: () => void;
}

export default function HoverPreview({
  filePath,
  linkName,
  position,
  onDismiss,
}: HoverPreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Load file content
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!filePath || !window.electronAPI) {
        setContent(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const fileContent = await window.electronAPI.readFile(filePath);
        if (!cancelled) {
          setContent(fileContent);
        }
      } catch {
        if (!cancelled) {
          setContent(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Adjust position to keep the preview in the viewport
  useEffect(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = position.x;
    let y = position.y;

    // Ensure the preview doesn't go off the right edge
    if (x + rect.width > vw - 16) {
      x = vw - rect.width - 16;
    }
    // Ensure it doesn't go off the left edge
    if (x < 16) {
      x = 16;
    }
    // If it would go below the viewport, show it above the link
    if (y + rect.height > vh - 16) {
      y = position.y - rect.height - 24;
    }
    // Ensure it doesn't go above the viewport
    if (y < 16) {
      y = 16;
    }

    setAdjustedPosition({ x, y });
  }, [position, content, loading]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onDismiss();
      }
    }

    // Close on scroll
    function handleScroll() {
      onDismiss();
    }

    // Close on escape
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onDismiss();
      }
    }

    document.addEventListener("mousedown", handleClick, true);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClick, true);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  // Get a truncated preview of the content (~200 chars)
  const preview = content
    ? content.slice(0, 200) + (content.length > 200 ? "..." : "")
    : null;

  return (
    <div
      ref={containerRef}
      className="hp-container"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
      onMouseLeave={onDismiss}
    >
      <div className="hp-header">
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          className="hp-icon"
        >
          <path
            d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
          <path
            d="M9 1v4h4"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>
        <span className="hp-title">{linkName}</span>
      </div>

      <div className="hp-body">
        {loading ? (
          <div className="hp-loading">Loading...</div>
        ) : preview ? (
          <pre className="hp-preview-text">{preview}</pre>
        ) : (
          <div className="hp-not-found">
            {filePath ? "Could not load content" : "Note not found"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hook for managing hover preview state ──

interface HoverState {
  visible: boolean;
  filePath: string | null;
  linkName: string;
  position: { x: number; y: number };
}

const INITIAL_STATE: HoverState = {
  visible: false,
  filePath: null,
  linkName: "",
  position: { x: 0, y: 0 },
};

/**
 * Hook to manage hover preview state with a delay.
 * Returns the state and handlers to attach to wiki link elements.
 */
export function useHoverPreview(delay: number = 300) {
  const [state, setState] = useState<HoverState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (filePath: string | null, linkName: string, x: number, y: number) => {
      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        setState({
          visible: true,
          filePath,
          linkName,
          position: { x, y: y + 20 },
        });
      }, delay);
    },
    [delay]
  );

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState(INITIAL_STATE);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { state, show, dismiss };
}
