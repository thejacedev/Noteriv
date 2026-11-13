import { describe, expect, it } from "vitest";
import {
  csvField,
  formatValue,
  fromRaw,
  isEmptyValue,
  isTruthy,
  makeNoteRow,
  parseBase,
  runView,
  toCsv,
  typeOf,
  type BaseValue,
  type NoteRow,
  type ViewResult,
} from "..";
import { note, NOW, run } from "./helpers";

function view(text: string, rows: NoteRow[]): ViewResult {
  const parsed = parseBase(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return runView(parsed.base, 0, rows, { now: NOW });
}

describe("csvField", () => {
  it("leaves plain text as it is", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("two words")).toBe("two words");
    expect(csvField("")).toBe("");
    expect(csvField("it's; fine: really")).toBe("it's; fine: really");
  });

  it("quotes a field with a comma, a quote or a line break", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('"')).toBe('""""');
    expect(csvField("line one\nline two")).toBe('"line one\nline two"');
    expect(csvField("windows\r\nbreak")).toBe('"windows\r\nbreak"');
  });

  it("quotes a field with a space at either end, which a reader might trim", () => {
    expect(csvField(" padded")).toBe('" padded"');
    expect(csvField("padded ")).toBe('"padded "');
    expect(csvField("\ttabbed")).toBe('"\ttabbed"');
  });
});

describe("toCsv", () => {
  const rows = [
    note("Books/Dune, part one.md", {
      title: 'The "spice" book',
      price: 12.5,
      read: true,
      tags: ["scifi", "classic"],
      due: "2025-06-01",
      author: "[[Frank Herbert|Frank]]",
      notes: "line one\nline two",
    }),
    note("Books/Emma.md", { title: "Emma", price: 3, read: false, tags: [], site: "https://example.com/emma" }),
    note("Books/Empty.md"),
  ];
  const text = `
properties:
  note.title:
    displayName: Title, as printed
  formula.cost:
    displayName: Cost
formulas:
  cost: 'if(price, "$" + price.toFixed(2))'
  bad: price.nosuch()
views:
  - type: table
    order: [file.name, title, formula.cost, read, tags, due, author, notes, site]
`;

  it("writes a header and one line for each row, with quoting", () => {
    expect(toCsv(view(text, rows)).split("\r\n")).toEqual([
      'file name,"Title, as printed",Cost,read,tags,due,author,notes,site',
      '"Dune, part one.md","The ""spice"" book",$12.50,true,"scifi, classic",2025-06-01,Frank,"line one\nline two",',
      "Emma.md,Emma,$3.00,false,,,,,https://example.com/emma",
      "Empty.md,,,,,,,,",
    ]);
  });

  it("can leave out the header and use another line ending", () => {
    const csv = toCsv(view("views:\n  - type: table\n    order: [file.name, price]", rows), {
      noHeader: true,
      lineEnding: "\n",
    });
    expect(csv).toBe('"Dune, part one.md",12.5\nEmma.md,3\nEmpty.md,');
  });

  it("follows the view's order, limit and groups", () => {
    const grouped = view(
      "views:\n  - type: table\n    order: [file.basename, read]\n    limit: 2\n    sort:\n      - property: price\n    groupBy:\n      property: read\n      direction: DESC",
      rows,
    );
    expect(toCsv(grouped, { lineEnding: "\n" })).toBe('file base name,read\n"Dune, part one",true\nEmma,false');
  });

  it("writes dates and empty cells the way the options ask", () => {
    const csv = toCsv(view("views:\n  - type: table\n    order: [due, price]", rows), {
      noHeader: true,
      lineEnding: "\n",
      format: { dateFormat: "D MMM, YYYY", emptyText: "-" },
    });
    expect(csv).toBe('"1 Jun, 2025",12.5\n-,3\n-,-');
  });

  it("writes the message of a cell that failed", () => {
    const csv = toCsv(view(`${text.replace("order: [file.name, title", "order: [formula.bad, file.name")}`, rows), {
      noHeader: true,
      lineEnding: "\n",
    });
    expect(csv.split("\n")[2]).toBe("There is no function called nosuch(),Emma.md,$3.00,false,,,,,https://example.com/emma");
  });

  it("gives only the header for a view with no rows", () => {
    expect(toCsv(view("filters: 1 == 2\nviews:\n  - type: table\n    order: [file.name, price]", rows))).toBe(
      "file name,price",
    );
  });
});

