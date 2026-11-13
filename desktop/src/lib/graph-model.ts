/**
 * What the graph view draws: which nodes and links exist for a set of
 * notes and a set of choices (the whole vault or the neighbourhood of one
 * note, with or without tags, attachments and notes that do not exist yet).
 * Built from the vault index; no file is read here.
 */

import { findLinkedNoteFrom } from "./wiki-link-utils";
import { findNoteByAlias, type NoteMeta } from "./vault-index";

export type GraphNodeKind = "note" | "tag" | "attachment" | "missing";

export interface GraphModelNode {
  /** A note's full path, or `tag:name`, `file:name`, `missing:name`. */
  id: string;
  label: string;
  kind: GraphNodeKind;
  /** How many links touch it. */
  connections: number;
  /** When the note was created, for the time-lapse. 0 for other kinds. */
  ctime: number;
  /** A group's colour, when a group claims the node. */
  color: string | null;
}

export interface GraphModelEdge {
  source: string;
  target: string;
  /** Both notes link to each other. */
  reciprocal: boolean;
}

export interface GraphGroup {
  /** `tag:#work`, `path:Projects`, `file:plan`, or plain text matched against name and path. */
  query: string;
  color: string;
}

export interface GraphFilters {
  /** Only the current note and what is within `depth` links of it. */
  local: boolean;
  depth: number;
  showTags: boolean;
  showAttachments: boolean;
  /** Leave out links to notes that do not exist. */
  existingOnly: boolean;
  showOrphans: boolean;
  groups: GraphGroup[];
}

export const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  local: false,
  depth: 1,
  showTags: false,
  showAttachments: false,
  existingOnly: true,
  showOrphans: true,
  groups: [],
};

const NOTE_EXT = /\.(md|markdown)$/i;

/** Whether a group's query claims a note. */
export function groupMatches(query: string, note: Pick<NoteMeta, "name" | "relativePath" | "allTags">): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const [op, ...rest] = q.split(":");
  const value = rest.join(":").trim();
  if (rest.length > 0 && value) {
    if (op === "tag") {
      const tag = value.replace(/^#/, "");
      return note.allTags.some((t) => {
        const lower = t.toLowerCase();
        return lower === tag || lower.startsWith(tag + "/");
      });
    }
    if (op === "path") return note.relativePath.toLowerCase().includes(value);
    if (op === "file") return note.name.toLowerCase().includes(value);
  }
  return note.name.toLowerCase().includes(q) || note.relativePath.toLowerCase().includes(q);
}

export function buildGraphModel(
  notes: NoteMeta[],
  filters: GraphFilters,
  currentFile: string | null
): { nodes: GraphModelNode[]; edges: GraphModelEdge[] } {
  const nodes = new Map<string, GraphModelNode>();
  const directed = new Map<string, { source: string; target: string }>();

  const add = (id: string, label: string, kind: GraphNodeKind, ctime = 0) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, kind, connections: 0, ctime, color: null });
  };
  const link = (source: string, target: string) => {
    if (source !== target) directed.set(`${source}\0${target}`, { source, target });
  };

  for (const note of notes) {
    add(note.filePath, note.name, "note", note.ctime);
  }
  for (const note of notes) {
    for (const target of note.links) {
      const resolved = findLinkedNoteFrom(notes, note.relativePath, target) ?? findNoteByAlias(notes, target);
      if (resolved) {
        link(note.filePath, resolved.filePath);
        continue;
      }
      const name = target.replace(/\\/g, "/").split("/").pop() || target;
      const isFile = /\.[a-z0-9]{1,8}$/i.test(name) && !NOTE_EXT.test(name);
      if (isFile) {
        if (!filters.showAttachments) continue;
        const id = `file:${name.toLowerCase()}`;
        add(id, name, "attachment");
        link(note.filePath, id);
      } else {
        if (filters.existingOnly) continue;
        const id = `missing:${name.toLowerCase()}`;
        add(id, name.replace(NOTE_EXT, ""), "missing");
        link(note.filePath, id);
      }
    }
    if (filters.showTags) {
      for (const tag of note.allTags) {
        const id = `tag:${tag.toLowerCase()}`;
        add(id, `#${tag}`, "tag");
        link(note.filePath, id);
      }
    }
  }

  // One line per pair of nodes, however many links run between them.
  const edges: GraphModelEdge[] = [];
  const seenPairs = new Set<string>();
  for (const { source, target } of directed.values()) {
    const pair = [source, target].sort().join("\0");
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    edges.push({ source, target, reciprocal: directed.has(`${target}\0${source}`) });
  }

  // Local graph: the current note and what is within `depth` links of it.
  let keep: Set<string> | null = null;
  if (filters.local && currentFile && nodes.has(currentFile)) {
    const neighbours = new Map<string, string[]>();
    for (const e of edges) {
      (neighbours.get(e.source) ?? neighbours.set(e.source, []).get(e.source)!).push(e.target);
      (neighbours.get(e.target) ?? neighbours.set(e.target, []).get(e.target)!).push(e.source);
    }
    keep = new Set([currentFile]);
    let frontier = [currentFile];
    for (let step = 0; step < Math.max(1, filters.depth) && frontier.length > 0; step++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const n of neighbours.get(id) ?? []) {
          if (!keep.has(n)) {
            keep.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
  }

  const keptEdges = keep ? edges.filter((e) => keep!.has(e.source) && keep!.has(e.target)) : edges;
  for (const e of keptEdges) {
    nodes.get(e.source)!.connections++;
    nodes.get(e.target)!.connections++;
  }

  const byPath = new Map(notes.map((n) => [n.filePath, n]));
  const out: GraphModelNode[] = [];
  for (const node of nodes.values()) {
    if (keep && !keep.has(node.id)) continue;
    // In the local graph the current note stays even with no links at all.
    const isCurrent = keep !== null && node.id === currentFile;
    if (!filters.showOrphans && node.connections === 0 && !isCurrent) continue;
    if (node.kind === "note") {
      const note = byPath.get(node.id);
      const group = note ? filters.groups.find((g) => groupMatches(g.query, note)) : undefined;
      node.color = group ? group.color : null;
    }
    out.push(node);
  }
  const ids = new Set(out.map((n) => n.id));
  return { nodes: out, edges: keptEdges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}
