import type { InlineRenderer, InlineReplacement } from "../types";

// Global EditorView reference — set by Editor.tsx
let _editorView: any = null;
export function setEditorViewForImages(view: any) { _editorView = view; }

// Cache of loaded images: absolute path → data URL
const imageCache = new Map<string, string>();
const loadingPaths = new Set<string>();

function resolveToAbsPath(src: string): string | null {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:") || src.startsWith("file://")) {
    return null;
  }
  const vaultPath = document.querySelector("[data-vault-path]")?.getAttribute("data-vault-path");
  if (!vaultPath) return null;
  return `${vaultPath}/${src}`;
}

function getMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const mimes: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp",
  };
  return mimes[ext] || "image/png";
}

async function loadLocalImage(absPath: string): Promise<string | null> {
  if (imageCache.has(absPath)) return imageCache.get(absPath)!;
  if (loadingPaths.has(absPath)) return null;
  loadingPaths.add(absPath);
  try {
    if (!window.electronAPI?.readBinaryFile) return null;
    const base64 = await window.electronAPI.readBinaryFile(absPath);
    if (!base64) return null;
    const dataUrl = `data:${getMime(absPath)};base64,${base64}`;
    imageCache.set(absPath, dataUrl);
    return dataUrl;
  } catch {
    return null;
  } finally {
    loadingPaths.delete(absPath);
  }
}

function loadPendingImages() {
  const imgs = document.querySelectorAll("img[data-local-src]:not([data-loaded])");
  imgs.forEach(async (img) => {
    const absPath = img.getAttribute("data-local-src");
    if (!absPath) return;
    img.setAttribute("data-loaded", "pending");
    const dataUrl = await loadLocalImage(absPath);
    if (dataUrl && img.isConnected) {
      (img as HTMLImageElement).src = dataUrl;
      img.setAttribute("data-loaded", "true");
    }
  });
}

let pollInterval: ReturnType<typeof setInterval> | null = null;
function ensurePolling() {
  if (pollInterval) return;
  pollInterval = setInterval(loadPendingImages, 300);
}
ensurePolling();

// --- Resize handling ---
// Attach resize handles to rendered images via DOM mutation observer + event delegation

let resizeListenerAttached = false;

