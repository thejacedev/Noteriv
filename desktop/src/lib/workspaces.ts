/**
 * Saved layouts ("workspaces"): which notes are open, which is in front,
 * what is expanded in the file list and which side panels are showing, kept
 * under a name so a way of working can be brought back with one command.
 *
 * They live in `<vault>/.noteriv/workspaces.json`, with paths written from
 * the top of the vault so the same layouts work wherever the vault is.
 */

import { fromVaultRelative, toVaultRelative } from "./vault-paths";

export type LayoutViewMode = "live" | "source" | "view";

/** A layout as the app holds it: full paths. */
export interface Layout {
  openTabs: string[];
  activeTab: string | null;
  /** The note in the right half of a split, if there is one. */
  splitTab: string | null;
  pinnedTabs: string[];
  expandedFolders: string[];
  /** A view mode chosen for one note. */
  fileViewModes: Record<string, LayoutViewMode>;
  viewMode: LayoutViewMode;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** The side panels that are open, by name. */
  panels: string[];
}

export interface LayoutStore {
  /** Saved layouts by name, paths from the top of the vault. */
  layouts: Record<string, Layout>;
  /** The layout last loaded or saved. */
  active: string | null;
}

export const EMPTY_LAYOUTS: LayoutStore = { layouts: {}, active: null };

const VIEW_MODES: LayoutViewMode[] = ["live", "source", "view"];

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
}

function viewMode(value: unknown): LayoutViewMode {
  return VIEW_MODES.includes(value as LayoutViewMode) ? (value as LayoutViewMode) : "live";
}

/** A layout read from a file, with anything missing or malformed set to a safe value. */
function cleanLayout(raw: unknown): Layout | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const openTabs = strings(r.openTabs);
  const modes: Record<string, LayoutViewMode> = {};
  if (r.fileViewModes && typeof r.fileViewModes === "object") {
    for (const [path, mode] of Object.entries(r.fileViewModes as Record<string, unknown>)) {
      if (VIEW_MODES.includes(mode as LayoutViewMode)) modes[path] = mode as LayoutViewMode;
    }
  }
  const width = typeof r.sidebarWidth === "number" && Number.isFinite(r.sidebarWidth) ? r.sidebarWidth : 250;
  return {
    openTabs,
    activeTab: typeof r.activeTab === "string" && openTabs.includes(r.activeTab) ? r.activeTab : (openTabs[0] ?? null),
    splitTab: typeof r.splitTab === "string" && openTabs.includes(r.splitTab) ? r.splitTab : null,
    pinnedTabs: strings(r.pinnedTabs).filter((p) => openTabs.includes(p)),
    expandedFolders: strings(r.expandedFolders),
    fileViewModes: modes,
    viewMode: viewMode(r.viewMode),
    sidebarCollapsed: r.sidebarCollapsed === true,
    sidebarWidth: Math.max(180, Math.min(520, width)),
    panels: strings(r.panels),
  };
}

export function parseLayouts(text: string | null | undefined): LayoutStore {
  if (!text) return { layouts: {}, active: null };
  try {
    const raw = JSON.parse(text);
    const layouts: Record<string, Layout> = {};
    if (raw?.layouts && typeof raw.layouts === "object") {
      for (const [name, value] of Object.entries(raw.layouts as Record<string, unknown>)) {
        const layout = cleanLayout(value);
        if (layout && name !== "" && cleanLayoutName(name) === name) layouts[name] = layout;
      }
    }
    const active = typeof raw?.active === "string" && raw.active in layouts ? raw.active : null;
    return { layouts, active };
  } catch {
    return { layouts: {}, active: null };
  }
}

export function serializeLayouts(store: LayoutStore): string {
  const sorted = Object.fromEntries(layoutNames(store).map((name) => [name, store.layouts[name]]));
  return JSON.stringify({ layouts: sorted, active: store.active }, null, 2);
}

/** A layout name as it is kept: trimmed, one space between words. Empty when there is nothing left. */
export function cleanLayoutName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function layoutNames(store: LayoutStore): string[] {
  return Object.keys(store.layouts).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

/** The layout to keep in the vault's file: paths from the top of the vault, anything outside it left out. */
export function toStoredLayout(layout: Layout, vaultPath: string): Layout {
  const rel = (path: string) => toVaultRelative(path, vaultPath);
  const keep = (paths: string[]) => paths.map(rel).filter((p): p is string => p !== null);
  const modes: Record<string, LayoutViewMode> = {};
  for (const [path, mode] of Object.entries(layout.fileViewModes)) {
    const r = rel(path);
    if (r !== null) modes[r] = mode;
  }
  return {
    ...layout,
    openTabs: keep(layout.openTabs),
    activeTab: layout.activeTab ? rel(layout.activeTab) : null,
    splitTab: layout.splitTab ? rel(layout.splitTab) : null,
    pinnedTabs: keep(layout.pinnedTabs),
    expandedFolders: keep(layout.expandedFolders),
    fileViewModes: modes,
  };
}

/** A stored layout with full paths again, for the vault as it is on this machine. */
export function fromStoredLayout(layout: Layout, vaultPath: string): Layout {
  const abs = (path: string) => fromVaultRelative(path, vaultPath);
  const keep = (paths: string[]) => paths.map(abs).filter((p): p is string => p !== null);
  const modes: Record<string, LayoutViewMode> = {};
  for (const [path, mode] of Object.entries(layout.fileViewModes)) {
    const a = abs(path);
    if (a !== null) modes[a] = mode;
  }
  const openTabs = keep(layout.openTabs);
  const activeTab = layout.activeTab ? abs(layout.activeTab) : null;
  const splitTab = layout.splitTab ? abs(layout.splitTab) : null;
  return {
    ...layout,
    openTabs,
    activeTab: activeTab && openTabs.includes(activeTab) ? activeTab : (openTabs[0] ?? null),
    splitTab: splitTab && openTabs.includes(splitTab) ? splitTab : null,
    pinnedTabs: keep(layout.pinnedTabs),
    expandedFolders: keep(layout.expandedFolders),
    fileViewModes: modes,
  };
}

/** Save a layout under a name, replacing one of that name, and make it the active one. */
export function putLayout(store: LayoutStore, name: string, layout: Layout): LayoutStore {
  const clean = cleanLayoutName(name);
  if (!clean) return store;
  return { layouts: { ...store.layouts, [clean]: layout }, active: clean };
}

export function removeLayout(store: LayoutStore, name: string): LayoutStore {
  if (!(name in store.layouts)) return store;
  const layouts = { ...store.layouts };
  delete layouts[name];
  return { layouts, active: store.active === name ? null : store.active };
}

/** Rename a layout. Nothing changes when the new name is empty or taken. */
export function renameLayout(store: LayoutStore, from: string, to: string): LayoutStore {
  const clean = cleanLayoutName(to);
  if (!clean || clean === from || !(from in store.layouts) || clean in store.layouts) return store;
  const layouts: Record<string, Layout> = {};
  for (const [name, layout] of Object.entries(store.layouts)) layouts[name === from ? clean : name] = layout;
  return { layouts, active: store.active === from ? clean : store.active };
}

/** A line that says what a layout holds, for the list of layouts. */
export function describeLayout(layout: Layout): string {
  const count = layout.openTabs.length;
  const notes = count === 0 ? "No notes open" : `${count} ${count === 1 ? "note" : "notes"} open`;
  const extras = [layout.splitTab ? "split" : "", ...layout.panels].filter(Boolean);
  return extras.length > 0 ? `${notes}, ${extras.join(", ")}` : notes;
}
