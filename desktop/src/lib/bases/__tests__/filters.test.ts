import { describe, expect, it } from "vitest";
import { parseBase, runView, type BaseFile, type FilterNode, type NoteRow } from "..";
import { createEnv } from "../environment";
import { testFilter, type FilterFailure } from "../filters";
import { note, NOW, SYNTAX_EXAMPLE } from "./helpers";

function base(text: string): BaseFile {
  const result = parseBase(text);
  if (!result.ok) throw new Error(result.error);
  return result.base;
}

/** The names of the files a view shows, in order. */
function names(file: BaseFile, rows: NoteRow[], view?: string | number): string[] {
  return runView(file, view, rows, { now: NOW }).rows.map((row) => row.row.file.basename);
}

const rows = [
  note("Books/Dune.md", { price: 10, age: 2, status: "reading" }, { tags: ["book"], links: ["Textbook"] }),
  note("Books/Emma.md", { price: 3, age: 3, status: "done" }, { tags: ["book"], links: ["Textbook"] }),
  note("Books/Solo.md", { price: 8, age: 1 }, { tags: ["book"] }),
  note("Required Reading/Calc.md", { price: 50, age: 5, status: "todo" }, { tags: ["book"], links: ["[[Textbook]]"] }),
  note("Required Reading/Guide.md", { price: 9, age: 3 }),
  note("Misc/Tagged.md", { price: 1, age: 4 }, { tags: ["tag"] }),
  note("Notes/Plain.md", { price: 2.5, age: 1 }),
  note("Textbook.md"),
];

describe("filters of the whole base", () => {
  it("applies the nested filter from the syntax page", () => {
    const file = base(SYNTAX_EXAMPLE);
    file.views = [];
    // In: the tagged note; the books that link to Textbook; and whatever is
    // neither a book nor in Required Reading. Out: the book with no link,
    // and the note in Required Reading that is not a book.
    expect(names(file, rows)).toEqual(["Dune", "Emma", "Calc", "Tagged", "Plain", "Textbook"]);
  });

  it("applies the simple filter from the syntax page", () => {
    const file = base('filters:\n  and:\n    - file.hasTag("tag")');
    expect(names(file, rows)).toEqual(["Tagged"]);
  });

  it("shows every file without filters", () => {
    expect(names(base(""), rows)).toHaveLength(rows.length);
  });

  it("takes a single statement", () => {
    expect(names(base('filters: file.inFolder("Books")'), rows)).toEqual(["Dune", "Emma", "Solo"]);
    expect(names(base("filters: price > 8 && age < 5"), rows)).toEqual(["Dune", "Guide"]);
  });
});

describe("filters of one view", () => {
  it("combines the base's filters and the view's with and", () => {
    const file = base(SYNTAX_EXAMPLE);
    // Emma is done; Tagged and Textbook pass neither price test.
    expect(names(file, rows, "My table")).toEqual(["Calc", "Dune", "Plain"]);
  });

  it("leaves other views alone", () => {
    const file = base(`
filters: file.hasTag("book")
views:
  - type: table
    name: Cheap
    filters: price < 9
  - type: table
    name: All
`);
    expect(names(file, rows, "Cheap")).toEqual(["Emma", "Solo"]);
    expect(names(file, rows, "All")).toEqual(["Dune", "Emma", "Solo", "Calc"]);
  });
});

describe("and, or, not", () => {
  const row = note("A.md", { a: 1, b: 2 });
  const test = (node: FilterNode) => {
    const file = base("");
    file.filters = node;
    return runView(file, 0, [row]).rows.length === 1;
  };

  it("and needs every statement", () => {
    expect(test({ and: ["a == 1", "b == 2"] })).toBe(true);
    expect(test({ and: ["a == 1", "b == 3"] })).toBe(false);
  });

  it("or needs one statement", () => {
    expect(test({ or: ["a == 9", "b == 2"] })).toBe(true);
    expect(test({ or: ["a == 9", "b == 9"] })).toBe(false);
  });

  it("not needs none of the statements", () => {
    expect(test({ not: ["a == 9", "b == 9"] })).toBe(true);
    expect(test({ not: ["a == 9", "b == 2"] })).toBe(false);
    expect(test({ not: ["a == 1", "b == 2"] })).toBe(false);
  });

  it("nests to any depth", () => {
    expect(test({ and: [{ or: ["a == 9", { not: ["b == 9"] }] }, { not: [{ and: ["a == 1", "b == 9"] }] }] })).toBe(
      true,
    );
    expect(test({ not: [{ or: [{ and: ["a == 1", "b == 2"] }] }] })).toBe(false);
  });

  it("lets everything through an empty group", () => {
    expect(test({ and: [] })).toBe(true);
    expect(test({ or: [] })).toBe(true);
    expect(test({ not: [] })).toBe(true);
  });

  it("reads a statement by its truthiness", () => {
    expect(test("a")).toBe(true);
    expect(test("missing")).toBe(false);
    expect(test("a - 1")).toBe(false);
    expect(test('"text"')).toBe(true);
  });
});