function attachResizeListeners() {
  if (resizeListenerAttached) return;
  resizeListenerAttached = true;

  let activeResize: {
    img: HTMLImageElement;
    container: HTMLElement;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    dir: string;
  } | null = null;

  document.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;

    // Click on resize handle
    if (target.classList.contains("md-img-resize-handle")) {
      e.preventDefault();
      e.stopPropagation();
      const container = target.parentElement;
      const img = container?.querySelector("img") as HTMLImageElement | null;
      if (!container || !img) return;
      activeResize = {
        img,
        container,
        startX: e.clientX,
        startY: e.clientY,
        startW: img.offsetWidth,
        startH: img.offsetHeight,
        dir: target.getAttribute("data-dir") || "se",
      };
      return;
    }

    // Click on image — toggle selected state
    if (target.tagName === "IMG" && target.classList.contains("md-inline-img")) {
      const wrapper = target.closest(".md-img-wrapper");
      if (wrapper) {
        // Deselect others
        document.querySelectorAll(".md-img-wrapper.selected").forEach((el) => {
          if (el !== wrapper) el.classList.remove("selected");
        });
        wrapper.classList.toggle("selected");
      }
      return;
    }

    // Click elsewhere — deselect all
    document.querySelectorAll(".md-img-wrapper.selected").forEach((el) => el.classList.remove("selected"));
  }, true);

  document.addEventListener("mousemove", (e) => {
    if (!activeResize) return;
    e.preventDefault();
    const dx = e.clientX - activeResize.startX;
    const dy = e.clientY - activeResize.startY;
    const dir = activeResize.dir;
    const ratio = activeResize.startH / activeResize.startW;

    let newW = activeResize.startW;
    let newH = activeResize.startH;

    if (dir === "e" || dir === "ne" || dir === "se") newW = activeResize.startW + dx;
    if (dir === "w" || dir === "nw" || dir === "sw") newW = activeResize.startW - dx;
    if (dir === "s" || dir === "se" || dir === "sw") newH = activeResize.startH + dy;
    if (dir === "n" || dir === "ne" || dir === "nw") newH = activeResize.startH - dy;

    newW = Math.max(50, newW);
    newH = Math.max(30, newH);

    // Corners maintain aspect ratio
    if (dir === "nw" || dir === "ne" || dir === "sw" || dir === "se") {
      newH = Math.round(newW * ratio);
    }

    activeResize.img.style.width = `${newW}px`;
    activeResize.img.style.height = `${newH}px`;
    activeResize.container.style.width = `${newW}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!activeResize) return;
    const img = activeResize.img;
    const width = Math.round(img.offsetWidth);
    const height = Math.round(img.offsetHeight);

    const from = parseInt(activeResize.container.getAttribute("data-from") || "");
    const to = parseInt(activeResize.container.getAttribute("data-to") || "");
    const originalMd = activeResize.container.getAttribute("data-md") || "";

    if (!isNaN(from) && !isNaN(to) && originalMd) {
      const mdMatch = originalMd.match(/^!\[([^\]]*?)(?:\|(\d+(?:x\d+)?))?\]\(([^)]+)\)$/);
      if (mdMatch) {
        const alt = mdMatch[1];
        const src = mdMatch[3];
        const newMd = `![${alt}|${width}x${height}](${src})`;

        if (_editorView) {
          _editorView.dispatch({ changes: { from, to, insert: newMd } });
        }
      }
    }

    activeResize = null;
  });
}

attachResizeListeners();

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const imageRenderer: InlineRenderer = {
  name: "images",
  priority: 10,

  find(text: string, offset: number): InlineReplacement[] {
    const results: InlineReplacement[] = [];
    // Match ![alt](src), ![alt|WIDTH](src), ![alt|WIDTHxHEIGHT](src)
    const regex = /!\[([^\]]*?)(?:\|(\d+(?:x\d+)?))?\]\(([^)]+)\)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const alt = match[1];
      const sizeStr = match[2]; // "300" or "300x200"
      const rawSrc = match[3];
      const fullMatch = match[0];
      const absPath = resolveToAbsPath(rawSrc);

      let sizeStyle = "";
      if (sizeStr) {
        const parts = sizeStr.split("x");
        const w = parts[0];
        const h = parts[1];
        sizeStyle = ` style="width:${w}px${h ? `;height:${h}px` : ""}"`;
      }
      const from = offset + match.index;
      const to = from + fullMatch.length;

      let imgTag: string;
      if (absPath) {
        const cached = imageCache.get(absPath);
        if (cached) {
          imgTag = `<img src="${cached}" alt="${escapeAttr(alt)}" class="md-inline-img"${sizeStyle}/>`;
        } else {
          const placeholderStyle = `min-height:24px;background:#313244;border-radius:4px${sizeStr ? `;width:${sizeStr.split("x")[0]}px` : ""}`;
          imgTag = `<img src="" alt="${escapeAttr(alt)}" data-local-src="${escapeAttr(absPath)}" class="md-inline-img" style="${placeholderStyle}"/>`;
        }
      } else {
        imgTag = `<img src="${escapeAttr(rawSrc)}" alt="${escapeAttr(alt)}" class="md-inline-img"${sizeStyle}/>`;
      }

      const handles = `<span class="md-img-resize-handle nw" data-dir="nw"></span><span class="md-img-resize-handle n" data-dir="n"></span><span class="md-img-resize-handle ne" data-dir="ne"></span><span class="md-img-resize-handle e" data-dir="e"></span><span class="md-img-resize-handle se" data-dir="se"></span><span class="md-img-resize-handle s" data-dir="s"></span><span class="md-img-resize-handle sw" data-dir="sw"></span><span class="md-img-resize-handle w" data-dir="w"></span>`;
      const html = `<span class="md-img-wrapper" data-from="${from}" data-to="${to}" data-md="${escapeAttr(fullMatch)}">${imgTag}${handles}</span>`;

      results.push({ from, to, html, className: "md-image" });
    }

    return results;
  },
};
