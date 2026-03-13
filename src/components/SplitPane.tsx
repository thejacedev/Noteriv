"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import "../styles/split-pane.css";

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode | null;
  splitRatio: number; // 0.0 to 1.0, default 0.5
  onSplitRatioChange: (ratio: number) => void;
  direction: "horizontal" | "vertical";
}

const MIN_PANE_SIZE = 200; // px

export default function SplitPane({
  left,
  right,
  splitRatio,
  onSplitRatioChange,
  direction,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      setDragging(true);
    },
    []
  );

  const handleDoubleClick = useCallback(() => {
    onSplitRatioChange(0.5);
  }, [onSplitRatioChange]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      let ratio: number;

      if (direction === "horizontal") {
        const x = e.clientX - rect.left;
        const totalWidth = rect.width;
        // Enforce min pane width
        const minRatio = MIN_PANE_SIZE / totalWidth;
        const maxRatio = 1 - MIN_PANE_SIZE / totalWidth;
        ratio = Math.min(maxRatio, Math.max(minRatio, x / totalWidth));
      } else {
        const y = e.clientY - rect.top;
        const totalHeight = rect.height;
        const minRatio = MIN_PANE_SIZE / totalHeight;
        const maxRatio = 1 - MIN_PANE_SIZE / totalHeight;
        ratio = Math.min(maxRatio, Math.max(minRatio, y / totalHeight));
      }

      onSplitRatioChange(ratio);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setDragging(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [direction, onSplitRatioChange]);

  // When right is null, left takes full width
  if (right === null) {
    return (
      <div className="split-pane-container" ref={containerRef}>
        <div className="split-pane-panel" style={{ flex: 1 }}>
          {left}
        </div>
      </div>
    );
  }

  const isHorizontal = direction === "horizontal";

  const leftStyle: React.CSSProperties = isHorizontal
    ? { width: `calc(${splitRatio * 100}% - 2px)`, minWidth: MIN_PANE_SIZE }
    : { height: `calc(${splitRatio * 100}% - 2px)`, minHeight: MIN_PANE_SIZE };

  const rightStyle: React.CSSProperties = isHorizontal
    ? {
        width: `calc(${(1 - splitRatio) * 100}% - 2px)`,
        minWidth: MIN_PANE_SIZE,
      }
    : {
        height: `calc(${(1 - splitRatio) * 100}% - 2px)`,
        minHeight: MIN_PANE_SIZE,
      };

  return (
    <div
      className={`split-pane-container ${isHorizontal ? "split-horizontal" : "split-vertical"} ${dragging ? "split-dragging" : ""}`}
      ref={containerRef}
    >
      <div className="split-pane-panel" style={leftStyle}>
        {left}
      </div>
      <div
        className={`split-pane-divider ${dragging ? "split-pane-divider-active" : ""}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        role="separator"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
      />
      <div className="split-pane-panel" style={rightStyle}>
        {right}
      </div>
    </div>
  );
}
