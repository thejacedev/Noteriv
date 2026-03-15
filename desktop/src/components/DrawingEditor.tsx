"use client";

import { useState, useRef, useEffect } from "react";
import {
  createEmptyDrawing,
  parseDrawing,
  serializeDrawing,
  type DrawingFile,
  type DrawingElement as DrawingElementType,
} from "@/lib/drawing-utils";

interface DrawingEditorProps {
  filePath: string;
  vaultPath: string;
  onClose: () => void;
  onSave?: () => void;
}

type Tool = "select" | "pencil" | "rectangle" | "ellipse" | "line" | "arrow" | "text" | "eraser";

interface El extends DrawingElementType {
  strokeColor: string;
  backgroundColor: string;
  strokeW: number;
  text?: string;
  points?: number[][];
}

// All mutable state lives in refs so mouse handlers never go stale
interface State {
  tool: Tool;
  stroke: string;
  fill: string;
  strokeW: number;
  elements: El[];
  selectedId: string | null;
  dirty: boolean;
  drawing: boolean;
  panning: boolean;
  spaceDown: boolean;
  startPos: { x: number; y: number } | null;
  dragOffset: { dx: number; dy: number } | null;
  panStart: { x: number; y: number } | null;
  temp: El | null;
  cam: { x: number; y: number; zoom: number };
  mouseScreen: { x: number; y: number };
  drawingFile: DrawingFile | null;
}

let _uid = 0;
function uid() { return `el-${Date.now()}-${_uid++}`; }

