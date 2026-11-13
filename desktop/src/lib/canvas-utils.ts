// ─── Canvas File Format & Utilities ───
//
// A canvas is saved as a JSON Canvas 1.0 file (jsoncanvas.org), the format
// Obsidian uses, so the same .canvas file opens in both apps. JSON Canvas has
// four kinds of card: text, file, link and group. Noteriv has three more
// (sticky note, image, freehand drawing); `serializeCanvas` explains how each
// of those is written so that another app still reads the file.
//
// Nothing here touches the DOM or the disk, so all of it can be tested.

import { pdfPage } from "./embed-utils";
import { fromVaultRelative, isAbsolutePath, toVaultRelative } from "./vault-paths";
import { splitWikiTarget, type WikiAnchor } from "./wiki-link-utils";

export type CanvasSide = "top" | "bottom" | "left" | "right";
export type CanvasEnd = "none" | "arrow";

/**
 * "unknown" is a card of a kind this version does not know. It keeps its place
 * and everything it was saved with, so opening and saving the canvas here does
 * not lose it.
 */
export type CanvasNodeType =
  | "text"
  | "file"
  | "link"
  | "group"
  | "sticky"
  | "image"
  | "drawing"
  | "unknown";

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  /**
   * The file a file or image card shows, as a path from the top of the vault
   * with "/" between folders. A vault sits in a different folder on each
   * machine it is synced to, so a full path would point nowhere on another.
   * Only a card from an old canvas whose file is outside the vault still
   * holds a full path here.
   */
  file?: string;
  /** The part of a note a file card is narrowed to: "#Heading" or "#^block-id". For a PDF, "#page=3". */
  subpath?: string;
  /** The address of a web page card. */
  url?: string;
  label?: string;
  /** A group's background image, as a path inside the vault, and how it is fitted. */
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
  /**
   * A preset "1" to "6" or a hex colour such as "#ff8800". A sticky note
   * keeps one of the names in STICKY_COLORS instead.
   */
  color?: string;
  drawingPoints?: number[][];
  strokeColor?: string;
  strokeWidth?: number;
  rotation?: number;
  /** Fields the file had that this version does not use. They are written back unchanged. */
  extra?: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  /** Left out when the file did not say; the side is then chosen as the line is drawn. */
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  /** What the line ends with. Left out, the start has nothing and the end has an arrow. */
  fromEnd?: CanvasEnd;
  toEnd?: CanvasEnd;
  label?: string;
  color?: string;
  extra?: Record<string, unknown>;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** Anything else at the top of the file, such as the "metadata" Obsidian writes. */
  extra?: Record<string, unknown>;
}

interface Point {
  x: number;
  y: number;
}

/** Generate a unique 16-character hex id */
export function generateId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Colours ───

/**
 * The six preset colours of JSON Canvas, each with the name and shade Noteriv
 * has always used for it. The format leaves the exact shades to the app.
 */
export const CANVAS_COLORS: { preset: string; name: string; hex: string }[] = [
  { preset: "1", name: "red", hex: "#e55" },
  { preset: "2", name: "orange", hex: "#e93" },
  { preset: "3", name: "yellow", hex: "#ec5" },
  { preset: "4", name: "green", hex: "#5b5" },
  { preset: "5", name: "blue", hex: "#58c" },
  { preset: "6", name: "purple", hex: "#a6e" },
];

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(color: string | undefined): color is string {
  return typeof color === "string" && HEX_COLOR.test(color);
}

/** The name of a preset colour ("1" gives "red"), which the stylesheet colours cards by. */
export function canvasColorName(color: string | undefined): string | undefined {
  return CANVAS_COLORS.find((c) => c.preset === color)?.name;
}

/** A colour as CSS: the shade of a preset, or the colour itself. */
export function canvasColorCss(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return CANVAS_COLORS.find((c) => c.preset === color)?.hex ?? color;
}

/** Old canvases named the preset ("red"); the file format numbers it ("1"). */
function presetForName(color: string): string {
  return CANVAS_COLORS.find((c) => c.name === color)?.preset ?? color;
}

/** Sticky note color palette */
export const STICKY_COLORS: Record<string, string> = {
  yellow: "#f9e2af",
  pink: "#f5c2e7",
  blue: "#89dceb",
  green: "#a6e3a1",
  purple: "#cba6f7",
  peach: "#fab387",
};

