"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import "@/styles/graph-view.css";
import { loadVaultIndex, type NoteMeta } from "@/lib/vault-index";
import {
  DEFAULT_GRAPH_FILTERS,
  buildGraphModel,
  type GraphFilters,
  type GraphNodeKind,
} from "@/lib/graph-model";

// ── Types ──

interface GraphViewProps {
  vaultPath: string;
  currentFile: string | null;
  onFileSelect: (filePath: string) => void;
  onClose: () => void;
  /** Open on the current note's neighbourhood instead of the whole vault. */
  startLocal?: boolean;
}

interface GraphNode {
  id: string;           // file path, or tag:/file:/missing: for the other kinds
  label: string;        // file name without .md
  kind: GraphNodeKind;
  /** A group's colour, if a group claims the note. */
  color: string | null;
  /** When the note was created, for the time-lapse. */
  ctime: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;  // total edge count
}

/** How the graph is drawn and how its nodes push and pull. 1 is the default strength. */
interface GraphLook {
  arrows: boolean;
  nodeSize: number;
  linkThickness: number;
  /** Labels show when zoomed in at least this far. */
  textFade: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  /** The length a link settles at, in pixels. 0 pulls linked notes together freely. */
  linkDistance: number;
}

const DEFAULT_LOOK: GraphLook = {
  arrows: true,
  nodeSize: 1,
  linkThickness: 1,
  textFade: 0.4,
  centerForce: 1,
  repelForce: 1,
  linkForce: 1,
  linkDistance: 0,
};

const GROUP_COLORS = ["#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#cba6f7", "#fab387", "#94e2d5"];
const SETTINGS_KEY = "noteriv-graph-settings";

function loadSettings(): { filters: GraphFilters; look: GraphLook } {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (saved && typeof saved === "object") {
      return {
        filters: { ...DEFAULT_GRAPH_FILTERS, ...saved.filters, local: false },
        look: { ...DEFAULT_LOOK, ...saved.look },
      };
    }
  } catch {
    // Unreadable settings are the same as none.
  }
  return { filters: { ...DEFAULT_GRAPH_FILTERS }, look: { ...DEFAULT_LOOK } };
}

interface GraphEdge {
  source: string;       // node id (file path)
  target: string;       // node id (file path)
  reciprocal: boolean;
}

interface TooltipInfo {
  x: number;
  y: number;
  label: string;
  connections: number;
}

// ── Constants ──

const REPULSION_STRENGTH = 1200;
const ATTRACTION_STRENGTH = 0.004;
const CENTER_GRAVITY = 0.0025;
const ORPHAN_GRAVITY = 0.012;
const DAMPING = 0.85;
const MIN_NODE_RADIUS = 6;
const MAX_NODE_RADIUS = 22;
const LABEL_FONT_SIZE = 11;
const HIT_PADDING = 4;

// ── Helpers ──

function nodeRadius(connections: number, maxConnections: number): number {
  if (maxConnections <= 0) return MIN_NODE_RADIUS;
  const t = Math.min(connections / Math.max(maxConnections, 1), 1);
  return MIN_NODE_RADIUS + t * (MAX_NODE_RADIUS - MIN_NODE_RADIUS);
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - Math.cos(angle - Math.PI / 6) * size,
    y - Math.sin(angle - Math.PI / 6) * size
  );
  ctx.lineTo(
    x - Math.cos(angle + Math.PI / 6) * size,
    y - Math.sin(angle + Math.PI / 6) * size
  );
  ctx.closePath();
  ctx.fill();
}

// ── Component ──

