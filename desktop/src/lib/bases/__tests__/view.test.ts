import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SUMMARIES,
  DEFAULT_VIEW,
  VIEW_TYPES,
  builtInSummary,
  formatValue,
  isError,
  parseBase,
  runView,
  type BaseFile,
  type BaseValue,
  type NoteRow,
  type RunViewOptions,
  type ViewResult,
} from "..";
import { note, NOW, SYNTAX_EXAMPLE } from "./helpers";

function base(text: string): BaseFile {
  const result = parseBase(text);
  if (!result.ok) throw new Error(result.error);
  return result.base;
}

function view(text: string, rows: NoteRow[], which?: string | number, options: RunViewOptions = {}): ViewResult {
  return runView(base(text), which, rows, { now: NOW, ...options });
}

const paths = (result: ViewResult) => result.rows.map((row) => row.path);
const column = (result: ViewResult, id: string) => result.rows.map((row) => row.cells[id]);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe("the example from the syntax page", () => {
  const rows = [
    note("Books/Dune.md", { price: 10, age: 2, status: "reading" }, { tags: ["book"], links: ["Textbook"] }),
    note("Books/Emma.md", { price: 3, age: 3, status: "done" }, { tags: ["book"], links: ["Textbook"] }),
    note("Required Reading/Calc.md", { price: 50, age: 5, status: "todo" }, { tags: ["book"], links: ["Textbook"] }),
    note("Notes/Plain.md", { price: 2.5, age: 1 }),
    note("Textbook.md"),
  ];
  const result = view(SYNTAX_EXAMPLE, rows, "My table");

  it("gives the view's type, name and limit", () => {
    expect(result.type).toBe("table");
    expect(result.name).toBe("My table");
    expect(result.index).toBe(0);
    expect(result.limit).toBe(10);
    expect(result.matchedCount).toBe(3);
    expect(result.problems).toEqual([]);
  });

  it("gives the columns in order, with their display names", () => {
    expect(result.columns).toEqual([
      { id: "file.name", source: "file", name: "name", displayName: "file name" },
      { id: "file.ext", source: "file", name: "ext", displayName: "Extension" },
      { id: "note.age", source: "note", name: "age", displayName: "age" },
      { id: "formula.ppu", source: "formula", name: "ppu", displayName: "ppu" },
      { id: "formula.formatted_price", source: "formula", name: "formatted_price", displayName: "Price" },
    ]);
  });

  it("computes every cell, formulas included", () => {
    const dune = result.rows.find((row) => row.path === "Books/Dune.md");
    expect(dune?.cells).toEqual({
      "file.name": "Dune.md",
      "file.ext": "md",
      "note.age": 2,
      "formula.ppu": "5.00",
      "formula.formatted_price": "10.00 dollars",
    });
  });

  it("groups by age, largest first", () => {
    expect(result.groupBy).toEqual({
      id: "note.age",
      source: "note",
      name: "age",
      displayName: "age",
      direction: "DESC",
    });
    expect(result.groups?.map((group) => [group.key, group.label, group.rows.map((row) => row.path)])).toEqual([
      [5, "5", ["Required Reading/Calc.md"]],
      [2, "2", ["Books/Dune.md"]],
      [1, "1", ["Notes/Plain.md"]],
    ]);
    // The flat list follows the groups.
    expect(paths(result)).toEqual(["Required Reading/Calc.md", "Books/Dune.md", "Notes/Plain.md"]);
  });

  it("summarises the ppu column, for the view and for each group", () => {
    expect(result.summaries["formula.ppu"].name).toBe("Average");
    expect(result.summaries["formula.ppu"].value).toBeCloseTo((10 + 5 + 2.5) / 3);
    expect(result.groups?.map((group) => group.summaries["formula.ppu"].value)).toEqual([10, 5, 2.5]);
  });

  it("runs the custom summary from the file", () => {
    const file = base(SYNTAX_EXAMPLE);
    file.views[0].summaries = { "formula.ppu": "customAverage", "note.age": "customAverage" };
    const custom = runView(file, 0, rows, { now: NOW });
    expect(custom.summaries["formula.ppu"]).toEqual({ name: "customAverage", value: 5.833 });
    expect(custom.summaries["note.age"]).toEqual({ name: "customAverage", value: 2.667 });
  });
});

