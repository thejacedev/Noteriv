"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  type PDFAnnotation,
  type PDFAnnotationFile,
  loadAnnotations,
  saveAnnotations,
  exportAnnotationsAsMarkdown,
  generateAnnotationId,
} from "@/lib/pdf-annotation";

interface PDFViewerProps {
  filePath: string;
  vaultPath: string;
  onExportedNote?: (mdPath: string) => void;
  onClose: () => void;
}

type AnnotationTool = "select" | "highlight" | "note" | "underline";
type HighlightColor = "yellow" | "green" | "blue" | "pink";

const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: "#f9e2af",
  green: "#a6e3a1",
  blue: "#89b4fa",
  pink: "#f5c2e7",
};

// Catppuccin Mocha palette
const C = {
  base: "#1e1e2e",
  surface0: "#313244",
  surface1: "#45475a",
  surface2: "#585b70",
  overlay0: "#6c7086",
  text: "#cdd6f4",
  subtext: "#a6adc8",
  blue: "#89b4fa",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  pink: "#f5c2e7",
  mantle: "#181825",
};

interface PageRenderState {
  canvas: HTMLCanvasElement | null;
  textItems: Array<{ str: string; x: number; y: number; w: number; h: number }>;
  viewport: { width: number; height: number; scale: number };
}

