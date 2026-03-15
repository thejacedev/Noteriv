// ─── Canvas File Format & Utilities ───

export interface CanvasNode {
  id: string;
  type: "text" | "file" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  filePath?: string;
  label?: string;
  color?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide: "top" | "bottom" | "left" | "right";
  toSide: "top" | "bottom" | "left" | "right";
  label?: string;
  color?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** Generate a unique 16-character hex id */
export function generateId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

/** Create a file node at a given position */
export function createFileNode(
  x: number,
  y: number,
  filePath: string
): CanvasNode {
  return {
    id: generateId(),
    type: "file",
    x,
    y,
    width: 260,
    height: 120,
    filePath,
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

/** Determine which side of a node is closest to another node's center */
function determineSide(
  from: CanvasNode,
  to: CanvasNode
): "top" | "bottom" | "left" | "right" {
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
  fromSide: "top" | "bottom" | "left" | "right" = "right",
  toSide: "top" | "bottom" | "left" | "right" = "left"
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

/** Serialize canvas data to JSON string */
export function serializeCanvas(data: CanvasData): string {
  return JSON.stringify(data, null, 2);
}

/** Parse a JSON string into canvas data */
export function parseCanvas(json: string): CanvasData {
  try {
    const data = JSON.parse(json);
    return {
      nodes: Array.isArray(data.nodes) ? data.nodes : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
    };
  } catch {
    return { nodes: [], edges: [] };
  }
}

/** Get the anchor point on a node for a given side */
export function getAnchorPoint(
  node: CanvasNode,
  side: "top" | "bottom" | "left" | "right"
): { x: number; y: number } {
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

/** Recalculate the best sides for an edge given current node positions */
export function recalcEdgeSides(
  edge: CanvasEdge,
  nodes: CanvasNode[]
): CanvasEdge {
  const from = nodes.find((n) => n.id === edge.fromNode);
  const to = nodes.find((n) => n.id === edge.toNode);
  if (!from || !to) return edge;
  return {
    ...edge,
    fromSide: determineSide(from, to),
    toSide: determineSide(to, from),
  };
}
