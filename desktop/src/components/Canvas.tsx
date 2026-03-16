"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  CanvasData,
  CanvasNode,
  CanvasEdge,
  createTextNode,
  createFileNode,
  createGroupNode,
  createStickyNode,
  createImageNode,
  createDrawingNode,
  createEdge,
  serializeCanvas,
  parseCanvas,
  getAnchorPoint,
  generateId,
  recalcEdgeSides,
  STICKY_COLORS,
} from "@/lib/canvas-utils";
import "@/styles/canvas.css";

// ─── Props ───

interface CanvasProps {
  filePath: string;
  vaultPath: string;
  onSave: (content: string) => void;
  onFileSelect: (filePath: string) => void;
  onClose?: () => void;
}

// ─── Constants ───

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const MIN_NODE_W = 100;
const MIN_NODE_H = 60;
const NODE_COLORS = ["", "red", "orange", "yellow", "green", "blue", "purple"];

/** Tool modes for the canvas toolbar */
type CanvasTool = "select" | "text" | "sticky" | "image" | "draw";

/** Colors available for the draw tool */
const DRAW_STROKE_COLORS = [
  "#cdd6f4", // white-ish (text)
  "#f38ba8", // red
  "#fab387", // peach
  "#f9e2af", // yellow
  "#a6e3a1", // green
  "#89dceb", // blue
  "#cba6f7", // purple
];

// ─── Sub-components ───

/** SVG arrow marker definition */
function EdgeMarkerDefs() {
  return (
    <defs>
      <marker
        id="canvas-arrowhead"
        markerWidth="10"
        markerHeight="8"
        refX="9"
        refY="4"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M0,0 L10,4 L0,8 Z" className="canvas-edge-arrowhead" />
      </marker>
    </defs>
  );
}

/** Render a single edge as SVG path */
function EdgeLine({
  edge,
  nodes,
  selected,
  onClick,
}: {
  edge: CanvasEdge;
  nodes: CanvasNode[];
  selected: boolean;
  onClick: (id: string, e: React.MouseEvent) => void;
}) {
  const fromNode = nodes.find((n) => n.id === edge.fromNode);
  const toNode = nodes.find((n) => n.id === edge.toNode);
  if (!fromNode || !toNode) return null;

  const from = getAnchorPoint(fromNode, edge.fromSide);
  const to = getAnchorPoint(toNode, edge.toSide);

  // Cubic bezier with control points offset in direction of the side
  const sideOffset = 60;
  const cp1 = { ...from };
  const cp2 = { ...to };
  if (edge.fromSide === "right") cp1.x += sideOffset;
  else if (edge.fromSide === "left") cp1.x -= sideOffset;
  else if (edge.fromSide === "bottom") cp1.y += sideOffset;
  else cp1.y -= sideOffset;

  if (edge.toSide === "right") cp2.x += sideOffset;
  else if (edge.toSide === "left") cp2.x -= sideOffset;
  else if (edge.toSide === "bottom") cp2.y += sideOffset;
  else cp2.y -= sideOffset;

  const d = `M${from.x},${from.y} C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${to.x},${to.y}`;

  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  return (
    <g>
      {/* Invisible wider path for easier click */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onClick={(e) => onClick(edge.id, e)}
      />
      <path
        d={d}
        className={`canvas-edge-line${selected ? " selected" : ""}`}
        markerEnd="url(#canvas-arrowhead)"
        style={edge.color ? { stroke: edge.color } : undefined}
      />
      {edge.label && (
        <text x={midX} y={midY - 8} className="canvas-edge-label">
          {edge.label}
        </text>
      )}
    </g>
  );
}

/** Single text node */
function TextNodeView({
  node,
  selected,
  editing,
  onPointerDown,
  onDoubleClick,
  onTextChange,
  onTextBlur,
  onAnchorPointerDown,
  onResizePointerDown,
  onContextMenu,
}: {
  node: CanvasNode;
  selected: boolean;
  editing: boolean;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onDoubleClick: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onTextBlur: () => void;
  onAnchorPointerDown: (nodeId: string, side: string, e: React.PointerEvent) => void;
  onResizePointerDown: (nodeId: string, corner: string, e: React.PointerEvent) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  return (
    <div
      className={`canvas-node canvas-node-text${selected ? " selected" : ""}`}
      data-color={node.color || undefined}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
      onPointerDown={(e) => onPointerDown(node.id, e)}
      onDoubleClick={() => onDoubleClick(node.id)}
      onContextMenu={(e) => onContextMenu(node.id, e)}
    >
      <div className="canvas-node-body">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={node.text || ""}
            onChange={(e) => onTextChange(node.id, e.target.value)}
            onBlur={onTextBlur}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="node-text-display">
            {node.text || "Double-click to edit"}
          </div>
        )}
      </div>
      {/* Resize handles */}
      {selected && (
        <>
          <div className="canvas-resize-handle nw" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "nw", e); }} />
          <div className="canvas-resize-handle ne" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "ne", e); }} />
          <div className="canvas-resize-handle sw" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "sw", e); }} />
          <div className="canvas-resize-handle se" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "se", e); }} />
        </>
      )}
      {/* Edge anchors */}
      <div className="canvas-edge-anchor top" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "top", e); }} />
      <div className="canvas-edge-anchor bottom" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "bottom", e); }} />
      <div className="canvas-edge-anchor left" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "left", e); }} />
      <div className="canvas-edge-anchor right" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "right", e); }} />
    </div>
  );
}

/** Single file node */
function FileNodeView({
  node,
  selected,
  preview,
  onPointerDown,
  onDoubleClick,
  onAnchorPointerDown,
  onResizePointerDown,
  onContextMenu,
}: {
  node: CanvasNode;
  selected: boolean;
  preview: string;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onDoubleClick: (id: string) => void;
  onAnchorPointerDown: (nodeId: string, side: string, e: React.PointerEvent) => void;
  onResizePointerDown: (nodeId: string, corner: string, e: React.PointerEvent) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}) {
  const fileName = node.filePath?.split("/").pop()?.split("\\").pop() || "Unknown";
  return (
    <div
      className={`canvas-node canvas-node-file${selected ? " selected" : ""}`}
      data-color={node.color || undefined}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
      onPointerDown={(e) => onPointerDown(node.id, e)}
      onDoubleClick={() => onDoubleClick(node.id)}
      onContextMenu={(e) => onContextMenu(node.id, e)}
    >
      <div className="canvas-node-header">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
          <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <span className="file-name">{fileName}</span>
      </div>
      <div className="canvas-node-body">
        {preview || "Loading..."}
      </div>
      {selected && (
        <>
          <div className="canvas-resize-handle nw" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "nw", e); }} />
          <div className="canvas-resize-handle ne" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "ne", e); }} />
          <div className="canvas-resize-handle sw" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "sw", e); }} />
          <div className="canvas-resize-handle se" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "se", e); }} />
        </>
      )}
      <div className="canvas-edge-anchor top" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "top", e); }} />
      <div className="canvas-edge-anchor bottom" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "bottom", e); }} />
      <div className="canvas-edge-anchor left" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "left", e); }} />
      <div className="canvas-edge-anchor right" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "right", e); }} />
    </div>
  );
}

