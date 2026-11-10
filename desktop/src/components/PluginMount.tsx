"use client";

import { useEffect, useRef } from "react";

interface PluginMountProps {
  /** A plugin's `render(container)`; may return a cleanup function. */
  render: (container: HTMLElement) => void | (() => void);
  className?: string;
}

/**
 * Hands a plugin an empty element to draw into, and runs the plugin's
 * cleanup (then clears the element) when it unmounts or `render` changes.
 */
export default function PluginMount({ render, className }: PluginMountProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cleanup: void | (() => void);
    try {
      cleanup = render(el);
    } catch (err) {
      console.error("[plugin] render failed:", err);
      const msg = document.createElement("div");
      msg.className = "plugin-mount-error";
      msg.textContent = `Plugin error: ${err instanceof Error ? err.message : String(err)}`;
      el.replaceChildren(msg);
    }
    return () => {
      try {
        if (typeof cleanup === "function") cleanup();
      } catch {
        // Ignore errors during plugin cleanup
      }
      el.replaceChildren();
    };
  }, [render]);

  return <div ref={ref} className={className} />;
}