describe("choosing a view", () => {
  const text = `
views:
  - type: table
    name: First
  - type: cards
    name: Second
  - type: gantt
    name: Third
`;
  const rows = [note("A.md")];

  it("takes a name, a position, or nothing for the first view", () => {
    expect(view(text, rows).name).toBe("First");
    expect(view(text, rows, 1).name).toBe("Second");
    expect(view(text, rows, "Second").index).toBe(1);
    expect(view(text, rows, "second").name).toBe("Second");
  });

  it("falls back to the first view and says so", () => {
    const byName = view(text, rows, "Gone");
    expect(byName.name).toBe("First");
    expect(byName.problems).toEqual([{ kind: "view", message: 'There is no view called "Gone". Showing "First".' }]);
    expect(view(text, rows, 7).problems[0].message).toBe('There is no view number 8. Showing "First".');
  });

  it("passes a type it does not know through", () => {
    const third = view(text, rows, "Third");
    expect(third.type).toBe("gantt");
    expect((VIEW_TYPES as readonly string[]).includes(third.type)).toBe(false);
    expect(third.rows).toHaveLength(1);
  });

  it("shows a base with no views as a table of file names", () => {
    const result = view("", [note("B.md"), note("A.md")]);
    expect(result.view).toBe(DEFAULT_VIEW);
    expect(result.type).toBe("table");
    expect(result.columns.map((c) => c.id)).toEqual(["file.name"]);
    expect(column(result, "file.name")).toEqual(["B.md", "A.md"]);
    expect(result.groups).toBeNull();
    expect(result.limit).toBeNull();
  });
});

describe("view types", () => {
  const rows = [
    note("Paris.md", { cover: "[[paris.jpg]]", coordinates: ["48.85837", "2.294481"], icon: "landmark", status: "Done" }),
    note("Rome.md", { cover: "https://example.com/rome.jpg", coordinates: "41.9, 12.5", status: "Planned" }),
  ];
  const text = `
views:
  - type: cards
    name: Gallery
    image: note.cover
    imageFit: contain
    imageAspectRatio: 0.5
    cardSize: 240
    order: [file.name]
  - type: list
    name: Plain list
    markers: number
    indentProperties: true
    order: [file.name, note.status]
  - type: kanban
    name: Board
    columnWidth: 300
    image: cover
    groupBy:
      property: status
      direction: ASC
  - type: map
    name: Places
    coordinates: note.coordinates
    markerIcon: note.icon
    mapTiles: https://tiles.openfreemap.org/styles/dark
`;

  it("knows the built-in types", () => {
    expect(VIEW_TYPES).toEqual(["table", "cards", "list", "kanban", "map"]);
  });

  it("gives a cards view its settings and the cover of each card", () => {
    const cards = view(text, rows, "Gallery");
    expect(cards.type).toBe("cards");
    expect(cards.settings).toEqual({ image: "note.cover", imageFit: "contain", imageAspectRatio: 0.5, cardSize: 240 });
    expect(cards.imageProperty).toBe("note.cover");
    // The cover is computed although it is not a column.
    expect(cards.columns.map((c) => c.id)).toEqual(["file.name"]);
    expect(cards.rows[0].cells["note.cover"]).toMatchObject({ kind: "link", path: "paris.jpg" });
    expect(cards.rows[1].cells["note.cover"]).toMatchObject({ kind: "url", href: "https://example.com/rome.jpg" });
  });

  it("gives a list view its settings", () => {
    const list = view(text, rows, "Plain list");
    expect(list.type).toBe("list");
    expect(list.settings).toEqual({ markers: "number", indentProperties: true });
    expect(list.columns.map((c) => c.displayName)).toEqual(["file name", "status"]);
  });

  it("gives a kanban view its columns as groups", () => {
    const board = view(text, rows, "Board");
    expect(board.type).toBe("kanban");
    expect(board.settings).toEqual({ columnWidth: 300, image: "cover" });
    expect(board.imageProperty).toBe("note.cover");
    expect(board.groups?.map((group) => [group.label, group.rows.map((row) => row.path)])).toEqual([
      ["Done", ["Paris.md"]],
      ["Planned", ["Rome.md"]],
    ]);
  });

  it("passes a map view's settings through untouched", () => {
    const map = view(text, rows, "Places", { extraProperties: ["coordinates", "note.icon"] });
    expect(map.type).toBe("map");
    expect(map.settings).toEqual({
      coordinates: "note.coordinates",
      markerIcon: "note.icon",
      mapTiles: "https://tiles.openfreemap.org/styles/dark",
    });
    // What the map needs for its pins is asked for as extra properties.
    expect(map.rows[0].cells["note.coordinates"]).toEqual(["48.85837", "2.294481"]);
    expect(map.rows[1].cells["note.coordinates"]).toBe("41.9, 12.5");
    expect(map.rows[0].cells["note.icon"]).toBe("landmark");
  });
});