/** Group node */
function GroupNodeView({
  node,
  selected,
  editingLabel,
  onPointerDown,
  onDoubleClick,
  onLabelChange,
  onLabelBlur,
  onResizePointerDown,
  onContextMenu,
}: {
  node: CanvasNode;
  selected: boolean;
  editingLabel: boolean;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onDoubleClick: (id: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onLabelBlur: () => void;
  onResizePointerDown: (nodeId: string, corner: string, e: React.PointerEvent) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingLabel && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingLabel]);

  return (
    <div
      className={`canvas-node canvas-node-group${selected ? " selected" : ""}`}
      data-color={node.color || undefined}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
      onPointerDown={(e) => onPointerDown(node.id, e)}
      onDoubleClick={() => onDoubleClick(node.id)}
      onContextMenu={(e) => onContextMenu(node.id, e)}
    >
      <div className="canvas-group-label">
        {editingLabel ? (
          <input
            ref={inputRef}
            value={node.label || ""}
            onChange={(e) => onLabelChange(node.id, e.target.value)}
            onBlur={onLabelBlur}
            onKeyDown={(e) => { if (e.key === "Enter") onLabelBlur(); }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          node.label || "Group"
        )}
      </div>
      {selected && (
        <>
          <div className="canvas-resize-handle nw" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "nw", e); }} />
          <div className="canvas-resize-handle ne" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "ne", e); }} />
          <div className="canvas-resize-handle sw" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "sw", e); }} />
          <div className="canvas-resize-handle se" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "se", e); }} />
        </>
      )}
    </div>
  );
}

/** Single sticky note node */
function StickyNoteView({
  node,
  selected,
  editing,
  onPointerDown,
  onDoubleClick,
  onTextChange,
  onTextBlur,
  onAnchorPointerDown,
  onResizePointerDown,
  onContextMenu,
}: {
  node: CanvasNode;
  selected: boolean;
  editing: boolean;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onDoubleClick: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onTextBlur: () => void;
  onAnchorPointerDown: (nodeId: string, side: string, e: React.PointerEvent) => void;
  onResizePointerDown: (nodeId: string, corner: string, e: React.PointerEvent) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const rotation = node.rotation ?? 0;

  return (
    <div
      className={`canvas-node canvas-node-sticky${selected ? " selected" : ""}`}
      data-sticky-color={node.color || "yellow"}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: `rotate(${rotation}deg)`,
        background: STICKY_COLORS[node.color || "yellow"] || "#f9e2af",
      }}
      onPointerDown={(e) => onPointerDown(node.id, e)}
      onDoubleClick={() => onDoubleClick(node.id)}
      onContextMenu={(e) => onContextMenu(node.id, e)}
    >
      <div className="canvas-sticky-body">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={node.text || ""}
            onChange={(e) => onTextChange(node.id, e.target.value)}
            onBlur={onTextBlur}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="sticky-text-display">
            {node.text || "Double-click to edit"}
          </div>
        )}
      </div>
      {/* Resize handles */}
      {selected && (
        <>
          <div className="canvas-resize-handle nw" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "nw", e); }} />
          <div className="canvas-resize-handle ne" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "ne", e); }} />
          <div className="canvas-resize-handle sw" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "sw", e); }} />
          <div className="canvas-resize-handle se" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "se", e); }} />
        </>
      )}
      {/* Edge anchors */}
      <div className="canvas-edge-anchor top" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "top", e); }} />
      <div className="canvas-edge-anchor bottom" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "bottom", e); }} />
      <div className="canvas-edge-anchor left" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "left", e); }} />
      <div className="canvas-edge-anchor right" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "right", e); }} />
    </div>
  );
}

/** Single image node */
function ImageNodeView({
  node,
  selected,
  onPointerDown,
  onDoubleClick,
  onAnchorPointerDown,
  onResizePointerDown,
  onContextMenu,
}: {
  node: CanvasNode;
  selected: boolean;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onDoubleClick: (id: string) => void;
  onAnchorPointerDown: (nodeId: string, side: string, e: React.PointerEvent) => void;
  onResizePointerDown: (nodeId: string, corner: string, e: React.PointerEvent) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!node.imagePath) return;
    // Read the image via Electron and create an object URL or use file:// protocol
    async function loadImage() {
      if (!node.imagePath) return;
      try {
        // Use file:// protocol for Electron (works in webview)
        setImageSrc(`file://${node.imagePath}`);
      } catch {
        setImageSrc(null);
      }
    }
    loadImage();
  }, [node.imagePath]);

  return (
    <div
      className={`canvas-node canvas-node-image${selected ? " selected" : ""}`}
      data-color={node.color || undefined}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
      onPointerDown={(e) => onPointerDown(node.id, e)}
      onDoubleClick={() => onDoubleClick(node.id)}
      onContextMenu={(e) => onContextMenu(node.id, e)}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          draggable={false}
        />
      ) : (
        <div className="canvas-image-placeholder">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
            <path d="M1 11l4-3 3 2 3-4 4 5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      {/* Resize handles */}
      {selected && (
        <>
          <div className="canvas-resize-handle nw" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "nw", e); }} />
          <div className="canvas-resize-handle ne" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "ne", e); }} />
          <div className="canvas-resize-handle sw" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "sw", e); }} />
          <div className="canvas-resize-handle se" onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(node.id, "se", e); }} />
        </>
      )}
      {/* Edge anchors */}
      <div className="canvas-edge-anchor top" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "top", e); }} />
      <div className="canvas-edge-anchor bottom" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "bottom", e); }} />
      <div className="canvas-edge-anchor left" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "left", e); }} />
      <div className="canvas-edge-anchor right" onPointerDown={(e) => { e.stopPropagation(); onAnchorPointerDown(node.id, "right", e); }} />
    </div>
  );
}

