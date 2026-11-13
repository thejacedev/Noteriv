import { describe, expect, it } from "vitest";
import {
  LinkIndex,
  encodePath,
  isExternalPath,
  joinPath,
  parseDestination,
  percentDecode,
  relativePath,
} from "../link-resolve";
import { findLinkedNote, findLinkedNoteFrom } from "../wiki-link-utils";
import fixture from "../__fixtures__/link-resolution.json";

// The backend resolves links with its own copy of these rules and runs the
// same fixture (`links.rs`), so the two cannot drift apart.
describe("the shared fixture", () => {
  const index = new LinkIndex([...fixture.vault].sort());

  it("has cases worth running", () => {
    expect(fixture.links.length).toBeGreaterThan(60);
  });

  for (const c of fixture.links) {
    const expected = c.expect ?? "nothing";
    if ("markdown" in c && typeof c.markdown === "string") {
      const text = c.markdown;
      it(`](${text}) in ${c.from} -> ${expected}`, () => {
        const dest = parseDestination(text);
        expect(isExternalPath(dest.path)).toBe(c.external === true);
        expect(index.markdown(c.from, dest.path)).toBe(c.expect);
        if (typeof c.fragment === "string") expect(dest.fragment).toBe(c.fragment);
      });
    } else if ("wiki" in c && typeof c.wiki === "string") {
      const target = c.wiki;
      it(`[[${target}]] in ${c.from} -> ${expected}`, () => {
        expect(index.wiki(c.from, target)).toBe(c.expect);
      });
    }
  }

  it("finds a note from the note a wiki link is in, as the graph and the backlinks do", () => {
    const notes = [...fixture.vault]
      .sort()
      .filter((rel) => /\.(md|markdown)$/i.test(rel))
      .map((rel) => ({ filePath: `/vault/${rel}`, relativePath: rel }));
    let checked = 0;
    for (const c of fixture.links) {
      if (!("wiki" in c) || typeof c.wiki !== "string") continue;
      // Only notes are looked for there; a picture is not one.
      if (c.expect !== null && !/\.(md|markdown)$/i.test(c.expect)) continue;
      expect(findLinkedNoteFrom(notes, c.from, c.wiki)?.relativePath ?? null, `[[${c.wiki}]] in ${c.from}`).toBe(
        c.expect
      );
      checked++;
    }
    expect(checked).toBeGreaterThan(8);
  });

  it("finds notes by name and path the way a click on a wiki link does", () => {
    const sorted = [...fixture.notes].sort();
    const notes = new LinkIndex(sorted);
    const files = sorted.map((rel) => ({ filePath: `/vault/${rel}`, relativePath: rel }));
    for (const c of fixture.cases) {
      expect(notes.note(c.target), `[[${c.target}]]`).toBe(c.expect);
      expect(findLinkedNote(files, c.target)?.relativePath ?? null, `[[${c.target}]]`).toBe(c.expect);
    }
  });
});

describe("parseDestination", () => {
  it("says where the file part is, so the rest can be kept as written", () => {
    const text = '  <my files/a b.png#x> "A title" ';
    const dest = parseDestination(text);
    expect(dest.path).toBe("my files/a b.png");
    expect(dest.fragment).toBe("#x");
    expect(text.slice(dest.from, dest.to)).toBe(dest.path);
  });

  it("only takes a quoted string at the very end for a title", () => {
    expect(parseDestination('my "great" photo.png').path).toBe('my "great" photo.png');
    expect(parseDestination('a "b" c.png "title"').path).toBe('a "b" c.png');
    expect(parseDestination('"title"').path).toBe('"title"');
    expect(parseDestination("it's.png").path).toBe("it's.png");
    expect(parseDestination("a.png 'it''s'").path).toBe("a.png 'it''s'");
  });

  it("reads an unfinished <path as a plain path", () => {
    expect(parseDestination("<a.png").path).toBe("<a.png");
    expect(parseDestination("<a>b.png").path).toBe("<a>b.png");
  });
});

