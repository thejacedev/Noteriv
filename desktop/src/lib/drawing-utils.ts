/**
 * Drawing utilities for creating, loading, saving, and exporting .drawing files.
 */

export interface DrawingFile {
  type: "drawing";
  version: 2;
  elements: DrawingElement[];
  appState: {
    viewBackgroundColor: string;
    theme: "dark" | "light";
  };
}

export interface DrawingElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth?: number;
  points?: number[][];
  [key: string]: unknown;
}

/** Create a new empty drawing file */
export function createEmptyDrawing(): DrawingFile {
  return {
    type: "drawing",
    version: 2,
    elements: [],
    appState: {
      viewBackgroundColor: "#1e1e2e",
      theme: "dark",
    },
  };
}

/** Parse a drawing JSON string */
export function parseDrawing(json: string): DrawingFile | null {
  try {
    const data = JSON.parse(json);
    if (data.type === "drawing" || data.type === "excalidraw") return data;
    return null;
  } catch {
    return null;
  }
}

/** Serialize a drawing file to JSON */
export function serializeDrawing(drawing: DrawingFile): string {
  return JSON.stringify(drawing, null, 2);
}

/** Generate a unique drawing filename */
export function generateDrawingName(existingNames: string[]): string {
  let counter = 1;
  let name = "Drawing.drawing";
  while (existingNames.includes(name)) {
    counter++;
    name = `Drawing ${counter}.drawing`;
  }
  return name;
}

/** Check if a file path is a drawing file */
export function isDrawingFile(path: string): boolean {
  return path.endsWith(".drawing");
}

/** Generate a simple SVG representation from drawing elements */
export function elementsToSVG(elements: DrawingElement[]): string {
  if (elements.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
      <rect width="200" height="100" fill="#313244" rx="8"/>
      <text x="100" y="55" text-anchor="middle" fill="#a6adc8" font-size="14" font-family="sans-serif">Empty Drawing</text>
    </svg>`;
  }

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + (el.width || 0));
    maxY = Math.max(maxY, el.y + (el.height || 0));
  }
  const padding = 20;
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2;

  const svgElements = elements.map((el) => {
    const x = el.x - minX + padding;
    const y = el.y - minY + padding;
    const stroke = (el.strokeColor as string) || "#cdd6f4";
    const fill = (el.backgroundColor as string) || "transparent";

    if (el.type === "rectangle") {
      return `<rect x="${x}" y="${y}" width="${el.width}" height="${el.height}" stroke="${stroke}" fill="${fill}" stroke-width="2" rx="4"/>`;
    }
    if (el.type === "ellipse") {
      return `<ellipse cx="${x + el.width / 2}" cy="${y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" stroke="${stroke}" fill="${fill}" stroke-width="2"/>`;
    }
    if (el.type === "line" || el.type === "arrow") {
      return `<line x1="${x}" y1="${y}" x2="${x + el.width}" y2="${y + el.height}" stroke="${stroke}" stroke-width="2" ${el.type === "arrow" ? 'marker-end="url(#arrow)"' : ""}/>`;
    }
    if (el.type === "text") {
      return `<text x="${x}" y="${y + 14}" fill="${stroke}" font-size="14" font-family="sans-serif">${escapeXml(String(el.text || ""))}</text>`;
    }
    if (el.type === "pencil" && el.points) {
      const pts = el.points.map((p) => `${p[0] - minX + padding},${p[1] - minY + padding}`).join(" ");
      return `<polyline points="${pts}" stroke="${stroke}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return "";
  }).filter(Boolean).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#cdd6f4"/></marker></defs>
  <rect width="${w}" height="${h}" fill="#1e1e2e" rx="8"/>
  ${svgElements}
</svg>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
