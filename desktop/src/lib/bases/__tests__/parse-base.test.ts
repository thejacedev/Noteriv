import { describe, expect, it } from "vitest";
import { normalizePropertyId, parseBase, parsePropertyId, type BaseFile } from "..";
import { SYNTAX_EXAMPLE } from "./helpers";

function parsed(text: string): BaseFile {
  const result = parseBase(text);
  if (!result.ok) throw new Error(result.error);
  return result.base;
}

function problem(text: string): string {
  const result = parseBase(text);
  if (result.ok) throw new Error("Expected the base to be rejected");
  return result.error;
}

describe("parseBase", () => {
  it("reads every section of the example from the syntax page", () => {
    const base = parsed(SYNTAX_EXAMPLE);

    expect(base.filters).toEqual({
      or: [
        'file.hasTag("tag")',
        { and: ['file.hasTag("book")', 'file.hasLink("Textbook")'] },
        { not: ['file.hasTag("book")', 'file.inFolder("Required Reading")'] },
      ],
    });
    expect(base.formulas).toEqual({
      formatted_price: 'if(price, price.toFixed(2) + " dollars")',
      ppu: "(price / age).toFixed(2)",
    });
    // "status" is a note property, so it is filed under its full id.
    expect(base.properties).toEqual({
      "note.status": { displayName: "Status" },
      "formula.formatted_price": { displayName: "Price" },
      "file.ext": { displayName: "Extension" },
    });
    expect(base.summaries).toEqual({ customAverage: "values.mean().round(3)" });

    expect(base.views).toHaveLength(1);
    expect(base.views[0]).toEqual({
      type: "table",
      name: "My table",
      limit: 10,
      groupBy: { property: "note.age", direction: "DESC" },
      groupOrder: null,
      filters: {
        and: ['status != "done"', { or: ["formula.ppu > 5", "price > 2.1"] }],
      },
      order: ["file.name", "file.ext", "note.age", "formula.ppu", "formula.formatted_price"],
      sort: [],
      summaries: { "formula.ppu": "Average" },
      settings: {},
    });
  });

  it("reads the kanban example with a group order", () => {
    const base = parsed(`
views:
  - type: kanban
    name: Projects
    groupBy:
      property: note.status
      direction: ASC
    groupOrder:
      - Planned
      - In progress
      - Done
      - null
`);
    expect(base.views[0].type).toBe("kanban");
    expect(base.views[0].groupBy).toEqual({ property: "note.status", direction: "ASC" });
    expect(base.views[0].groupOrder).toEqual(["Planned", "In progress", "Done", null]);
  });

  it("reads the code block example from the 'Create a base' page", () => {
    const base = parsed(`
filters:
  and:
    - file.hasTag("example")
views:
  - type: table
    name: Table
`);
    expect(base.filters).toEqual({ and: ['file.hasTag("example")'] });
    expect(base.views.map((view) => [view.type, view.name])).toEqual([["table", "Table"]]);
  });

  it("accepts a single statement as the whole filter", () => {
    expect(parsed(`filters: 'file.ext == "md"'`).filters).toBe('file.ext == "md"');
  });

  it("treats an empty file as a base with nothing set", () => {
    for (const text of ["", "   \n", "# only a comment\n"]) {
      expect(parsed(text)).toEqual({
        filters: null,
        formulas: {},
        properties: {},
        summaries: {},
        views: [],
        extra: {},
      });
    }
  });

  it("keeps keys it does not know, at the top and inside a view", () => {
    const base = parsed(`
pluginData:
  version: 2
views:
  - type: cards
    name: Gallery
    image: note.cover
    imageFit: contain
    cardSize: 240
  - type: map
    name: Places
    coordinates: note.coordinates
    markerIcon: note.icon
    defaultZoom: 4
`);
    expect(base.extra).toEqual({ pluginData: { version: 2 } });
    expect(base.views[0].settings).toEqual({ image: "note.cover", imageFit: "contain", cardSize: 240 });
    // A map view is recognised by its type and its settings are passed through untouched.
    expect(base.views[1].type).toBe("map");
    expect(base.views[1].settings).toEqual({
      coordinates: "note.coordinates",
      markerIcon: "note.icon",
      defaultZoom: 4,
    });
  });

  it("reads sort, and the short ways of writing sort and groupBy", () => {
    const view = parsed(`
views:
  - type: table
    sort:
      - property: file.mtime
        direction: desc
      - property: status
      - priority
    groupBy: status
`).views[0];
    expect(view.sort).toEqual([
      { property: "file.mtime", direction: "DESC" },
      { property: "note.status", direction: "ASC" },
      { property: "note.priority", direction: "ASC" },
    ]);
    expect(view.groupBy).toEqual({ property: "note.status", direction: "ASC" });
    // A view with no name is called after its type.
    expect(view.name).toBe("Table");
  });

  it("writes every property id in full", () => {
    const base = parsed(`
properties:
  note.author:
    displayName: Writer
  rating:
    displayName: Stars
    width: 80
views:
  - type: table
    order: [title, note.author, file.name, formula.total]
    summaries:
      rating: Sum
`);
    expect(Object.keys(base.properties)).toEqual(["note.author", "note.rating"]);
    // Settings other than the display name are kept for the UI.
    expect(base.properties["note.rating"]).toEqual({ displayName: "Stars", width: 80 });
    expect(base.views[0].order).toEqual(["note.title", "note.author", "file.name", "formula.total"]);
    expect(base.views[0].summaries).toEqual({ "note.rating": "Sum" });
  });

  it("reads a limit that is not a usable count as no limit", () => {
    expect(parsed("views:\n  - type: table\n    limit: 0").views[0].limit).toBeNull();
    expect(parsed("views:\n  - type: table\n    limit: '25'").views[0].limit).toBe(25);
    expect(parsed("views:\n  - type: table\n    limit: 7.9").views[0].limit).toBe(7);
  });

  it("reads a filter mapping with two keys as both together", () => {
    const base = parsed(`
filters:
  and:
    - a > 1
  not:
    - b > 1
`);
    expect(base.filters).toEqual({ and: [{ and: ["a > 1"] }, { not: ["b > 1"] }] });
  });
});