export default function PDFViewer({ filePath, vaultPath, onExportedNote, onClose }: PDFViewerProps) {
  // PDF state
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Annotation state
  const [annotations, setAnnotations] = useState<PDFAnnotation[]>([]);
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const [showSidebar, setShowSidebar] = useState(true);
  const [editingAnnotation, setEditingAnnotation] = useState<string | null>(null);
  const [editComment, setEditComment] = useState("");
  const [notePopover, setNotePopover] = useState<{ x: number; y: number; page: number } | null>(null);
  const [noteText, setNoteText] = useState("");

  // Selection state for highlight/underline
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number; page: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);

  // Refs
  const pdfDocRef = useRef<any>(null);
  const pageRenderStates = useRef<Map<number, PageRenderState>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const annotationFileRef = useRef<PDFAnnotationFile>({ pdfPath: filePath, annotations: [] });
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);

        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        // Read PDF file as base64 via Electron
        if (!window.electronAPI) {
          setError("Electron API not available");
          return;
        }

        const raw = await window.electronAPI.readBinaryFile(filePath);
        if (raw === null) {
          setError("Could not read PDF file");
          return;
        }

        // Convert base64 to Uint8Array
        const binaryStr = atob(raw);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load PDF");
          setLoading(false);
        }
      }
    }
    loadPdf();
    return () => { cancelled = true; };
  }, [filePath]);

  // Load annotations
  useEffect(() => {
    loadAnnotations(filePath).then((file) => {
      annotationFileRef.current = file;
      setAnnotations(file.annotations);
    });
  }, [filePath]);

  // Auto-save annotations (debounced)
  const debounceSave = useCallback((anns: PDFAnnotation[]) => {
    annotationFileRef.current.annotations = anns;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveAnnotations(annotationFileRef.current);
    }, 500);
  }, []);

  const updateAnnotations = useCallback((anns: PDFAnnotation[]) => {
    setAnnotations(anns);
    debounceSave(anns);
  }, [debounceSave]);

  // Render a single PDF page to canvas
  const renderPage = useCallback(async (pageNum: number, canvas: HTMLCanvasElement) => {
    if (!pdfDocRef.current) return;
    const page = await pdfDocRef.current.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = zoom * 1.5; // Higher base scale for clarity
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Get text content for text selection
    const textContent = await page.getTextContent();
    const textItems: PageRenderState["textItems"] = [];

    for (const item of textContent.items) {
      if (!("str" in item)) continue;
      const tx = item.transform;
      // transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
      const fontSize = Math.abs(tx[3]) * scale;
      const x = tx[4] * scale;
      const y = viewport.height - tx[5] * scale - fontSize;
      const w = (item.width || 0) * scale;
      const h = fontSize;
      textItems.push({ str: item.str, x, y, w, h });
    }

    pageRenderStates.current.set(pageNum, {
      canvas,
      textItems,
      viewport: { width: viewport.width, height: viewport.height, scale },
    });
  }, [zoom]);

  // Render all visible pages
  useEffect(() => {
    if (!pdfDocRef.current || loading) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    // Render pages that have canvas refs
    const canvases = container.querySelectorAll<HTMLCanvasElement>("canvas[data-page]");
    canvases.forEach((canvas) => {
      const pageNum = parseInt(canvas.getAttribute("data-page") || "0");
      if (pageNum > 0) renderPage(pageNum, canvas);
    });
  }, [numPages, zoom, loading, renderPage]);

  // Track current page from scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const children = container.querySelectorAll("[data-page-container]");
      let closest = 1;
      let minDist = Infinity;
      const scrollTop = container.scrollTop + container.clientHeight / 3;
      children.forEach((child) => {
        const el = child as HTMLElement;
        const dist = Math.abs(el.offsetTop - scrollTop);
        if (dist < minDist) {
          minDist = dist;
          closest = parseInt(el.getAttribute("data-page-container") || "1");
        }
      });
      setCurrentPage(closest);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [numPages, loading]);

  // Navigate to page
  const goToPage = useCallback((page: number) => {
    const clamped = Math.max(1, Math.min(page, numPages));
    setCurrentPage(clamped);
    const container = scrollContainerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-page-container="${clamped}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [numPages]);

  // Zoom
  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 4)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.25)), []);
  const fitWidth = useCallback(() => setZoom(1.0), []);

  // Scroll to annotation
  const scrollToAnnotation = useCallback((ann: PDFAnnotation) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-page-container="${ann.page}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Handle mouse events on page overlay for creating annotations
  const handlePageMouseDown = useCallback((e: React.MouseEvent, pageNum: number) => {
    if (tool === "select") return;
    if (tool === "note") {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setNotePopover({ x, y, page: pageNum });
      setNoteText("");
      return;
    }
    // Highlight or underline — start selection
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsSelecting(true);
    setSelectionStart({ x, y, page: pageNum });
    setSelectionEnd({ x, y });
  }, [tool]);

  const handlePageMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !selectionStart) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelectionEnd({ x, y });
  }, [isSelecting, selectionStart]);

  const handlePageMouseUp = useCallback(() => {
    if (!isSelecting || !selectionStart || !selectionEnd) {
      setIsSelecting(false);
      return;
    }

    const pageNum = selectionStart.page;
    const pageState = pageRenderStates.current.get(pageNum);
    if (!pageState) {
      setIsSelecting(false);
      return;
    }

    // Find text items within the selection rectangle
    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const maxX = Math.max(selectionStart.x, selectionEnd.x);
    const minY = Math.min(selectionStart.y, selectionEnd.y);
    const maxY = Math.max(selectionStart.y, selectionEnd.y);

    // Expand selection vertically to capture text lines
    const selectedTexts: string[] = [];
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];

    for (const item of pageState.textItems) {
      const itemCenterX = item.x + item.w / 2;
      const itemCenterY = item.y + item.h / 2;

      // Check if the text item intersects with the selection area
      const intersects = (
        item.x < maxX && item.x + item.w > minX &&
        item.y < maxY && item.y + item.h > minY
      );

      // Or if center is within selection
      const centerInside = (
        itemCenterX >= minX && itemCenterX <= maxX &&
        itemCenterY >= minY && itemCenterY <= maxY
      );

      if ((intersects || centerInside) && item.str.trim()) {
        selectedTexts.push(item.str);
        rects.push({ x: item.x, y: item.y, w: item.w, h: item.h });
      }
    }

    if (selectedTexts.length > 0) {
      // Compute bounding rect of all selected items
      const bx = Math.min(...rects.map((r) => r.x));
      const by = Math.min(...rects.map((r) => r.y));
      const bx2 = Math.max(...rects.map((r) => r.x + r.w));
      const by2 = Math.max(...rects.map((r) => r.y + r.h));

      const scale = pageState.viewport.scale;
      const ann: PDFAnnotation = {
        id: generateAnnotationId(),
        page: pageNum,
        type: tool === "highlight" ? "highlight" : "underline",
        text: selectedTexts.join(" "),
        comment: "",
        color: HIGHLIGHT_COLORS[highlightColor],
        rect: {
          x: bx / scale,
          y: by / scale,
          w: (bx2 - bx) / scale,
          h: (by2 - by) / scale,
        },
        created: Date.now(),
      };
      updateAnnotations([...annotations, ann]);
    }

    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [isSelecting, selectionStart, selectionEnd, tool, highlightColor, annotations, updateAnnotations]);

  // Create note annotation
  const handleCreateNote = useCallback(() => {
    if (!notePopover || !noteText.trim()) {
      setNotePopover(null);
      return;
    }
    const pageState = pageRenderStates.current.get(notePopover.page);
    const scale = pageState?.viewport?.scale || 1;

    const ann: PDFAnnotation = {
      id: generateAnnotationId(),
      page: notePopover.page,
      type: "note",
      text: "",
      comment: noteText.trim(),
      color: HIGHLIGHT_COLORS[highlightColor],
      rect: {
        x: notePopover.x / scale,
        y: notePopover.y / scale,
        w: 24 / scale,
        h: 24 / scale,
      },
      created: Date.now(),
    };
    updateAnnotations([...annotations, ann]);
    setNotePopover(null);
    setNoteText("");
  }, [notePopover, noteText, highlightColor, annotations, updateAnnotations]);

  // Delete annotation
  const deleteAnnotation = useCallback((id: string) => {
    updateAnnotations(annotations.filter((a) => a.id !== id));
    if (editingAnnotation === id) setEditingAnnotation(null);
  }, [annotations, editingAnnotation, updateAnnotations]);

  // Update annotation comment
  const saveAnnotationComment = useCallback((id: string, comment: string) => {
    updateAnnotations(annotations.map((a) => a.id === id ? { ...a, comment } : a));
    setEditingAnnotation(null);
  }, [annotations, updateAnnotations]);

  // Export annotations
  const handleExport = useCallback(async () => {
    const file: PDFAnnotationFile = { pdfPath: filePath, annotations };
    const mdPath = await exportAnnotationsAsMarkdown(file);
    if (mdPath && onExportedNote) onExportedNote(mdPath);
  }, [filePath, annotations, onExportedNote]);

  // Handle annotation click
  const handleAnnotationClick = useCallback((ann: PDFAnnotation, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tool === "select") {
      setEditingAnnotation(ann.id);
      setEditComment(ann.comment);
    }
  }, [tool]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (notePopover) {
          setNotePopover(null);
        } else if (editingAnnotation) {
          setEditingAnnotation(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, notePopover, editingAnnotation]);

  // Get annotations for a specific page
  const getPageAnnotations = useCallback((pageNum: number) => {
    return annotations.filter((a) => a.page === pageNum);
  }, [annotations]);

  // Render selection rectangle
  const renderSelection = useCallback((pageNum: number) => {
    if (!isSelecting || !selectionStart || !selectionEnd || selectionStart.page !== pageNum) return null;
    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const minY = Math.min(selectionStart.y, selectionEnd.y);
    const w = Math.abs(selectionEnd.x - selectionStart.x);
    const h = Math.abs(selectionEnd.y - selectionStart.y);

    return (
      <div
        style={{
          position: "absolute",
          left: minX,
          top: minY,
          width: w,
          height: h,
          background: `${HIGHLIGHT_COLORS[highlightColor]}33`,
          border: `1px dashed ${HIGHLIGHT_COLORS[highlightColor]}`,
          pointerEvents: "none",
        }}
      />
    );
  }, [isSelecting, selectionStart, selectionEnd, highlightColor]);

  // Render annotation overlay on a page
  const renderAnnotationOverlay = useCallback((ann: PDFAnnotation, pageNum: number) => {
    const pageState = pageRenderStates.current.get(pageNum);
    const scale = pageState?.viewport?.scale || 1;

    if (ann.type === "note") {
      return (
        <div
          key={ann.id}
          onClick={(e) => handleAnnotationClick(ann, e)}
          style={{
            position: "absolute",
            left: ann.rect.x * scale - 12,
            top: ann.rect.y * scale - 12,
            width: 24,
            height: 24,
            cursor: "pointer",
            zIndex: 10,
          }}
          title={ann.comment}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill={ann.color} stroke={C.base} strokeWidth="1.5">
            <path d="M4 4h16v14H8l-4 4V4z" />
          </svg>
        </div>
      );
    }

    const isUnderline = ann.type === "underline";
    return (
      <div
        key={ann.id}
        onClick={(e) => handleAnnotationClick(ann, e)}
        style={{
          position: "absolute",
          left: ann.rect.x * scale,
          top: ann.rect.y * scale,
          width: ann.rect.w * scale,
          height: ann.rect.h * scale,
          background: isUnderline ? "transparent" : `${ann.color}40`,
          borderBottom: isUnderline ? `2px solid ${ann.color}` : "none",
          cursor: "pointer",
          zIndex: 5,
          borderRadius: isUnderline ? 0 : 2,
        }}
        title={ann.comment || ann.text}
      />
    );
  }, [handleAnnotationClick]);

  // Sorted annotations for sidebar
  const sortedAnnotations = [...annotations].sort((a, b) => a.page - b.page || a.created - b.created);

  const fileName = filePath.split("/").pop() || "PDF";

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: C.base,
        color: C.text,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: C.mantle,
          borderBottom: `1px solid ${C.surface0}`,
          flexShrink: 0,
          minHeight: 42,
        }}
      >
        {/* File name */}
        <span style={{ fontSize: 13, color: C.subtext, marginRight: 8, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fileName}
        </span>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: C.surface1, marginRight: 4 }} />

        {/* Page navigation */}
        <ToolbarButton onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} title="Previous page">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </ToolbarButton>
        <span style={{ fontSize: 12, color: C.subtext, minWidth: 60, textAlign: "center" }}>
          {currentPage} / {numPages}
        </span>
        <ToolbarButton onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages} title="Next page">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </ToolbarButton>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: C.surface1, margin: "0 4px" }} />

        {/* Zoom */}
        <ToolbarButton onClick={zoomOut} title="Zoom out">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </ToolbarButton>
        <span style={{ fontSize: 12, color: C.subtext, minWidth: 40, textAlign: "center" }}>
          {Math.round(zoom * 100)}%
        </span>
        <ToolbarButton onClick={zoomIn} title="Zoom in">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </ToolbarButton>
        <ToolbarButton onClick={fitWidth} title="Fit width">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="3" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" /><path d="M4 7h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        </ToolbarButton>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: C.surface1, margin: "0 4px" }} />

        {/* Tool selector */}
        <ToolbarButton active={tool === "select"} onClick={() => setTool("select")} title="Select tool">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 2l2 10 2.5-4L12 6 3 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
        </ToolbarButton>
        <ToolbarButton active={tool === "highlight"} onClick={() => setTool("highlight")} title="Highlight tool">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="4" width="10" height="6" rx="1" fill={tool === "highlight" ? HIGHLIGHT_COLORS[highlightColor] + "66" : "none"} stroke="currentColor" strokeWidth="1.3" /></svg>
        </ToolbarButton>
        <ToolbarButton active={tool === "note"} onClick={() => setTool("note")} title="Note tool">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3h8v8H6l-3 3V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M5 6h4M5 8h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
        </ToolbarButton>
        <ToolbarButton active={tool === "underline"} onClick={() => setTool("underline")} title="Underline tool">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 11h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M4 3v4a3 3 0 006 0V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        </ToolbarButton>

        {/* Highlight color picker (only when highlight or note or underline tool) */}
        {tool !== "select" && (
          <>
            <div style={{ width: 1, height: 20, background: C.surface1, margin: "0 4px" }} />
            {(Object.entries(HIGHLIGHT_COLORS) as [HighlightColor, string][]).map(([name, color]) => (
              <button
                key={name}
                onClick={() => setHighlightColor(name)}
                title={name}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: color,
                  border: highlightColor === name ? `2px solid ${C.text}` : `2px solid transparent`,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              />
            ))}
          </>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Toggle annotation sidebar */}
        <ToolbarButton active={showSidebar} onClick={() => setShowSidebar((s) => !s)} title="Toggle annotation sidebar">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M9 2v10" stroke="currentColor" strokeWidth="1.3" /></svg>
        </ToolbarButton>

        {/* Export */}
        <ToolbarButton onClick={handleExport} disabled={annotations.length === 0} title="Export annotations as markdown">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M2 10v2h10v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </ToolbarButton>

        {/* Close */}
        <ToolbarButton onClick={onClose} title="Close PDF viewer">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </ToolbarButton>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* PDF scroll area */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "20px 20px",
            gap: 16,
            background: C.surface0,
          }}
        >
          {loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
              <div style={{ width: 32, height: 32, border: `2px solid ${C.blue}`, borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 13, color: C.subtext }}>Loading PDF...</span>
            </div>
          )}

          {error && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
              <span style={{ fontSize: 13, color: C.red }}>{error}</span>
              <button onClick={onClose} style={{ fontSize: 12, color: C.blue, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Close</button>
            </div>
          )}

          {!loading && !error && Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <div
              key={pageNum}
              data-page-container={pageNum}
              style={{ position: "relative", boxShadow: "0 2px 12px rgba(0,0,0,0.4)", borderRadius: 4, overflow: "hidden" }}
            >
              <canvas data-page={pageNum} style={{ display: "block" }} />
              {/* Annotation + interaction overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  cursor: tool === "select" ? "default" : tool === "note" ? "crosshair" : "text",
                }}
                onMouseDown={(e) => handlePageMouseDown(e, pageNum)}
                onMouseMove={handlePageMouseMove}
                onMouseUp={handlePageMouseUp}
              >
                {/* Render annotations for this page */}
                {getPageAnnotations(pageNum).map((ann) => renderAnnotationOverlay(ann, pageNum))}

                {/* Render selection rectangle */}
                {renderSelection(pageNum)}

                {/* Note popover */}
                {notePopover && notePopover.page === pageNum && (
                  <div
                    style={{
                      position: "absolute",
                      left: notePopover.x,
                      top: notePopover.y,
                      background: C.surface0,
                      border: `1px solid ${C.surface1}`,
                      borderRadius: 8,
                      padding: 10,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                      zIndex: 20,
                      width: 220,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Type your note..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCreateNote();
                        if (e.key === "Escape") setNotePopover(null);
                      }}
                      style={{
                        width: "100%",
                        height: 60,
                        background: C.base,
                        color: C.text,
                        border: `1px solid ${C.surface1}`,
                        borderRadius: 4,
                        padding: 6,
                        fontSize: 12,
                        resize: "none",
                        outline: "none",
                        fontFamily: "inherit",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => setNotePopover(null)}
                        style={{
                          fontSize: 11,
                          padding: "3px 10px",
                          borderRadius: 4,
                          background: C.surface1,
                          color: C.subtext,
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateNote}
                        style={{
                          fontSize: 11,
                          padding: "3px 10px",
                          borderRadius: 4,
                          background: C.blue,
                          color: C.base,
                          border: "none",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Add Note
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Page number label */}
              <div style={{ position: "absolute", bottom: 4, right: 8, fontSize: 10, color: C.overlay0, background: `${C.base}cc`, padding: "1px 6px", borderRadius: 3 }}>
                {pageNum}
              </div>
            </div>
          ))}
        </div>

        {/* Annotation sidebar */}
        {showSidebar && (
          <div
            style={{
              width: 280,
              background: C.base,
              borderLeft: `1px solid ${C.surface0}`,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.surface0}`, fontSize: 13, fontWeight: 600, color: C.text }}>
              Annotations ({annotations.length})
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
              {sortedAnnotations.length === 0 && (
                <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: C.overlay0 }}>
                  No annotations yet. Use the highlight, note, or underline tool to annotate.
                </div>
              )}
              {sortedAnnotations.map((ann) => (
                <div
                  key={ann.id}
                  style={{
                    padding: 8,
                    marginBottom: 6,
                    borderRadius: 6,
                    background: editingAnnotation === ann.id ? C.surface1 : C.surface0,
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onClick={() => scrollToAnnotation(ann)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: ann.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: C.overlay0, textTransform: "capitalize" }}>{ann.type}</span>
                    <span style={{ fontSize: 10, color: C.overlay0, marginLeft: "auto" }}>p.{ann.page}</span>
                  </div>
                  {ann.text && (
                    <div style={{ fontSize: 12, color: C.subtext, marginBottom: 4, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const }}>
                      {ann.text}
                    </div>
                  )}
                  {editingAnnotation === ann.id ? (
                    <div style={{ marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                      <textarea
                        value={editComment}
                        onChange={(e) => setEditComment(e.target.value)}
                        autoFocus
                        placeholder="Add a comment..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            saveAnnotationComment(ann.id, editComment);
                          }
                          if (e.key === "Escape") setEditingAnnotation(null);
                        }}
                        style={{
                          width: "100%",
                          height: 48,
                          background: C.base,
                          color: C.text,
                          border: `1px solid ${C.surface1}`,
                          borderRadius: 4,
                          padding: 6,
                          fontSize: 11,
                          resize: "none",
                          outline: "none",
                          fontFamily: "inherit",
                        }}
                      />
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        <button
                          onClick={() => saveAnnotationComment(ann.id, editComment)}
                          style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: C.blue, color: C.base, border: "none", cursor: "pointer", fontWeight: 600 }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingAnnotation(null)}
                          style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: C.surface1, color: C.subtext, border: "none", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => deleteAnnotation(ann.id)}
                          style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "transparent", color: C.red, border: `1px solid ${C.red}44`, cursor: "pointer", marginLeft: "auto" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : ann.comment ? (
                    <div style={{ fontSize: 11, color: C.overlay0, fontStyle: "italic", marginTop: 2, lineHeight: 1.3 }}>
                      {ann.comment}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Spin animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// Toolbar button sub-component
function ToolbarButton({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 6,
        background: active ? C.surface1 : "transparent",
        color: disabled ? C.surface2 : active ? C.blue : C.subtext,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        flexShrink: 0,
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.background = C.surface1;
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}