/** The sticky colour closest to each preset, for a sticky note recoloured in another app. */
const STICKY_FOR_PRESET: Record<string, string> = {
  "1": "pink",
  "2": "peach",
  "3": "yellow",
  "4": "green",
  "5": "blue",
  "6": "purple",
};

/** The paper colour of a sticky note. */
export function stickyBackground(color: string | undefined): string {
  if (isHexColor(color)) return color;
  return STICKY_COLORS[color || "yellow"] || STICKY_COLORS.yellow;
}

/** A sticky note's colour as read from a file: one of the names when it is one of ours. */
function stickyColorFromFile(color: string | undefined): string {
  if (!color) return "yellow";
  if (color in STICKY_COLORS) return color;
  const byHex = Object.keys(STICKY_COLORS).find(
    (name) => STICKY_COLORS[name].toLowerCase() === color.toLowerCase()
  );
  return byHex ?? STICKY_FOR_PRESET[color] ?? (isHexColor(color) ? color : "yellow");
}

// ─── Files a card can show ───

export type FileCardKind = "note" | "image" | "audio" | "video" | "pdf" | "other";

const NOTE_FILE = /\.(md|markdown)$/i;
// The same extensions the editor's embeds recognise (see embed-utils).
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const AUDIO_FILE = /\.(mp3|wav|m4a|ogg|flac|3gp)$/i;
const VIDEO_FILE = /\.(mp4|webm|mov|mkv|ogv)$/i;
const PDF_FILE = /\.pdf$/i;

/**
 * What a file card shows, going by the file's extension. Only Markdown files
 * are notes; a file of a kind the app cannot show is "other".
 */
export function fileCardKind(file: string): FileCardKind {
  if (NOTE_FILE.test(file)) return "note";
  if (IMAGE_FILE.test(file)) return "image";
  if (AUDIO_FILE.test(file)) return "audio";
  if (VIDEO_FILE.test(file)) return "video";
  if (PDF_FILE.test(file)) return "pdf";
  return "other";
}

/** The name a file card is headed with: the file name, without ".md" for a note. */
export function fileCardTitle(file: string): string {
  const name = file.split(/[\\/]/).pop() || file;
  return name.replace(NOTE_FILE, "");
}

/** The full path of a card's file on this machine, or null when it has none or it would leave the vault. */
export function resolveCanvasFile(file: string | undefined, vaultPath: string): string | null {
  if (!file) return null;
  if (isAbsolutePath(file)) return file;
  return fromVaultRelative(file, vaultPath);
}

/** A full path as it is kept on a card: from the top of the vault. null for a file outside the vault. */
export function canvasFileFor(absolutePath: string, vaultPath: string): string | null {
  return toVaultRelative(absolutePath, vaultPath);
}

/** The heading or block a file card is narrowed to, or null for the whole note. */
export function subpathAnchor(subpath: string | undefined): WikiAnchor | null {
  if (!subpath || !subpath.startsWith("#")) return null;
  return splitWikiTarget(subpath).anchor;
}

/** The subpath that narrows a card to a heading. Characters a link cannot hold become spaces, as in a wiki link. */
export function headingSubpath(heading: string): string {
  return `#${heading.replace(/[#^|[\]]/g, " ").replace(/\s+/g, " ").trim()}`;
}

/** The page of a PDF a card opens at, from a subpath such as "#page=3". */
export function subpathPage(subpath: string | undefined): number | undefined {
  return subpath ? pdfPage(`file.pdf${subpath}`) : undefined;
}

/** A short description of a subpath for the card's title: "Heading", "^block-id" or "page 3". */
export function subpathLabel(subpath: string | undefined): string {
  const page = subpathPage(subpath);
  if (page) return `page ${page}`;
  const anchor = subpathAnchor(subpath);
  if (!anchor) return "";
  return anchor.type === "heading" ? anchor.text : `^${anchor.id}`;
}

// ─── Web pages ───

/**
 * A web address as a person types it: "example.com/page" becomes
 * "https://example.com/page". Only http and https pages can be opened, so
 * anything else, and anything that is not an address, gives null.
 */
export function normalizeWebUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  // "mailto:..." or "javascript:..." names another scheme; "localhost:3000" is a host and a port.
  if (!hasScheme && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return null;
  const candidate = hasScheme ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // A bare word is far more likely a typo than a site.
  const host = url.hostname;
  if (!host || (!host.includes(".") && !host.includes(":") && host !== "localhost")) return null;
  return candidate;
}

/**
 * The address to make a card from when text is pasted onto the canvas. The
 * whole of the pasted text has to be one http or https address; other text is
 * left alone.
 */