describe("sorting", () => {
  const rows = [
    note("b.md", { status: "Open", priority: 2, due: "2025-03-01" }),
    note("A.md", { status: "Done", priority: 1, due: "2025-01-15" }),
    note("d.md", { status: "Open", priority: 10, due: "2024-12-31" }),
    note("C.md", { status: "Done", priority: 3 }),
    note("e.md", { priority: 2, due: "2025-02-01" }),
  ];
  const sorted = (sort: string) => paths(view(`views:\n  - type: table\n    sort:\n${sort}`, rows));

  it("keeps the order the rows were given in when there is no sort", () => {
    expect(paths(view("", rows))).toEqual(["b.md", "A.md", "d.md", "C.md", "e.md"]);
  });

  it("sorts text without regard to case", () => {
    expect(sorted("      - property: file.name")).toEqual(["A.md", "b.md", "C.md", "d.md", "e.md"]);
    expect(sorted("      - property: file.name\n        direction: DESC")).toEqual([
      "e.md",
      "d.md",
      "C.md",
      "b.md",
      "A.md",
    ]);
  });

  it("sorts numbers by value, not as text", () => {
    expect(sorted("      - property: priority\n      - property: file.name")).toEqual([
      "A.md",
      "b.md",
      "e.md",
      "C.md",
      "d.md",
    ]);
  });

  it("sorts dates from old to new, or new to old", () => {
    expect(sorted("      - property: due")).toEqual(["d.md", "A.md", "e.md", "b.md", "C.md"]);
    // The note with no date stays last either way.
    expect(sorted("      - property: due\n        direction: DESC")).toEqual(["b.md", "e.md", "A.md", "d.md", "C.md"]);
  });

  it("sorts by several keys, each in its own direction", () => {
    const sort = `
      - property: status
        direction: ASC
      - property: priority
        direction: DESC
`;
    expect(sorted(sort)).toEqual(["C.md", "A.md", "d.md", "b.md", "e.md"]);
    const reversed = `
      - property: status
        direction: DESC
      - property: priority
        direction: ASC
`;
    expect(sorted(reversed)).toEqual(["b.md", "d.md", "A.md", "C.md", "e.md"]);
  });

  it("keeps the given order between rows that sort the same", () => {
    expect(sorted("      - property: status")).toEqual(["A.md", "C.md", "b.md", "d.md", "e.md"]);
  });

  it("sorts by a formula", () => {
    const text = `
formulas:
  weight: priority * if(status == "Open", 10, 1)
views:
  - type: table
    order: [file.name, formula.weight]
    sort:
      - property: formula.weight
        direction: DESC
`;
    const result = view(text, rows);
    expect(paths(result)).toEqual(["d.md", "b.md", "C.md", "e.md", "A.md"]);
    expect(column(result, "formula.weight")).toEqual([100, 20, 3, 2, 1]);
  });

  it("sorts mixed types into runs of their own, with failed cells last", () => {
    const mixed = [
      note("text.md", { v: "apple" }),
      note("bool.md", { v: true }),
      note("date.md", { v: "2025-01-01" }),
      note("num.md", { v: 7 }),
      note("none.md"),
      note("list.md", { v: ["b", "a"] }),
    ];
    const result = view("views:\n  - type: table\n    sort:\n      - property: v", mixed);
    expect(paths(result)).toEqual(["num.md", "date.md", "bool.md", "text.md", "list.md", "none.md"]);
  });
});

