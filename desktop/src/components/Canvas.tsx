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
  CanvasEnd,
  CanvasSide,
  CANVAS_COLORS,
  arrowHeadPath,
  canvasBounds,
  canvasColorCss,
  canvasFileFor,
  cardsForFiles,
  createTextNode,
  createFileNode,
  createGroupNode,
  createLinkNode,
  createStickyNode,
  createImageNode,
  createDrawingNode,
  createEdge,
  edgeEnds,
  edgeGeometry,
  edgeSides,
  fileCardKind,
  headingSubpath,
  isHexColor,
  notesInFolder,
  pastedWebUrl,
  serializeCanvas,
  parseCanvas,
  getAnchorPoint,
  generateId,
  recalcEdgeSides,
  recalcEdgesFor,
  resolveCanvasFile,
  stickyBackground,
  STICKY_COLORS,
} from "@/lib/canvas-utils";
import { generateAttachmentName, getAttachmentsDir } from "@/lib/attachment-utils";
import { CardChrome, cardColor } from "@/components/canvas/CardChrome";
import { FileCard } from "@/components/canvas/FileCard";
import { LinkCard } from "@/components/canvas/LinkCard";
import { AddressPrompt, FolderPicker, HeadingMenu } from "@/components/canvas/Pickers";
import { useObjectUrl, useSeen } from "@/components/canvas/media";
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
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

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