/** Drawing (freehand stroke) node */
function DrawingNodeView({
  node,
  selected,
  onPointerDown,
  onContextMenu,
}: {
  node: CanvasNode;
  selected: boolean;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}) {
  const points = node.drawingPoints || [];
  if (points.length < 2) return null;

  const polylinePoints = points.map(([px, py]) => `${px},${py}`).join(" ");

  return (
    <div
      className={`canvas-node canvas-node-drawing${selected ? " selected" : ""}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(node.id, e); }}
      onContextMenu={(e) => onContextMenu(node.id, e)}
    >
      <svg
        viewBox={`0 0 ${node.width} ${node.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", top: 0, left: 0, width: node.width, height: node.height, overflow: "visible" }}
      >
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={node.strokeColor || "#cdd6f4"}
          strokeWidth={node.strokeWidth || 3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** File picker overlay */
function FilePicker({
  vaultPath,
  onSelect,
  onClose,
}: {
  vaultPath: string;
  onSelect: (filePath: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<{ filePath: string; fileName: string; relativePath: string }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    async function loadFiles() {
      if (!window.electronAPI) return;
      const all = await window.electronAPI.listAllFiles(vaultPath);
      setFiles(all);
    }
    loadFiles();
  }, [vaultPath]);

  const filtered = useMemo(() => {
    if (!query) return files;
    const q = query.toLowerCase();
    return files.filter(
      (f) => f.fileName.toLowerCase().includes(q) || f.relativePath.toLowerCase().includes(q)
    );
  }, [files, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      onSelect(filtered[selectedIndex].filePath);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="canvas-file-picker" onClick={onClose}>
      <div className="canvas-file-picker-inner" onClick={(e) => e.stopPropagation()}>
        <div className="canvas-file-picker-header">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="var(--text-muted)" strokeWidth="1.3" />
            <path d="M11 11l3 3" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
          />
        </div>
        <div className="canvas-file-picker-list">
          {filtered.slice(0, 50).map((f, i) => (
            <button
              key={f.filePath}
              className={`canvas-file-picker-item${i === selectedIndex ? " active" : ""}`}
              onClick={() => onSelect(f.filePath)}
            >
              <span>{f.fileName.replace(/\.(md|markdown)$/i, "")}</span>
              <span className="file-path">{f.relativePath}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No matching files
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Context menu */
function CanvasContextMenu({
  x,
  y,
  nodeId,
  nodeType,
  nodeColor,
  onDelete,
  onColorChange,
  onStickyColorChange,
  onDuplicate,
  onAddTextNode,
  onAddStickyNote,
  onAddImage,
  onClose,
}: {
  x: number;
  y: number;
  nodeId: string | null;
  nodeType?: string;
  nodeColor?: string;
  onDelete: () => void;
  onColorChange: (color: string) => void;
  onStickyColorChange: (color: string) => void;
  onDuplicate: () => void;
  onAddTextNode: () => void;
  onAddStickyNote: () => void;
  onAddImage: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleClick = () => onClose();
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [onClose]);

  return (
    <div className="canvas-context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      {nodeId && (
        <>
          <button className="canvas-context-item" onClick={onDuplicate}>
            Duplicate
          </button>
          <div className="canvas-context-divider" />
          {/* Show sticky-specific color picker for sticky nodes */}
          {nodeType === "sticky" ? (
            <>
              <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--text-muted)" }}>
                Sticky Color
              </div>
              <div className="canvas-context-submenu">
                {Object.entries(STICKY_COLORS).map(([name, hex]) => (
                  <div
                    key={name}
                    className={`canvas-sticky-color-dot${nodeColor === name ? " active" : ""}`}
                    style={{ background: hex }}
                    onClick={() => onStickyColorChange(name)}
                  />
                ))}
              </div>
            </>
          ) : nodeType !== "drawing" ? (
            <>
              <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--text-muted)" }}>
                Color
              </div>
              <div className="canvas-context-submenu">
                {NODE_COLORS.map((c) => (
                  <div
                    key={c || "none"}
                    className={`canvas-color-dot${nodeColor === c ? " active" : ""}`}
                    style={{
                      background: c
                        ? { red: "#e55", orange: "#e93", yellow: "#ec5", green: "#5b5", blue: "#58c", purple: "#a6e" }[c]
                        : "var(--bg-hover)",
                    }}
                    onClick={() => onColorChange(c)}
                  />
                ))}
              </div>
            </>
          ) : null}
          <div className="canvas-context-divider" />
          <button className="canvas-context-item danger" onClick={onDelete}>
            Delete
          </button>
        </>
      )}
      {!nodeId && (
        <>
          <button className="canvas-context-item" onClick={onAddTextNode}>
            Add Text Node
          </button>
          <button className="canvas-context-item" onClick={onAddStickyNote}>
            Add Sticky Note
          </button>
          <button className="canvas-context-item" onClick={onAddImage}>
            Add Image
          </button>
        </>
      )}
    </div>
  );
}

/** Minimap */
function Minimap({
  nodes,
  panX,
  panY,
  zoom,
  viewportWidth,
  viewportHeight,
}: {
  nodes: CanvasNode[];
  panX: number;
  panY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  if (nodes.length === 0) return null;

  // Calculate bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  const pad = 100;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const worldW = maxX - minX;
  const worldH = maxY - minY;

  const mmW = 160;
  const mmH = 100;
  const scale = Math.min(mmW / worldW, mmH / worldH);

  // Viewport rect in world coordinates
  const vpLeft = -panX / zoom;
  const vpTop = -panY / zoom;
  const vpW = viewportWidth / zoom;
  const vpH = viewportHeight / zoom;

  return (
    <div className="canvas-minimap">
      {nodes.map((n) => (
        <div
          key={n.id}
          className="canvas-minimap-node"
          style={{
            left: (n.x - minX) * scale,
            top: (n.y - minY) * scale,
            width: Math.max(n.width * scale, 2),
            height: Math.max(n.height * scale, 2),
          }}
        />
      ))}
      <div
        className="canvas-minimap-viewport"
        style={{
          left: (vpLeft - minX) * scale,
          top: (vpTop - minY) * scale,
          width: vpW * scale,
          height: vpH * scale,
        }}
      />
    </div>
  );
}

// ─── Main Canvas Component ───

export default function Canvas({ filePath, vaultPath, onSave, onFileSelect, onClose }: CanvasProps) {
  // ─── State ───
  const [canvasData, setCanvasData] = useState<CanvasData>({ nodes: [], edges: [] });
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  const [viewportSize, setViewportSize] = useState({ w: 800, h: 600 });

  // Tool mode state
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [drawStrokeColor, setDrawStrokeColor] = useState("#cdd6f4");
  const [drawStrokeWidth] = useState(3);

  // Freehand drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawPoints, setCurrentDrawPoints] = useState<number[][]>([]);
  const drawPointsRef = useRef<number[][]>([]);

  // Drawing edge state
  const [drawingEdge, setDrawingEdge] = useState<{
    fromNode: string;
    fromSide: string;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  // Resize state
  const [resizing, setResizing] = useState<{
    nodeId: string;
    corner: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const nodeDragRef = useRef<{ nodeId: string; startX: number; startY: number; nodePositions: Map<string, { x: number; y: number }> } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  // ─── Load canvas data ───
  useEffect(() => {
    loadedRef.current = false;
    async function load() {
      if (!window.electronAPI) return;
      const content = await window.electronAPI.readFile(filePath);
      if (content !== null) {
        const data = parseCanvas(content);
        setCanvasData(data);
      } else {
        setCanvasData({ nodes: [], edges: [] });
      }
      loadedRef.current = true;
    }
    load();
    setSelectedNodeIds(new Set());
    setSelectedEdgeId(null);
    setEditingNodeId(null);
  }, [filePath]);

  // ─── Load file previews for file nodes ───
  useEffect(() => {
    async function loadPreviews() {
      if (!window.electronAPI) return;
      const fileNodes = canvasData.nodes.filter((n) => n.type === "file" && n.filePath);
      for (const node of fileNodes) {
        if (node.filePath && !filePreviews[node.filePath]) {
          const content = await window.electronAPI.readFile(node.filePath);
          if (content !== null) {
            setFilePreviews((prev) => ({
              ...prev,
              [node.filePath!]: content.slice(0, 300),
            }));
          }
        }
      }
    }
    loadPreviews();
  }, [canvasData.nodes, filePreviews]);

  // ─── Observe viewport size ───
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Debounced save ───
  const scheduleSave = useCallback(
    (data: CanvasData) => {
      if (!loadedRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSave(serializeCanvas(data));
      }, 500);
    },
    [onSave]
  );

  // ─── Update canvas data with auto-save ───
  const updateCanvas = useCallback(
    (updater: (prev: CanvasData) => CanvasData) => {
      setCanvasData((prev) => {
        const next = updater(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  // ─── Convert screen coords to canvas (world) coords ───
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (sx - rect.left - panX) / zoom,
        y: (sy - rect.top - panY) / zoom,
      };
    },
    [panX, panY, zoom]
  );

  // ─── Pan (background drag) ───
  const handleViewportPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only left button on background
      if (e.button !== 0) return;
      // If we clicked a node/anchor, skip
      if ((e.target as HTMLElement).closest(".canvas-node")) return;

      e.preventDefault();
      setContextMenu(null);

      // Draw mode: start freehand stroke
      if (activeTool === "draw") {
        const world = screenToWorld(e.clientX, e.clientY);
        const startPoint = [world.x, world.y];
        setIsDrawing(true);
        setCurrentDrawPoints([startPoint]);
        drawPointsRef.current = [startPoint];
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      setIsPanning(true);
      setSelectedNodeIds(new Set());
      setSelectedEdgeId(null);
      setEditingNodeId(null);
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [panX, panY, activeTool, screenToWorld]
  );

  const handleViewportPointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Freehand drawing
      if (isDrawing) {
        const world = screenToWorld(e.clientX, e.clientY);
        const newPoint = [world.x, world.y];
        drawPointsRef.current = [...drawPointsRef.current, newPoint];
        setCurrentDrawPoints([...drawPointsRef.current]);
        return;
      }

      // Panning
      if (isPanning && dragStartRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setPanX(dragStartRef.current.panX + dx);
        setPanY(dragStartRef.current.panY + dy);
        return;
      }

      // Dragging node
      if (isDraggingNode && nodeDragRef.current) {
        const drag = nodeDragRef.current;
        if (!drag.nodePositions) return;
        const dx = (e.clientX - drag.startX) / zoom;
        const dy = (e.clientY - drag.startY) / zoom;
        updateCanvas((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            const orig = drag.nodePositions.get(n.id);
            if (!orig) return n;
            return { ...n, x: orig.x + dx, y: orig.y + dy };
          }),
        }));
        return;
      }

      // Drawing edge
      if (drawingEdge) {
        const world = screenToWorld(e.clientX, e.clientY);
        setDrawingEdge((prev) => prev ? { ...prev, mouseX: world.x, mouseY: world.y } : null);
        return;
      }

      // Resizing
      if (resizing) {
        const dx = (e.clientX - resizing.startX) / zoom;
        const dy = (e.clientY - resizing.startY) / zoom;
        updateCanvas((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (n.id !== resizing.nodeId) return n;
            let { origX: nx, origY: ny, origW: nw, origH: nh } = resizing;
            const corner = resizing.corner;
            if (corner.includes("e")) nw = Math.max(MIN_NODE_W, nw + dx);
            if (corner.includes("w")) { nw = Math.max(MIN_NODE_W, nw - dx); nx = nw > MIN_NODE_W ? nx + dx : nx; }
            if (corner.includes("s")) nh = Math.max(MIN_NODE_H, nh + dy);
            if (corner.includes("n")) { nh = Math.max(MIN_NODE_H, nh - dy); ny = nh > MIN_NODE_H ? ny + dy : ny; }
            return { ...n, x: nx, y: ny, width: nw, height: nh };
          }),
        }));
        return;
      }
    },
    [isDrawing, isPanning, isDraggingNode, drawingEdge, resizing, zoom, updateCanvas, screenToWorld]
  );

  const handleViewportPointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Finalize freehand drawing stroke
      if (isDrawing) {
        setIsDrawing(false);
        const points = drawPointsRef.current;
        if (points.length >= 2) {
          const drawNode = createDrawingNode(points, drawStrokeColor, drawStrokeWidth);
          updateCanvas((prev) => ({ ...prev, nodes: [...prev.nodes, drawNode] }));
        }
        setCurrentDrawPoints([]);
        drawPointsRef.current = [];
        try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
        return;
      }

      if (isPanning) {
        setIsPanning(false);
        dragStartRef.current = null;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }

      if (isDraggingNode) {
        setIsDraggingNode(false);
        nodeDragRef.current = null;
        // Recalculate edge sides after move
        updateCanvas((prev) => ({
          ...prev,
          edges: prev.edges.map((edge) => recalcEdgeSides(edge, prev.nodes)),
        }));
      }

      if (drawingEdge) {
        // Find node under cursor
        const world = screenToWorld(e.clientX, e.clientY);
        const targetNode = canvasData.nodes.find(
          (n) =>
            n.id !== drawingEdge.fromNode &&
            world.x >= n.x &&
            world.x <= n.x + n.width &&
            world.y >= n.y &&
            world.y <= n.y + n.height
        );
        if (targetNode) {
          const fromNode = canvasData.nodes.find((n) => n.id === drawingEdge.fromNode);
          if (fromNode) {
            // Check no duplicate edge
            const exists = canvasData.edges.some(
              (edge) =>
                (edge.fromNode === drawingEdge.fromNode && edge.toNode === targetNode.id) ||
                (edge.fromNode === targetNode.id && edge.toNode === drawingEdge.fromNode)
            );
            if (!exists) {
              const fromSide = drawingEdge.fromSide as "top" | "bottom" | "left" | "right";
              // Determine best toSide
              const opposite: Record<string, string> = { top: "bottom", bottom: "top", left: "right", right: "left" };
              const toSide = (opposite[fromSide] || "left") as "top" | "bottom" | "left" | "right";
              const newEdge = createEdge(drawingEdge.fromNode, targetNode.id, fromSide, toSide);
              // Recalculate sides
              const recalced = recalcEdgeSides(newEdge, canvasData.nodes);
              updateCanvas((prev) => ({
                ...prev,
                edges: [...prev.edges, recalced],
              }));
            }
          }
        }
        setDrawingEdge(null);
      }

      if (resizing) {
        setResizing(null);
        // Recalculate edge sides
        updateCanvas((prev) => ({
          ...prev,
          edges: prev.edges.map((edge) => recalcEdgeSides(edge, prev.nodes)),
        }));
      }
    },
    [isDrawing, isPanning, isDraggingNode, drawingEdge, resizing, canvasData.nodes, canvasData.edges, screenToWorld, updateCanvas, drawStrokeColor, drawStrokeWidth]
  );

  // ─── Zoom (mouse wheel) ───
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = 1 + ZOOM_STEP * direction;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));

      // Zoom towards cursor
      const scale = newZoom / zoom;
      setPanX(mouseX - (mouseX - panX) * scale);
      setPanY(mouseY - (mouseY - panY) * scale);
      setZoom(newZoom);
    },
    [zoom, panX, panY]
  );

  // ─── Node interactions ───
  const handleNodePointerDown = useCallback(
    (nodeId: string, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      setContextMenu(null);

      // Select
      if (e.shiftKey) {
        setSelectedNodeIds((prev) => {
          const next = new Set(prev);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return next;
        });
      } else {
        if (!selectedNodeIds.has(nodeId)) {
          setSelectedNodeIds(new Set([nodeId]));
        }
      }
      setSelectedEdgeId(null);

      // If editing a text node, don't start dragging
      if (editingNodeId === nodeId) return;

      // Start dragging
      setIsDraggingNode(true);
      const positions = new Map<string, { x: number; y: number }>();
      const idsToMove = selectedNodeIds.has(nodeId) ? selectedNodeIds : new Set([nodeId]);
      if (!selectedNodeIds.has(nodeId)) {
        setSelectedNodeIds(new Set([nodeId]));
      }
      for (const id of idsToMove) {
        const node = canvasData.nodes.find((n) => n.id === id);
        if (node) positions.set(id, { x: node.x, y: node.y });
      }
      // Also include the clicked node
      const clickedNode = canvasData.nodes.find((n) => n.id === nodeId);
      if (clickedNode && !positions.has(nodeId)) {
        positions.set(nodeId, { x: clickedNode.x, y: clickedNode.y });
      }
      nodeDragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, nodePositions: positions };
    },
    [selectedNodeIds, editingNodeId, canvasData.nodes]
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      const node = canvasData.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      if (node.type === "text" || node.type === "group" || node.type === "sticky") {
        setEditingNodeId(nodeId);
      } else if (node.type === "file" && node.filePath) {
        onFileSelect(node.filePath);
      } else if (node.type === "image") {
        // Double-click image to change it via file dialog
        (async () => {
          if (!window.electronAPI) return;
          try {
            const result = await window.electronAPI.showOpenDialog({
              properties: ["openFile"],
              filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }],
            });
            if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
              updateCanvas((prev) => ({
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.id === nodeId ? { ...n, imagePath: result.filePaths[0] } : n
                ),
              }));
            }
          } catch {
            // Silently fail if dialog not available
          }
        })();
      }
    },
    [canvasData.nodes, onFileSelect, updateCanvas]
  );

  const handleTextChange = useCallback(
    (nodeId: string, text: string) => {
      updateCanvas((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, text } : n)),
      }));
    },
    [updateCanvas]
  );

  const handleLabelChange = useCallback(
    (nodeId: string, label: string) => {
      updateCanvas((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, label } : n)),
      }));
    },
    [updateCanvas]
  );

  const handleEditBlur = useCallback(() => {
    setEditingNodeId(null);
  }, []);

  // ─── Edge connection ───
  const handleAnchorPointerDown = useCallback(
    (nodeId: string, side: string, e: React.PointerEvent) => {
      e.preventDefault();
      const world = screenToWorld(e.clientX, e.clientY);
      setDrawingEdge({
        fromNode: nodeId,
        fromSide: side,
        mouseX: world.x,
        mouseY: world.y,
      });
    },
    [screenToWorld]
  );

  const handleEdgeClick = useCallback(
    (edgeId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedEdgeId(edgeId);
      setSelectedNodeIds(new Set());
    },
    []
  );

  // ─── Resize ───
  const handleResizePointerDown = useCallback(
    (nodeId: string, corner: string, e: React.PointerEvent) => {
      e.preventDefault();
      const node = canvasData.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setResizing({
        nodeId,
        corner,
        startX: e.clientX,
        startY: e.clientY,
        origX: node.x,
        origY: node.y,
        origW: node.width,
        origH: node.height,
      });
    },
    [canvasData.nodes]
  );

  // ─── Context menu ───
  const handleNodeContextMenu = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedNodeIds(new Set([nodeId]));
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
    },
    []
  );

  const handleViewportContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!(e.target as HTMLElement).closest(".canvas-node")) {
        setContextMenu({ x: e.clientX, y: e.clientY, nodeId: null });
      }
    },
    []
  );

  // ─── Delete ───
  const deleteSelected = useCallback(() => {
    if (selectedEdgeId) {
      updateCanvas((prev) => ({
        ...prev,
        edges: prev.edges.filter((e) => e.id !== selectedEdgeId),
      }));
      setSelectedEdgeId(null);
      return;
    }

    if (selectedNodeIds.size > 0) {
      updateCanvas((prev) => ({
        ...prev,
        nodes: prev.nodes.filter((n) => !selectedNodeIds.has(n.id)),
        edges: prev.edges.filter(
          (e) => !selectedNodeIds.has(e.fromNode) && !selectedNodeIds.has(e.toNode)
        ),
      }));
      setSelectedNodeIds(new Set());
    }
  }, [selectedNodeIds, selectedEdgeId, updateCanvas]);

  // ─── Duplicate ───
  const duplicateSelected = useCallback(() => {
    if (selectedNodeIds.size === 0) return;
    const idMap = new Map<string, string>();
    const newNodes: CanvasNode[] = [];
    for (const id of selectedNodeIds) {
      const node = canvasData.nodes.find((n) => n.id === id);
      if (!node) continue;
      const newId = generateId();
      idMap.set(id, newId);
      newNodes.push({ ...node, id: newId, x: node.x + 30, y: node.y + 30 });
    }
    // Duplicate edges between selected nodes
    const newEdges: CanvasEdge[] = [];
    for (const edge of canvasData.edges) {
      if (idMap.has(edge.fromNode) && idMap.has(edge.toNode)) {
        newEdges.push({
          ...edge,
          id: generateId(),
          fromNode: idMap.get(edge.fromNode)!,
          toNode: idMap.get(edge.toNode)!,
        });
      }
    }
    updateCanvas((prev) => ({
      nodes: [...prev.nodes, ...newNodes],
      edges: [...prev.edges, ...newEdges],
    }));
    setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
  }, [selectedNodeIds, canvasData, updateCanvas]);

  // ─── Color change ───
  const changeSelectedColor = useCallback(
    (color: string) => {
      if (contextMenu?.nodeId) {
        updateCanvas((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === contextMenu.nodeId ? { ...n, color: color || undefined } : n
          ),
        }));
      }
      setContextMenu(null);
    },
    [contextMenu, updateCanvas]
  );

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when editing text
      if (editingNodeId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (document.activeElement === document.body || document.activeElement === viewportRef.current) {
          e.preventDefault();
          deleteSelected();
        }
      }

      if (e.key === "Escape") {
        // If something is active, deselect it first
        if (selectedNodeIds.size > 0 || selectedEdgeId || editingNodeId || drawingEdge || isDrawing || contextMenu || activeTool !== "select") {
          setSelectedNodeIds(new Set());
          setSelectedEdgeId(null);
          setEditingNodeId(null);
          setContextMenu(null);
          setDrawingEdge(null);
          setActiveTool("select");
          setIsDrawing(false);
          setCurrentDrawPoints([]);
          drawPointsRef.current = [];
        } else if (onClose) {
          // Nothing selected — save and close
          onSave(serializeCanvas(canvasData));
          onClose();
        }
      }

      // Ctrl+A: select all
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        if (document.activeElement === document.body || document.activeElement === viewportRef.current) {
          e.preventDefault();
          setSelectedNodeIds(new Set(canvasData.nodes.map((n) => n.id)));
        }
      }

      // Ctrl+D: duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        if (selectedNodeIds.size > 0) {
          e.preventDefault();
          duplicateSelected();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingNodeId, deleteSelected, duplicateSelected, canvasData.nodes, selectedNodeIds]);

  // ─── Toolbar actions ───
  const addTextNode = useCallback((atX?: number, atY?: number) => {
    const cx = atX ?? (-panX + viewportSize.w / 2) / zoom;
    const cy = atY ?? (-panY + viewportSize.h / 2) / zoom;
    const node = createTextNode(cx - 130, cy - 80, "");
    updateCanvas((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedNodeIds(new Set([node.id]));
    setEditingNodeId(node.id);
    setActiveTool("select");
  }, [panX, panY, zoom, viewportSize, updateCanvas]);

  const addStickyNode = useCallback((atX?: number, atY?: number) => {
    const cx = atX ?? (-panX + viewportSize.w / 2) / zoom;
    const cy = atY ?? (-panY + viewportSize.h / 2) / zoom;
    const node = createStickyNode(cx - 100, cy - 100, "", "yellow");
    updateCanvas((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedNodeIds(new Set([node.id]));
    setEditingNodeId(node.id);
    setActiveTool("select");
  }, [panX, panY, zoom, viewportSize, updateCanvas]);

  /** Opens a file dialog to pick an image and creates an image node */
  const addImageNode = useCallback(async (atX?: number, atY?: number) => {
    if (!window.electronAPI) return;
    try {
      // Use Electron dialog to pick an image file
      const result = await window.electronAPI.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }],
      });
      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        const imagePath = result.filePaths[0];
        const cx = atX ?? (-panX + viewportSize.w / 2) / zoom;
        const cy = atY ?? (-panY + viewportSize.h / 2) / zoom;
        const node = createImageNode(cx - 150, cy - 120, imagePath);
        updateCanvas((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
        setSelectedNodeIds(new Set([node.id]));
      }
    } catch {
      // Silently fail if dialog not available
    }
    setActiveTool("select");
  }, [panX, panY, zoom, viewportSize, updateCanvas]);

  /** Change the color of a sticky note via context menu */
  const handleStickyColorChange = useCallback(
    (color: string) => {
      if (contextMenu?.nodeId) {
        updateCanvas((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === contextMenu.nodeId ? { ...n, color } : n
          ),
        }));
      }
      setContextMenu(null);
    },
    [contextMenu, updateCanvas]
  );

  const handleFilePickerSelect = useCallback(
    (selectedFilePath: string) => {
      const cx = (-panX + viewportSize.w / 2) / zoom;
      const cy = (-panY + viewportSize.h / 2) / zoom;
      const node = createFileNode(cx - 130, cy - 60, selectedFilePath);
      updateCanvas((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
      setSelectedNodeIds(new Set([node.id]));
      setShowFilePicker(false);
    },
    [panX, panY, zoom, viewportSize, updateCanvas]
  );

  const addGroupNode = useCallback(() => {
    const cx = (-panX + viewportSize.w / 2) / zoom;
    const cy = (-panY + viewportSize.h / 2) / zoom;
    const node = createGroupNode(cx - 200, cy - 150, 400, 300, "Group");
    updateCanvas((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedNodeIds(new Set([node.id]));
  }, [panX, panY, zoom, viewportSize, updateCanvas]);

  const zoomIn = useCallback(() => {
    const newZoom = Math.min(MAX_ZOOM, zoom + ZOOM_STEP);
    const cx = viewportSize.w / 2;
    const cy = viewportSize.h / 2;
    const scale = newZoom / zoom;
    setPanX(cx - (cx - panX) * scale);
    setPanY(cy - (cy - panY) * scale);
    setZoom(newZoom);
  }, [zoom, panX, panY, viewportSize]);

  const zoomOut = useCallback(() => {
    const newZoom = Math.max(MIN_ZOOM, zoom - ZOOM_STEP);
    const cx = viewportSize.w / 2;
    const cy = viewportSize.h / 2;
    const scale = newZoom / zoom;
    setPanX(cx - (cx - panX) * scale);
    setPanY(cy - (cy - panY) * scale);
    setZoom(newZoom);
  }, [zoom, panX, panY, viewportSize]);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const zoomToFit = useCallback(() => {
    if (canvasData.nodes.length === 0) {
      resetZoom();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of canvasData.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }

    const pad = 80;
    const worldW = maxX - minX + pad * 2;
    const worldH = maxY - minY + pad * 2;
    const fitZoom = Math.min(
      viewportSize.w / worldW,
      viewportSize.h / worldH,
      1.5
    );
    const fitPanX = (viewportSize.w - worldW * fitZoom) / 2 - (minX - pad) * fitZoom;
    const fitPanY = (viewportSize.h - worldH * fitZoom) / 2 - (minY - pad) * fitZoom;

    setZoom(fitZoom);
    setPanX(fitPanX);
    setPanY(fitPanY);
  }, [canvasData.nodes, viewportSize, resetZoom]);

  // ─── Drawing edge SVG ───
  const drawingEdgeSvg = useMemo(() => {
    if (!drawingEdge) return null;
    const fromNode = canvasData.nodes.find((n) => n.id === drawingEdge.fromNode);
    if (!fromNode) return null;
    const fromPt = getAnchorPoint(fromNode, drawingEdge.fromSide as "top" | "bottom" | "left" | "right");
    return (
      <line
        x1={fromPt.x}
        y1={fromPt.y}
        x2={drawingEdge.mouseX}
        y2={drawingEdge.mouseY}
        className="canvas-edge-drawing"
      />
    );
  }, [drawingEdge, canvasData.nodes]);

  // ─── Render ───

  // Sort nodes: groups first (background), then others, then drawings on top
  const sortedNodes = useMemo(() => {
    const groups = canvasData.nodes.filter((n) => n.type === "group");
    const others = canvasData.nodes.filter((n) => n.type !== "group" && n.type !== "drawing");
    const drawings = canvasData.nodes.filter((n) => n.type === "drawing");
    return [...groups, ...others, ...drawings];
  }, [canvasData.nodes]);

  const selectedNodeColor = useMemo(() => {
    if (contextMenu?.nodeId) {
      const node = canvasData.nodes.find((n) => n.id === contextMenu.nodeId);
      return node?.color || "";
    }
    return "";
  }, [contextMenu, canvasData.nodes]);

  const selectedNodeType = useMemo(() => {
    if (contextMenu?.nodeId) {
      const node = canvasData.nodes.find((n) => n.id === contextMenu.nodeId);
      return node?.type || "";
    }
    return "";
  }, [contextMenu, canvasData.nodes]);

  const bgPosX = panX % (24 * zoom);
  const bgPosY = panY % (24 * zoom);
  const bgSize = 24 * zoom;

  return (
    <div ref={containerRef} className="canvas-container">
      {/* Viewport */}
      <div
        ref={viewportRef}
        className={`canvas-viewport${isPanning ? " is-panning" : ""}${drawingEdge ? " is-connecting" : ""}${activeTool === "draw" ? " is-drawing" : ""}`}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onWheel={handleWheel}
        onContextMenu={handleViewportContextMenu}
        style={{
          backgroundPosition: `${bgPosX}px ${bgPosY}px`,
          backgroundSize: `${bgSize}px ${bgSize}px`,
        }}
        tabIndex={0}
      >
        {/* Transform layer */}
        <div
          className="canvas-transform"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          }}
        >
          {/* SVG edges layer */}
          <svg className="canvas-edges-svg">
            <EdgeMarkerDefs />
            {canvasData.edges.map((edge) => (
              <EdgeLine
                key={edge.id}
                edge={edge}
                nodes={canvasData.nodes}
                selected={selectedEdgeId === edge.id}
                onClick={handleEdgeClick}
              />
            ))}
            {drawingEdgeSvg}
          </svg>

          {/* Nodes */}
          {sortedNodes.map((node) => {
            const isSelected = selectedNodeIds.has(node.id);
            if (node.type === "text") {
              return (
                <TextNodeView
                  key={node.id}
                  node={node}
                  selected={isSelected}
                  editing={editingNodeId === node.id}
                  onPointerDown={handleNodePointerDown}
                  onDoubleClick={handleNodeDoubleClick}
                  onTextChange={handleTextChange}
                  onTextBlur={handleEditBlur}
                  onAnchorPointerDown={handleAnchorPointerDown}
                  onResizePointerDown={handleResizePointerDown}
                  onContextMenu={handleNodeContextMenu}
                />
              );
            }
            if (node.type === "file") {
              return (
                <FileNodeView
                  key={node.id}
                  node={node}
                  selected={isSelected}
                  preview={node.filePath ? filePreviews[node.filePath] || "" : ""}
                  onPointerDown={handleNodePointerDown}
                  onDoubleClick={handleNodeDoubleClick}
                  onAnchorPointerDown={handleAnchorPointerDown}
                  onResizePointerDown={handleResizePointerDown}
                  onContextMenu={handleNodeContextMenu}
                />
              );
            }
            if (node.type === "group") {
              return (
                <GroupNodeView
                  key={node.id}
                  node={node}
                  selected={isSelected}
                  editingLabel={editingNodeId === node.id}
                  onPointerDown={handleNodePointerDown}
                  onDoubleClick={handleNodeDoubleClick}
                  onLabelChange={handleLabelChange}
                  onLabelBlur={handleEditBlur}
                  onResizePointerDown={handleResizePointerDown}
                  onContextMenu={handleNodeContextMenu}
                />
              );
            }
            if (node.type === "sticky") {
              return (
                <StickyNoteView
                  key={node.id}
                  node={node}
                  selected={isSelected}
                  editing={editingNodeId === node.id}
                  onPointerDown={handleNodePointerDown}
                  onDoubleClick={handleNodeDoubleClick}
                  onTextChange={handleTextChange}
                  onTextBlur={handleEditBlur}
                  onAnchorPointerDown={handleAnchorPointerDown}
                  onResizePointerDown={handleResizePointerDown}
                  onContextMenu={handleNodeContextMenu}
                />
              );
            }
            if (node.type === "image") {
              return (
                <ImageNodeView
                  key={node.id}
                  node={node}
                  selected={isSelected}
                  onPointerDown={handleNodePointerDown}
                  onDoubleClick={handleNodeDoubleClick}
                  onAnchorPointerDown={handleAnchorPointerDown}
                  onResizePointerDown={handleResizePointerDown}
                  onContextMenu={handleNodeContextMenu}
                />
              );
            }
            if (node.type === "drawing") {
              return (
                <DrawingNodeView
                  key={node.id}
                  node={node}
                  selected={isSelected}
                  onPointerDown={handleNodePointerDown}
                  onContextMenu={handleNodeContextMenu}
                />
              );
            }
            return null;
          })}

          {/* Live freehand stroke (while drawing) */}
          {isDrawing && currentDrawPoints.length >= 2 && (
            <svg className="canvas-drawing-live-svg">
              <polyline
                points={currentDrawPoints.map(([px, py]) => `${px},${py}`).join(" ")}
                fill="none"
                stroke={drawStrokeColor}
                strokeWidth={drawStrokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="canvas-toolbar">
        {/* Select (pointer) tool */}
        <button
          className={`canvas-toolbar-btn${activeTool === "select" ? " active" : ""}`}
          onClick={() => setActiveTool("select")}
          title="Select (V)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 2l8 6-3.5.5L10 13l-2-1-2.5-4.5L3 10V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="canvas-toolbar-divider" />

        {/* Text node */}
        <button
          className={`canvas-toolbar-btn${activeTool === "text" ? " active" : ""}`}
          onClick={() => { setActiveTool("select"); addTextNode(); }}
          title="Add text node"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3h10M8 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {/* Sticky note */}
        <button
          className={`canvas-toolbar-btn${activeTool === "sticky" ? " active" : ""}`}
          onClick={() => { setActiveTool("select"); addStickyNode(); }}
          title="Add sticky note"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="rgba(249,226,175,0.3)" />
            <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        {/* Image */}
        <button
          className={`canvas-toolbar-btn${activeTool === "image" ? " active" : ""}`}
          onClick={() => { addImageNode(); }}
          title="Add image"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
            <path d="M1 11l4-3 3 2 3-4 4 5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </button>
        {/* File node */}
        <button
          className="canvas-toolbar-btn"
          onClick={() => setShowFilePicker(true)}
          title="Add file node"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        {/* Group */}
        <button
          className="canvas-toolbar-btn"
          onClick={addGroupNode}
          title="Add group"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 2" />
          </svg>
        </button>

        <div className="canvas-toolbar-divider" />

        {/* Draw (pencil) tool */}
        <button
          className={`canvas-toolbar-btn${activeTool === "draw" ? " active" : ""}`}
          onClick={() => setActiveTool(activeTool === "draw" ? "select" : "draw")}
          title="Draw (D)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2.5 13.5l1-4L11 2l2.5 2.5-7.5 7.5-4 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M9.5 3.5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        {/* Color picker for draw stroke */}
        {activeTool === "draw" && (
          <>
            <div className="canvas-toolbar-divider" />
            <div className="canvas-toolbar-color-group">
              {DRAW_STROKE_COLORS.map((c) => (
                <div
                  key={c}
                  className={`canvas-toolbar-color-dot${drawStrokeColor === c ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setDrawStrokeColor(c)}
                />
              ))}
            </div>
          </>
        )}

        <div className="canvas-toolbar-divider" />

        <button
          className="canvas-toolbar-btn"
          onClick={zoomOut}
          title="Zoom out"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5 7h4M11 11l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <span
          className="canvas-toolbar-zoom"
          onClick={resetZoom}
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="canvas-toolbar-btn"
          onClick={zoomIn}
          title="Zoom in"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5 7h4M7 5v4M11 11l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className="canvas-toolbar-btn"
          onClick={zoomToFit}
          title="Zoom to fit"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 6V3a1 1 0 011-1h3M10 2h3a1 1 0 011 1v3M14 10v3a1 1 0 01-1 1h-3M6 14H3a1 1 0 01-1-1v-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="canvas-toolbar-divider" />

        <button
          className="canvas-toolbar-btn"
          onClick={deleteSelected}
          disabled={selectedNodeIds.size === 0 && !selectedEdgeId}
          title="Delete selected"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Minimap */}
      <Minimap
        nodes={canvasData.nodes}
        panX={panX}
        panY={panY}
        zoom={zoom}
        viewportWidth={viewportSize.w}
        viewportHeight={viewportSize.h}
      />

      {/* Context menu */}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          nodeType={selectedNodeType}
          nodeColor={selectedNodeColor}
          onDelete={() => {
            deleteSelected();
            setContextMenu(null);
          }}
          onColorChange={changeSelectedColor}
          onStickyColorChange={handleStickyColorChange}
          onDuplicate={() => {
            duplicateSelected();
            setContextMenu(null);
          }}
          onAddTextNode={() => {
            const world = screenToWorld(contextMenu.x, contextMenu.y);
            addTextNode(world.x, world.y);
            setContextMenu(null);
          }}
          onAddStickyNote={() => {
            const world = screenToWorld(contextMenu.x, contextMenu.y);
            addStickyNode(world.x, world.y);
            setContextMenu(null);
          }}
          onAddImage={() => {
            const world = screenToWorld(contextMenu.x, contextMenu.y);
            addImageNode(world.x, world.y);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* File picker */}
      {showFilePicker && (
        <FilePicker
          vaultPath={vaultPath}
          onSelect={handleFilePickerSelect}
          onClose={() => setShowFilePicker(false)}
        />
      )}
    </div>
  );
}
