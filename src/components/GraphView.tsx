"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import "@/styles/graph-view.css";

// ── Types ──

interface GraphViewProps {
  vaultPath: string;
  currentFile: string | null;
  onFileSelect: (filePath: string) => void;
  onClose: () => void;
}

interface GraphNode {
  id: string;           // file path
  label: string;        // file name without .md
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;  // total edge count
}

interface GraphEdge {
  source: string;       // node id (file path)
  target: string;       // node id (file path)
}

interface TooltipInfo {
  x: number;
  y: number;
  label: string;
  connections: number;
}

// ── Constants ──

const REPULSION_STRENGTH = 800;
const ATTRACTION_STRENGTH = 0.015;
const CENTER_GRAVITY = 0.01;
const DAMPING = 0.92;
const MIN_NODE_RADIUS = 5;
const MAX_NODE_RADIUS = 22;
const LABEL_FONT_SIZE = 11;
const LINK_REGEX = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
const HIT_PADDING = 4;

// ── Helpers ──

function labelFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.md$/i, "");
}

function nodeRadius(connections: number, maxConnections: number): number {
  if (maxConnections <= 0) return MIN_NODE_RADIUS;
  const t = Math.min(connections / Math.max(maxConnections, 1), 1);
  return MIN_NODE_RADIUS + t * (MAX_NODE_RADIUS - MIN_NODE_RADIUS);
}

// ── Component ──

export default function GraphView({
  vaultPath,
  currentFile,
  onFileSelect,
  onClose,
}: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  // Graph data
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

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
  useEffect(() => {
    let cancelled = false;

    async function buildGraph() {
      if (!window.electronAPI) return;

      try {
        const files = await window.electronAPI.listAllFiles(vaultPath);
        const mdFiles = files.filter((f) => f.fileName.endsWith(".md"));

        // Read all file contents in parallel
        const contents = await Promise.all(
          mdFiles.map(async (f) => {
            const content = await window.electronAPI.readFile(f.filePath);
            return { file: f, content: content ?? "" };
          })
        );

        if (cancelled) return;

        // Build a lookup: label (lowercase) -> file path
        const labelToPath = new Map<string, string>();
        for (const f of mdFiles) {
          const label = labelFromPath(f.filePath).toLowerCase();
          labelToPath.set(label, f.filePath);
        }

        // Parse links and build edges
        const edgeSet = new Set<string>();
        const edgeList: GraphEdge[] = [];

        for (const { file, content } of contents) {
          let match: RegExpExecArray | null;
          const regex = new RegExp(LINK_REGEX.source, LINK_REGEX.flags);
          while ((match = regex.exec(content)) !== null) {
            const linkTarget = match[1].trim().toLowerCase();
            const targetPath = labelToPath.get(linkTarget);
            if (targetPath && targetPath !== file.filePath) {
              // Use sorted key to deduplicate bidirectional edges
              const key = [file.filePath, targetPath].sort().join("|||");
              if (!edgeSet.has(key)) {
                edgeSet.add(key);
                edgeList.push({ source: file.filePath, target: targetPath });
              }
            }
          }
        }

        // Count connections per node
        const connectionCount = new Map<string, number>();
        for (const edge of edgeList) {
          connectionCount.set(edge.source, (connectionCount.get(edge.source) ?? 0) + 1);
          connectionCount.set(edge.target, (connectionCount.get(edge.target) ?? 0) + 1);
        }

        // Create nodes with random initial positions
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const spread = Math.min(cx, cy) * 0.8;

        const nodeList: GraphNode[] = mdFiles.map((f) => ({
          id: f.filePath,
          label: labelFromPath(f.filePath),
          x: cx + (Math.random() - 0.5) * spread * 2,
          y: cy + (Math.random() - 0.5) * spread * 2,
          vx: 0,
          vy: 0,
          connections: connectionCount.get(f.filePath) ?? 0,
        }));

        if (cancelled) return;
        setNodes(nodeList);
        setEdges(edgeList);
        nodesRef.current = nodeList;
        edgesRef.current = edgeList;
        setLoading(false);
      } catch (err) {
        console.error("GraphView: failed to build graph", err);
        if (!cancelled) setLoading(false);
      }
    }

    buildGraph();
    return () => { cancelled = true; };
  }, [vaultPath]);

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
  });

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    colorsRef.current = {
      bgSurface: style.getPropertyValue("--bg-surface").trim() || "#313244",
      accent: style.getPropertyValue("--accent").trim() || "#89b4fa",
      border: style.getPropertyValue("--border").trim() || "#313244",
      textPrimary: style.getPropertyValue("--text-primary").trim() || "#cdd6f4",
      textMuted: style.getPropertyValue("--text-muted").trim() || "#6c7086",
      bgPrimary: style.getPropertyValue("--bg-primary").trim() || "#1e1e2e",
    };
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
          const force = REPULSION_STRENGTH / (dist * dist);
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

        // Center gravity
        a.vx += (centerX - a.x) * CENTER_GRAVITY;
        a.vy += (centerY - a.y) * CENTER_GRAVITY;
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

        const fx = dx * ATTRACTION_STRENGTH;
        const fy = dy * ATTRACTION_STRENGTH;

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

        const isHighlighted = hovered && highlightSet.has(a.id) && highlightSet.has(b.id);
        const isDimmedBySearch = search && (!searchMatched.has(a.id) && !searchMatched.has(b.id));

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = isHighlighted
          ? colors.accent
          : colors.border;
        ctx.globalAlpha = isDimmedBySearch ? 0.08 : isHighlighted ? 0.8 : 0.25;
        ctx.lineWidth = isHighlighted ? 1.5 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw nodes
      for (const n of ns) {
        const r = nodeRadius(n.connections, mc);
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
        } else {
          ctx.fillStyle = colors.bgSurface;
          ctx.fill();
          ctx.strokeStyle = isConnected && hovered ? colors.accent : colors.accent;
          ctx.lineWidth = isConnected && hovered ? 1.5 : 1;
          ctx.stroke();
        }

        // Label
        const showLabel = cam.zoom > 0.4 || isHovered || isActive || (search && isSearchMatch);
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
          if (node) {
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
            <span>notes</span>
          </div>
          <div className="graph-stat-item">
            <span className="graph-stat-value">{stats.edgeCount}</span>
            <span>connections</span>
          </div>
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