describe("limits", () => {
  const rows = Array.from({ length: 25 }, (_, i) => note(`Note ${i + 1}.md`, { n: i + 1 }));

  it("cuts the sorted rows and reports how many matched", () => {
    const result = view("views:\n  - type: table\n    limit: 10\n    sort:\n      - property: n\n        direction: DESC", rows);
    expect(result.rows).toHaveLength(10);
    expect(result.limit).toBe(10);
    expect(result.matchedCount).toBe(25);
    expect(column(result, "file.name")[0]).toBe("Note 25.md");
    expect(column(result, "file.name")[9]).toBe("Note 16.md");
  });

  it("sorts names with numbers in them the way a reader would", () => {
    const result = view("views:\n  - type: table\n    limit: 3\n    sort:\n      - property: file.name", rows);
    expect(column(result, "file.name")).toEqual(["Note 1.md", "Note 2.md", "Note 3.md"]);
  });

  it("applies after the filters", () => {
    const result = view("filters: n > 20\nviews:\n  - type: table\n    limit: 10", rows);
    expect(result.rows).toHaveLength(5);
    expect(result.matchedCount).toBe(5);
  });

  it("summarises only the rows shown", () => {
    const result = view(
      "views:\n  - type: table\n    limit: 4\n    order: [n]\n    summaries:\n      n: Sum",
      rows,
    );
    expect(result.summaries["note.n"].value).toBe(10);
  });

  it("applies before grouping", () => {
    const text = `
views:
  - type: table
    limit: 5
    sort:
      - property: n
    groupBy:
      property: formula.parity
formulas:
  parity: if(n % 2 == 0, "even", "odd")
`;
    const result = view(text, rows);
    expect(result.groups?.map((group) => [group.label, group.rows.length])).toEqual([
      ["even", 2],
      ["odd", 3],
    ]);
  });
});