export function pastedWebUrl(text: string): string | null {
  const trimmed = text.trim();
  return /^https?:\/\/\S+$/i.test(trimmed) ? normalizeWebUrl(trimmed) : null;
}

/** The site a web address is on, for the card's heading. The address itself when it cannot be read. */
export function webUrlHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

// ─── Creating cards ───

/** Create a text node at a given position */
export function createTextNode(
  x: number,
  y: number,
  text: string = ""
): CanvasNode {
  return {
    id: generateId(),
    type: "text",
    x,
    y,
    width: 260,
    height: 160,
    text,
  };
}

/** How big a new file card is, by what it shows. */
const FILE_CARD_SIZE: Record<FileCardKind, { width: number; height: number }> = {
  note: { width: 300, height: 220 },
  image: { width: 300, height: 240 },
  pdf: { width: 300, height: 400 },
  audio: { width: 300, height: 120 },
  video: { width: 360, height: 260 },
  other: { width: 260, height: 110 },
};

/** Create a file node at a given position. `file` is a path from the top of the vault. */
export function createFileNode(
  x: number,
  y: number,
  file: string
): CanvasNode {
  return {
    id: generateId(),
    type: "file",
    x,
    y,
    ...FILE_CARD_SIZE[fileCardKind(file)],
    file,
  };
}

/** Create a web page card at a given position */
export function createLinkNode(x: number, y: number, url: string): CanvasNode {
  return {
    id: generateId(),
    type: "link",
    x,
    y,
    width: 300,
    height: 140,
    url,
  };
}

/** Create a group node at a given position and size */
export function createGroupNode(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string
): CanvasNode {
  return {
    id: generateId(),
    type: "group",
    x,
    y,
    width: w,
    height: h,
    label,
  };
}

/** Create a sticky note node at a given position */
export function createStickyNode(
  x: number,
  y: number,
  text: string = "",
  color: string = "yellow"
): CanvasNode {
  // Random slight rotation between -2 and 2 degrees
  const rotation = Math.round((Math.random() * 4 - 2) * 100) / 100;
  return {
    id: generateId(),
    type: "sticky",
    x,
    y,
    width: 200,
    height: 200,
    text,
    color,
    rotation,
  };
}

/** Create an image node at a given position. `file` is a path from the top of the vault. */
export function createImageNode(
  x: number,
  y: number,
  file: string
): CanvasNode {
  return {
    id: generateId(),
    type: "image",
    x,
    y,
    width: 300,
    height: 240,
    file,
  };
}

/** Create a drawing (freehand stroke) node */
export function createDrawingNode(
  points: number[][],
  strokeColor: string = "#cdd6f4",
  strokeWidth: number = 3
): CanvasNode {
  if (points.length === 0) {
    return {
      id: generateId(),
      type: "drawing",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      drawingPoints: [],
      strokeColor,
      strokeWidth,
    };
  }
  // Calculate bounding box from the points
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of points) {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  const pad = strokeWidth;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  // Normalize points relative to the node origin
  const normalizedPoints = points.map(([px, py]) => [px - minX, py - minY]);
  return {
    id: generateId(),
    type: "drawing",
    x: minX,
    y: minY,
    width: w,
    height: h,
    drawingPoints: normalizedPoints,
    strokeColor,
    strokeWidth,
  };
}

// ─── Cards from a folder ───

export interface VaultFolder {
  /** Path from the top of the vault; "" is the top itself. */
  path: string;
  /** How many notes sit directly in it. */
  notes: number;
}

function folderOf(file: string): string {
  const slash = file.lastIndexOf("/");
  return slash < 0 ? "" : file.slice(0, slash);
}

/**
 * The folders of a vault that hold notes, from the list of its files (paths
 * from the top of the vault). The top of the vault comes first.
 */