describe("formatValue", () => {
  const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

  it("shows nothing for an empty value, or the text asked for", () => {
    expect(formatValue(null)).toBe("");
    expect(formatValue(null, { emptyText: "—" })).toBe("—");
    expect(formatValue([1, null, 3], { emptyText: "?" })).toBe("1, ?, 3");
  });

  it("shows text, numbers and booleans", () => {
    expect(formatValue("text")).toBe("text");
    expect(formatValue(42)).toBe("42");
    expect(formatValue(-0.5)).toBe("-0.5");
    expect(formatValue(true)).toBe("true");
    expect(formatValue(false)).toBe("false");
  });

  it("hides the noise arithmetic leaves in a number", () => {
    expect(formatValue(run("0.1 + 0.2"))).toBe("0.3");
    expect(formatValue(run("1.1 * 3"))).toBe("3.3");
    expect(formatValue(1e21)).toBe("1e+21");
    expect(formatValue(123456789.123)).toBe("123456789.123");
    expect(formatValue(Infinity)).toBe("Infinity");
  });

  it("shows a date with or without its time, in the format asked for", () => {
    const date: BaseValue = { kind: "date", ms: at(2025, 5, 27), hasTime: false };
    const moment: BaseValue = { kind: "date", ms: at(2025, 5, 27, 14, 5), hasTime: true };
    expect(formatValue(date)).toBe("2025-05-27");
    expect(formatValue(moment)).toBe("2025-05-27 14:05:00");
    expect(formatValue(date, { dateFormat: "MMM D, YYYY" })).toBe("May 27, 2025");
    expect(formatValue(moment, { dateFormat: "MMM D, YYYY" })).toBe("2025-05-27 14:05:00");
    expect(formatValue(moment, { dateTimeFormat: "D/M/YY h:mm a" })).toBe("27/5/25 2:05 pm");
  });

  it("shows a duration in words", () => {
    expect(formatValue(run('duration("3d 4h")'))).toBe("3 days 4 hours");
    expect(formatValue(run('date("2025-03-01") - date("2025-02-27")'))).toBe("2 days");
  });

  it("counts whole days between two dates across a clock change", () => {
    // Clocks change between these dates in most zones that have summer time.
    expect(formatValue(run('date("2025-04-15") - date("2025-03-01")'))).toBe("45 days");
    expect(formatValue(run('date("2025-11-15") - date("2025-10-01")'))).toBe("45 days");
    expect(run('(date("2025-11-15") - date("2025-10-01")).days')).toBe(45);
    expect(formatValue(run('date("2025-03-01") + (date("2025-04-15") - date("2025-03-01"))'))).toBe("2025-04-15");
  });

  it("shows a list with a separator", () => {
    expect(formatValue(["a", 2, true])).toBe("a, 2, true");
    expect(formatValue(["a", "b"], { listSeparator: " | " })).toBe("a | b");
    expect(formatValue([])).toBe("");
    expect(formatValue([["a", "b"], ["c"]])).toBe("a, b, c");
  });

  it("shows a link by its display text, or its target", () => {
    expect(formatValue(run('link("Folder/Note")'))).toBe("Folder/Note");
    expect(formatValue(run('link("[[Note#Heading]]")'))).toBe("Note#Heading");
    expect(formatValue(run('link("Note", "shown")'))).toBe("shown");
    expect(formatValue(run('link("[[Note|alias]]")'))).toBe("alias");
    expect(formatValue(run('link("https://obsidian.md")'))).toBe("https://obsidian.md");
    expect(formatValue(run('link("Note", icon("plus"))'))).toBe("plus");
  });

  it("shows files, tags, objects and the rest", () => {
    const row = note("Books/Dune.md", { meta: { pages: 412, tags: ["a"] } }, { tags: ["book"] });
    expect(formatValue(run("file", row))).toBe("Dune.md");
    expect(formatValue(run("file.tags", row))).toBe("#book");
    expect(formatValue(run("meta", row))).toBe('{"pages":412,"tags":["a"]}');
    expect(formatValue(run("/a+b/gi"))).toBe("/a+b/gi");
    expect(formatValue(run('html("<i>x</i>")'))).toBe("<i>x</i>");
    expect(formatValue(run('image("cover.png")'))).toBe("cover.png");
    expect(formatValue(run('icon("star")'))).toBe("star");
    expect(formatValue(run("nosuch()"))).toBe("There is no function called nosuch()");
  });

  it("stops at a list nested without end", () => {
    let nested: BaseValue = "core";
    for (let i = 0; i < 10_000; i++) nested = [nested];
    expect(formatValue(nested)).toBe("…");
  });
});