describe("grouping", () => {
  const rows = [
    note("a.md", { status: "In progress", owner: "[[Dana]]", n: 1 }),
    note("b.md", { status: "Done", owner: "[[People/Dana|D.]]", n: 2 }),
    note("c.md", { status: "Planned", n: 3 }),
    note("d.md", { status: "Done", owner: "[[Lee]]", n: 4 }),
    note("e.md", { n: 5, status: "" }),
    note("f.md", { status: "Blocked", n: 6 }),
    note("People/Dana.md"),
  ];
  const grouped = (extra: string, options: RunViewOptions = {}) =>
    view(
      `filters: file.inFolder("People") == false\nviews:\n  - type: kanban\n    name: Projects\n    order: [file.name, n]\n${extra}`,
      rows,
      0,
      options,
    );
  const shape = (result: ViewResult) => result.groups?.map((group) => [group.label, group.rows.map((r) => r.path)]);

  it("groups by a property in ascending order, rows without a value last", () => {
    const result = grouped("    groupBy:\n      property: note.status\n      direction: ASC");
    expect(shape(result)).toEqual([
      ["Blocked", ["f.md"]],
      ["Done", ["b.md", "d.md"]],
      ["In progress", ["a.md"]],
      ["Planned", ["c.md"]],
      ["None", ["e.md"]],
    ]);
    expect(result.groups?.[4].key).toBeNull();
    expect(paths(result)).toEqual(["f.md", "b.md", "d.md", "a.md", "c.md", "e.md"]);
  });

  it("groups in descending order", () => {
    const result = grouped("    groupBy:\n      property: note.status\n      direction: DESC");
    expect(result.groups?.map((group) => group.label)).toEqual(["Planned", "In progress", "Done", "Blocked", "None"]);
  });

  it("keeps the view's sort inside each group", () => {
    const result = grouped(
      "    sort:\n      - property: n\n        direction: DESC\n    groupBy:\n      property: status",
    );
    expect(shape(result)?.[1]).toEqual(["Done", ["d.md", "b.md"]]);
  });

  it("shows only the listed groups, in the listed order, as the syntax page describes", () => {
    const result = grouped(
      "    groupBy:\n      property: note.status\n      direction: ASC\n    groupOrder:\n      - Planned\n      - In progress\n      - Done",
    );
    expect(shape(result)).toEqual([
      ["Planned", ["c.md"]],
      ["In progress", ["a.md"]],
      ["Done", ["b.md", "d.md"]],
    ]);
    // Rows of hidden groups are not shown.
    expect(paths(result)).toEqual(["c.md", "a.md", "b.md", "d.md"]);
    expect(result.matchedCount).toBe(6);
  });

  it("includes the rows with no value when the group order lists null", () => {
    const result = grouped("    groupBy:\n      property: status\n    groupOrder:\n      - null\n      - Done");
    expect(shape(result)).toEqual([
      ["None", ["e.md"]],
      ["Done", ["b.md", "d.md"]],
    ]);
  });

  it("shows a listed group that has no rows yet", () => {
    const result = grouped("    groupBy:\n      property: status\n    groupOrder:\n      - Review\n      - Done");
    expect(shape(result)).toEqual([
      ["Review", []],
      ["Done", ["b.md", "d.md"]],
    ]);
  });

  it("hides every group for an empty group order", () => {
    const result = grouped("    groupBy:\n      property: status\n    groupOrder: []");
    expect(result.groups).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("puts links to the same note in one group, however they are written", () => {
    const result = grouped("    groupBy:\n      property: owner");
    expect(shape(result)).toEqual([
      ["Dana", ["a.md", "b.md"]],
      ["Lee", ["d.md"]],
      ["None", ["c.md", "e.md", "f.md"]],
    ]);
  });

  it("groups by a file property and by a formula", () => {
    const byFolder = view("views:\n  - type: table\n    groupBy:\n      property: file.folder", rows);
    expect(byFolder.groups?.map((group) => [group.label, group.rows.length])).toEqual([
      ["People", 1],
      ["None", 6],
    ]);
    const byFormula = view(
      'formulas:\n  size: if(n > 3, "big", "small")\nviews:\n  - type: table\n    groupBy:\n      property: formula.size\n      direction: DESC',
      rows.slice(0, 6),
    );
    expect(byFormula.groups?.map((group) => [group.key, group.rows.length])).toEqual([
      ["small", 3],
      ["big", 3],
    ]);
  });

  it("gives each group its own summaries", () => {
    const result = grouped("    groupBy:\n      property: status\n    summaries:\n      n: Sum");
    expect(result.groups?.map((group) => [group.label, group.summaries["note.n"].value])).toEqual([
      ["Blocked", 6],
      ["Done", 6],
      ["In progress", 1],
      ["Planned", 3],
      ["None", 5],
    ]);
    expect(result.summaries["note.n"]).toEqual({ name: "Sum", value: 21 });
  });

  it("is not grouped without groupBy", () => {
    expect(view("views:\n  - type: table", rows).groups).toBeNull();
  });
});

describe("built-in summaries", () => {
  const numbers: BaseValue[] = [4, 8, null, 15, "16", 23, 42, "n/a"];
  const date = (y: number, m: number, d: number): BaseValue => ({ kind: "date", ms: day(y, m, d), hasTime: false });
  const dates: BaseValue[] = [date(2025, 3, 10), null, date(2025, 1, 5), date(2025, 1, 25)];

  it("lists every summary the docs name", () => {
    expect([...BUILT_IN_SUMMARIES].sort()).toEqual(
      [
        "Average",
        "Checked",
        "Earliest",
        "Empty",
        "Filled",
        "Latest",
        "Max",
        "Median",
        "Min",
        "Range",
        "Stddev",
        "Sum",
        "Unchecked",
        "Unique",
      ].sort(),
    );
  });

  it("Average, Min, Max, Sum, Range and Median work on the numbers", () => {
    expect(builtInSummary("Average", numbers)).toBe(18);
    expect(builtInSummary("Min", numbers)).toBe(4);
    expect(builtInSummary("Max", numbers)).toBe(42);
    expect(builtInSummary("Sum", numbers)).toBe(108);
    expect(builtInSummary("Range", numbers)).toBe(38);
    expect(builtInSummary("Median", numbers)).toBe(15.5);
    expect(builtInSummary("Median", [3, 1, 2])).toBe(2);
  });

  it("Stddev is the standard deviation of the whole set", () => {
    expect(builtInSummary("Stddev", [2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(builtInSummary("Stddev", [5])).toBe(0);
  });

  it("Earliest, Latest and Range work on the dates", () => {
    expect(formatValue(builtInSummary("Earliest", dates))).toBe("2025-01-05");
    expect(formatValue(builtInSummary("Latest", dates))).toBe("2025-03-10");
    const range = builtInSummary("Range", dates);
    expect(range).toMatchObject({ kind: "duration" });
    expect(formatValue(range)).toBe("64 days");
  });

  it("Checked and Unchecked count the booleans", () => {
    const boxes: BaseValue[] = [true, false, true, null, true, "true"];
    expect(builtInSummary("Checked", boxes)).toBe(3);
    expect(builtInSummary("Unchecked", boxes)).toBe(1);
  });

  it("Empty, Filled and Unique count values of any type", () => {
    const mixed: BaseValue[] = ["a", "", null, [], ["x"], "a", 0, false, "A", ["x"]];
    expect(builtInSummary("Empty", mixed)).toBe(3);
    expect(builtInSummary("Filled", mixed)).toBe(7);
    // "a" twice and ["x"] twice count once each; "A" is its own value.
    expect(builtInSummary("Unique", mixed)).toBe(5);
  });

  it("give nothing when there is nothing of their type", () => {
    const words: BaseValue[] = ["a", "b", null];
    for (const name of ["Average", "Min", "Max", "Sum", "Range", "Median", "Stddev", "Earliest", "Latest"] as const) {
      expect(builtInSummary(name, words)).toBeNull();
      expect(builtInSummary(name, [])).toBeNull();
    }
    expect(builtInSummary("Checked", words)).toBe(0);
    expect(builtInSummary("Empty", [])).toBe(0);
  });
});

describe("summaries in a view", () => {
  const rows = [
    note("a.md", { price: 10, done: true, due: "2025-01-05" }),
    note("b.md", { price: 20, done: false, due: "2025-03-10" }),
    note("c.md", { price: 60, done: true }),
    note("d.md", { done: true, due: "2025-01-25" }),
  ];
  const summarised = (summaries: string, custom = "") =>
    view(`${custom}views:\n  - type: table\n    order: [file.name, price, done, due]\n    summaries:\n${summaries}`, rows);

  it("computes one summary for each column that asks for it", () => {
    const result = summarised("      price: Average\n      done: Checked\n      note.due: Latest\n      file.name: Unique");
    expect(result.summaries["note.price"]).toEqual({ name: "Average", value: 30 });
    expect(result.summaries["note.done"]).toEqual({ name: "Checked", value: 3 });
    expect(formatValue(result.summaries["note.due"].value)).toBe("2025-03-10");
    expect(result.summaries["file.name"]).toEqual({ name: "Unique", value: 4 });
    expect(Object.keys(result.summaries)).toEqual(["note.price", "note.done", "note.due", "file.name"]);
  });

  it("counts empty and filled cells", () => {
    expect(summarised("      price: Empty").summaries["note.price"].value).toBe(1);
    expect(summarised("      price: Filled").summaries["note.price"].value).toBe(3);
  });

  it("finds a built-in summary whatever the case of its name", () => {
    expect(summarised("      price: sum").summaries["note.price"]).toEqual({ name: "sum", value: 90 });
  });

  it("runs a custom formula over the column's values", () => {
    const custom = `
summaries:
  total with tax: values.reduce(acc + if(value, value, 0), 0) * 1.1
  biggest: values.filter(value.isType("number")).reduce(if(acc == null || value > acc, value, acc), null)
  share done: (values.filter(value == true).length / values.length * 100).round() + "%"
`;
    expect(summarised("      price: total with tax", custom).summaries["note.price"].value).toBeCloseTo(99);
    expect(summarised("      price: biggest", custom).summaries["note.price"].value).toBe(60);
    expect(summarised("      done: share done", custom).summaries["note.done"].value).toBe("75%");
  });

  it("lets a custom summary take the name of a built-in one", () => {
    const custom = "summaries:\n  Sum: values.length\n";
    expect(summarised("      price: Sum", custom).summaries["note.price"].value).toBe(4);
  });

  it("gives an error value for a summary that does not exist or fails", () => {
    const unknown = summarised("      price: Mode").summaries["note.price"].value;
    expect(unknown).toEqual({ kind: "error", message: 'There is no summary called "Mode"' });
    const broken = summarised("      price: bad", "summaries:\n  bad: values.nosuch()\n").summaries["note.price"].value;
    expect(broken).toEqual({ kind: "error", message: "There is no function called nosuch()" });
    const syntax = summarised("      price: worse", "summaries:\n  worse: values.\n").summaries["note.price"].value;
    expect(isError(syntax)).toBe(true);
  });

  it("summarises a property that is not a column", () => {
    const result = view("views:\n  - type: table\n    order: [file.name]\n    summaries:\n      price: Max", rows);
    expect(result.summaries["note.price"].value).toBe(60);
  });
});

describe("cells that fail", () => {
  const rows = [note("ok.md", { price: 4, qty: 2 }), note("zero.md", { price: 4, qty: 0 }), note("text.md", { price: "four", qty: 2 })];
  const text = `
formulas:
  each: price / qty
  doubled: formula.each * 2
  typo: price.toFixd(2)
  broken: (price
  loop: formula.loop + 1
views:
  - type: table
    order: [file.name, formula.each, formula.doubled, formula.typo, formula.broken, formula.loop, formula.nosuch]
    sort:
      - property: formula.each
    summaries:
      formula.each: Sum
`;
  const result = view(text, rows);

  it("fail one at a time, and the rest of the view is drawn", () => {
    expect(result.rows).toHaveLength(3);
    expect(column(result, "file.name")).toEqual(["ok.md", "zero.md", "text.md"]);
    expect(column(result, "formula.each")).toEqual([
      2,
      { kind: "error", message: "Cannot divide by zero" },
      { kind: "error", message: "Cannot divide text and a number" },
    ]);
  });

  it("carry the error into the formulas that use them", () => {
    expect(column(result, "formula.doubled")).toEqual([
      4,
      { kind: "error", message: "Cannot divide by zero" },
      { kind: "error", message: "Cannot divide text and a number" },
    ]);
  });

  it("say what is wrong: an unknown function, a syntax error, a loop, a missing formula", () => {
    const first = result.rows[0].cells;
    expect(first["formula.typo"]).toEqual({ kind: "error", message: "There is no function called toFixd()" });
    expect(first["formula.broken"]).toEqual({ kind: "error", message: 'Formula "broken": Missing ")"' });
    expect(first["formula.loop"]).toEqual({ kind: "error", message: 'Formula "loop" refers to itself' });
    expect(first["formula.nosuch"]).toEqual({ kind: "error", message: 'There is no formula called "nosuch"' });
  });

  it("list a formula that does not parse among the view's problems", () => {
    expect(result.problems).toEqual([{ kind: "formula", source: "broken", message: 'Missing ")"' }]);
  });

  it("are skipped by summaries and sorted last", () => {
    expect(result.summaries["formula.each"].value).toBe(2);
    expect(paths(result)[0]).toBe("ok.md");
  });

  it("count as empty in a summary, built-in or custom, instead of failing the whole column", () => {
    const custom = `
summaries:
  total: values.reduce(acc + if(value, value, 0), 0)
  biggest: values.filter(value.isType("number")).reduce(if(acc == null || value > acc, value, acc), null)
  count: values.length
`;
    const summarised = (name: string) =>
      view(text.replace("formula.each: Sum", `formula.each: ${name}`) + custom, rows).summaries["formula.each"].value;
    expect(summarised("total")).toBe(2);
    expect(summarised("biggest")).toBe(2);
    expect(summarised("count")).toBe(3);
    expect(summarised("Empty")).toBe(2);
    expect(summarised("Filled")).toBe(1);
    expect(summarised("Unique")).toBe(1);
  });

  it("show an unknown file property as an error in its column", () => {
    const odd = view("views:\n  - type: table\n    order: [file.nosuch, file.name]", rows);
    expect(odd.rows[0].cells["file.nosuch"]).toEqual({
      kind: "error",
      message: 'There is no file property called "nosuch"',
    });
    expect(odd.rows[0].cells["file.name"]).toBe("ok.md");
  });
});

describe("this and search", () => {
  const project = note("Projects/Website.md", { status: "Active" });
  const rows = [
    project,
    note("Tasks/Nav.md", { project: "[[Website]]", hours: 3 }, { links: ["Website"] }),
    note("Tasks/Footer.md", { project: "[[Website]]", hours: 2 }, { links: ["Website"] }),
    note("Tasks/Other.md", { project: "[[App]]", hours: 9 }, { links: ["App"] }),
  ];

  it("replicates the backlinks pane with file.hasLink(this.file)", () => {
    const text = "filters: file.hasLink(this.file)\nviews:\n  - type: table\n    order: [file.name, hours]";
    expect(paths(view(text, rows, 0, { thisFile: project }))).toEqual(["Tasks/Nav.md", "Tasks/Footer.md"]);
    // Without a current file nothing links to it.
    expect(paths(view(text, rows))).toEqual([]);
  });

  it("filters on a property that points at this file", () => {
    const text = "filters: project == this\nviews:\n  - type: table";
    expect(paths(view(text, rows, 0, { thisFile: project }))).toEqual(["Tasks/Nav.md", "Tasks/Footer.md"]);
  });

  it("accepts a this file that is not one of the rows", () => {
    const baseFile = note("Dashboards/Tasks.base");
    const text = 'filters: file.folder != this.file.folder\nviews:\n  - type: table';
    expect(view(text, rows, 0, { thisFile: baseFile }).rows).toHaveLength(4);
  });

  it("keeps the rows whose columns show the search text", () => {
    const text = "views:\n  - type: table\n    order: [file.name, project, hours]\n    limit: 1";
    const found = view(text, rows, 0, { search: "  WEBSITE " });
    // Searched before the limit, so the count is of everything found.
    expect(found.matchedCount).toBe(3);
    expect(paths(found)).toEqual(["Projects/Website.md"]);
    expect(view(text, rows, 0, { search: "9" }).rows.map((r) => r.path)).toEqual(["Tasks/Other.md"]);
    expect(view(text, rows, 0, { search: "nothing like it" }).rows).toEqual([]);
    expect(view(text, rows, 0, { search: "   " }).matchedCount).toBe(4);
  });
});

describe("robustness", () => {
  it("runs over rows with missing pieces", () => {
    const sparse = [
      { file: { name: "x.md", basename: "x", path: "x.md", folder: "", ext: "md" } },
      { file: { name: "y.md", basename: "y", path: "y.md", folder: "", ext: "md", tags: null, links: undefined }, note: null },
    ] as unknown as NoteRow[];
    const text = `
filters:
  or:
    - file.hasTag("a")
    - file.hasLink("x")
    - file.tags.length == 0
views:
  - type: table
    order: [file.name, file.tags, file.links, file.backlinks, file.properties, status]
`;
    const result = view(text, sparse);
    expect(result.rows).toHaveLength(2);
    expect(result.problems).toEqual([]);
  });

  it("handles a large vault in one pass", () => {
    const many = Array.from({ length: 20_000 }, (_, i) =>
      note(`Folder ${i % 50}/Note ${i}.md`, { n: i, status: i % 3 === 0 ? "Done" : "Open" }, { tags: i % 2 ? ["odd"] : [] }),
    );
    const text = `
filters:
  and:
    - file.hasTag("odd")
    - status == "Open"
formulas:
  double: n * 2
views:
  - type: table
    order: [file.name, formula.double]
    sort:
      - property: formula.double
        direction: DESC
    limit: 50
    groupBy:
      property: file.folder
    summaries:
      formula.double: Max
`;
    const result = view(text, many);
    expect(result.rows).toHaveLength(50);
    expect(result.matchedCount).toBe(6667);
    expect(result.summaries["formula.double"].value).toBe(39_998);
  });

  it("survives a value nested too deeply to show", () => {
    const text = `
formulas:
  nest: "\\"${"x".repeat(3000)}\\".split(\\"\\").reduce([acc], 0)"
views:
  - type: table
    order: [formula.nest]
    sort:
      - property: formula.nest
    groupBy:
      property: formula.nest
`;
    const result = view(text, [note("a.md"), note("b.md")]);
    // Either the view is drawn or it reports why not; it does not throw.
    expect(result.rows.length + result.problems.length).toBeGreaterThan(0);
    for (const row of result.rows) expect(typeof formatValue(row.cells["formula.nest"])).toBe("string");
  });

  it("returns an empty view with the reason when the rows cannot be read at all", () => {
    const broken = [{ note: {} }] as unknown as NoteRow[];
    const result = view("views:\n  - type: kanban\n    name: Board\n    groupBy:\n      property: status", broken);
    expect(result.name).toBe("Board");
    expect(result.rows).toEqual([]);
    expect(result.groups).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].kind).toBe("view");
    expect(result.problems[0].message).toMatch(/^This view could not be run: /);
  });
});