/** Render a single edge as SVG path */
function EdgeLine({
  edge,
  nodes,
  selected,
  hideLabel,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  edge: CanvasEdge;
  nodes: CanvasNode[];
  selected: boolean;
  /** While the label is being typed, the box it is typed in stands in its place. */
  hideLabel: boolean;
  onClick: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}) {
  const fromNode = nodes.find((n) => n.id === edge.fromNode);
  const toNode = nodes.find((n) => n.id === edge.toNode);
  if (!fromNode || !toNode) return null;

  const sides = edgeSides(edge, fromNode, toNode);
  const { path, from, to, middle } = edgeGeometry(fromNode, toNode, sides.from, sides.to);
  const ends = edgeEnds(edge);
  const color = canvasColorCss(edge.color);
  const headClass = `canvas-edge-arrowhead${selected ? " selected" : ""}`;
  const headStyle = color ? { fill: color } : undefined;

  return (
    // The handlers are on the group: the line itself lies over the wider path
    // and takes the clicks that land exactly on it.
    <g
      className="canvas-edge"
      onClick={(e) => onClick(edge.id, e)}
      onDoubleClick={() => onDoubleClick(edge.id)}
      onContextMenu={(e) => onContextMenu(edge.id, e)}
    >
      {/* Invisible wider path for easier click */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
      />
      <path
        d={path}
        className={`canvas-edge-line${selected ? " selected" : ""}`}
        style={color ? { stroke: color } : undefined}
      />
      {/* Drawn as shapes of their own so that they take the edge's colour */}
      {ends.to === "arrow" && <path d={arrowHeadPath(to, sides.to)} className={headClass} style={headStyle} />}
      {ends.from === "arrow" && <path d={arrowHeadPath(from, sides.from)} className={headClass} style={headStyle} />}
      {edge.label && !hideLabel && (
        <text x={middle.x} y={middle.y} className="canvas-edge-label">
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

  const color = cardColor(node.color);

  return (
    <div
      className={`canvas-node canvas-node-text${selected ? " selected" : ""}`}
      data-color={color.name}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        ...color.style,
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

/** Group node */
function GroupNodeView({
  node,
  selected,
  editingLabel,
  vaultPath,
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
  vaultPath: string;
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

  const color = cardColor(node.color);
  // A background picture, as a canvas made in Obsidian can give a group.
  const groupRef = useRef<HTMLDivElement>(null);
  const seen = useSeen(groupRef);
  const background = useObjectUrl(
    node.background ? resolveCanvasFile(node.background, vaultPath) : null,
    seen
  ).url;
  const backgroundStyle: React.CSSProperties = background
    ? {
        backgroundImage: `url("${background}")`,
        backgroundPosition: "center",
        backgroundRepeat: node.backgroundStyle === "repeat" ? "repeat" : "no-repeat",
        backgroundSize:
          node.backgroundStyle === "repeat" ? "auto" : node.backgroundStyle === "ratio" ? "contain" : "cover",
      }
    : {};

  return (
    <div
      ref={groupRef}
      className={`canvas-node canvas-node-group${selected ? " selected" : ""}`}
      data-color={color.name}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        ...(background ? { borderColor: color.style.borderColor } : color.style),
        ...backgroundStyle,
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
        background: stickyBackground(node.color),
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
  vaultPath,
  onPointerDown,
  onDoubleClick,
  onAnchorPointerDown,
  onResizePointerDown,
  onContextMenu,
}: {
  node: CanvasNode;
  selected: boolean;
  vaultPath: string;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onDoubleClick: (id: string) => void;
  onAnchorPointerDown: (nodeId: string, side: string, e: React.PointerEvent) => void;
  onResizePointerDown: (nodeId: string, corner: string, e: React.PointerEvent) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}) {
  // file:// is blocked in the Tauri/WebKitGTK webview, so the bytes are read
  // through the app. The picture is read once the card has been on screen, and
  // its object URL is released when the card goes away.
  const cardRef = useRef<HTMLDivElement>(null);
  const seen = useSeen(cardRef);
  const imageSrc = useObjectUrl(resolveCanvasFile(node.file, vaultPath), seen).url;
  const color = cardColor(node.color);

  return (
    <div
      ref={cardRef}
      className={`canvas-node canvas-node-image${selected ? " selected" : ""}`}
      data-color={color.name}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        ...color.style,
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
      <CardChrome
        node={node}
        selected={selected}
        onAnchorPointerDown={onAnchorPointerDown}
        onResizePointerDown={onResizePointerDown}
      />
    </div>
  );
}

/** A card of a kind this version does not know. It keeps its place; what it holds is not shown. */
function UnknownNodeView({
  node,
  selected,
  onPointerDown,
  onAnchorPointerDown,
  onResizePointerDown,
  onContextMenu,
}: {
  node: CanvasNode;
  selected: boolean;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onAnchorPointerDown: (nodeId: string, side: string, e: React.PointerEvent) => void;
  onResizePointerDown: (nodeId: string, corner: string, e: React.PointerEvent) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}) {
  const kind = typeof node.extra?.type === "string" ? node.extra.type : "";
  return (
    <div
      className={`canvas-node canvas-node-unknown${selected ? " selected" : ""}`}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onPointerDown={(e) => onPointerDown(node.id, e)}
      onContextMenu={(e) => onContextMenu(node.id, e)}
    >
      <div className="canvas-card-status">
        {kind ? `A “${kind}” card, which this version cannot show` : "A card this version cannot show"}
      </div>
      <CardChrome
        node={node}
        selected={selected}
        onAnchorPointerDown={onAnchorPointerDown}
        onResizePointerDown={onResizePointerDown}
      />
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
  /** Called with the chosen file's path from the top of the vault. */
  onSelect: (file: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    async function loadFiles() {
      if (!window.electronAPI) return;
      // Every file, so that pictures, PDFs and recordings can be added as cards too.
      const all = await window.electronAPI.listVaultFiles(vaultPath);
      setFiles(all);
    }
    loadFiles();
  }, [vaultPath]);

  const filtered = useMemo(() => {
    if (!query) return files;
    const q = query.toLowerCase();
    return files.filter((f) => f.toLowerCase().includes(q));
  }, [files, query]);
  const active = Math.min(selectedIndex, Math.max(filtered.length - 1, 0));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(Math.min(active + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(Math.max(active - 1, 0));
    } else if (e.key === "Enter" && filtered[active]) {
      e.preventDefault();
      onSelect(filtered[active]);
    } else if (e.key === "Escape") {
      // Kept from the canvas's own Escape handler, which would close the canvas.
      e.stopPropagation();
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
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
          />
        </div>
        <div className="canvas-file-picker-list">
          {filtered.slice(0, 50).map((f, i) => (
            <button
              key={f}
              className={`canvas-file-picker-item${i === active ? " active" : ""}`}
              onClick={() => onSelect(f)}
            >
              <span>{(f.split("/").pop() || f).replace(/\.(md|markdown)$/i, "")}</span>
              <span className="file-path">{f}</span>
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

/** The row of colours in a menu: none, the six presets, and one of the user's own. */
function ColorRow({
  current,
  onPick,
  onPickOwn,
}: {
  current: string;
  onPick: (color: string) => void;
  /** A colour from the colour chooser. It is applied as it is chosen, so the menu stays open. */
  onPickOwn: (color: string) => void;
}) {
  return (
    <>
      <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--text-muted)" }}>
        Color
      </div>
      <div className="canvas-context-submenu">
        <div
          className={`canvas-color-dot${current === "" ? " active" : ""}`}
          style={{ background: "var(--bg-hover)" }}
          title="No color"
          onClick={() => onPick("")}
        />
        {CANVAS_COLORS.map((c) => (
          <div
            key={c.preset}
            className={`canvas-color-dot${current === c.preset ? " active" : ""}`}
            style={{ background: c.hex }}
            title={c.name}
            onClick={() => onPick(c.preset)}
          />
        ))}
        <label
          className={`canvas-color-dot canvas-color-own${isHexColor(current) ? " active" : ""}`}
          style={isHexColor(current) ? { background: current } : undefined}
          title="Another color"
        >
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#888888"}
            onChange={(e) => onPickOwn(e.target.value)}
          />
        </label>
      </div>
    </>
  );
}

/** What a right-click landed on, which decides what the menu offers. */
type MenuTarget =
  | { kind: "canvas" }
  | { kind: "node"; node: CanvasNode }
  | { kind: "edge"; edge: CanvasEdge };

interface MenuActions {
  onDelete: () => void;
  onDuplicate: () => void;
  onColorChange: (color: string, keepOpen?: boolean) => void;
  onStickyColorChange: (color: string) => void;
  onAddTextNode: () => void;
  onAddStickyNote: () => void;
  onAddImage: () => void;
  onAddWebPage: () => void;
  onAddFolder: () => void;
  onOpen: () => void;
  onCopyAddress: () => void;
  onChangeAddress: () => void;
  onShowWholeNote: () => void;
  onEditLabel: () => void;
  onRemoveLabel: () => void;
  onEdgeEnds: (from: CanvasEnd, to: CanvasEnd) => void;
  onClose: () => void;
}

/** Context menu */
function CanvasContextMenu({
  x,
  y,
  target,
  actions,
}: {
  x: number;
  y: number;
  target: MenuTarget;
  actions: MenuActions;
}) {
  const { onClose } = actions;
  useEffect(() => {
    const handleClick = () => onClose();
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [onClose]);

  const node = target.kind === "node" ? target.node : null;
  const edge = target.kind === "edge" ? target.edge : null;
  const ends = edge ? edgeEnds(edge) : null;
  const endChoices: { label: string; from: CanvasEnd; to: CanvasEnd }[] = [
    { label: "No Arrows", from: "none", to: "none" },
    { label: "One Arrow", from: "none", to: "arrow" },
    { label: "Arrows at Both Ends", from: "arrow", to: "arrow" },
  ];

  return (
    <div className="canvas-context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      {node && (
        <>
          {node.type === "link" && (
            <>
              <button className="canvas-context-item" onClick={actions.onOpen}>
                Open in Browser
              </button>
              <button className="canvas-context-item" onClick={actions.onCopyAddress}>
                Copy Address
              </button>
              <button className="canvas-context-item" onClick={actions.onChangeAddress}>
                Change Address...
              </button>
              <div className="canvas-context-divider" />
            </>
          )}
          {node.type === "file" && (
            <>
              <button className="canvas-context-item" onClick={actions.onOpen}>
                Open
              </button>
              {node.subpath && fileCardKind(node.file || "") === "note" && (
                <button className="canvas-context-item" onClick={actions.onShowWholeNote}>
                  Show Whole Note
                </button>
              )}
              <div className="canvas-context-divider" />
            </>
          )}
          <button className="canvas-context-item" onClick={actions.onDuplicate}>
            Duplicate
          </button>
          <div className="canvas-context-divider" />
          {/* Show sticky-specific color picker for sticky nodes */}
          {node.type === "sticky" ? (
            <>
              <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--text-muted)" }}>
                Sticky Color
              </div>
              <div className="canvas-context-submenu">
                {Object.entries(STICKY_COLORS).map(([name, hex]) => (
                  <div
                    key={name}
                    className={`canvas-sticky-color-dot${node.color === name ? " active" : ""}`}
                    style={{ background: hex }}
                    onClick={() => actions.onStickyColorChange(name)}
                  />
                ))}
              </div>
            </>
          ) : node.type !== "drawing" && node.type !== "unknown" ? (
            <ColorRow
              current={node.color || ""}
              onPick={(color) => actions.onColorChange(color)}
              onPickOwn={(color) => actions.onColorChange(color, true)}
            />
          ) : null}
          <div className="canvas-context-divider" />
          <button className="canvas-context-item danger" onClick={actions.onDelete}>
            Delete
          </button>
        </>
      )}
      {edge && ends && (
        <>
          <button className="canvas-context-item" onClick={actions.onEditLabel}>
            {edge.label ? "Edit Label" : "Add Label"}
          </button>
          {edge.label && (
            <button className="canvas-context-item" onClick={actions.onRemoveLabel}>
              Remove Label
            </button>
          )}
          <div className="canvas-context-divider" />
          {endChoices.map((choice) => (
            <button
              key={choice.label}
              className={`canvas-context-item${ends.from === choice.from && ends.to === choice.to ? " active" : ""}`}
              onClick={() => actions.onEdgeEnds(choice.from, choice.to)}
            >
              {choice.label}
            </button>
          ))}
          <div className="canvas-context-divider" />
          <ColorRow
            current={edge.color || ""}
            onPick={(color) => actions.onColorChange(color)}
            onPickOwn={(color) => actions.onColorChange(color, true)}
          />
          <div className="canvas-context-divider" />
          <button className="canvas-context-item danger" onClick={actions.onDelete}>
            Delete
          </button>
        </>
      )}
      {target.kind === "canvas" && (
        <>
          <button className="canvas-context-item" onClick={actions.onAddTextNode}>
            Add Text Node
          </button>
          <button className="canvas-context-item" onClick={actions.onAddStickyNote}>
            Add Sticky Note
          </button>
          <button className="canvas-context-item" onClick={actions.onAddImage}>
            Add Image
          </button>
          <button className="canvas-context-item" onClick={actions.onAddWebPage}>
            Add Web Page
          </button>
          <button className="canvas-context-item" onClick={actions.onAddFolder}>
            Add Notes from a Folder
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
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  // Asking for a web address: for a new card (and where to put it), or to change the address of one.
  const [addressPrompt, setAddressPrompt] = useState<{ nodeId: string | null; at?: { x: number; y: number } } | null>(null);
  // The list of a note's headings, opened from a note card.
  const [headingMenu, setHeadingMenu] = useState<{ nodeId: string; x: number; y: number; headings: string[] } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null; edgeId?: string } | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  // A short message about what was just done, such as how many cards were added.
  const [notice, setNotice] = useState<string | null>(null);
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
  // True while there is a change that has not been written yet. Looking at a
  // canvas must not rewrite its file.
  const dirtyRef = useRef(false);
  // Where the pointer last was over the canvas, so a pasted address lands there.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  // One-shot guard so we auto "zoom to fit" only on the initial open of a
  // canvas, not on every edit. Reset when the opened file changes.
  const didFitRef = useRef(false);
  // The viewport's size once it has been measured for real (not the initial
  // default size) — fitting before this frames for the wrong dimensions.
  const measuredRef = useRef<{ w: number; h: number } | null>(null);
  // The canvas as it was read from the file, which is what the first fit frames.
  const loadedDataRef = useRef<CanvasData | null>(null);

  // ─── Load canvas data ───
  useEffect(() => {
    loadedRef.current = false;
    didFitRef.current = false;
    dirtyRef.current = false;
    async function load() {
      if (!window.electronAPI) return;
      const content = await window.electronAPI.readFile(filePath);
      const data: CanvasData = content !== null ? parseCanvas(content, vaultPath) : { nodes: [], edges: [] };
      setCanvasData(data);
      loadedDataRef.current = data;
      loadedRef.current = true;
    }
    load();
    setSelectedNodeIds(new Set());
    setSelectedEdgeId(null);
    setEditingNodeId(null);
  }, [filePath, vaultPath]);

  // ─── Observe viewport size ───
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) measuredRef.current = { w: width, h: height };
        setViewportSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Debounced save ───
  const scheduleSave = useCallback(
    (data: CanvasData) => {
      if (!loadedRef.current) return;
      dirtyRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        dirtyRef.current = false;
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
      setEditingEdgeId(null);
      setHeadingMenu(null);
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [panX, panY, activeTool, screenToWorld]
  );

  const handleViewportPointerMove = useCallback(
    (e: React.PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };

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
        const drag = nodeDragRef.current;
        nodeDragRef.current = null;
        // The cards that ended up somewhere else. A plain click moves nothing,
        // and must not count as a change to the canvas.
        const moved = new Set<string>();
        if (drag) {
          for (const n of canvasData.nodes) {
            const start = drag.nodePositions.get(n.id);
            if (start && (start.x !== n.x || start.y !== n.y)) moved.add(n.id);
          }
        }
        if (moved.size > 0) {
          // Recalculate the sides of the edges on the cards that moved
          updateCanvas((prev) => ({
            ...prev,
            edges: recalcEdgesFor(prev.edges, prev.nodes, moved),
          }));
        }
      }

      if (drawingEdge) {
        // Find node under cursor
        const world = screenToWorld(e.clientX, e.clientY);
        const under = (n: CanvasNode) =>
          n.id !== drawingEdge.fromNode &&
          world.x >= n.x &&
          world.x <= n.x + n.width &&
          world.y >= n.y &&
          world.y <= n.y + n.height;
        // A card inside a group is what was aimed at, not the group around it.
        const targetNode =
          canvasData.nodes.find((n) => n.type !== "group" && under(n)) ??
          canvasData.nodes.find((n) => n.type === "group" && under(n));
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
              const fromSide = drawingEdge.fromSide as CanvasSide;
              // Determine best toSide
              const opposite: Record<string, string> = { top: "bottom", bottom: "top", left: "right", right: "left" };
              const toSide = (opposite[fromSide] || "left") as CanvasSide;
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
        const node = canvasData.nodes.find((n) => n.id === resizing.nodeId);
        const changed =
          node &&
          (node.x !== resizing.origX || node.y !== resizing.origY ||
            node.width !== resizing.origW || node.height !== resizing.origH);
        if (changed) {
          // Recalculate the sides of the edges on the card that was resized
          updateCanvas((prev) => ({
            ...prev,
            edges: recalcEdgesFor(prev.edges, prev.nodes, new Set([resizing.nodeId])),
          }));
        }
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

  /** Open what a card points at: its file in the app, or its web page in the browser. */
  const openCard = useCallback(
    (nodeId: string) => {
      const node = canvasData.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (node.type === "link") {
        // The app's opener takes http and https addresses and nothing else.
        if (node.url && /^https?:\/\//i.test(node.url)) window.electronAPI?.openExternal(node.url);
        return;
      }
      const path = resolveCanvasFile(node.file, vaultPath);
      if (path) onFileSelect(path);
    },
    [canvasData.nodes, vaultPath, onFileSelect]
  );

  /**
   * The path a picked image is kept under. A canvas only holds paths inside
   * the vault, so that it still works on another machine; an image from
   * elsewhere is first copied into the vault's attachment folder. null when
   * that copy could not be made.
   */
  const imageInVault = useCallback(
    async (picked: string): Promise<string | null> => {
      const inside = canvasFileFor(picked, vaultPath);
      if (inside) return inside;
      const name = picked.split(/[\\/]/).pop() || "image";
      const copy = `${getAttachmentsDir(vaultPath)}/${generateAttachmentName(name)}`;
      const copied = await window.electronAPI.copyFile(picked, copy);
      return copied ? canvasFileFor(copy, vaultPath) : null;
    },
    [vaultPath]
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      const node = canvasData.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      if (node.type === "text" || node.type === "group" || node.type === "sticky") {
        setEditingNodeId(nodeId);
      } else if (node.type === "file" || node.type === "link") {
        openCard(nodeId);
      } else if (node.type === "image") {
        // Double-click image to change it via file dialog
        (async () => {
          if (!window.electronAPI) return;
          try {
            const result = await window.electronAPI.showOpenDialog({
              properties: ["openFile"],
              filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
            });
            if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
              const file = await imageInVault(result.filePaths[0]);
              if (!file) {
                setNotice("The image could not be copied into the vault.");
                return;
              }
              updateCanvas((prev) => ({
                ...prev,
                nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, file } : n)),
              }));
            }
          } catch {
            // Silently fail if dialog not available
          }
        })();
      }
    },
    [canvasData.nodes, openCard, imageInVault, updateCanvas]
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

  /** Double-click an edge to type its label. */
  const handleEdgeDoubleClick = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeIds(new Set());
    setEditingEdgeId(edgeId);
  }, []);

  const handleEdgeContextMenu = useCallback((edgeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedEdgeId(edgeId);
    setSelectedNodeIds(new Set());
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: null, edgeId });
  }, []);

  const updateEdge = useCallback(
    (edgeId: string, change: (edge: CanvasEdge) => CanvasEdge) => {
      updateCanvas((prev) => ({
        ...prev,
        edges: prev.edges.map((edge) => (edge.id === edgeId ? change(edge) : edge)),
      }));
    },
    [updateCanvas]
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
      ...prev,
      nodes: [...prev.nodes, ...newNodes],
      edges: [...prev.edges, ...newEdges],
    }));
    setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
  }, [selectedNodeIds, canvasData, updateCanvas]);

  // ─── Color change ───
  const changeSelectedColor = useCallback(
    (color: string, keepOpen?: boolean) => {
      if (contextMenu?.edgeId) {
        updateCanvas((prev) => ({
          ...prev,
          edges: prev.edges.map((edge) =>
            edge.id === contextMenu.edgeId ? { ...edge, color: color || undefined } : edge
          ),
        }));
      } else if (contextMenu?.nodeId) {
        updateCanvas((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === contextMenu.nodeId ? { ...n, color: color || undefined } : n
          ),
        }));
      }
      // The colour chooser reports each colour tried; the menu waits for the last.
      if (!keepOpen) setContextMenu(null);
    },
    [contextMenu, updateCanvas]
  );

  const overlayOpen = showFilePicker || showFolderPicker || addressPrompt !== null || headingMenu !== null;

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when editing text
      if (editingNodeId || editingEdgeId) return;
      // A dialog over the canvas has the keyboard: Escape closes it, not the canvas.
      if (overlayOpen) return;

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
          // Nothing selected — save what has not been written yet, and close
          if (dirtyRef.current) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            dirtyRef.current = false;
            onSave(serializeCanvas(canvasData));
          }
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
  }, [
    editingNodeId, editingEdgeId, overlayOpen, deleteSelected, duplicateSelected, canvasData,
    selectedNodeIds, selectedEdgeId, drawingEdge, isDrawing, contextMenu, activeTool, onClose, onSave,
  ]);

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
        filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
      });
      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        const file = await imageInVault(result.filePaths[0]);
        if (!file) {
          setNotice("The image could not be copied into the vault.");
        } else {
          const cx = atX ?? (-panX + viewportSize.w / 2) / zoom;
          const cy = atY ?? (-panY + viewportSize.h / 2) / zoom;
          const node = createImageNode(cx - 150, cy - 120, file);
          updateCanvas((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
          setSelectedNodeIds(new Set([node.id]));
        }
      }
    } catch {
      // Silently fail if dialog not available
    }
    setActiveTool("select");
  }, [panX, panY, zoom, viewportSize, updateCanvas, imageInVault]);

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
    (file: string) => {
      const cx = (-panX + viewportSize.w / 2) / zoom;
      const cy = (-panY + viewportSize.h / 2) / zoom;
      const card = createFileNode(0, 0, file);
      const node = { ...card, x: cx - card.width / 2, y: cy - card.height / 2 };
      updateCanvas((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
      setSelectedNodeIds(new Set([node.id]));
      setShowFilePicker(false);
    },
    [panX, panY, zoom, viewportSize, updateCanvas]
  );

  /** Add a web page card, in the middle of the view unless a place is given. */
  const addLinkNode = useCallback(
    (url: string, at?: { x: number; y: number }) => {
      const cx = at?.x ?? (-panX + viewportSize.w / 2) / zoom;
      const cy = at?.y ?? (-panY + viewportSize.h / 2) / zoom;
      const card = createLinkNode(0, 0, url);
      const node = { ...card, x: cx - card.width / 2, y: cy - card.height / 2 };
      updateCanvas((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
      setSelectedNodeIds(new Set([node.id]));
      setSelectedEdgeId(null);
    },
    [panX, panY, zoom, viewportSize, updateCanvas]
  );

  /** The address typed into the prompt: a new card, or a new address for the card it was opened from. */
  const handleAddressSubmit = useCallback(
    (url: string) => {
      if (!addressPrompt) return;
      const { nodeId, at } = addressPrompt;
      if (nodeId) {
        updateCanvas((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, url } : n)),
        }));
      } else {
        addLinkNode(url, at);
      }
      setAddressPrompt(null);
    },
    [addressPrompt, addLinkNode, updateCanvas]
  );

  /** Show the whole note on a card, or only what is under one of its headings. */
  const handleHeadingPick = useCallback(
    (heading: string | null) => {
      if (!headingMenu) return;
      const { nodeId } = headingMenu;
      const subpath = heading === null ? undefined : headingSubpath(heading);
      updateCanvas((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, subpath } : n)),
      }));
      setHeadingMenu(null);
    },
    [headingMenu, updateCanvas]
  );

  const handleHeadingMenu = useCallback(
    (nodeId: string, at: { x: number; y: number }, headings: string[]) => {
      setContextMenu(null);
      // A second press on the same card's button closes the list again.
      setHeadingMenu((open) => (open?.nodeId === nodeId ? null : { nodeId, x: at.x, y: at.y, headings }));
    },
    []
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

  /** Zoom and pan so that all of the given cards are in view. */
  const fitNodes = useCallback((nodes: CanvasNode[]) => {
    const bounds = canvasBounds(nodes);
    if (!bounds) {
      resetZoom();
      return;
    }
    const { minX, minY, maxX, maxY } = bounds;

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
  }, [viewportSize, resetZoom]);

  const zoomToFit = useCallback(() => fitNodes(canvasData.nodes), [fitNodes, canvasData.nodes]);

  /** Add a card for each note in a folder, beside what is already on the canvas. */
  const handleFolderSelect = useCallback(
    (folder: string, files: string[]) => {
      setShowFolderPicker(false);
      const notes = notesInFolder(files, folder);
      const centre = {
        x: (-panX + viewportSize.w / 2) / zoom,
        y: (-panY + viewportSize.h / 2) / zoom,
      };
      const { added, skipped } = cardsForFiles(canvasData.nodes, notes, centre);
      const already =
        skipped === 0 ? "" : skipped === 1 ? " 1 was already on the canvas." : ` ${skipped} were already on the canvas.`;
      if (added.length === 0) {
        setNotice(notes.length === 0 ? "That folder has no notes." : `No notes added.${already}`);
        return;
      }
      updateCanvas((prev) => ({ ...prev, nodes: [...prev.nodes, ...added] }));
      setSelectedNodeIds(new Set(added.map((n) => n.id)));
      setSelectedEdgeId(null);
      // Bring the new cards into view, along with the rest.
      fitNodes([...canvasData.nodes, ...added]);
      setNotice(`Added ${added.length} ${added.length === 1 ? "note" : "notes"}.${already}`);
    },
    [panX, panY, zoom, viewportSize, canvasData.nodes, updateCanvas, fitNodes]
  );

  // ─── Paste a web address to make a card of it ───
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (editingNodeId || editingEdgeId || overlayOpen) return;
      // Text pasted into a field anywhere in the app is that field's.
      const focused = document.activeElement as HTMLElement | null;
      if (focused && (focused.tagName === "INPUT" || focused.tagName === "TEXTAREA" || focused.isContentEditable)) return;
      if (focused && focused !== document.body && !containerRef.current?.contains(focused)) return;
      const url = pastedWebUrl(e.clipboardData?.getData("text/plain") ?? "");
      if (!url) return;
      e.preventDefault();
      const pointer = lastPointerRef.current;
      addLinkNode(url, pointer ? screenToWorld(pointer.x, pointer.y) : undefined);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [editingNodeId, editingEdgeId, overlayOpen, addLinkNode, screenToWorld]);

  // ─── Clear a notice after a few seconds ───
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // On first open, frame the whole canvas (zoom to fit) once the file has
  // loaded and the viewport has been measured — instead of the fixed 1:1 / 0,0
  // default. Runs a single time per opened file (guarded by didFitRef).
  useEffect(() => {
    // Wait for both the file to load AND the viewport to be measured for real,
    // otherwise zoomToFit frames for the default 800x600 and nodes land off-screen.
    const measured = measuredRef.current;
    if (didFitRef.current || !loadedRef.current || !measured) return;
    if (viewportSize.w <= 0 || viewportSize.h <= 0) return;
    // This can run late, for a render made before the file or the size had
    // arrived, and would then frame an empty canvas or the default size. Fit
    // only when what this render holds is the file and the measured size.
    if (canvasData !== loadedDataRef.current) return;
    if (viewportSize.w !== measured.w || viewportSize.h !== measured.h) return;
    didFitRef.current = true;
    zoomToFit();
  }, [canvasData, viewportSize, zoomToFit]);

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

  const menuTarget = useMemo<MenuTarget | null>(() => {
    if (!contextMenu) return null;
    if (contextMenu.edgeId) {
      const edge = canvasData.edges.find((e) => e.id === contextMenu.edgeId);
      return edge ? { kind: "edge", edge } : null;
    }
    if (contextMenu.nodeId) {
      const node = canvasData.nodes.find((n) => n.id === contextMenu.nodeId);
      return node ? { kind: "node", node } : null;
    }
    return { kind: "canvas" };
  }, [contextMenu, canvasData]);

  // The edge whose label is being typed, and where on the canvas its label sits.
  const labelEditor = useMemo(() => {
    const edge = canvasData.edges.find((e) => e.id === editingEdgeId);
    const from = edge && canvasData.nodes.find((n) => n.id === edge.fromNode);
    const to = edge && canvasData.nodes.find((n) => n.id === edge.toNode);
    if (!edge || !from || !to) return null;
    const sides = edgeSides(edge, from, to);
    return { edge, at: edgeGeometry(from, to, sides.from, sides.to).middle };
  }, [editingEdgeId, canvasData]);

  const headingMenuNode = headingMenu ? canvasData.nodes.find((n) => n.id === headingMenu.nodeId) : undefined;

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
            {canvasData.edges.map((edge) => (
              <EdgeLine
                key={edge.id}
                edge={edge}
                nodes={canvasData.nodes}
                selected={selectedEdgeId === edge.id}
                hideLabel={editingEdgeId === edge.id}
                onClick={handleEdgeClick}
                onDoubleClick={handleEdgeDoubleClick}
                onContextMenu={handleEdgeContextMenu}
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
                <FileCard
                  key={node.id}
                  node={node}
                  selected={isSelected}
                  vaultPath={vaultPath}
                  onOpen={openCard}
                  onHeadingMenu={handleHeadingMenu}
                  onPointerDown={handleNodePointerDown}
                  onDoubleClick={handleNodeDoubleClick}
                  onAnchorPointerDown={handleAnchorPointerDown}
                  onResizePointerDown={handleResizePointerDown}
                  onContextMenu={handleNodeContextMenu}
                />
              );
            }
            if (node.type === "link") {
              return (
                <LinkCard
                  key={node.id}
                  node={node}
                  selected={isSelected}
                  onOpen={() => openCard(node.id)}
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
                  vaultPath={vaultPath}
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
                  vaultPath={vaultPath}
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
            if (node.type === "unknown") {
              return (
                <UnknownNodeView
                  key={node.id}
                  node={node}
                  selected={isSelected}
                  onPointerDown={handleNodePointerDown}
                  onAnchorPointerDown={handleAnchorPointerDown}
                  onResizePointerDown={handleResizePointerDown}
                  onContextMenu={handleNodeContextMenu}
                />
              );
            }
            return null;
          })}

          {/* The box an edge's label is typed in, where the label sits */}
          {labelEditor && (
            <input
              className="canvas-edge-label-input"
              style={{ left: labelEditor.at.x, top: labelEditor.at.y }}
              autoFocus
              value={labelEditor.edge.label || ""}
              placeholder="Label"
              onChange={(e) => {
                const label = e.target.value || undefined;
                updateEdge(labelEditor.edge.id, (edge) => ({ ...edge, label }));
              }}
              onBlur={() => setEditingEdgeId(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.stopPropagation();
                  setEditingEdgeId(null);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
          )}

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
        {/* Web page */}
        <button
          className="canvas-toolbar-btn"
          onClick={() => setAddressPrompt({ nodeId: null })}
          title="Add web page"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1.8 8h12.4M8 1.8c2 2.2 2 10.2 0 12.4M8 1.8c-2 2.2-2 10.2 0 12.4" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        {/* A card for each note in a folder */}
        <button
          className="canvas-toolbar-btn"
          onClick={() => setShowFolderPicker(true)}
          title="Add notes from a folder"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M1.5 4a1 1 0 011-1h3l1.5 1.5h6.5a1 1 0 011 1V12a1 1 0 01-1 1h-11a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M8 7v3.5M6.25 8.75h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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
      {contextMenu && menuTarget && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          target={menuTarget}
          actions={{
            onDelete: () => {
              deleteSelected();
              setContextMenu(null);
            },
            onColorChange: changeSelectedColor,
            onStickyColorChange: handleStickyColorChange,
            onDuplicate: () => {
              duplicateSelected();
              setContextMenu(null);
            },
            onAddTextNode: () => {
              const world = screenToWorld(contextMenu.x, contextMenu.y);
              addTextNode(world.x, world.y);
              setContextMenu(null);
            },
            onAddStickyNote: () => {
              const world = screenToWorld(contextMenu.x, contextMenu.y);
              addStickyNode(world.x, world.y);
              setContextMenu(null);
            },
            onAddImage: () => {
              const world = screenToWorld(contextMenu.x, contextMenu.y);
              addImageNode(world.x, world.y);
              setContextMenu(null);
            },
            onAddWebPage: () => {
              setAddressPrompt({ nodeId: null, at: screenToWorld(contextMenu.x, contextMenu.y) });
              setContextMenu(null);
            },
            onAddFolder: () => {
              setShowFolderPicker(true);
              setContextMenu(null);
            },
            onOpen: () => {
              if (contextMenu.nodeId) openCard(contextMenu.nodeId);
              setContextMenu(null);
            },
            onCopyAddress: () => {
              const url = menuTarget.kind === "node" ? menuTarget.node.url : undefined;
              if (url) navigator.clipboard?.writeText(url).catch(() => {});
              setContextMenu(null);
            },
            onChangeAddress: () => {
              setAddressPrompt({ nodeId: contextMenu.nodeId });
              setContextMenu(null);
            },
            onShowWholeNote: () => {
              const { nodeId } = contextMenu;
              updateCanvas((prev) => ({
                ...prev,
                nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, subpath: undefined } : n)),
              }));
              setContextMenu(null);
            },
            onEditLabel: () => {
              if (contextMenu.edgeId) setEditingEdgeId(contextMenu.edgeId);
              setContextMenu(null);
            },
            onRemoveLabel: () => {
              if (contextMenu.edgeId) updateEdge(contextMenu.edgeId, (edge) => ({ ...edge, label: undefined }));
              setContextMenu(null);
            },
            onEdgeEnds: (from, to) => {
              // Only what differs from the file format's own default is kept on the edge.
              if (contextMenu.edgeId) {
                updateEdge(contextMenu.edgeId, (edge) => ({
                  ...edge,
                  fromEnd: from === "arrow" ? "arrow" : undefined,
                  toEnd: to === "none" ? "none" : undefined,
                }));
              }
              setContextMenu(null);
            },
            onClose: () => setContextMenu(null),
          }}
        />
      )}

      {/* The headings of a note card's note */}
      {headingMenu && (
        <HeadingMenu
          x={headingMenu.x}
          y={headingMenu.y}
          headings={headingMenu.headings}
          current={headingMenuNode?.subpath}
          onPick={handleHeadingPick}
          onClose={() => setHeadingMenu(null)}
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

      {/* Folder picker */}
      {showFolderPicker && (
        <FolderPicker
          vaultPath={vaultPath}
          onSelect={handleFolderSelect}
          onClose={() => setShowFolderPicker(false)}
        />
      )}

      {/* Web address prompt */}
      {addressPrompt && (
        <AddressPrompt
          title={addressPrompt.nodeId ? "Change address" : "Add web page"}
          action={addressPrompt.nodeId ? "Change" : "Add"}
          initial={canvasData.nodes.find((n) => n.id === addressPrompt.nodeId)?.url ?? ""}
          onSubmit={handleAddressSubmit}
          onClose={() => setAddressPrompt(null)}
        />
      )}

      {notice && <div className="canvas-notice" role="status">{notice}</div>}
    </div>
  );
}