export default function GraphView({
  vaultPath,
  currentFile,
  onFileSelect,
  onClose,
  startLocal = false,
}: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  // Graph data
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

  // The vault's notes, and the choices that decide what is drawn from them
  const [index, setIndex] = useState<NoteMeta[]>([]);
  const [filters, setFilters] = useState<GraphFilters>(() => ({ ...loadSettings().filters, local: startLocal }));
  const [look, setLook] = useState<GraphLook>(() => loadSettings().look);
  const [showSettings, setShowSettings] = useState(false);
  const lookRef = useRef(look);
  useEffect(() => { lookRef.current = look; }, [look]);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ filters, look }));
    } catch {
      // Not being able to remember the settings is not worth interrupting for.
    }
  }, [filters, look]);

  // Time-lapse: notes appear in the order they were created. While it runs,
  // only notes created up to this moment are drawn.
  const revealRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);

  // Interaction state
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  // Camera: stored in refs for perf (used every frame)
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    camStartX: number;
    camStartY: number;
    draggedNode: string | null;
  }>({ active: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0, draggedNode: null });

  // Keep mutable refs for simulation so the rAF loop can access latest state
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const searchRef = useRef("");
  const currentFileRef = useRef<string | null>(currentFile);

  // Sync refs
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { hoveredRef.current = hoveredNode; }, [hoveredNode]);
  useEffect(() => { searchRef.current = searchQuery; }, [searchQuery]);
  useEffect(() => { currentFileRef.current = currentFile; }, [currentFile]);

  // ── Build graph data ──
  // Load the vault's notes once.
  useEffect(() => {
    let cancelled = false;
    loadVaultIndex(vaultPath)
      .then((notes) => {
        if (!cancelled) setIndex(notes);
      })
      .catch((err) => console.error("GraphView: failed to load the vault", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [vaultPath]);

  // Build what is drawn. Nodes that were already there keep their place, so
  // changing a filter does not throw the whole picture in the air.
  const localTarget = filters.local ? currentFile : null;
  useEffect(() => {
    const model = buildGraphModel(index, filters, localTarget);
    const previous = new Map(nodesRef.current.map((n) => [n.id, n]));
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const spread = Math.min(cx, cy) * 0.8;
    const nodeList: GraphNode[] = model.nodes.map((n) => {
      const old = previous.get(n.id);
      return {
        ...n,
        x: old ? old.x : cx + (Math.random() - 0.5) * spread * 2,
        y: old ? old.y : cy + (Math.random() - 0.5) * spread * 2,
        vx: old ? old.vx : 0,
        vy: old ? old.vy : 0,
      };
    });
    setNodes(nodeList);
    setEdges(model.edges);
    nodesRef.current = nodeList;
    edgesRef.current = model.edges;
  }, [index, filters, localTarget]);

  // ── Computed values ──
  const stats = useMemo(() => {
    return { noteCount: nodes.length, edgeCount: edges.length };
  }, [nodes, edges]);

  // ── CSS variable resolution (cached) ──
  const colorsRef = useRef({
    bgSurface: "#313244",
    accent: "#89b4fa",
    border: "#313244",
    textPrimary: "#cdd6f4",
    textMuted: "#6c7086",
    bgPrimary: "#1e1e2e",
    green: "#a6e3a1",
  });

  useEffect(() => {
    const readColors = () => {
      const style = getComputedStyle(document.documentElement);
      colorsRef.current = {
        bgSurface: style.getPropertyValue("--bg-surface").trim() || "#313244",
        accent: style.getPropertyValue("--accent").trim() || "#89b4fa",
        border: style.getPropertyValue("--border").trim() || "#313244",
        textPrimary: style.getPropertyValue("--text-primary").trim() || "#cdd6f4",
        textMuted: style.getPropertyValue("--text-muted").trim() || "#6c7086",
        bgPrimary: style.getPropertyValue("--bg-primary").trim() || "#1e1e2e",
        green: style.getPropertyValue("--green").trim() || "#a6e3a1",
      };
    };
    readColors();

    // Re-read whenever the theme system updates CSS vars (it toggles classes
    // and / or inline styles on <html>). Without this the canvas keeps the
    // first theme it saw and looks broken after a theme switch.
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // ── Force simulation + render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener("resize", resize);

    function tick() {
      if (!running || !ctx || !canvas) return;

      const ns = nodesRef.current;
      const es = edgesRef.current;
      const cam = cameraRef.current;
      const hovered = hoveredRef.current;
      const search = searchRef.current.toLowerCase();
      const curFile = currentFileRef.current;
      const colors = colorsRef.current;
      const dragging = dragRef.current;
      const style = lookRef.current;
      const reveal = revealRef.current;
      const hidden = (n: GraphNode) => reveal !== null && n.kind === "note" && n.ctime > reveal;

      const W = canvas.getBoundingClientRect().width;
      const H = canvas.getBoundingClientRect().height;
      const centerX = W / 2;
      const centerY = H / 2;

      // ── Force simulation step ──
      // Build index for quick lookup
      const nodeMap = new Map<string, GraphNode>();
      for (const n of ns) nodeMap.set(n.id, n);

      for (let i = 0; i < ns.length; i++) {
        const a = ns[i];

        // If this node is being dragged, skip forces
        if (dragging.active && dragging.draggedNode === a.id) continue;

        // Repulsion (against all other nodes)
        for (let j = i + 1; j < ns.length; j++) {
          const b = ns[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1; }
          const force = (REPULSION_STRENGTH * style.repelForce) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          // Skip applying force to dragged node
          if (!(dragging.active && dragging.draggedNode === b.id)) {
            b.vx -= fx;
            b.vy -= fy;
          }
          a.vx += fx;
          a.vy += fy;
        }

        // Center gravity (stronger for orphan nodes)
        const gravity = (a.connections === 0 ? ORPHAN_GRAVITY : CENTER_GRAVITY) * style.centerForce;
        a.vx += (centerX - a.x) * gravity;
        a.vy += (centerY - a.y) * gravity;
      }

      // Attraction along edges
      for (const e of es) {
        const a = nodeMap.get(e.source);
        const b = nodeMap.get(e.target);
        if (!a || !b) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue;

        // A spring that rests at the chosen link length.
        const stretch = (dist - style.linkDistance) / dist;
        const fx = dx * stretch * ATTRACTION_STRENGTH * style.linkForce;
        const fy = dy * stretch * ATTRACTION_STRENGTH * style.linkForce;

        if (!(dragging.active && dragging.draggedNode === a.id)) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!(dragging.active && dragging.draggedNode === b.id)) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // Apply velocity + damping
      for (const n of ns) {
        if (dragging.active && dragging.draggedNode === n.id) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x += n.vx;
        n.y += n.vy;
      }

      // ── Render ──
      ctx.clearRect(0, 0, W, H);
      ctx.save();

      // Apply camera transform
      ctx.translate(W / 2, H / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-W / 2 + cam.x, -H / 2 + cam.y);

      // Determine highlighted node set
      const highlightSet = new Set<string>();
      if (hovered) {
        highlightSet.add(hovered);
        for (const e of es) {
          if (e.source === hovered) highlightSet.add(e.target);
          if (e.target === hovered) highlightSet.add(e.source);
        }
      }

      // Determine search-matched nodes
      const searchMatched = new Set<string>();
      if (search) {
        for (const n of ns) {
          if (n.label.toLowerCase().includes(search)) {
            searchMatched.add(n.id);
          }
        }
      }

      // Compute max connections for radius sizing
      const mc = Math.max(...ns.map((n) => n.connections), 1);

      // Draw edges
      for (const e of es) {
        const a = nodeMap.get(e.source);
        const b = nodeMap.get(e.target);
        if (!a || !b) continue;
        if (hidden(a) || hidden(b)) continue;

        const isHighlighted = hovered && highlightSet.has(a.id) && highlightSet.has(b.id);
        const isDimmedBySearch = search && (!searchMatched.has(a.id) && !searchMatched.has(b.id));

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 1) continue;
        const ux = dx / distance;
        const uy = dy / distance;
        const startX = a.x + ux * (nodeRadius(a.connections, mc) * style.nodeSize + 2);
        const startY = a.y + uy * (nodeRadius(a.connections, mc) * style.nodeSize + 2);
        const endX = b.x - ux * (nodeRadius(b.connections, mc) * style.nodeSize + 3);
        const endY = b.y - uy * (nodeRadius(b.connections, mc) * style.nodeSize + 3);
        const edgeColor = isHighlighted ? colors.accent : colors.border;
        const edgeAlpha = isDimmedBySearch ? 0.08 : isHighlighted ? 0.85 : e.reciprocal ? 0.42 : 0.3;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = isHighlighted
          ? colors.accent
          : colors.border;
        ctx.globalAlpha = edgeAlpha;
        ctx.lineWidth = (isHighlighted ? 1.5 : e.reciprocal ? 1.25 : 1) * style.linkThickness;
        ctx.stroke();

        if (style.arrows) {
          const angle = Math.atan2(dy, dx);
          ctx.fillStyle = edgeColor;
          drawArrowHead(ctx, endX, endY, angle, isHighlighted ? 7 : 6);
          if (e.reciprocal) {
            drawArrowHead(ctx, startX, startY, angle + Math.PI, isHighlighted ? 7 : 6);
          }
        }
        ctx.globalAlpha = 1;
      }

      // Draw nodes
      for (const n of ns) {
        if (hidden(n)) continue;
        const r = nodeRadius(n.connections, mc) * style.nodeSize;
        const isActive = curFile === n.id;
        const isHovered = hovered === n.id;
        const isConnected = highlightSet.has(n.id);
        const isSearchMatch = search ? searchMatched.has(n.id) : true;
        const isDimmed = (hovered && !isConnected) || (search && !isSearchMatch);

        ctx.globalAlpha = isDimmed ? 0.15 : 1;

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

        if (isActive) {
          ctx.fillStyle = colors.accent;
          ctx.fill();
          ctx.strokeStyle = colors.textPrimary;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (isHovered) {
          ctx.fillStyle = colors.accent;
          ctx.fill();
          ctx.strokeStyle = colors.accent;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (n.kind === "tag") {
          // Tags are filled, so they read as a different kind of thing.
          ctx.fillStyle = colors.green;
          ctx.fill();
        } else if (n.kind === "missing" || n.kind === "attachment") {
          // Not a note: an outline only, dashed for one that does not exist.
          ctx.fillStyle = colors.bgPrimary;
          ctx.fill();
          if (n.kind === "missing") ctx.setLineDash([3, 3]);
          ctx.strokeStyle = colors.textMuted;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = n.color ?? colors.bgSurface;
          ctx.fill();
          ctx.strokeStyle = n.color ?? colors.accent;
          ctx.lineWidth = isConnected && hovered ? 1.5 : 1;
          ctx.stroke();
        }

        // Label
        const showLabel = cam.zoom > style.textFade || isHovered || isActive || (search && isSearchMatch);
        if (showLabel) {
          const fontSize = Math.max(LABEL_FONT_SIZE / Math.max(cam.zoom, 0.5), 10);
          ctx.font = `${isActive || isHovered ? "600" : "400"} ${fontSize}px Inter, -apple-system, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = isActive || isHovered ? colors.textPrimary : colors.textMuted;
          ctx.fillText(n.label, n.x, n.y + r + 4);
        }

        ctx.globalAlpha = 1;
      }

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [loading]);

  // ── Hit testing ──
  const hitTest = useCallback(
    (clientX: number, clientY: number): GraphNode | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const cam = cameraRef.current;
      const W = rect.width;
      const H = rect.height;

      // Convert screen coords to world coords
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const worldX = (sx - W / 2) / cam.zoom + W / 2 - cam.x;
      const worldY = (sy - H / 2) / cam.zoom + H / 2 - cam.y;

      const ns = nodesRef.current;
      const mc = Math.max(...ns.map((n) => n.connections), 1);

      // Check in reverse order so top-most nodes are hit first
      for (let i = ns.length - 1; i >= 0; i--) {
        const n = ns[i];
        const r = nodeRadius(n.connections, mc) + HIT_PADDING;
        const dx = worldX - n.x;
        const dy = worldY - n.y;
        if (dx * dx + dy * dy <= r * r) {
          return n;
        }
      }
      return null;
    },
    []
  );

  // ── Mouse handlers ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;

      const node = hitTest(e.clientX, e.clientY);
      const cam = cameraRef.current;

      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        camStartX: cam.x,
        camStartY: cam.y,
        draggedNode: node ? node.id : null,
      };

      canvasRef.current?.classList.add("grabbing");
    },
    [hitTest]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;

      if (drag.active) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;

        if (drag.draggedNode) {
          // Dragging a node: move it in world space
          const cam = cameraRef.current;
          const node = nodesRef.current.find((n) => n.id === drag.draggedNode);
          if (node) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const W = rect.width;
            const H = rect.height;
            const worldX = (e.clientX - rect.left - W / 2) / cam.zoom + W / 2 - cam.x;
            const worldY = (e.clientY - rect.top - H / 2) / cam.zoom + H / 2 - cam.y;
            node.x = worldX;
            node.y = worldY;
            node.vx = 0;
            node.vy = 0;
          }
        } else {
          // Panning
          const cam = cameraRef.current;
          cam.x = drag.camStartX + dx / cam.zoom;
          cam.y = drag.camStartY + dy / cam.zoom;
        }
      } else {
        // Hover detection
        const node = hitTest(e.clientX, e.clientY);
        const nodeId = node?.id ?? null;

        if (nodeId !== hoveredRef.current) {
          setHoveredNode(nodeId);
          if (node) {
            setTooltip({
              x: e.clientX,
              y: e.clientY,
              label: node.label,
              connections: node.connections,
            });
          } else {
            setTooltip(null);
          }
        } else if (node && tooltip) {
          setTooltip({
            x: e.clientX,
            y: e.clientY,
            label: node.label,
            connections: node.connections,
          });
        }

        if (canvasRef.current) {
          canvasRef.current.style.cursor = node ? "pointer" : "grab";
        }
      }
    },
    [hitTest, tooltip]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;

      if (drag.active) {
        const dx = Math.abs(e.clientX - drag.startX);
        const dy = Math.abs(e.clientY - drag.startY);

        // If it was a click (not a drag), open the note
        if (dx < 3 && dy < 3) {
          const node = hitTest(e.clientX, e.clientY);
          // A tag or a note that does not exist has nothing to open.
          if (node && node.kind === "note") {
            onFileSelect(node.id);
          }
        }
      }

      dragRef.current = {
        active: false,
        startX: 0,
        startY: 0,
        camStartX: 0,
        camStartY: 0,
        draggedNode: null,
      };

      canvasRef.current?.classList.remove("grabbing");
    },
    [hitTest, onFileSelect]
  );

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const cam = cameraRef.current;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    cam.zoom = Math.max(0.1, Math.min(5, cam.zoom * zoomFactor));
  }, []);

  const handleZoomIn = useCallback(() => {
    const cam = cameraRef.current;
    cam.zoom = Math.min(5, cam.zoom * 1.25);
  }, []);

  const handleZoomOut = useCallback(() => {
    const cam = cameraRef.current;
    cam.zoom = Math.max(0.1, cam.zoom * 0.8);
  }, []);

  // ── Keyboard ──
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // ── Time-lapse ──
  const timelapseFrame = useRef(0);
  const playTimelapse = useCallback(() => {
    const times = nodesRef.current
      .filter((n) => n.kind === "note")
      .map((n) => n.ctime)
      .sort((a, b) => a - b);
    if (times.length < 2) return;
    cancelAnimationFrame(timelapseFrame.current);
    const startedAt = performance.now();
    const duration = Math.min(8000, 1500 + times.length * 40);
    setPlaying(true);
    const step = (now: number) => {
      const t = Math.min((now - startedAt) / duration, 1);
      // By rank, not by date: a hundred notes imported on one day should
      // still appear one after another.
      revealRef.current = times[Math.min(times.length - 1, Math.floor(t * times.length))];
      if (t < 1) {
        timelapseFrame.current = requestAnimationFrame(step);
      } else {
        revealRef.current = null;
        setPlaying(false);
      }
    };
    timelapseFrame.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(timelapseFrame.current), []);

  const setFilter = useCallback(<K extends keyof GraphFilters>(key: K, value: GraphFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);
  const setLookValue = useCallback(<K extends keyof GraphLook>(key: K, value: GraphLook[K]) => {
    setLook((l) => ({ ...l, [key]: value }));
  }, []);

  // ── Backdrop click ──
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  return (
    <div ref={overlayRef} className="graph-overlay" onClick={handleBackdropClick}>
      <div ref={containerRef} className="graph-container">
        {/* Search */}
        <div className="graph-search">
          <svg
            className="graph-search-icon"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M10.5 10.5L14 14"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            placeholder="Filter nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Close button */}
        <button className="graph-close-btn" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path
              d="M3 3l8 8M11 3l-8 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Settings */}
        <button
          className={`graph-settings-btn${showSettings ? " graph-settings-btn-on" : ""}`}
          onClick={() => setShowSettings((v) => !v)}
          title="Graph settings"
          aria-expanded={showSettings}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 4h7M12 4h2M2 8h2M7 8h7M2 12h8M13 12h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="10.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="5.5" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="11.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        {showSettings && (
          <div className="graph-settings">
            <div className="graph-settings-head">
              <span>Graph settings</span>
              <button
                className="graph-settings-reset"
                onClick={() => {
                  setFilters({ ...DEFAULT_GRAPH_FILTERS, local: filters.local });
                  setLook({ ...DEFAULT_LOOK });
                }}
              >
                Restore defaults
              </button>
            </div>

            <div className="graph-settings-title">Filters</div>
            <label className="graph-check" title={currentFile ? undefined : "Open a note first"}>
              <input
                type="checkbox"
                checked={filters.local}
                disabled={!currentFile}
                onChange={(e) => setFilter("local", e.target.checked)}
              />
              Local graph: this note and its neighbours
            </label>
            {filters.local && (
              <label className="graph-slider">
                <span>Depth</span>
                <input type="range" min={1} max={5} step={1} value={filters.depth} onChange={(e) => setFilter("depth", Number(e.target.value))} />
                <span className="graph-slider-value">{filters.depth}</span>
              </label>
            )}
            <label className="graph-check">
              <input type="checkbox" checked={filters.showTags} onChange={(e) => setFilter("showTags", e.target.checked)} />
              Tags
            </label>
            <label className="graph-check">
              <input type="checkbox" checked={filters.showAttachments} onChange={(e) => setFilter("showAttachments", e.target.checked)} />
              Attachments
            </label>
            <label className="graph-check">
              <input type="checkbox" checked={filters.existingOnly} onChange={(e) => setFilter("existingOnly", e.target.checked)} />
              Existing notes only
            </label>
            <label className="graph-check">
              <input type="checkbox" checked={filters.showOrphans} onChange={(e) => setFilter("showOrphans", e.target.checked)} />
              Notes with no links
            </label>

            <div className="graph-settings-title">Groups</div>
            {filters.groups.map((group, i) => (
              <div key={i} className="graph-group">
                <input
                  type="color"
                  value={group.color}
                  aria-label="Group colour"
                  onChange={(e) =>
                    setFilter("groups", filters.groups.map((g, k) => (k === i ? { ...g, color: e.target.value } : g)))
                  }
                />
                <input
                  type="text"
                  value={group.query}
                  placeholder="tag:#work, path:Folder or a name"
                  aria-label="Which notes are in the group"
                  onChange={(e) =>
                    setFilter("groups", filters.groups.map((g, k) => (k === i ? { ...g, query: e.target.value } : g)))
                  }
                />
                <button
                  className="graph-group-remove"
                  title="Remove group"
                  aria-label="Remove group"
                  onClick={() => setFilter("groups", filters.groups.filter((_, k) => k !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="graph-settings-action"
              onClick={() =>
                setFilter("groups", [
                  ...filters.groups,
                  { query: "", color: GROUP_COLORS[filters.groups.length % GROUP_COLORS.length] },
                ])
              }
            >
              New group
            </button>

            <div className="graph-settings-title">Display</div>
            <label className="graph-check">
              <input type="checkbox" checked={look.arrows} onChange={(e) => setLookValue("arrows", e.target.checked)} />
              Arrows
            </label>
            {([
              ["nodeSize", "Node size", 0.5, 2.5, 0.1],
              ["linkThickness", "Link thickness", 0.5, 3, 0.1],
              ["textFade", "Hide names when zoomed out past", 0, 1.5, 0.05],
            ] as const).map(([key, label, min, max, step]) => (
              <label key={key} className="graph-slider">
                <span>{label}</span>
                <input type="range" min={min} max={max} step={step} value={look[key]} onChange={(e) => setLookValue(key, Number(e.target.value))} />
              </label>
            ))}
            <button className="graph-settings-action" onClick={playTimelapse} disabled={playing}>
              {playing ? "Playing..." : "Play time-lapse"}
            </button>

            <div className="graph-settings-title">Forces</div>
            {([
              ["centerForce", "Center force", 0, 3, 0.1],
              ["repelForce", "Repel force", 0.2, 3, 0.1],
              ["linkForce", "Link force", 0, 3, 0.1],
              ["linkDistance", "Link distance", 0, 300, 10],
            ] as const).map(([key, label, min, max, step]) => (
              <label key={key} className="graph-slider">
                <span>{label}</span>
                <input type="range" min={min} max={max} step={step} value={look[key]} onChange={(e) => setLookValue(key, Number(e.target.value))} />
              </label>
            ))}
          </div>
        )}

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="graph-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (dragRef.current.active) {
              dragRef.current = {
                active: false,
                startX: 0,
                startY: 0,
                camStartX: 0,
                camStartY: 0,
                draggedNode: null,
              };
              canvasRef.current?.classList.remove("grabbing");
            }
            setHoveredNode(null);
            setTooltip(null);
          }}
          onWheel={handleWheel}
        />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="graph-tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div>{tooltip.label}</div>
            <div className="graph-tooltip-connections">
              {tooltip.connections} connection{tooltip.connections !== 1 ? "s" : ""}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="graph-stats">
          <div className="graph-stat-item">
            <span className="graph-stat-value">{stats.noteCount}</span>
            <span>{filters.local ? "nearby" : "nodes"}</span>
          </div>
          <div className="graph-stat-item">
            <span className="graph-stat-value">{stats.edgeCount}</span>
            <span>connections</span>
          </div>
        </div>

        <div className="graph-edge-legend" aria-label="Link direction legend">
          <span><span className="graph-legend-arrow">→</span> one-way</span>
          <span><span className="graph-legend-arrow">↔</span> reciprocal</span>
        </div>

        {/* Zoom controls */}
        <div className="graph-zoom-controls">
          <button className="graph-zoom-btn" onClick={handleZoomIn} title="Zoom in">
            +
          </button>
          <button className="graph-zoom-btn" onClick={handleZoomOut} title="Zoom out">
            &minus;
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 14,
            }}
          >
            Building graph...
          </div>
        )}
      </div>
    </div>
  );
}