export default function DrawingEditor({ filePath, onClose, onSave }: DrawingEditorProps) {
  // React state for toolbar re-renders only
  const [, forceRender] = useState(0);
  const rerender = () => forceRender((n) => n + 1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const s = useRef<State>({
    tool: "pencil",
    stroke: "#cdd6f4",
    fill: "transparent",
    strokeW: 2,
    elements: [],
    selectedId: null,
    dirty: false,
    drawing: false,
    panning: false,
    spaceDown: false,
    startPos: null,
    dragOffset: null,
    panStart: null,
    temp: null,
    cam: { x: 0, y: 0, zoom: 1 },
    mouseScreen: { x: -100, y: -100 },
    drawingFile: null,
  }).current;

  // Load file
  useEffect(() => {
    (async () => {
      if (!window.electronAPI) return;
      const content = await window.electronAPI.readFile(filePath);
      if (content) {
        const parsed = parseDrawing(content);
        if (parsed) {
          s.drawingFile = parsed;
          s.elements = (parsed.elements || []) as El[];
          rerender();
          return;
        }
      }
      s.drawingFile = createEmptyDrawing();
      s.elements = [];
      rerender();
    })();
  }, [filePath, s]);

  // Auto-focus
  useEffect(() => { containerRef.current?.focus(); }, []);

  // --- Coordinate transforms ---
  function screenToWorld(sx: number, sy: number) {
    return {
      x: (sx - s.cam.x) / s.cam.zoom,
      y: (sy - s.cam.y) / s.cam.zoom,
    };
  }

  // --- Hit testing ---
  function hitTest(wx: number, wy: number): El | null {
    const r = 8 / s.cam.zoom;
    for (let i = s.elements.length - 1; i >= 0; i--) {
      const el = s.elements[i];
      if (el.type === "pencil" && el.points) {
        for (const pt of el.points) {
          if ((wx - pt[0]) ** 2 + (wy - pt[1]) ** 2 < (r * 1.5) ** 2) return el;
        }
      } else if (el.type === "text") {
        if (wx >= el.x - r && wx <= el.x + el.width + r && wy >= el.y - r && wy <= el.y + el.height + r) return el;
      } else if (el.type === "line" || el.type === "arrow") {
        const x1 = el.x, y1 = el.y, x2 = el.x + el.width, y2 = el.y + el.height;
        const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (len2 === 0) { if (Math.abs(wx - x1) < r && Math.abs(wy - y1) < r) return el; continue; }
        let t = ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = x1 + t * (x2 - x1), py = y1 + t * (y2 - y1);
        if ((wx - px) ** 2 + (wy - py) ** 2 < r * r) return el;
      } else {
        const minX = Math.min(el.x, el.x + el.width) - r;
        const maxX = Math.max(el.x, el.x + el.width) + r;
        const minY = Math.min(el.y, el.y + el.height) - r;
        const maxY = Math.max(el.y, el.y + el.height) + r;
        if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY) return el;
      }
    }
    return null;
  }

  // --- Canvas rendering ---
  function render() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();
    const cw = rect.width, ch = rect.height;

    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#1e1e2e";
    ctx.fillRect(0, 0, cw, ch);

    // Grid (in screen space, moves with camera)
    const { x: cx, y: cy, zoom } = s.cam;
    const gridSize = 40 * zoom;
    if (gridSize > 8) {
      ctx.strokeStyle = "#252536";
      ctx.lineWidth = 1;
      const offX = cx % gridSize;
      const offY = cy % gridSize;
      for (let x = offX; x < cw; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, ch); ctx.stroke();
      }
      for (let y = offY; y < ch; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(cw, y + 0.5); ctx.stroke();
      }
    }

    // Apply camera transform
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);

    // Draw elements
    for (const el of s.elements) {
      drawEl(ctx, el, el.id === s.selectedId, false, zoom);
    }
    if (s.temp) {
      drawEl(ctx, s.temp, false, true, zoom);
    }

    ctx.restore();

    // Eraser cursor
    if (s.tool === "eraser") {
      const mx = s.mouseScreen.x, my = s.mouseScreen.y;
      if (mx > 0 && my > 0) {
        ctx.beginPath();
        ctx.arc(mx, my, ERASER_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = "#f38ba866";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Zoom indicator
    if (zoom !== 1) {
      ctx.fillStyle = "#6c7086";
      ctx.font = "11px sans-serif";
      ctx.fillText(`${Math.round(zoom * 100)}%`, 8, ch - 8);
    }
  }

  // RAF loop
  useEffect(() => {
    let alive = true;
    function loop() {
      if (!alive) return;
      render();
      rafRef.current = requestAnimationFrame(loop);
    }
    loop();
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize
  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const obs = new ResizeObserver(() => render());
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Mouse position helper ---
  function mousePos(e: React.MouseEvent | MouseEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  // --- Eraser: erase at a world-space point ---
  const ERASER_RADIUS = 12;

  function eraseAt(wx: number, wy: number) {
    const r = ERASER_RADIUS / s.cam.zoom;
    const r2 = r * r;
    let changed = false;
    const newElements: El[] = [];

    for (const el of s.elements) {
      if (el.type === "pencil" && el.points && el.points.length > 1) {
        // Split pencil stroke: remove points near eraser, keep remaining segments
        const segments: number[][][] = [];
        let current: number[][] = [];

        for (const pt of el.points) {
          const dx = pt[0] - wx, dy = pt[1] - wy;
          if (dx * dx + dy * dy < r2) {
            // This point is erased
            if (current.length > 1) segments.push(current);
            current = [];
            changed = true;
          } else {
            current.push(pt);
          }
        }
        if (current.length > 1) segments.push(current);

        if (segments.length === 0) {
          // Entire stroke erased
          changed = true;
        } else if (segments.length === 1 && segments[0].length === el.points.length) {
          // Nothing erased from this stroke
          newElements.push(el);
        } else {
          // Create new stroke elements for remaining segments
          changed = true;
          for (const seg of segments) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of seg) {
              minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
              maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
            }
            newElements.push({
              ...el, id: uid(), points: seg,
              x: minX, y: minY, width: maxX - minX, height: maxY - minY,
            });
          }
        }
      } else {
        // For non-pencil elements: check if eraser is near the element
        const hit = hitTestSingle(el, wx, wy, r);
        if (hit) {
          changed = true;
        } else {
          newElements.push(el);
        }
      }
    }

    if (changed) {
      s.elements = newElements;
      s.dirty = true;
    }
  }

  /** Hit test a single element with a given radius */
  function hitTestSingle(el: El, wx: number, wy: number, r: number): boolean {
    if (el.type === "text") {
      return wx >= el.x - r && wx <= el.x + el.width + r && wy >= el.y - r && wy <= el.y + el.height + r;
    }
    if (el.type === "line" || el.type === "arrow") {
      const x1 = el.x, y1 = el.y, x2 = el.x + el.width, y2 = el.y + el.height;
      const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      if (len2 === 0) return (wx - x1) ** 2 + (wy - y1) ** 2 < r * r;
      let t = ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = x1 + t * (x2 - x1), py = y1 + t * (y2 - y1);
      return (wx - px) ** 2 + (wy - py) ** 2 < r * r;
    }
    // Rectangle, ellipse — bounding box
    const minX = Math.min(el.x, el.x + el.width);
    const maxX = Math.max(el.x, el.x + el.width);
    const minY = Math.min(el.y, el.y + el.height);
    const maxY = Math.max(el.y, el.y + el.height);
    return wx >= minX - r && wx <= maxX + r && wy >= minY - r && wy <= maxY + r;
  }

  // --- Mouse handlers (read from s ref, never stale) ---
  function onMouseDown(e: React.MouseEvent) {
    containerRef.current?.focus();
    const { sx, sy } = mousePos(e);
    const { x: wx, y: wy } = screenToWorld(sx, sy);

    // Middle mouse or space+click = pan
    if (e.button === 1 || s.spaceDown) {
      s.panning = true;
      s.panStart = { x: sx - s.cam.x, y: sy - s.cam.y };
      return;
    }

    if (e.button !== 0) return;

    const tool = s.tool;

    if (tool === "select") {
      const hit = hitTest(wx, wy);
      s.selectedId = hit?.id || null;
      if (hit) {
        s.dragOffset = { dx: wx - hit.x, dy: wy - hit.y };
        s.drawing = true;
      }
      rerender();
      return;
    }

    if (tool === "eraser") {
      s.drawing = true;
      // Erase anything under cursor on click
      eraseAt(wx, wy);
      return;
    }

    if (tool === "text") {
      const text = prompt("Enter text:");
      if (text) {
        s.elements.push({
          id: uid(), type: "text", x: wx, y: wy,
          width: text.length * 9.6, height: 20,
          strokeColor: s.stroke, backgroundColor: s.fill, strokeW: s.strokeW, text,
        });
        s.dirty = true;
        rerender();
      }
      return;
    }

    s.drawing = true;
    s.startPos = { x: wx, y: wy };

    if (tool === "pencil") {
      s.temp = {
        id: "temp", type: "pencil", x: wx, y: wy, width: 0, height: 0,
        strokeColor: s.stroke, backgroundColor: s.fill, strokeW: s.strokeW,
        points: [[wx, wy]],
      };
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const { sx, sy } = mousePos(e);
    const { x: wx, y: wy } = screenToWorld(sx, sy);
    s.mouseScreen = { x: sx, y: sy };

    // Panning
    if (s.panning && s.panStart) {
      s.cam.x = sx - s.panStart.x;
      s.cam.y = sy - s.panStart.y;
      return;
    }

    if (!s.drawing) return;
    const tool = s.tool;

    // Eraser: continuously erase along drag path
    if (tool === "eraser") {
      eraseAt(wx, wy);
      return;
    }

    // Dragging selected element
    if (tool === "select" && s.selectedId && s.dragOffset) {
      const el = s.elements.find((e) => e.id === s.selectedId);
      if (!el) return;
      const newX = wx - s.dragOffset.dx;
      const newY = wy - s.dragOffset.dy;
      if (el.type === "pencil" && el.points) {
        const dx = newX - el.x, dy = newY - el.y;
        el.points = el.points.map((p) => [p[0] + dx, p[1] + dy]);
      }
      el.x = newX;
      el.y = newY;
      s.dirty = true;
      return;
    }

    // Pencil
    if (tool === "pencil" && s.temp?.points) {
      s.temp.points.push([wx, wy]);
      return;
    }

    // Shape tools
    if (!s.startPos) return;
    const start = s.startPos;
    const isLine = tool === "line" || tool === "arrow";
    const type = tool === "arrow" ? "arrow" : tool === "line" ? "line" : tool === "ellipse" ? "ellipse" : "rectangle";

    s.temp = {
      id: "temp", type,
      x: isLine ? start.x : Math.min(start.x, wx),
      y: isLine ? start.y : Math.min(start.y, wy),
      width: isLine ? wx - start.x : Math.abs(wx - start.x),
      height: isLine ? wy - start.y : Math.abs(wy - start.y),
      strokeColor: s.stroke, backgroundColor: s.fill, strokeW: s.strokeW,
    };
  }

  function onMouseUp() {
    // End pan
    if (s.panning) {
      s.panning = false;
      s.panStart = null;
      return;
    }

    if (!s.drawing) return;
    s.drawing = false;

    const tool = s.tool;

    if (tool === "select") {
      s.dragOffset = null;
      rerender();
      return;
    }

    const temp = s.temp;
    if (!temp) { s.startPos = null; return; }

    if (tool === "pencil" && temp.points && temp.points.length > 1) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of temp.points) {
        minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
        maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
      }
      s.elements.push({ ...temp, id: uid(), x: minX, y: minY, width: maxX - minX, height: maxY - minY });
      s.dirty = true;
    } else if (temp.type !== "pencil" && (Math.abs(temp.width) > 2 || Math.abs(temp.height) > 2)) {
      s.elements.push({ ...temp, id: uid() });
      s.dirty = true;
    }

    s.temp = null;
    s.startPos = null;
    rerender();
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const { sx, sy } = mousePos(e);
    const oldZoom = s.cam.zoom;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.min(10, Math.max(0.1, oldZoom * factor));

    // Zoom toward cursor
    s.cam.x = sx - (sx - s.cam.x) * (newZoom / oldZoom);
    s.cam.y = sy - (sy - s.cam.y) * (newZoom / oldZoom);
    s.cam.zoom = newZoom;
    rerender();
  }

  // --- Keyboard ---
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === " ") { e.preventDefault(); s.spaceDown = true; rerender(); return; }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (s.selectedId) {
        s.elements = s.elements.filter((el) => el.id !== s.selectedId);
        s.selectedId = null;
        s.dirty = true;
        rerender();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      doSave();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      s.elements.pop();
      s.dirty = true;
      rerender();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "0") {
      e.preventDefault();
      s.cam = { x: 0, y: 0, zoom: 1 };
      rerender();
      return;
    }
    // Tool shortcuts (only without modifiers)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const keyMap: Record<string, Tool> = {
      v: "select", p: "pencil", r: "rectangle", o: "ellipse",
      l: "line", a: "arrow", t: "text", e: "eraser",
    };
    const tool = keyMap[e.key.toLowerCase()];
    if (tool) { s.tool = tool; rerender(); return; }
    if (e.key === "Escape") onClose();
  }

  function onKeyUp(e: React.KeyboardEvent) {
    if (e.key === " ") { s.spaceDown = false; rerender(); }
  }

  async function doSave() {
    if (!window.electronAPI || !s.drawingFile) return;
    const updated: DrawingFile = {
      ...s.drawingFile,
      elements: s.elements as DrawingElementType[],
    };
    await window.electronAPI.writeFile(filePath, serializeDrawing(updated));
    s.dirty = false;
    onSave?.();
    rerender();
  }

  function clearAll() {
    if (s.elements.length === 0) return;
    if (!confirm("Clear all elements?")) return;
    s.elements = [];
    s.selectedId = null;
    s.dirty = true;
    rerender();
  }

  function setTool(t: Tool) { s.tool = t; rerender(); }
  function setStroke(c: string) { s.stroke = c; rerender(); }
  function setStrokeW(w: number) { s.strokeW = w; rerender(); }
  function toggleFill() { s.fill = s.fill === "transparent" ? s.stroke + "33" : "transparent"; rerender(); }
  function resetView() { s.cam = { x: 0, y: 0, zoom: 1 }; rerender(); }

  const presetColors = ["#cdd6f4", "#89b4fa", "#a6e3a1", "#f9e2af", "#f38ba8", "#cba6f7", "#fab387", "#94e2d5", "#f5c2e7", "#585b70", "#ffffff", "#000000"];

  const tools: { id: Tool; label: string; icon: string }[] = [
    { id: "select", label: "Select (V)", icon: "M4 2l8 12-3-1-3 5-2-1 3-5-3 1z" },
    { id: "pencil", label: "Pencil (P)", icon: "M3 13l1.5-4L12 2l2 2-7.5 7.5L3 13zM9.5 4.5l2 2" },
    { id: "rectangle", label: "Rectangle (R)", icon: "M3 3h10v10H3z" },
    { id: "ellipse", label: "Ellipse (O)", icon: "M8 3a5 5 0 100 10 5 5 0 000-10z" },
    { id: "line", label: "Line (L)", icon: "M2 14L14 2" },
    { id: "arrow", label: "Arrow (A)", icon: "M2 14L14 2M14 2v5M14 2h-5" },
    { id: "text", label: "Text (T)", icon: "M3 3h10M8 3v10" },
    { id: "eraser", label: "Eraser (E)", icon: "M7 14l7-7-4-4-7 7 2 2zM10 11l3-3" },
  ];

  const cursor = s.spaceDown || s.panning ? "grab" : (
    { select: "default", pencil: "crosshair", rectangle: "crosshair", ellipse: "crosshair",
      line: "crosshair", arrow: "crosshair", text: "text", eraser: "pointer" } as Record<Tool, string>
  )[s.tool];

  return (
    <div
      ref={containerRef}
      className="no-drag"
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "#1e1e2e", display: "flex", flexDirection: "column", outline: "none" }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      tabIndex={0}
    >
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#181825", borderBottom: "1px solid #313244", flexShrink: 0 }}>
        <span style={{ color: "#cdd6f4", fontSize: 13, fontWeight: 600, marginRight: 8 }}>
          {filePath.split("/").pop()}
        </span>

        <div style={{ display: "flex", gap: 1, background: "#313244", borderRadius: 6, padding: 2 }}>
          {tools.map((t) => (
            <button key={t.id} onClick={() => setTool(t.id)} title={t.label} style={{
              width: 30, height: 30, border: "none", borderRadius: 4,
              background: s.tool === t.id ? "#45475a" : "transparent",
              color: s.tool === t.id ? "#89b4fa" : "#6c7086",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d={t.icon} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "#313244", margin: "0 4px" }} />

        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {/* Color picker */}
          <div style={{ position: "relative", width: 24, height: 24 }}>
            <input
              type="color"
              value={s.stroke}
              onChange={(e) => setStroke(e.target.value)}
              title="Pick any color"
              style={{
                position: "absolute", inset: 0, width: 24, height: 24,
                border: "none", padding: 0, cursor: "pointer",
                borderRadius: "50%", opacity: 0,
              }}
            />
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              border: "2px solid #89b4fa", background: s.stroke,
              pointerEvents: "none",
            }} />
          </div>
          {/* Preset swatches */}
          {presetColors.map((c) => (
            <button key={c} onClick={() => setStroke(c)} title={c} style={{
              width: 14, height: 14, borderRadius: "50%",
              border: s.stroke === c ? "2px solid #89b4fa" : "1.5px solid #45475a",
              background: c, cursor: "pointer", padding: 0,
            }} />
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "#313244", margin: "0 4px" }} />

        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {[1, 2, 4, 6].map((w) => (
            <button key={w} onClick={() => setStrokeW(w)} title={`${w}px`} style={{
              width: 24, height: 24, border: "none", borderRadius: 4,
              background: s.strokeW === w ? "#45475a" : "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: Math.max(8, w * 3), height: w, borderRadius: w, background: s.strokeW === w ? "#89b4fa" : "#6c7086" }} />
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={toggleFill} style={{ ...btnStyle, background: s.fill !== "transparent" ? "#45475a" : undefined }}>
          Fill {s.fill !== "transparent" ? "On" : "Off"}
        </button>
        <button onClick={resetView} style={btnStyle} title="Ctrl+0">Reset View</button>
        <button onClick={clearAll} style={btnStyle}>Clear</button>
        <button onClick={doSave} style={{ ...btnStyle, background: s.dirty ? "#89b4fa" : undefined, color: s.dirty ? "#1e1e2e" : undefined, fontWeight: s.dirty ? 600 : undefined }}>
          {s.dirty ? "Save*" : "Save"}
        </button>
        <button onClick={onClose} style={btnStyle}>Close</button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
          style={{ display: "block", cursor }}
        />
      </div>

      {/* Status bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 12px", background: "#181825", borderTop: "1px solid #313244", fontSize: 10, color: "#6c7086", flexShrink: 0 }}>
        <span>{s.elements.length} element{s.elements.length !== 1 ? "s" : ""}{s.selectedId ? " | 1 selected" : ""}</span>
        <span>{s.tool} | Space+drag pan | Scroll zoom | Ctrl+0 reset | Ctrl+Z undo | Ctrl+S save | Esc close</span>
        {s.dirty && <span style={{ color: "#f9e2af" }}>unsaved</span>}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "3px 10px", border: "1px solid #45475a", borderRadius: 4,
  background: "transparent", color: "#a6adc8", fontSize: 11, cursor: "pointer",
};

function drawEl(ctx: CanvasRenderingContext2D, el: El, selected: boolean, temp: boolean, zoom: number) {
  ctx.save();
  ctx.strokeStyle = selected ? "#89b4fa" : el.strokeColor;
  ctx.fillStyle = el.backgroundColor;
  ctx.lineWidth = el.strokeW || 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (temp) ctx.setLineDash([6 / zoom, 4 / zoom]);
  if (selected) ctx.setLineDash([6 / zoom, 3 / zoom]);

  if (el.type === "pencil" && el.points && el.points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(el.points[0][0], el.points[0][1]);
    for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i][0], el.points[i][1]);
    ctx.stroke();
  } else if (el.type === "rectangle") {
    if (el.backgroundColor !== "transparent") ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.strokeRect(el.x, el.y, el.width, el.height);
  } else if (el.type === "ellipse") {
    const rx = Math.abs(el.width) / 2, ry = Math.abs(el.height) / 2;
    if (rx > 0 && ry > 0) {
      ctx.beginPath();
      ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, rx, ry, 0, 0, Math.PI * 2);
      if (el.backgroundColor !== "transparent") ctx.fill();
      ctx.stroke();
    }
  } else if (el.type === "line" || el.type === "arrow") {
    ctx.beginPath();
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x + el.width, el.y + el.height);
    ctx.stroke();
    if (el.type === "arrow") {
      const angle = Math.atan2(el.height, el.width);
      const hl = 14 / zoom;
      ctx.beginPath();
      ctx.moveTo(el.x + el.width, el.y + el.height);
      ctx.lineTo(el.x + el.width - hl * Math.cos(angle - 0.35), el.y + el.height - hl * Math.sin(angle - 0.35));
      ctx.moveTo(el.x + el.width, el.y + el.height);
      ctx.lineTo(el.x + el.width - hl * Math.cos(angle + 0.35), el.y + el.height - hl * Math.sin(angle + 0.35));
      ctx.stroke();
    }
  } else if (el.type === "text") {
    ctx.font = "16px 'JetBrains Mono', monospace";
    ctx.fillStyle = el.strokeColor;
    ctx.textBaseline = "top";
    ctx.fillText(el.text || "", el.x, el.y);
  }

  if (selected) {
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.strokeStyle = "#89b4fa66";
    ctx.lineWidth = 1 / zoom;
    const pad = 6 / zoom;
    ctx.strokeRect(
      Math.min(el.x, el.x + el.width) - pad,
      Math.min(el.y, el.y + el.height) - pad,
      Math.abs(el.width) + pad * 2,
      Math.abs(el.height) + pad * 2,
    );
  }

  ctx.restore();
}