describe("values", () => {
  it("names the type of each value", () => {
    const row = note("A.md", {}, { tags: ["t"] });
    const types = [
      "null",
      '"text"',
      "1",
      "true",
      "[1]",
      "now()",
      'duration("1d")',
      'link("a")',
      'link("https://a.b")',
      "file",
      "file.tags[0]",
      '{"a": 1}',
      "/a/",
      'html("a")',
      'image("a")',
      'icon("a")',
      "nosuch()",
    ].map((source) => typeOf(run(source, row)));
    expect(types).toEqual([
      "null",
      "string",
      "number",
      "boolean",
      "list",
      "date",
      "duration",
      "link",
      "url",
      "file",
      "tag",
      "object",
      "regexp",
      "html",
      "image",
      "icon",
      "error",
    ]);
  });

  it("knows what is empty and what is true", () => {
    expect([null, "", [], run("{}")].map(isEmptyValue)).toEqual([true, true, true, true]);
    expect([0, false, " ", [null], run("now()")].map(isEmptyValue)).toEqual([false, false, false, false, false]);
    expect([null, "", 0, false, [], NaN, run("nosuch()")].map(isTruthy)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(["a", 1, true, [0], run("now()"), run("{}")].map(isTruthy)).toEqual([true, true, true, true, true, true]);
  });
});

describe("reading frontmatter", () => {
  it("recognises links, URLs and dates in text", () => {
    expect(fromRaw("[[Note]]")).toMatchObject({ kind: "link", path: "Note" });
    expect(fromRaw("![[image.png]]")).toMatchObject({ kind: "link", path: "image.png", embed: true });
    expect(fromRaw("[[Note#Part|shown]]")).toMatchObject({ path: "Note", subpath: "#Part", display: "shown" });
    expect(fromRaw("https://obsidian.md")).toEqual({ kind: "url", href: "https://obsidian.md", display: null });
    expect(fromRaw("mailto:someone@example.com")).toMatchObject({ kind: "url" });
    expect(fromRaw("2025-05-27")).toMatchObject({ kind: "date", hasTime: false });
    expect(fromRaw("2025-05-27T10:00")).toMatchObject({ kind: "date", hasTime: true });
  });

  it("leaves other text alone", () => {
    for (const text of ["see [[Note]] for more", "visit https://obsidian.md today", "2025", "05/27/2025", "#000000", ""]) {
      expect(fromRaw(text)).toBe(text);
    }
  });

  it("converts lists and nested objects, and drops what has no value", () => {
    expect(fromRaw(["a", 1, ["[[b]]"]])).toMatchObject(["a", 1, [{ kind: "link", path: "b" }]]);
    expect(fromRaw({ a: { b: [true] } })).toEqual({
      kind: "object",
      fields: { a: { kind: "object", fields: { b: [true] } } },
    });
    expect(fromRaw(undefined)).toBeNull();
    expect(fromRaw(() => 1)).toBeNull();
    expect(fromRaw(BigInt(12))).toBe(12);
    expect(fromRaw(new Map([["k", "v"]]))).toEqual({ kind: "object", fields: { k: "v" } });
  });

  it("keeps a key called __proto__ as data", () => {
    const value = fromRaw(JSON.parse('{"__proto__": {"polluted": true}, "safe": 1}'));
    expect(typeOf(value)).toBe("object");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(run('note["__proto__"].polluted', note("A.md", JSON.parse('{"__proto__": {"polluted": true}}')))).toBe(true);
  });

  it("does not follow an object that contains itself", () => {
    const loop: Record<string, unknown> = { name: "loop" };
    loop.self = loop;
    expect(typeOf(fromRaw(loop))).toBe("object");
  });
});

describe("makeNoteRow", () => {
  it("derives the file's name, folder and extension from its path", () => {
    expect(makeNoteRow({ path: "Projects/2025/Plan.final.md" }).file).toEqual({
      name: "Plan.final.md",
      basename: "Plan.final",
      path: "Projects/2025/Plan.final.md",
      folder: "Projects/2025",
      ext: "md",
      size: 0,
      ctime: 0,
      mtime: 0,
      tags: [],
      links: [],
    });
  });

  it("handles the vault root, other slashes and names without an extension", () => {
    expect(makeNoteRow({ path: "Inbox.md" }).file).toMatchObject({ name: "Inbox.md", folder: "" });
    expect(makeNoteRow({ path: "\\Notes\\Win.md" }).file).toMatchObject({ path: "Notes/Win.md", folder: "Notes" });
    expect(makeNoteRow({ path: "LICENSE" }).file).toMatchObject({ basename: "LICENSE", ext: "" });
    expect(makeNoteRow({ path: ".gitignore" }).file).toMatchObject({ basename: ".gitignore", ext: "" });
    expect(makeNoteRow({ path: "a.png", embeds: ["x"], size: 9 }).file).toMatchObject({ embeds: ["x"], size: 9 });
  });
});
