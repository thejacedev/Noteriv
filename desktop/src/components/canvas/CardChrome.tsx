"use client";

import type React from "react";
import { canvasColorName, isHexColor, type CanvasNode } from "@/lib/canvas-utils";

/** What every card needs from the canvas to be selected, moved, resized and connected. */
export interface CardHandlers {
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onDoubleClick: (id: string) => void;
  onAnchorPointerDown: (nodeId: string, side: string, e: React.PointerEvent) => void;
  onResizePointerDown: (nodeId: string, corner: string, e: React.PointerEvent) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}

const CORNERS = ["nw", "ne", "sw", "se"];
const SIDES = ["top", "bottom", "left", "right"];

/** The corner handles of a selected card and the dots an edge is dragged from. */
export function CardChrome({
  node,
  selected,
  anchors = true,
  onAnchorPointerDown,
  onResizePointerDown,
}: {
  node: CanvasNode;
  selected: boolean;
  anchors?: boolean;
  onAnchorPointerDown: CardHandlers["onAnchorPointerDown"];
  onResizePointerDown: CardHandlers["onResizePointerDown"];
}) {
  return (
    <>
      {selected &&
        CORNERS.map((corner) => (
          <div
            key={corner}
            className={`canvas-resize-handle ${corner}`}
            onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, corner, e); }}
          />
        ))}
      {anchors &&
        SIDES.map((side) => (
          <div
            key={side}
            className={`canvas-edge-anchor ${side}`}
            onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, side, e); }}
          />
        ))}
    </>
  );
}

/**
 * How a card shows its colour. A preset is named for the stylesheet, as it
 * always was; a colour of the user's own is set on the card itself.
 */
export function cardColor(color: string | undefined): {
  name: string | undefined;
  style: React.CSSProperties;
} {
  if (isHexColor(color)) {
    return {
      name: undefined,
      style: { borderColor: color, background: `color-mix(in srgb, ${color} 8%, transparent)` },
    };
  }
  return { name: canvasColorName(color), style: {} };
}

/** Keeps a press on a control inside a card from starting to drag the card. */
export function stopPointer(e: React.PointerEvent) {
  e.stopPropagation();
}
