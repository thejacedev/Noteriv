import { describe, expect, it } from "vitest";
import { DEFAULT_GRAPH_FILTERS, buildGraphModel, groupMatches, type GraphFilters } from "../graph-model";
import { buildNoteMeta, type NoteMeta } from "../vault-index";

function note(rel: string, links: string[], extra: { tags?: string[]; frontmatter?: string; ctime?: number } = {}): NoteMeta {
  return buildNoteMeta({
    filePath: `/v/${rel}`,
    relativePath: rel,
    name: (rel.split("/").pop() || rel).replace(/\.md$/, ""),
    size: 1,
    mtime: 1,
    ctime: extra.ctime ?? 1,
    frontmatter: extra.frontmatter ?? null,
    tags: extra.tags ?? [],
    links,
    tasksOpen: 0,
    tasksDone: 0,
  });
}

const notes = [
  note("Hub.md", ["A", "B", "photo.png", "Ghost"], { tags: ["work"] }),
  note("A.md", ["Hub", "C"], { tags: ["work/deep"] }),
  note("B.md", []),
  note("C.md", ["Roadmap"]),
  note("Projects/Plan.md", [], { frontmatter: "aliases: [Roadmap]" }),
  note("Lonely.md", []),
];
const filters = (over: Partial<GraphFilters> = {}): GraphFilters => ({ ...DEFAULT_GRAPH_FILTERS, ...over });
const labels = (m: { nodes: { label: string }[] }) => m.nodes.map((n) => n.label).sort();

describe("buildGraphModel", () => {
  it("links notes by name and by alias, one line per pair", () => {
    const model = buildGraphModel(notes, filters(), null);
    expect(labels(model)).toEqual(["A", "B", "C", "Hub", "Lonely", "Plan"]);
    expect(model.edges).toHaveLength(4);
    const hubA = model.edges.find((e) => [e.source, e.target].sort().join() === "/v/A.md,/v/Hub.md");
    expect(hubA?.reciprocal).toBe(true);
    // C links to Plan through its alias.
    expect(model.edges.some((e) => e.source === "/v/C.md" && e.target === "/v/Projects/Plan.md")).toBe(true);
    expect(model.nodes.find((n) => n.label === "Hub")?.connections).toBe(2);
  });

  it("can leave out notes with no links", () => {
    expect(labels(buildGraphModel(notes, filters({ showOrphans: false }), null))).toEqual(["A", "B", "C", "Hub", "Plan"]);
  });

  it("shows notes that do not exist, attachments and tags when asked", () => {
    const model = buildGraphModel(notes, filters({ existingOnly: false, showAttachments: true, showTags: true }), null);
    const kinds = Object.fromEntries(model.nodes.map((n) => [n.label, n.kind]));
    expect(kinds["Ghost"]).toBe("missing");
    expect(kinds["photo.png"]).toBe("attachment");
    expect(kinds["#work"]).toBe("tag");
    expect(kinds["#work/deep"]).toBe("tag");
    expect(model.edges.some((e) => e.source === "/v/Hub.md" && e.target === "tag:work")).toBe(true);
  });

  it("limits a local graph to what is near the current note", () => {
    const one = buildGraphModel(notes, filters({ local: true, depth: 1 }), "/v/Hub.md");
    expect(labels(one)).toEqual(["A", "B", "Hub"]);
    const two = buildGraphModel(notes, filters({ local: true, depth: 2 }), "/v/Hub.md");
    expect(labels(two)).toEqual(["A", "B", "C", "Hub"]);
    const three = buildGraphModel(notes, filters({ local: true, depth: 3 }), "/v/Hub.md");
    expect(labels(three)).toEqual(["A", "B", "C", "Hub", "Plan"]);
  });

  it("keeps the current note in its local graph even with no links", () => {
    const model = buildGraphModel(notes, filters({ local: true, showOrphans: false }), "/v/Lonely.md");
    expect(labels(model)).toEqual(["Lonely"]);
  });

  it("falls back to the whole vault when there is no current note", () => {
    expect(buildGraphModel(notes, filters({ local: true }), null).nodes).toHaveLength(6);
  });

  it("colours a note with the first group that claims it", () => {
    const model = buildGraphModel(
      notes,
      filters({ groups: [{ query: "tag:#work", color: "#f00" }, { query: "path:Projects", color: "#0f0" }, { query: "hub", color: "#00f" }] }),
      null
    );
    const colour = Object.fromEntries(model.nodes.map((n) => [n.label, n.color]));
    expect(colour).toEqual({ Hub: "#f00", A: "#f00", B: null, C: null, Plan: "#0f0", Lonely: null });
  });
});

describe("groupMatches", () => {
  const n = { name: "Weekly Plan", relativePath: "Projects/Weekly Plan.md", allTags: ["work/meetings", "Idea"] };
  it("reads tag:, path:, file: and plain text", () => {
    expect(groupMatches("tag:#work", n)).toBe(true);
    expect(groupMatches("tag:meetings", n)).toBe(false);
    expect(groupMatches("tag:#idea", n)).toBe(true);
    expect(groupMatches("path:projects/", n)).toBe(true);
    expect(groupMatches("file:weekly", n)).toBe(true);
    expect(groupMatches("file:projects", n)).toBe(false);
    expect(groupMatches("plan", n)).toBe(true);
    expect(groupMatches("", n)).toBe(false);
    expect(groupMatches("tag:", n)).toBe(false);
  });
});
