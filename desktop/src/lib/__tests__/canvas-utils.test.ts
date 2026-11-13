import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  arrowHeadPath,
  canvasColorCss,
  canvasColorName,
  canvasFileFor,
  cardsForFiles,
  createEdge,
  createFileNode,
  createLinkNode,
  edgeEnds,
  edgeGeometry,
  edgeSides,
  fileCardKind,
  fileCardTitle,
  headingSubpath,
  normalizeWebUrl,
  notesInFolder,
  parseCanvas,
  pastedWebUrl,
  recalcEdgesFor,
  resolveCanvasFile,
  serializeCanvas,
  stickyBackground,
  subpathAnchor,
  subpathLabel,
  subpathPage,
  vaultFolders,
  webUrlHost,
  type CanvasData,
  type CanvasNode,
} from "../canvas-utils";

const fixture = (name: string) =>
  readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), "utf8");

// The example file from the JSON Canvas repository (jsoncanvas.org).
const SPEC_SAMPLE = fixture("jsoncanvas-sample.canvas");
// A canvas as Obsidian writes one, using every part of the format.
const OBSIDIAN = fixture("obsidian-style.canvas");
// A canvas as Noteriv wrote them before it used the format.
const LEGACY = fixture("noteriv-legacy.canvas");
const VAULT = "/home/sam/Vault";

const byId = (data: CanvasData, id: string) => data.nodes.find((n) => n.id === id)!;
const reopen = (data: CanvasData, vault = VAULT) => parseCanvas(serializeCanvas(data), vault);

interface SavedCanvas {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  [key: string]: unknown;
}
const saved = (data: CanvasData): SavedCanvas => JSON.parse(serializeCanvas(data));

