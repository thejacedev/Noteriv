"use client";

import type { SidebarPanel } from "@/lib/plugin-api";
import PluginMount from "@/components/PluginMount";

interface PluginSidebarPanelProps {
  panel: SidebarPanel;
  onClose: () => void;
}

export default function PluginSidebarPanel({ panel, onClose }: PluginSidebarPanelProps) {
  return (
    <div className="outline-panel plugin-panel">
      <div className="outline-header">
        <span className="outline-title">{panel.title}</span>
        <button onClick={onClose} className="outline-close" title="Close">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <PluginMount render={panel.render} className="plugin-panel-body" />
    </div>
  );
}

/**
 * Ribbon icon for a plugin panel. Short icons (an emoji or a symbol like "★")
 * are drawn as text; icon names such as "list" fall back to a generic glyph.
 */
export function PluginPanelIcon({ icon }: { icon: string }) {
  if (icon && Array.from(icon).length <= 2) {
    return <span className="ribbon-glyph">{icon}</span>;
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10 2v12" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