describe("filters that fail", () => {
  const good = note("Good.md", { n: 5, tags: ["x"] });
  const bad = note("Bad.md", { n: "five", tags: ["x"] });
  const run = (text: string) => runView(base(text), 0, [good, bad]);

  it("drops the row a statement fails on and reports the statement", () => {
    const result = run("filters: n * 2 > 5");
    expect(result.rows.map((r) => r.path)).toEqual(["Good.md"]);
    expect(result.problems).toEqual([
      {
        kind: "filter",
        source: "n * 2 > 5",
        message: "Cannot multiply text and a number",
        count: 1,
        path: "Bad.md",
      },
    ]);
  });

  it("reports a statement once, with the number of rows it failed on", () => {
    const result = run("filters: nosuch(n)");
    expect(result.rows).toEqual([]);
    expect(result.problems).toEqual([
      {
        kind: "filter",
        source: "nosuch(n)",
        message: "There is no function called nosuch()",
        count: 2,
        path: "Good.md",
      },
    ]);
  });

  it("reports a statement that does not parse, and shows no rows for it", () => {
    const result = run('filters:\n  and:\n    - n >\n    - tags.contains("x")');
    expect(result.rows).toEqual([]);
    expect(result.problems[0]).toMatchObject({ kind: "filter", source: "n >", message: "The expression ends too early" });
  });

  it("still keeps a row that another statement of an or lets in", () => {
    const result = run('filters:\n  or:\n    - n * 2 > 5\n    - tags.contains("x")');
    expect(result.rows.map((r) => r.path)).toEqual(["Good.md", "Bad.md"]);
    // The failure is reported all the same: the statement is wrong for that row.
    expect(result.problems).toHaveLength(1);
  });

  it("still drops a row that another statement of an and rules out", () => {
    const result = run("filters:\n  and:\n    - n * 2 > 5\n    - 1 == 2");
    expect(result.rows).toEqual([]);
  });

  it("does not let a not turn a failure into a pass", () => {
    const result = run("filters:\n  not:\n    - n * 2 > 50");
    expect(result.rows.map((r) => r.path)).toEqual(["Good.md"]);
  });

  it("is not a failure for a property to be missing", () => {
    const sparse = [note("A.md", { tags: ["urgent"], price: 5 }), note("B.md"), note("C.md", { tags: null })];
    const result = runView(base('filters:\n  and:\n    - tags.contains("urgent")\n    - price > 2.1'), 0, sparse);
    expect(result.rows.map((r) => r.path)).toEqual(["A.md"]);
    expect(result.problems).toEqual([]);
  });
});

describe("testFilter", () => {
  const row = note("A.md", { n: "five", ok: true });
  const scope = { env: createEnv([row]), row, locals: null };

  it("answers true or false when the statements can decide", () => {
    expect(testFilter("ok", scope)).toBe(true);
    expect(testFilter({ not: ["ok"] }, scope)).toBe(false);
    expect(testFilter({ or: ["n * 2 > 5", "ok"] }, scope)).toBe(true);
    expect(testFilter({ and: ["n * 2 > 5", "!ok"] }, scope)).toBe(false);
  });

  it("answers with the error when they cannot, and names each failed statement", () => {
    const seen: FilterFailure[] = [];
    const result = testFilter({ or: ["n * 2 > 5", "nosuch()", "!ok"] }, scope, (failure) => seen.push(failure));
    expect(result).toEqual({ kind: "error", message: "Cannot multiply text and a number" });
    expect(seen).toEqual([
      { statement: "n * 2 > 5", message: "Cannot multiply text and a number" },
      { statement: "nosuch()", message: "There is no function called nosuch()" },
    ]);
  });
});
