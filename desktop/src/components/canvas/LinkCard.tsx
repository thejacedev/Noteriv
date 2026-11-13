"use client";

import { webUrlHost, type CanvasNode } from "@/lib/canvas-utils";
import { CardChrome, cardColor, stopPointer, type CardHandlers } from "./CardChrome";

/**
 * A web page card. It shows where the page is, the site first and the whole
 * address under it, and opens it in the browser. The page itself is not shown:
 * the app does not embed web pages, and nothing is fetched to draw the card.
 */
export function LinkCard({
  node,
  selected,
  onOpen,
  ...handlers
}: {
  node: CanvasNode;
  selected: boolean;
  onOpen: (url: string) => void;
} & CardHandlers) {
  const url = node.url || "";
  const color = cardColor(node.color);

  return (
    <div
      className={`canvas-node canvas-node-link${selected ? " selected" : ""}`}
      data-color={color.name}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height, ...color.style }}
      onPointerDown={(e) => handlers.onPointerDown(node.id, e)}
      onDoubleClick={() => handlers.onDoubleClick(node.id)}
      onContextMenu={(e) => handlers.onContextMenu(node.id, e)}
    >
      <div className="canvas-link-body">
        <div className="canvas-link-site">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1.8 8h12.4M8 1.8c2 2.2 2 10.2 0 12.4M8 1.8c-2 2.2-2 10.2 0 12.4" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <span className="canvas-link-host">{url ? webUrlHost(url) : "No address"}</span>
        </div>
        <div className="canvas-link-url" title={url}>{url}</div>
        <button
          type="button"
          className="canvas-card-button"
          disabled={!url}
          onPointerDown={stopPointer}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => onOpen(url)}
        >
          Open
        </button>
      </div>
      <CardChrome
        node={node}
        selected={selected}
        onAnchorPointerDown={handlers.onAnchorPointerDown}
        onResizePointerDown={handlers.onResizePointerDown}
      />
    </div>
  );
}