export function vaultFolders(files: string[]): VaultFolder[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    if (!NOTE_FILE.test(file)) continue;
    const folder = folderOf(file);
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts]
    .map(([path, notes]) => ({ path, notes }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

/** The notes that sit directly in a folder, not those in folders inside it, in name order. */
export function notesInFolder(files: string[], folder: string): string[] {
  return files
    .filter((file) => NOTE_FILE.test(file) && folderOf(file) === folder)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** The rectangle that holds every card, or null for an empty canvas. */
export function canvasBounds(
  nodes: CanvasNode[]
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return { minX, minY, maxX, maxY };
}

const GRID_GAP = 24;
/** How far new cards are set from what is already on the canvas. */
const GRID_MARGIN = 80;

/**
 * One file card for each file, laid out in a grid of equal cells to the right
 * of what is already on the canvas (around `centre` when the canvas is empty).
 * A file that already has a card is left out; `skipped` counts those.
 */
export function cardsForFiles(
  existing: CanvasNode[],
  files: string[],
  centre: Point
): { added: CanvasNode[]; skipped: number } {
  const present = new Set(
    existing.filter((n) => n.type === "file" && n.file).map((n) => n.file as string)
  );
  const wanted: string[] = [];
  for (const file of files) {
    if (present.has(file)) continue;
    present.add(file);
    wanted.push(file);
  }
  if (wanted.length === 0) return { added: [], skipped: files.length };

  const cards = wanted.map((file) => createFileNode(0, 0, file));
  const cellW = Math.max(...cards.map((c) => c.width));
  const cellH = Math.max(...cards.map((c) => c.height));
  // As close to square as the number of cards allows.
  const columns = Math.ceil(Math.sqrt(cards.length));
  const rows = Math.ceil(cards.length / columns);

  const bounds = canvasBounds(existing);
  const left = bounds
    ? bounds.maxX + GRID_MARGIN
    : centre.x - (columns * cellW + (columns - 1) * GRID_GAP) / 2;
  const top = bounds
    ? bounds.minY
    : centre.y - (rows * cellH + (rows - 1) * GRID_GAP) / 2;

  const added = cards.map((card, index) => ({
    ...card,
    x: Math.round(left + (index % columns) * (cellW + GRID_GAP)),
    y: Math.round(top + Math.floor(index / columns) * (cellH + GRID_GAP)),
  }));
  return { added, skipped: files.length - wanted.length };
}

// ─── Edges ───

/** Determine which side of a node is closest to another node's center */
function determineSide(
  from: CanvasNode,
  to: CanvasNode
): CanvasSide {
  const fromCx = from.x + from.width / 2;
  const fromCy = from.y + from.height / 2;
  const toCx = to.x + to.width / 2;
  const toCy = to.y + to.height / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  }
  return dy > 0 ? "bottom" : "top";
}

/** Create an edge between two nodes (auto-detect sides) */
export function createEdge(
  fromId: string,
  toId: string,
  fromSide: CanvasSide = "right",
  toSide: CanvasSide = "left"
): CanvasEdge {
  return {
    id: generateId(),
    fromNode: fromId,
    toNode: toId,
    fromSide,
    toSide,
  };
}

/** Create an edge and auto-detect the best sides based on node positions */
export function createEdgeAutoSide(
  fromNode: CanvasNode,
  toNode: CanvasNode
): CanvasEdge {
  const fromSide = determineSide(fromNode, toNode);
  const toSide = determineSide(toNode, fromNode);
  return createEdge(fromNode.id, toNode.id, fromSide, toSide);
}

/** Get the anchor point on a node for a given side */
export function getAnchorPoint(
  node: CanvasNode,
  side: CanvasSide
): Point {
  switch (side) {
    case "top":
      return { x: node.x + node.width / 2, y: node.y };
    case "bottom":
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case "left":
      return { x: node.x, y: node.y + node.height / 2 };
    case "right":
      return { x: node.x + node.width, y: node.y + node.height / 2 };
  }
}

/**
 * The sides an edge is drawn between. A side the file did not give is chosen
 * from where the two cards are, and is not saved.
 */
export function edgeSides(
  edge: CanvasEdge,
  from: CanvasNode,
  to: CanvasNode
): { from: CanvasSide; to: CanvasSide } {
  return {
    from: edge.fromSide ?? determineSide(from, to),
    to: edge.toSide ?? determineSide(to, from),
  };
}

/** What each end of an edge has. The file format's defaults: nothing at the start, an arrow at the end. */
export function edgeEnds(edge: CanvasEdge): { from: CanvasEnd; to: CanvasEnd } {
  return { from: edge.fromEnd ?? "none", to: edge.toEnd ?? "arrow" };
}

/** Recalculate the best sides for an edge given current node positions */
export function recalcEdgeSides(
  edge: CanvasEdge,
  nodes: CanvasNode[]
): CanvasEdge {
  const from = nodes.find((n) => n.id === edge.fromNode);
  const to = nodes.find((n) => n.id === edge.toNode);
  if (!from || !to) return edge;
  // A side the file left out stays left out: it is worked out as the edge is drawn.
  const fromSide = edge.fromSide ? determineSide(from, to) : undefined;
  const toSide = edge.toSide ? determineSide(to, from) : undefined;
  if (fromSide === edge.fromSide && toSide === edge.toSide) return edge;
  const next = { ...edge };
  if (fromSide) next.fromSide = fromSide;
  if (toSide) next.toSide = toSide;
  return next;
}

/**
 * Recalculate the sides of the edges that touch the given cards, after those
 * cards were moved or resized. Other edges are left exactly as they are, so
 * moving one card in a canvas made elsewhere does not re-route every line.
 */
export function recalcEdgesFor(
  edges: CanvasEdge[],
  nodes: CanvasNode[],
  changed: Set<string>
): CanvasEdge[] {
  return edges.map((edge) =>
    changed.has(edge.fromNode) || changed.has(edge.toNode) ? recalcEdgeSides(edge, nodes) : edge
  );
}

/** The direction pointing away from a card on one of its sides. */
function sideNormal(side: CanvasSide): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

/** How far the curve leaves a card before bending towards the other one. */
const EDGE_BEND = 60;

/**
 * The curve between two cards: the SVG path, its two ends, and the point half
 * way along, where the label sits.
 */
export function edgeGeometry(
  fromNode: CanvasNode,
  toNode: CanvasNode,
  fromSide: CanvasSide,
  toSide: CanvasSide
): { path: string; from: Point; to: Point; middle: Point } {
  const from = getAnchorPoint(fromNode, fromSide);
  const to = getAnchorPoint(toNode, toSide);
  const n1 = sideNormal(fromSide);
  const n2 = sideNormal(toSide);
  const cp1 = { x: from.x + n1.x * EDGE_BEND, y: from.y + n1.y * EDGE_BEND };
  const cp2 = { x: to.x + n2.x * EDGE_BEND, y: to.y + n2.y * EDGE_BEND };
  return {
    path: `M${from.x},${from.y} C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${to.x},${to.y}`,
    from,
    to,
    // A cubic curve at its half-way point.
    middle: {
      x: (from.x + 3 * cp1.x + 3 * cp2.x + to.x) / 8,
      y: (from.y + 3 * cp1.y + 3 * cp2.y + to.y) / 8,
    },
  };
}

/**
 * An arrowhead where an edge meets a card, pointing at the card. The curve
 * always arrives square to the side, so the head only needs the side.
 */
export function arrowHeadPath(at: Point, side: CanvasSide): string {
  const n = sideNormal(side);
  const tip = { x: at.x - n.x * 2, y: at.y - n.y * 2 };
  const base = { x: at.x + n.x * 18, y: at.y + n.y * 18 };
  // Across the line of travel.
  const a = { x: base.x - n.y * 8, y: base.y + n.x * 8 };
  const b = { x: base.x + n.y * 8, y: base.y - n.x * 8 };
  return `M${tip.x},${tip.y} L${a.x},${a.y} L${b.x},${b.y} Z`;
}

// ─── Reading and writing the file ───

type Raw = Record<string, unknown>;

const SIDES: readonly string[] = ["top", "bottom", "left", "right"];
const ENDS: readonly string[] = ["none", "arrow"];
const BACKGROUND_STYLES: readonly string[] = ["cover", "ratio", "repeat"];

/** The id of the one text card that carries a canvas's freehand strokes. See `serializeCanvas`. */
const DRAWINGS_CARD_ID = "noteriv-drawings";
const DRAWINGS_CARD_TEXT = "Drawings made in Noteriv are kept in this card.";

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Takes named fields out of a saved object. Whatever is not taken stays in
 * `rest` and is written back as it was, which is how fields this version does
 * not know survive being opened and saved.
 */
function reader(raw: Raw) {
  const rest: Raw = { ...raw };
  return {
    rest,
    string(key: string): string | undefined {
      const value = rest[key];
      if (typeof value !== "string") return undefined;
      delete rest[key];
      return value;
    },
    number(key: string): number | undefined {
      const value = rest[key];
      if (!finite(value)) return undefined;
      delete rest[key];
      return value;
    },
    oneOf<T extends string>(key: string, allowed: readonly string[]): T | undefined {
      const value = rest[key];
      if (typeof value !== "string" || !allowed.includes(value)) return undefined;
      delete rest[key];
      return value as T;
    },
    drop(key: string) {
      delete rest[key];
    },
  };
}

/** A path as a card keeps it. An old canvas holds full paths; one inside this vault is shortened. */
function readFilePath(path: string, vaultPath: string): string {
  if (!isAbsolutePath(path) || !vaultPath) return path;
  return toVaultRelative(path, vaultPath) ?? path;
}

function readNode(raw: Raw, vaultPath: string): CanvasNode {
  const take = reader(raw);
  const savedType = typeof raw.type === "string" ? raw.type : "";
  // Cards only Noteriv has are saved as a text or file card with a note of
  // what they really are.
  const marker = isRecord(raw.noteriv) ? raw.noteriv : null;
  const markedAs = marker && typeof marker.type === "string" ? marker.type : "";
  // A text card standing in for a card whose file is outside the vault.
  const outside =
    savedType === "text" && (markedAs === "image" || markedAs === "file") && typeof marker?.path === "string"
      ? marker.path
      : undefined;

  let type: CanvasNodeType = "unknown";
  if (savedType === "text" && markedAs === "sticky") type = "sticky";
  else if (savedType === "file" && markedAs === "image") type = "image";
  else if (outside !== undefined) type = markedAs === "image" ? "image" : "file";
  else if (
    savedType === "text" || savedType === "file" || savedType === "link" || savedType === "group" ||
    savedType === "sticky" || savedType === "image" || savedType === "drawing"
  ) {
    type = savedType;
  }

  const node: CanvasNode = {
    id: take.string("id") ?? generateId(),
    type,
    x: take.number("x") ?? 0,
    y: take.number("y") ?? 0,
    width: take.number("width") ?? 260,
    height: take.number("height") ?? 160,
  };
  if (type === "unknown") {
    // Kept whole, kind and all.
    if (Object.keys(take.rest).length > 0) node.extra = take.rest;
    return node;
  }
  take.drop("type");
  if (type === "sticky" || type === "image" || outside !== undefined) take.drop("noteriv");

  const color = take.string("color");
  if (type === "sticky") node.color = stickyColorFromFile(color);
  else if (color !== undefined) node.color = presetForName(color);

  switch (type) {
    case "text": {
      const text = take.string("text");
      if (text !== undefined) node.text = text;
      break;
    }
    case "sticky": {
      const text = take.string("text");
      if (text !== undefined) node.text = text;
      // The tilt is under `noteriv` in a file of the format, beside the text in an old one.
      const saved = marker?.rotation;
      const rotation = finite(saved) ? saved : take.number("rotation");
      if (rotation !== undefined) node.rotation = rotation;
      break;
    }
    case "file":
    case "image": {
      // "file" is the format's field; "filePath" and "imagePath" are what
      // Noteriv wrote before it used the format.
      const file = take.string("file");
      const legacy = take.string(type === "image" ? "imagePath" : "filePath");
      const path = outside ?? file ?? legacy;
      if (path !== undefined) node.file = readFilePath(path, vaultPath);
      const kept = outside !== undefined ? marker?.subpath : undefined;
      const subpath = typeof kept === "string" ? kept : take.string("subpath");
      if (subpath !== undefined) node.subpath = subpath;
      // The stand-in card's text is only the file's name, for other apps.
      if (outside !== undefined) take.drop("text");
      break;
    }
    case "link": {
      const url = take.string("url");
      if (url !== undefined) node.url = url;
      break;
    }
    case "group": {
      const label = take.string("label");
      if (label !== undefined) node.label = label;
      const background = take.string("background");
      if (background !== undefined) node.background = background;
      const style = take.oneOf<"cover" | "ratio" | "repeat">("backgroundStyle", BACKGROUND_STYLES);
      if (style !== undefined) node.backgroundStyle = style;
      break;
    }
    case "drawing": {
      const points = take.rest.drawingPoints;
      if (Array.isArray(points)) {
        node.drawingPoints = points.filter(
          (p): p is number[] => Array.isArray(p) && finite(p[0]) && finite(p[1])
        );
        take.drop("drawingPoints");
      }
      const strokeColor = take.string("strokeColor");
      if (strokeColor !== undefined) node.strokeColor = strokeColor;
      const strokeWidth = take.number("strokeWidth");
      if (strokeWidth !== undefined) node.strokeWidth = strokeWidth;
      break;
    }
  }

  if (Object.keys(take.rest).length > 0) node.extra = take.rest;
  return node;
}

function readEdge(raw: Raw): CanvasEdge {
  const take = reader(raw);
  const edge: CanvasEdge = {
    id: take.string("id") ?? generateId(),
    fromNode: take.string("fromNode") ?? "",
    toNode: take.string("toNode") ?? "",
  };
  const fromSide = take.oneOf<CanvasSide>("fromSide", SIDES);
  if (fromSide) edge.fromSide = fromSide;
  const toSide = take.oneOf<CanvasSide>("toSide", SIDES);
  if (toSide) edge.toSide = toSide;
  const fromEnd = take.oneOf<CanvasEnd>("fromEnd", ENDS);
  if (fromEnd) edge.fromEnd = fromEnd;
  const toEnd = take.oneOf<CanvasEnd>("toEnd", ENDS);
  if (toEnd) edge.toEnd = toEnd;
  const label = take.string("label");
  if (label !== undefined) edge.label = label;
  const color = take.string("color");
  if (color !== undefined) edge.color = presetForName(color);
  if (Object.keys(take.rest).length > 0) edge.extra = take.rest;
  return edge;
}

/**
 * Parse a .canvas file. Reads JSON Canvas files, as Obsidian writes them, and
 * the files Noteriv wrote before it used that format (full paths in
 * `filePath` and `imagePath`, colours by name, sticky, image and drawing
 * cards as kinds of their own). `vaultPath` is needed to shorten the full
 * paths of an old file to paths inside the vault.
 */
export function parseCanvas(json: string, vaultPath: string = ""): CanvasData {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { nodes: [], edges: [] };
  }
  if (!isRecord(data)) return { nodes: [], edges: [] };

  const { nodes: savedNodes, edges: savedEdges, ...rest } = data;
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const seen = new Set<string>();
  const addNode = (raw: unknown) => {
    if (!isRecord(raw)) return;
    const node = readNode(raw, vaultPath);
    // Two cards with one id cannot be told apart; the first one stands.
    if (seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
  };
  // Strokes come after every other card, as they are drawn on top of them.
  const strokes: unknown[] = [];
  const strokeEdges: unknown[] = [];

  for (const raw of Array.isArray(savedNodes) ? savedNodes : []) {
    const marker = isRecord(raw) && isRecord(raw.noteriv) ? raw.noteriv : null;
    if (isRecord(raw) && raw.type === "text" && marker?.type === "drawings") {
      if (Array.isArray(marker.nodes)) strokes.push(...marker.nodes);
      if (Array.isArray(marker.edges)) strokeEdges.push(...marker.edges);
      continue;
    }
    addNode(raw);
  }
  for (const raw of strokes) {
    if (isRecord(raw) && raw.type === "drawing") addNode(raw);
  }
  for (const raw of [...(Array.isArray(savedEdges) ? savedEdges : []), ...strokeEdges]) {
    if (isRecord(raw)) edges.push(readEdge(raw));
  }

  const canvas: CanvasData = { nodes, edges };
  if (Object.keys(rest).length > 0) canvas.extra = rest;
  return canvas;
}

/** The named fields first, then whatever else the file had. A named field wins over a leftover of the same name. */
function withExtra(known: Raw, extra: Raw | undefined): Raw {
  if (!extra) return known;
  const out: Raw = { ...known };
  for (const [key, value] of Object.entries(extra)) {
    if (!(key in out)) out[key] = value;
  }
  return out;
}

/** Position and size as whole numbers, which is what the format asks for; dragging leaves fractions. */
function box(node: CanvasNode): Raw {
  return {
    x: Math.round(node.x),
    y: Math.round(node.y),
    width: Math.round(node.width),
    height: Math.round(node.height),
  };
}

function writeNode(node: CanvasNode): Raw {
  const known: Raw = { id: node.id };
  const color = node.color !== undefined ? { color: node.color } : {};
  // A card whose file is outside the vault cannot be a file card: its path
  // would mean nothing to another app or on another machine.
  const outside = node.file !== undefined && isAbsolutePath(node.file) ? node.file : undefined;

  switch (node.type) {
    case "unknown":
      // Its kind and fields are all in `extra`; only where it sits can have changed.
      return { ...node.extra, id: node.id, ...box(node) };
    case "text":
      Object.assign(known, { type: "text" }, node.text !== undefined ? { text: node.text } : {}, box(node), color);
      break;
    case "sticky": {
      const marker: Raw = { type: "sticky" };
      if (node.rotation !== undefined) marker.rotation = node.rotation;
      Object.assign(known, { type: "text", text: node.text ?? "" }, box(node), {
        color: stickyBackground(node.color),
        noteriv: marker,
      });
      break;
    }
    case "file":
    case "image":
      if (outside !== undefined) {
        const marker: Raw = { type: node.type, path: outside };
        if (node.subpath !== undefined) marker.subpath = node.subpath;
        Object.assign(known, { type: "text", text: fileCardTitle(outside) }, box(node), color, { noteriv: marker });
      } else {
        Object.assign(
          known,
          { type: "file" },
          node.file !== undefined ? { file: node.file } : {},
          node.subpath !== undefined ? { subpath: node.subpath } : {},
          box(node),
          color,
          node.type === "image" ? { noteriv: { type: "image" } } : {}
        );
      }
      break;
    case "link":
      Object.assign(known, { type: "link" }, node.url !== undefined ? { url: node.url } : {}, box(node), color);
      break;
    case "group":
      Object.assign(
        known,
        { type: "group" },
        box(node),
        node.label !== undefined ? { label: node.label } : {},
        node.background !== undefined ? { background: node.background } : {},
        node.backgroundStyle !== undefined ? { backgroundStyle: node.backgroundStyle } : {},
        color
      );
      break;
    case "drawing":
      // Kept as drawn: a stroke's points are measured from its exact corner.
      Object.assign(
        known,
        { type: "drawing", x: node.x, y: node.y, width: node.width, height: node.height },
        { drawingPoints: node.drawingPoints ?? [] },
        node.strokeColor !== undefined ? { strokeColor: node.strokeColor } : {},
        node.strokeWidth !== undefined ? { strokeWidth: node.strokeWidth } : {}
      );
      break;
  }
  return withExtra(known, node.extra);
}

function writeEdge(edge: CanvasEdge): Raw {
  const known: Raw = { id: edge.id, fromNode: edge.fromNode };
  if (edge.fromSide) known.fromSide = edge.fromSide;
  if (edge.fromEnd) known.fromEnd = edge.fromEnd;
  known.toNode = edge.toNode;
  if (edge.toSide) known.toSide = edge.toSide;
  if (edge.toEnd) known.toEnd = edge.toEnd;
  if (edge.color !== undefined) known.color = edge.color;
  if (edge.label !== undefined) known.label = edge.label;
  return withExtra(known, edge.extra);
}

/**
 * Serialize canvas data to a JSON Canvas file.
 *
 * Text, file, web page and group cards are written as the format defines
 * them. The cards only Noteriv has are written as cards the format does
 * have, so that another app still opens the file. What makes them Noteriv's
 * is kept in a `noteriv` field on the card; an app that writes back the
 * fields it does not know (Obsidian's own file types allow for such fields)
 * keeps them through a save there, and one that drops those fields leaves
 * the plain card.
 *
 * - A sticky note is a text card with its paper colour, plus
 *   `"noteriv": {"type": "sticky"}` so it comes back as a sticky note here.
 * - An image card is a file card pointing at the image, plus
 *   `"noteriv": {"type": "image"}`.
 * - Freehand strokes have no counterpart. All of them go inside one small
 *   text card (id "noteriv-drawings"), along with any edge that touches one,
 *   so another app shows a single card that says what it holds, not an empty
 *   box per stroke.
 * - A card from an old canvas whose file is outside the vault is a text card
 *   naming the file, with the full path under `noteriv`.
 */
export function serializeCanvas(data: CanvasData): string {
  const strokes = data.nodes.filter((n) => n.type === "drawing");
  const strokeIds = new Set(strokes.map((n) => n.id));
  const nodes = data.nodes.filter((n) => n.type !== "drawing").map(writeNode);
  const edges: Raw[] = [];
  const strokeEdges: Raw[] = [];
  for (const edge of data.edges) {
    const onStroke = strokeIds.has(edge.fromNode) || strokeIds.has(edge.toNode);
    (onStroke ? strokeEdges : edges).push(writeEdge(edge));
  }

  if (strokes.length > 0) {
    const bounds = canvasBounds(strokes);
    const marker: Raw = { type: "drawings", nodes: strokes.map(writeNode) };
    if (strokeEdges.length > 0) marker.edges = strokeEdges;
    nodes.push({
      id: DRAWINGS_CARD_ID,
      type: "text",
      text: DRAWINGS_CARD_TEXT,
      x: Math.round(bounds?.minX ?? 0),
      y: Math.round(bounds?.minY ?? 0),
      width: 260,
      height: 60,
      noteriv: marker,
    });
  }

  return JSON.stringify({ nodes, edges, ...data.extra }, null, 2);
}