describe("reading a JSON Canvas file", () => {
  it("reads the example from the specification", () => {
    const canvas = parseCanvas(SPEC_SAMPLE, VAULT);
    expect(canvas.nodes.map((n) => n.type)).toEqual(["group", "file", "file", "text", "file"]);
    expect(byId(canvas, "754a8ef995f366bc")).toMatchObject({ label: "JSON Canvas", width: 610, height: 200 });
    expect(byId(canvas, "8132d4d894c80022")).toMatchObject({ file: "readme.md", color: "6" });
    expect(byId(canvas, "7efdbbe0c4742315").file).toBe("_site/logo.svg");
    expect(byId(canvas, "59e896bc8da20699").text).toContain("- [Apps](/docs/apps.md)");
    expect(canvas.edges).toEqual([
      {
        id: "6fa11ab87f90b8af",
        fromNode: "7efdbbe0c4742315",
        fromSide: "right",
        toNode: "59e896bc8da20699",
        toSide: "left",
      },
    ]);
  });

  it("writes the example back with nothing added, lost or changed", () => {
    expect(saved(parseCanvas(SPEC_SAMPLE, VAULT))).toEqual(JSON.parse(SPEC_SAMPLE));
  });

  it("reads all four kinds of card with their colours and labels", () => {
    const canvas = parseCanvas(OBSIDIAN, VAULT);
    expect(canvas.nodes.map((n) => n.type)).toEqual(["group", "text", "file", "file", "link", "file", "text"]);
    expect(byId(canvas, "a0f3c1d2e4b5a697")).toMatchObject({
      type: "group",
      label: "Research",
      color: "4",
      background: "Attachments/board.png",
      backgroundStyle: "cover",
    });
    expect(byId(canvas, "b1e2d3c4f5a6b798")).toMatchObject({ type: "text", color: "1" });
    expect(byId(canvas, "c2d3e4f5a6b7c899")).toMatchObject({
      type: "file",
      file: "Projects/Field notes.md",
      subpath: "#Findings",
      color: "#2e7d32",
    });
    expect(byId(canvas, "e4f5a6b7c8d9e01b")).toMatchObject({
      type: "link",
      url: "https://jsoncanvas.org/spec/1.0/",
      color: "5",
    });
    expect(byId(canvas, "f5a6b7c8d9e0f12c").subpath).toBe("#page=3");
  });

  it("reads edge ends, labels and colours", () => {
    const [plain, both, none, bare] = parseCanvas(OBSIDIAN, VAULT).edges;
    expect(plain).toMatchObject({ label: "answered by", fromSide: "right", toSide: "left" });
    expect(edgeEnds(plain)).toEqual({ from: "none", to: "arrow" });
    expect(both).toMatchObject({ fromEnd: "arrow", toEnd: "arrow", color: "6", label: "cites" });
    expect(edgeEnds(none)).toEqual({ from: "none", to: "none" });
    expect(none.color).toBe("#ff8800");
    // The format lets an edge leave its sides out.
    expect(bare.fromSide).toBeUndefined();
    expect(bare.toSide).toBeUndefined();
  });

  it("keeps fields it does not know, on cards, edges and the file itself", () => {
    const canvas = parseCanvas(OBSIDIAN, VAULT);
    expect(byId(canvas, "e4f5a6b7c8d9e01b").extra).toEqual({ styleAttributes: { border: "dotted" } });
    expect(canvas.edges[2].extra).toEqual({ pathfindingMethod: "square" });
    expect(canvas.extra).toEqual({ metadata: { version: "1.0-1.0", frontmatter: {} } });
  });

  it("writes an Obsidian canvas back with nothing added, lost or changed", () => {
    expect(saved(parseCanvas(OBSIDIAN, VAULT))).toEqual(JSON.parse(OBSIDIAN));
  });

  it("keeps unknown fields through an edit", () => {
    const canvas = parseCanvas(OBSIDIAN, VAULT);
    const moved: CanvasData = {
      ...canvas,
      nodes: canvas.nodes.map((n) => (n.type === "link" ? { ...n, x: n.x + 40.4 } : n)),
      edges: canvas.edges.map((e) => (e.extra ? { ...e, label: "new" } : e)),
    };
    const out = saved(moved);
    const link = out.nodes.find((n) => n.type === "link")!;
    expect(link).toMatchObject({ x: 420, styleAttributes: { border: "dotted" } });
    expect(out.edges[2]).toMatchObject({ label: "new", pathfindingMethod: "square" });
    expect(out.metadata).toEqual({ version: "1.0-1.0", frontmatter: {} });
  });

  it("keeps a card of a kind it does not know, where it sits and all it holds", () => {
    const json = JSON.stringify({
      nodes: [
        { id: "n1", type: "mindmap", x: 10, y: 20, width: 300, height: 90, root: "Topic", branches: ["a", "b"] },
        { id: "n2", type: "text", text: "next to it", x: 400, y: 20, width: 200, height: 90 },
      ],
      edges: [{ id: "e1", fromNode: "n1", toNode: "n2" }],
    });
    const canvas = parseCanvas(json);
    expect(byId(canvas, "n1")).toMatchObject({ type: "unknown", x: 10, y: 20, width: 300, height: 90 });
    expect(saved(canvas)).toEqual(JSON.parse(json));

    const moved = { ...canvas, nodes: canvas.nodes.map((n) => (n.id === "n1" ? { ...n, x: 55 } : n)) };
    expect(saved(moved).nodes[0]).toEqual({
      id: "n1", type: "mindmap", x: 55, y: 20, width: 300, height: 90, root: "Topic", branches: ["a", "b"],
    });
  });

  it("gives a card with missing numbers a place, so it can still be drawn", () => {
    const canvas = parseCanvas('{"nodes":[{"id":"n1","type":"text","text":"hi"}]}');
    const node = canvas.nodes[0];
    for (const value of [node.x, node.y, node.width, node.height]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("returns an empty canvas for text that is not a canvas", () => {
    for (const text of ["", "not json", "[]", "null", '"nodes"', '{"nodes": 3, "edges": "x"}']) {
      expect(parseCanvas(text)).toEqual({ nodes: [], edges: [] });
    }
  });

  it("drops a second card with an id already used", () => {
    const canvas = parseCanvas(
      '{"nodes":[{"id":"a","type":"text","text":"one","x":0,"y":0,"width":1,"height":1},' +
        '{"id":"a","type":"text","text":"two","x":0,"y":0,"width":1,"height":1}]}'
    );
    expect(canvas.nodes.map((n) => n.text)).toEqual(["one"]);
  });
});

describe("opening a canvas Noteriv wrote before it used the format", () => {
  const canvas = parseCanvas(LEGACY, VAULT);

  it("opens every card as the kind it was", () => {
    expect(canvas.nodes.map((n) => n.type)).toEqual([
      "text", "file", "sticky", "image", "image", "drawing", "group",
    ]);
    expect(byId(canvas, "1111111111111111")).toMatchObject({ text: "Main idea", x: 100.5, y: 200.25 });
    expect(byId(canvas, "3333333333333333")).toMatchObject({ text: "Call Dana", color: "pink", rotation: -1.37 });
    expect(byId(canvas, "6666666666666666")).toMatchObject({
      x: 97.2,
      y: 697.6,
      drawingPoints: [[3, 3], [60.5, 43.8], [123.4, 12.1]],
      strokeColor: "#f38ba8",
      strokeWidth: 3,
    });
    expect(byId(canvas, "7777777777777777")).toMatchObject({ label: "Sprint" });
    expect(canvas.edges).toHaveLength(2);
    expect(canvas.edges[1]).toMatchObject({ label: "see sketch", fromSide: "bottom", toSide: "top" });
  });

  it("turns full paths inside the vault into paths from the top of the vault", () => {
    expect(byId(canvas, "2222222222222222").file).toBe("Projects/Plan.md");
    expect(byId(canvas, "4444444444444444").file).toBe("attachments/sketch.png");
    expect(resolveCanvasFile(byId(canvas, "2222222222222222").file, VAULT)).toBe("/home/sam/Vault/Projects/Plan.md");
  });

  it("keeps the path of a file outside the vault, which still opens on this machine", () => {
    const outside = byId(canvas, "5555555555555555");
    expect(outside.file).toBe("/home/sam/Pictures/holiday.jpg");
    expect(resolveCanvasFile(outside.file, VAULT)).toBe("/home/sam/Pictures/holiday.jpg");
  });

  it("reads Windows paths", () => {
    const json = JSON.stringify({
      nodes: [
        { id: "w1", type: "file", x: 0, y: 0, width: 1, height: 1, filePath: "C:\\Users\\Sam\\Vault\\Notes\\A.md" },
        { id: "w2", type: "image", x: 0, y: 0, width: 1, height: 1, imagePath: "C:\\Users\\Sam\\Vault/attachments/p.png" },
      ],
    });
    const windows = parseCanvas(json, "C:\\Users\\Sam\\Vault");
    expect(windows.nodes.map((n) => n.file)).toEqual(["Notes/A.md", "attachments/p.png"]);
  });

  it("numbers the colours that were names, card by card", () => {
    expect(byId(canvas, "1111111111111111").color).toBe("1");
    expect(byId(canvas, "2222222222222222").color).toBe("5");
    expect(byId(canvas, "7777777777777777").color).toBe("6");
    // A sticky note's colours are its own set and keep their names.
    expect(byId(canvas, "3333333333333333").color).toBe("pink");
    const blueSticky = parseCanvas('{"nodes":[{"id":"s","type":"sticky","x":0,"y":0,"width":1,"height":1,"color":"blue"}]}');
    expect(blueSticky.nodes[0].color).toBe("blue");
  });
});

describe("saving a canvas", () => {
  const out = saved(parseCanvas(LEGACY, VAULT));
  const node = (id: string) => out.nodes.find((n) => n.id === id)!;

  it("writes only the four kinds of card the format has", () => {
    for (const n of out.nodes) {
      expect(["text", "file", "link", "group"]).toContain(n.type);
    }
  });

  it("writes text, file and group cards as the format defines them", () => {
    expect(node("1111111111111111")).toEqual({
      id: "1111111111111111", type: "text", text: "Main idea", x: 101, y: 200, width: 260, height: 160, color: "1",
    });
    expect(node("2222222222222222")).toEqual({
      id: "2222222222222222", type: "file", file: "Projects/Plan.md", x: 420, y: 200, width: 260, height: 120, color: "5",
    });
    expect(node("7777777777777777")).toEqual({
      id: "7777777777777777", type: "group", x: 60, y: 160, width: 680, height: 520, label: "Sprint", color: "6",
    });
  });

  it("writes a sticky note as a text card that says what it is", () => {
    expect(node("3333333333333333")).toEqual({
      id: "3333333333333333",
      type: "text",
      text: "Call Dana",
      x: 100,
      y: 420,
      width: 200,
      height: 200,
      color: "#f5c2e7",
      noteriv: { type: "sticky", rotation: -1.37 },
    });
  });

  it("writes an image card as a file card pointing at the image", () => {
    expect(node("4444444444444444")).toEqual({
      id: "4444444444444444",
      type: "file",
      file: "attachments/sketch.png",
      x: 420,
      y: 420,
      width: 300,
      height: 240,
      noteriv: { type: "image" },
    });
  });

  it("never writes a full path as a card's file", () => {
    for (const n of out.nodes) {
      if (typeof n.file === "string") {
        expect(n.file).not.toMatch(/^([A-Za-z]:|[\\/])/);
        expect(n.file).not.toContain("\\");
      }
    }
    // The image outside the vault stands as a text card naming the file.
    expect(node("5555555555555555")).toEqual({
      id: "5555555555555555",
      type: "text",
      text: "holiday.jpg",
      x: 760,
      y: 420,
      width: 300,
      height: 240,
      noteriv: { type: "image", path: "/home/sam/Pictures/holiday.jpg" },
    });
  });

  it("puts every stroke, and the edges that touch one, inside a single text card", () => {
    const carriers = out.nodes.filter((n) => n.id === "noteriv-drawings");
    expect(carriers).toHaveLength(1);
    expect(carriers[0]).toMatchObject({ type: "text", x: 97, y: 698, width: 260, height: 60 });
    expect(String(carriers[0].text)).toContain("Noteriv");
    expect(carriers[0].noteriv).toEqual({
      type: "drawings",
      nodes: [
        {
          id: "6666666666666666",
          type: "drawing",
          x: 97.2,
          y: 697.6,
          width: 126.4,
          height: 46.8,
          drawingPoints: [[3, 3], [60.5, 43.8], [123.4, 12.1]],
          strokeColor: "#f38ba8",
          strokeWidth: 3,
        },
      ],
      edges: [
        {
          id: "bbbbbbbbbbbbbbbb",
          fromNode: "3333333333333333",
          fromSide: "bottom",
          toNode: "6666666666666666",
          toSide: "top",
          label: "see sketch",
        },
      ],
    });
  });

  it("leaves no edge pointing at a card another app cannot see", () => {
    const ids = new Set(out.nodes.map((n) => n.id));
    expect(out.edges).toHaveLength(1);
    for (const edge of out.edges) {
      expect(ids.has(edge.fromNode as string)).toBe(true);
      expect(ids.has(edge.toNode as string)).toBe(true);
    }
  });

  it("writes positions and sizes as whole numbers", () => {
    for (const n of out.nodes) {
      for (const key of ["x", "y", "width", "height"]) {
        expect(Number.isInteger(n[key])).toBe(true);
      }
    }
  });

  it("gives back the same canvas when the saved file is opened again", () => {
    const first = parseCanvas(LEGACY, VAULT);
    const second = reopen(first);
    expect(second.nodes.map((n) => [n.id, n.type])).toEqual(
      // Strokes are drawn above every other card, so they come last.
      [...first.nodes.filter((n) => n.type !== "drawing"), ...first.nodes.filter((n) => n.type === "drawing")].map(
        (n) => [n.id, n.type]
      )
    );
    for (const before of first.nodes) {
      const after = byId(second, before.id);
      const whole = before.type === "drawing" ? before : {
        ...before,
        x: Math.round(before.x),
        y: Math.round(before.y),
        width: Math.round(before.width),
        height: Math.round(before.height),
      };
      expect(after).toEqual(whole);
    }
    expect(second.edges).toEqual(first.edges);
  });

  it("writes the same file on every save after the first", () => {
    const once = serializeCanvas(parseCanvas(LEGACY, VAULT));
    const twice = serializeCanvas(parseCanvas(once, VAULT));
    expect(twice).toBe(once);
    expect(serializeCanvas(parseCanvas(twice, VAULT))).toBe(once);
  });

  it("writes new cards as the format defines them", () => {
    const note = { ...createFileNode(10, 20, "Notes/Idea.md"), id: "f", subpath: "#Plan" };
    const page = { ...createLinkNode(10, 20, "https://example.com/a"), id: "l", color: "2" };
    const edge = { ...createEdge("f", "l"), id: "e", fromEnd: "arrow" as const, toEnd: "none" as const, label: "source" };
    const out2 = saved({ nodes: [note, page], edges: [edge] });
    expect(out2).toEqual({
      nodes: [
        { id: "f", type: "file", file: "Notes/Idea.md", subpath: "#Plan", x: 10, y: 20, width: 300, height: 220 },
        { id: "l", type: "link", url: "https://example.com/a", x: 10, y: 20, width: 300, height: 140, color: "2" },
      ],
      edges: [
        {
          id: "e", fromNode: "f", fromSide: "right", fromEnd: "arrow",
          toNode: "l", toSide: "left", toEnd: "none", label: "source",
        },
      ],
    });
  });

  it("reads a sticky note another app recoloured", () => {
    const text = (color: string) =>
      `{"nodes":[{"id":"s","type":"text","text":"x","x":0,"y":0,"width":1,"height":1,"color":"${color}","noteriv":{"type":"sticky"}}]}`;
    expect(parseCanvas(text("#A6E3A1")).nodes[0]).toMatchObject({ type: "sticky", color: "green" });
    expect(parseCanvas(text("2")).nodes[0].color).toBe("peach");
    expect(parseCanvas(text("#123456")).nodes[0].color).toBe("#123456");
    expect(stickyBackground("#123456")).toBe("#123456");
    expect(stickyBackground("pink")).toBe("#f5c2e7");
    expect(stickyBackground(undefined)).toBe("#f9e2af");
  });

  it("turns a card back into a file card once its file is inside the vault", () => {
    const moved = parseCanvas(serializeCanvas(parseCanvas(LEGACY, VAULT)), "/home/sam");
    expect(byId(moved, "5555555555555555")).toMatchObject({ type: "image", file: "Pictures/holiday.jpg" });
    expect(saved(moved).nodes.find((n) => n.id === "5555555555555555")).toMatchObject({
      type: "file",
      file: "Pictures/holiday.jpg",
      noteriv: { type: "image" },
    });
  });
});

describe("colours", () => {
  it("names and shades the six presets", () => {
    expect(["1", "2", "3", "4", "5", "6"].map(canvasColorName)).toEqual([
      "red", "orange", "yellow", "green", "blue", "purple",
    ]);
    expect(canvasColorCss("1")).toBe("#e55");
    expect(canvasColorCss("#2e7d32")).toBe("#2e7d32");
    expect(canvasColorName("#2e7d32")).toBeUndefined();
    expect(canvasColorCss(undefined)).toBeUndefined();
  });
});

describe("files on cards", () => {
  it("tells what a file card shows from the file's extension", () => {
    expect(fileCardKind("Notes/Idea.md")).toBe("note");
    expect(fileCardKind("README.MARKDOWN")).toBe("note");
    expect(fileCardKind("a/b/photo.JPG")).toBe("image");
    expect(fileCardKind("logo.svg")).toBe("image");
    expect(fileCardKind("talk.mp3")).toBe("audio");
    expect(fileCardKind("clip.webm")).toBe("video");
    expect(fileCardKind("paper.pdf")).toBe("pdf");
    // Not a note just because it is not anything else.
    expect(fileCardKind("report.docx")).toBe("other");
    expect(fileCardKind("Makefile")).toBe("other");
    expect(fileCardKind("board.canvas")).toBe("other");
  });

  it("titles a card with the file's name", () => {
    expect(fileCardTitle("Projects/Field notes.md")).toBe("Field notes");
    expect(fileCardTitle("Attachments/chart.png")).toBe("chart.png");
    expect(fileCardTitle("C:\\Users\\Sam\\pic.png")).toBe("pic.png");
  });

  it("finds a card's file on this machine", () => {
    expect(resolveCanvasFile("Notes/Idea.md", VAULT)).toBe("/home/sam/Vault/Notes/Idea.md");
    expect(resolveCanvasFile("Notes/Idea.md", "C:\\Users\\Sam\\Vault")).toBe("C:\\Users\\Sam\\Vault\\Notes\\Idea.md");
    expect(resolveCanvasFile(undefined, VAULT)).toBeNull();
    expect(resolveCanvasFile("../outside.md", VAULT)).toBeNull();
  });

  it("keeps a picked file as a path from the top of the vault", () => {
    expect(canvasFileFor("/home/sam/Vault/attachments/a.png", VAULT)).toBe("attachments/a.png");
    expect(canvasFileFor("C:\\Vault\\attachments\\a.png", "C:\\Vault")).toBe("attachments/a.png");
    expect(canvasFileFor("/home/sam/Pictures/a.png", VAULT)).toBeNull();
  });

  it("reads what a card is narrowed to", () => {
    expect(subpathAnchor("#Findings")).toEqual({ type: "heading", text: "Findings" });
    expect(subpathAnchor("#^key-point")).toEqual({ type: "block", id: "key-point" });
    expect(subpathAnchor("#Chapter#Section")).toEqual({ type: "heading", text: "Section" });
    expect(subpathAnchor(undefined)).toBeNull();
    expect(subpathAnchor("")).toBeNull();
    expect(subpathLabel("#Findings")).toBe("Findings");
    expect(subpathLabel("#^key-point")).toBe("^key-point");
    expect(subpathLabel("#page=3")).toBe("page 3");
    expect(subpathLabel(undefined)).toBe("");
    expect(subpathPage("#page=3")).toBe(3);
    expect(subpathPage("#Findings")).toBeUndefined();
  });

  it("narrows to a heading by its text", () => {
    expect(headingSubpath("Findings")).toBe("#Findings");
    expect(subpathAnchor(headingSubpath("Open questions"))).toEqual({ type: "heading", text: "Open questions" });
    // A "#" inside the heading would start a second heading in the path.
    expect(headingSubpath("C# basics")).toBe("#C basics");
  });
});

describe("web page addresses", () => {
  it("accepts an address with or without the scheme", () => {
    expect(normalizeWebUrl("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(normalizeWebUrl("  http://example.com  ")).toBe("http://example.com");
    expect(normalizeWebUrl("example.com/page")).toBe("https://example.com/page");
    expect(normalizeWebUrl("localhost:3000")).toBe("https://localhost:3000");
  });

  it("refuses what cannot be opened as a web page", () => {
    for (const text of [
      "", "   ", "hello", "two words.com", "javascript:alert(1)", "file:///etc/passwd",
      "ftp://example.com/x", "mailto:sam@example.com", "data:text/html,<p>x</p>",
    ]) {
      expect(normalizeWebUrl(text)).toBeNull();
    }
  });

  it("makes a card from pasted text only when all of it is one address", () => {
    expect(pastedWebUrl("https://example.com/a\n")).toBe("https://example.com/a");
    expect(pastedWebUrl("example.com")).toBeNull();
    expect(pastedWebUrl("see https://example.com")).toBeNull();
    expect(pastedWebUrl("https://a.example https://b.example")).toBeNull();
    expect(pastedWebUrl("Just some text")).toBeNull();
  });

  it("shows the site an address is on", () => {
    expect(webUrlHost("https://www.example.com/a/b?c")).toBe("www.example.com");
    expect(webUrlHost("http://localhost:3000/x")).toBe("localhost:3000");
    expect(webUrlHost("not an address")).toBe("not an address");
  });
});

describe("cards from a folder", () => {
  const files = [
    "Inbox.md",
    "Projects/Alpha.md",
    "Projects/Beta.md",
    "Projects/notes10.md",
    "Projects/notes2.md",
    "Projects/diagram.png",
    "Projects/Archive/Old.md",
    "Attachments/photo.jpg",
  ];

  it("lists the folders that hold notes, with how many", () => {
    expect(vaultFolders(files)).toEqual([
      { path: "", notes: 1 },
      { path: "Projects", notes: 4 },
      { path: "Projects/Archive", notes: 1 },
    ]);
  });

  it("takes the notes directly in a folder, in name order", () => {
    expect(notesInFolder(files, "Projects")).toEqual([
      "Projects/Alpha.md",
      "Projects/Beta.md",
      "Projects/notes2.md",
      "Projects/notes10.md",
    ]);
    expect(notesInFolder(files, "")).toEqual(["Inbox.md"]);
    expect(notesInFolder(files, "Attachments")).toEqual([]);
  });

  const existing: CanvasNode[] = [
    { id: "t", type: "text", x: 0, y: 100, width: 200, height: 100, text: "" },
    { id: "f", type: "file", x: 300, y: 150, width: 260, height: 120, file: "Projects/Beta.md" },
  ];

  it("lays the cards out in a grid to the right of what is there", () => {
    const { added, skipped } = cardsForFiles(existing, notesInFolder(files, "Projects"), { x: 0, y: 0 });
    expect(skipped).toBe(1);
    expect(added.map((n) => n.file)).toEqual(["Projects/Alpha.md", "Projects/notes2.md", "Projects/notes10.md"]);
    // Two columns, starting clear of the rightmost card and level with the top one.
    expect(added.map((n) => [n.x, n.y])).toEqual([
      [640, 100],
      [964, 100],
      [640, 344],
    ]);
    for (const card of added) {
      expect(card).toMatchObject({ type: "file", width: 300, height: 220 });
    }
    expect(new Set(added.map((n) => n.id)).size).toBe(3);
  });

  it("does not overlap the cards it adds", () => {
    const many = Array.from({ length: 11 }, (_, i) => `Big/Note ${i}.md`);
    const { added } = cardsForFiles([], many, { x: 0, y: 0 });
    expect(added).toHaveLength(11);
    for (const a of added) {
      for (const b of added) {
        if (a === b) continue;
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("centres the grid on an empty canvas", () => {
    const { added } = cardsForFiles([], ["A.md", "B.md", "C.md", "D.md"], { x: 1000, y: 500 });
    const xs = added.map((n) => n.x);
    const ys = added.map((n) => n.y);
    expect((Math.min(...xs) + Math.max(...xs) + 300) / 2).toBe(1000);
    expect((Math.min(...ys) + Math.max(...ys) + 220) / 2).toBe(500);
  });

  it("adds nothing when every note is already there, or the list repeats one", () => {
    expect(cardsForFiles(existing, ["Projects/Beta.md"], { x: 0, y: 0 })).toEqual({ added: [], skipped: 1 });
    const { added, skipped } = cardsForFiles([], ["A.md", "A.md"], { x: 0, y: 0 });
    expect(added).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});

describe("edges", () => {
  const a: CanvasNode = { id: "a", type: "text", x: 0, y: 0, width: 100, height: 100 };
  const b: CanvasNode = { id: "b", type: "text", x: 300, y: 0, width: 100, height: 100 };
  const c: CanvasNode = { id: "c", type: "text", x: 0, y: 400, width: 100, height: 100 };

  it("draws an edge between the sides the file gives, or the facing sides", () => {
    expect(edgeSides({ id: "e", fromNode: "a", toNode: "b" }, a, b)).toEqual({ from: "right", to: "left" });
    expect(edgeSides({ id: "e", fromNode: "a", toNode: "c" }, a, c)).toEqual({ from: "bottom", to: "top" });
    expect(edgeSides({ id: "e", fromNode: "a", toNode: "b", fromSide: "top", toSide: "top" }, a, b)).toEqual({
      from: "top",
      to: "top",
    });
  });

  it("re-routes only the edges that touch a card that moved", () => {
    const edges = [
      { id: "ab", fromNode: "a", toNode: "b", fromSide: "top" as const, toSide: "top" as const },
      { id: "ac", fromNode: "a", toNode: "c", fromSide: "left" as const, toSide: "left" as const },
      { id: "bc", fromNode: "b", toNode: "c" },
    ];
    const next = recalcEdgesFor(edges, [a, b, c], new Set(["b"]));
    expect(next[0]).toEqual({ id: "ab", fromNode: "a", toNode: "b", fromSide: "right", toSide: "left" });
    // Not attached to the card that moved: the very same edge.
    expect(next[1]).toBe(edges[1]);
    // Attached, but saved without sides: they stay left to the drawing.
    expect(next[2]).toBe(edges[2]);
  });

  it("puts the label half way along the curve", () => {
    const { path, from, to, middle } = edgeGeometry(a, b, "right", "left");
    expect(from).toEqual({ x: 100, y: 50 });
    expect(to).toEqual({ x: 300, y: 50 });
    expect(path).toBe("M100,50 C160,50 240,50 300,50");
    expect(middle).toEqual({ x: 200, y: 50 });
  });

  it("points an arrowhead at the card", () => {
    // Arriving at a card's left side: the tip is just inside it, the base 18 back.
    expect(arrowHeadPath({ x: 300, y: 50 }, "left")).toBe("M302,50 L282,42 L282,58 Z");
    expect(arrowHeadPath({ x: 50, y: 400 }, "top")).toBe("M50,402 L58,382 L42,382 Z");
  });
});