describe("parseBase errors", () => {
  it("reports broken YAML in one line, without throwing", () => {
    const error = problem("filters:\n  and: [unclosed\nviews: {");
    expect(error).toMatch(/^This base is not valid YAML: /);
    expect(error).not.toContain("\n");
  });

  it("reports a duplicated key", () => {
    expect(problem("views: []\nviews: []")).toMatch(/not valid YAML: Map keys must be unique/);
  });

  it("says what is wrong when the file is not a mapping", () => {
    expect(problem("- one\n- two")).toBe(
      'A base must be a mapping with keys such as "filters" and "views", not a list.',
    );
    expect(problem("just some text")).toMatch(/not text\.$/);
  });

  it("names the place of a value of the wrong type", () => {
    expect(problem("views: table")).toBe('"views" must be a list, not text.');
    expect(problem("views:\n  - table")).toBe('"views[0]" must be a mapping, not text.');
    expect(problem("formulas:\n  - a")).toBe('"formulas" must be a mapping of names to values, not a list.');
    expect(problem("formulas:\n  total:\n    nested: 1")).toBe('"formulas.total" must be text, not a mapping.');
    expect(problem("views:\n  - type: table\n    limit: lots")).toBe('"views[0].limit" must be a number, not text.');
    expect(problem("views:\n  - type: table\n    order: file.name")).toBe(
      '"views[0].order" must be a list, not text.',
    );
    expect(problem("views:\n  - type: table\n    groupBy:\n      direction: ASC")).toBe(
      '"views[0].groupBy" is missing its "property".',
    );
    expect(problem("views:\n  - type: table\n    sort:\n      - property: a\n        direction: up")).toBe(
      '"views[0].sort[0].direction" must be ASC or DESC, not "up".',
    );
  });

  it("rejects a filter with a key that is not and, or or not", () => {
    expect(problem("filters:\n  any:\n    - a > 1")).toBe(
      '"filters" has the key "any". A filter can only hold "and", "or" or "not".',
    );
    expect(problem("views:\n  - type: table\n    filters:\n      or:\n        - xor: [a]")).toBe(
      '"views[0].filters.or[0]" has the key "xor". A filter can only hold "and", "or" or "not".',
    );
  });
});

describe("property ids", () => {
  it("reads a bare name as a note property", () => {
    expect(parsePropertyId("status")).toEqual({ id: "note.status", source: "note", name: "status" });
    expect(parsePropertyId("note.status")).toEqual({ id: "note.status", source: "note", name: "status" });
    expect(parsePropertyId("file.name")).toEqual({ id: "file.name", source: "file", name: "name" });
    expect(parsePropertyId("formula.ppu")).toEqual({ id: "formula.ppu", source: "formula", name: "ppu" });
  });

  it("keeps dots and spaces that belong to the name", () => {
    expect(normalizePropertyId("note.due date")).toBe("note.due date");
    expect(normalizePropertyId("version.major")).toBe("note.version.major");
    // "file" alone is not a file property, so it can only be a note property.
    expect(normalizePropertyId("file")).toBe("note.file");
  });
});
