"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Loading files of the vault for cards on the canvas.
 *
 * The editor's own players (`localMediaTag` in the markdown renderers) keep
 * each file's object URL for as long as the app runs, shared by every player
 * of that file. A canvas can hold many large files and is closed again, so a
 * card makes its own URL when it needs one and releases it when it goes away.
 */

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac", "3gp": "audio/3gpp",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska", ogv: "video/ogg",
  pdf: "application/pdf",
};

/** The bytes of a file. file:// is blocked in the webview, so files are read through the app. */
export async function readFileBytes(absolutePath: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const base64 = await window.electronAPI?.readBinaryFile(absolutePath);
  if (!base64) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function makeObjectUrl(absolutePath: string): Promise<string | null> {
  const bytes = await readFileBytes(absolutePath);
  if (!bytes) return null;
  const extension = absolutePath.split(".").pop()?.toLowerCase() || "";
  return URL.createObjectURL(new Blob([bytes], { type: MIME[extension] || "application/octet-stream" }));
}

/**
 * True once the element has been on screen. A card far off to the side of a
 * large canvas does not read its file until it is scrolled to.
 */
export function useSeen(ref: RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const element = ref.current;
    if (seen || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      // Start a little before the card comes into view.
      { rootMargin: "200px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, seen]);

  return seen;
}

/**
 * An object URL for a file, made once `wanted` is true. It is released when
 * the card goes away or turns to another file.
 */
export function useObjectUrl(
  absolutePath: string | null,
  wanted: boolean
): { url: string | null; failed: boolean } {
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!absolutePath || !wanted) return;
    let gone = false;
    let made: string | null = null;
    makeObjectUrl(absolutePath)
      .catch(() => null)
      .then((url) => {
        if (gone) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        made = url;
        setLoaded({ path: absolutePath, url });
      });
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [absolutePath, wanted]);

  // What was loaded for another file is not this card's any more.
  const current = loaded && loaded.path === absolutePath ? loaded : null;
  return { url: current?.url ?? null, failed: current !== null && current.url === null };
}