describe("percent encoding", () => {
  it("keeps a % that starts no sequence", () => {
    expect(percentDecode("100%.md")).toBe("100%.md");
    expect(percentDecode("100% done")).toBe("100% done");
    expect(percentDecode("%4%41")).toBe("%4A");
    expect(percentDecode("a%2")).toBe("a%2");
  });

  it("gives nothing for sequences that are not text", () => {
    expect(percentDecode("%FF")).toBeNull();
    expect(percentDecode("%C3%zz%A9")).toBeNull();
  });

  it("encodes everything a link's path cannot hold, part by part", () => {
    expect(encodePath("My files/a b (1).png")).toBe("My%20files/a%20b%20%281%29.png");
    expect(encodePath("Notes/C# 100%.md")).toBe("Notes/C%23%20100%25.md");
    expect(encodePath("Café/it's~ok_-.md")).toBe("Caf%C3%A9/it%27s~ok_-.md");
    for (const path of ["a b/c#d.md", "Ünï/[x] (y)!*'.md", "50%25 off.md"]) {
      expect(percentDecode(encodePath(path))).toBe(path);
    }
  });
});

describe("paths", () => {
  it("joins a path onto a folder", () => {
    expect(joinPath("A/B", "c.md")).toBe("A/B/c.md");
    expect(joinPath("A/B", "./c.md")).toBe("A/B/c.md");
    expect(joinPath("A/B", "../c.md")).toBe("A/c.md");
    expect(joinPath("A/B", "../../c.md")).toBe("c.md");
    expect(joinPath("A/B", "../../../c.md")).toBeNull();
    expect(joinPath("", "/a//b/./c.md")).toBe("a/b/c.md");
  });

  it("finds the way from a folder to a file", () => {
    expect(relativePath("A/B", "A/B/c.md")).toBe("c.md");
    expect(relativePath("A/B", "A/B/C/d.md")).toBe("C/d.md");
    expect(relativePath("A/B", "A/c.md")).toBe("../c.md");
    expect(relativePath("A/B", "X/c.md")).toBe("../../X/c.md");
    expect(relativePath("", "X/c.md")).toBe("X/c.md");
    expect(relativePath("A", "c.md")).toBe("../c.md");
    // A folder and a file with the same name are different things.
    expect(relativePath("A/B", "A/B")).toBe("../B");
    for (const [folder, target] of [["A/B", "X/c.md"], ["", "c.md"], ["A", "A/B/c.md"], ["A/B", "A"]]) {
      expect(joinPath(folder, relativePath(folder, target))).toBe(target);
    }
  });
});

describe("LinkIndex", () => {
  it("splits a wiki link at the heading, trying the whole target first", () => {
    const index = new LinkIndex(["Notes/C# basics.md", "Notes/Daily.md", "paper.pdf"]);
    expect(index.wikiLink("Notes/Daily.md", "C# basics")).toEqual({
      file: "Notes/C# basics.md",
      written: "C# basics",
      fragment: "",
    });
    expect(index.wikiLink("Notes/Daily.md", "C# basics#Types")).toEqual({
      file: "Notes/C# basics.md",
      written: "C# basics",
      fragment: "#Types",
    });
    expect(index.wikiLink("Notes/Daily.md", "./Daily#Morning#Tea")).toEqual({
      file: "Notes/Daily.md",
      written: "./Daily",
      fragment: "#Morning#Tea",
    });
    expect(index.wikiLink("Notes/Daily.md", "paper.pdf#page=3")?.file).toBe("paper.pdf");
    expect(index.wikiLink("Notes/Daily.md", "Missing#x")).toBeNull();
  });

  it("can be given a file that was only just created", () => {
    const index = new LinkIndex(["Inbox.md"]);
    expect(index.markdown("Inbox.md", "attachments/new.png")).toBeNull();
    expect(index.with("attachments/new.png").markdown("Inbox.md", "attachments/new.png")).toBe("attachments/new.png");
    expect(index.with("Inbox.md")).toBe(index);
  });
});
