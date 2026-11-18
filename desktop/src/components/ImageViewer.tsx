"use client";

import { useEffect, useState } from "react";
import { fileNameOf } from "@/lib/file-path";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp",
  ico: "image/x-icon", tiff: "image/tiff", tif: "image/tiff",
};

/**
 * Displays an image file from the vault. Loads bytes via readBinaryFile and
 * builds a data: URL — file:// is blocked in the Tauri/WebKitGTK webview.
 * Click toggles fit-to-view vs. actual size.
 */
export default function ImageViewer({ filePath }: { filePath: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [actualSize, setActualSize] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(false);
    setActualSize(false);
    (async () => {
      if (!window.electronAPI?.readBinaryFile) { setError(true); return; }
      try {
        const base64 = await window.electronAPI.readBinaryFile(filePath);
        if (cancelled) return;
        if (!base64) { setError(true); return; }
        const ext = filePath.split(".").pop()?.toLowerCase() || "";
        setSrc(`data:${MIME[ext] || "image/png"};base64,${base64}`);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [filePath]);

  return (
    <div className="flex items-center justify-center h-full w-full overflow-auto bg-[var(--bg-primary)] p-4">
      {error ? (
        <span className="text-sm text-[var(--text-muted)]">Couldn&apos;t load image</span>
      ) : src ? (
        <img
          src={src}
          alt={fileNameOf(filePath)}
          onClick={() => setActualSize((s) => !s)}
          draggable={false}
          style={
            actualSize
              ? { cursor: "zoom-out" }
              : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-in" }
          }
        />
      ) : (
        <span className="text-sm text-[var(--text-muted)]">Loading…</span>
      )}
    </div>
  );
}
