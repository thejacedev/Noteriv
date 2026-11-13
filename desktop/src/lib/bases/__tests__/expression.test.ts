import { describe, expect, it } from "vitest";
import { isError, parseExpression, typeOf } from "..";
import { failure, note, run, shown } from "./helpers";

const book = note(
  "Books/Dune.md",
  {
    price: 12.5,
    quantity: 4,
    age: 2,
    status: "Done",
    completed: false,
    urgent: true,
    important: false,
    radius: 2,
    description: "a classic",
    tags: ["scifi", "urgent"],
    "due date": "2025-06-01",
    nested: { level: { deep: 7 }, list: [10, 20, 30] },
    first_name: "Frank",
    last_name: "Herbert",
    impact: 3,
    urgency: 4,
    effort: 6,
  },
  { size: 2048 },
);

describe("literals", () => {
  it("reads numbers, text and booleans", () => {
    expect(run("1")).toBe(1);
    expect(run("(2.5)")).toBe(2.5);
    expect(run(".5")).toBe(0.5);
    expect(run("1e3")).toBe(1000);
    expect(run('"message"')).toBe("message");
    expect(run("'world'")).toBe("world");
    expect(run("true")).toBe(true);
    expect(run("false")).toBe(false);
    expect(run("null")).toBeNull();
  });

  it("reads escapes inside text", () => {
    expect(run('"say \\"hi\\""')).toBe('say "hi"');
    expect(run("'it\\'s'")).toBe("it's");
    expect(run('"a\\nb"')).toBe("a\nb");
    expect(run('"back\\\\slash"')).toBe("back\\slash");
    expect(run('"\\u00e9"')).toBe("é");
  });

  it("reads lists and objects", () => {
    expect(run("[1, 2, 3]")).toEqual([1, 2, 3]);
    expect(run("[]")).toEqual([]);
    expect(run('[1, "two", [3]]')).toEqual([1, "two", [3]]);
    expect(run('{"name": "value"}')).toEqual({ kind: "object", fields: { name: "value" } });
    expect(run('{"a": 1, b: 2}.b')).toBe(2);
    expect(run("[1, 2, 3,]")).toEqual([1, 2, 3]);
  });

  it("reads a regular expression, and tells it from a division", () => {
    expect(run("/abc/")).toEqual({ kind: "regexp", source: "abc", flags: "" });
    expect(run("/a\\/b[/]/gi")).toEqual({ kind: "regexp", source: "a\\/b[/]", flags: "gi" });
    expect(run("8 / 4 / 2")).toBe(1);
    expect(run("price / quantity / 2", book)).toBe(1.5625);
    expect(run("(price) / 5", book)).toBe(2.5);
    expect(run("[10][0] / 5")).toBe(2);
  });
});

describe("arithmetic operators", () => {
  it("adds, subtracts, multiplies, divides and takes the remainder", () => {
    expect(run("1 + 2")).toBe(3);
    expect(run("5 - 2")).toBe(3);
    expect(run("4 * 2.5")).toBe(10);
    expect(run("9 / 2")).toBe(4.5);
    expect(run("7 % 3")).toBe(1);
  });

  it("follows the usual order, which parentheses change", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) * 3")).toBe(9);
    expect(run("10 - 4 - 3")).toBe(3);
    expect(run("2 * 3 % 4")).toBe(2);
    // The example from the syntax page.
    expect(run("radius * (2 * 3.14)", book)).toBeCloseTo(12.56);
  });

  it("works on note properties, as in the formulas page", () => {
    expect(run("price * quantity", book)).toBe(50);
    expect(run("(impact * urgency) / effort", book)).toBe(2);
    expect(run("(price / quantity) * 100", book)).toBe(312.5);
    expect(run("price - 2.5", book)).toBe(10);
  });

  it("negates", () => {
    expect(run("-5")).toBe(-5);
    expect(run("-price", book)).toBe(-12.5);
    expect(run("3 - -2")).toBe(5);
    expect(run("-(1 + 2)")).toBe(-3);
  });

  it("reads text that holds a number as that number, except for +", () => {
    expect(run('"3.50" * 2')).toBe(7);
    expect(run('"10" - 4')).toBe(6);
    expect(run('"3" + 4')).toBe("34");
  });

  it("joins text with +", () => {
    expect(run('"a" + "b"')).toBe("ab");
    expect(run('file.name + " - " + description', book)).toBe("Dune.md - a classic");
    expect(run('first_name + " " + last_name', book)).toBe("Frank Herbert");
    expect(run('"$" + price', book)).toBe("$12.5");
    expect(run('"Tags: " + tags', book)).toBe("Tags: scifi, urgent");
    expect(run('"done: " + completed', book)).toBe("done: false");
  });

  it("gives an empty result when a number is missing", () => {
    expect(run("price * missing", book)).toBeNull();
    expect(run("missing + 1", book)).toBeNull();
    expect(run("missing - 1", book)).toBeNull();
    expect(run("missing / 2", book)).toBeNull();
    expect(run("-missing", book)).toBeNull();
    // Joined to text, a missing value is nothing rather than the word "null".
    expect(run('"Total: " + missing', book)).toBe("Total: ");
  });

  it("fails on values that cannot be calculated with", () => {
    expect(failure('"abc" * 2')).toBe("Cannot multiply text and a number");
    expect(failure("[1] + [2]")).toBe("Cannot add a list and a list");
    expect(failure("true - 1")).toBe("Cannot subtract a boolean and a number");
    expect(failure("1 / 0")).toBe("Cannot divide by zero");
    expect(failure("5 % 0")).toBe("Cannot divide by zero");
    expect(failure('-"abc"')).toBe("Cannot negate text");
  });
});

describe("comparison operators", () => {
  it("compares numbers", () => {
    expect(run("price > 100", book)).toBe(false);
    expect(run("age < 18", book)).toBe(true);
    expect(run("2 >= 2")).toBe(true);
    expect(run("2 <= 1")).toBe(false);
    expect(run("3 > 2")).toBe(true);
    expect(run("3 < 2")).toBe(false);
  });

  it("compares for equality with any kind of value", () => {
    expect(run('status == "Done"', book)).toBe(true);
    expect(run('status != "Done"', book)).toBe(false);
    expect(run('status == "done"', book)).toBe(false);
    expect(run("1 == 1")).toBe(true);
    expect(run("true != false")).toBe(true);
    expect(run("[1, 2] == [1, 2]")).toBe(true);
    expect(run("[1, 2] == [2, 1]")).toBe(false);
    expect(run('{"a": 1} == {"a": 1}')).toBe(true);
    expect(run("missing == null", book)).toBe(true);
    expect(run("price != null", book)).toBe(true);
    expect(run('"" == null')).toBe(false);
  });

  it("compares text in order", () => {
    expect(run('"apple" < "banana"')).toBe(true);
    expect(run('"b" >= "a"')).toBe(true);
  });

  it("compares a number with text that holds a number", () => {
    // The syntax page's own view filter does this: formula.ppu is text from toFixed().
    expect(run('"5.50" > 5')).toBe(true);
    expect(run('"5.00" == 5')).toBe(true);
    expect(run('"abc" == 5')).toBe(false);
  });

  it("is false, not an error, when a side is missing", () => {
    expect(run("missing > 2.1", book)).toBe(false);
    expect(run("missing <= 2.1", book)).toBe(false);
    expect(run("2.1 >= missing", book)).toBe(false);
    expect(run("missing < missing", book)).toBe(false);
  });

  it("fails on values that have no order between them", () => {
    expect(failure('"abc" > 5')).toBe("Cannot compare text and a number");
    expect(failure("[1] < 2")).toBe("Cannot compare a list and a number");
    expect(failure("true >= 1")).toBe("Cannot compare a boolean and a number");
    expect(failure('today() < "soon"')).toBe("Cannot compare a date and text");
    expect(failure("[1] <= [2]")).toBe("Cannot compare a list and a list");
  });
});

describe("boolean operators", () => {
  it("inverts and combines", () => {
    expect(run("!completed", book)).toBe(true);
    expect(run("!true")).toBe(false);
    expect(run("price > 0 && quantity > 0", book)).toBe(true);
    expect(run("urgent || important", book)).toBe(true);
    expect(run("completed || important", book)).toBe(false);
    expect(run("true && false")).toBe(false);
    expect(run("!(1 > 2) && !false")).toBe(true);
  });

  it("gives true or false whatever the operands are", () => {
    expect(run('"text" && 5')).toBe(true);
    expect(run('"" || 0')).toBe(false);
    expect(run("missing || price", book)).toBe(true);
    expect(run("!missing", book)).toBe(true);
    expect(run("!tags", book)).toBe(false);
    expect(run("![]")).toBe(true);
  });

  it("binds && tighter than ||, and comparisons tighter than both", () => {
    expect(run("true || false && false")).toBe(true);
    expect(run("(true || false) && false")).toBe(false);
    expect(run("1 < 2 == true")).toBe(true);
    expect(run("1 + 1 == 2 && 2 * 2 == 4")).toBe(true);
  });

  it("does not run the side that cannot change the answer", () => {
    expect(run("false && nosuch()")).toBe(false);
    expect(run("true || nosuch()")).toBe(true);
    expect(failure("true && nosuch()")).toBe("There is no function called nosuch()");
  });
});

describe("property access", () => {
  it("reads note properties bare, with note. and with brackets", () => {
    expect(run("price", book)).toBe(12.5);
    expect(run("note.price", book)).toBe(12.5);
    expect(run('note["price"]', book)).toBe(12.5);
    expect(run('note["due date"].year', book)).toBe(2025);
    expect(run("missing", book)).toBeNull();
    expect(run("note.missing", book)).toBeNull();
  });

  it("does not find what JavaScript objects inherit", () => {
    expect(run("constructor", book)).toBeNull();
    expect(run("note.toString", book)).toBeNull();
    expect(run('note["__proto__"]', book)).toBeNull();
    expect(run("nested.hasOwnProperty", book)).toBeNull();
  });

  it("reads file properties", () => {
    expect(run("file.name", book)).toBe("Dune.md");
    expect(run("file.basename", book)).toBe("Dune");
    expect(run("file.path", book)).toBe("Books/Dune.md");
    expect(run("file.folder", book)).toBe("Books");
    expect(run("file.ext", book)).toBe("md");
    expect(run("file.size", book)).toBe(2048);
    expect(run('file.ext == "md"', book)).toBe(true);
    expect(run('file["name"]', book)).toBe("Dune.md");
    expect(typeOf(run("file", book))).toBe("file");
    expect(typeOf(run("file.file", book))).toBe("file");
    expect(run("file.properties.price", book)).toBe(12.5);
    expect(failure("file.nosuch", book)).toBe('There is no file property called "nosuch"');
  });

  it("reads into lists and objects", () => {
    expect(run("tags[0]", book)).toBe("scifi");
    expect(run("tags[5]", book)).toBeNull();
    expect(run("tags[-1]", book)).toBeNull();
    expect(run("tags.length", book)).toBe(2);
    expect(run("nested.level.deep", book)).toBe(7);
    expect(run('nested["level"]["deep"]', book)).toBe(7);
    expect(run("nested.list[1]", book)).toBe(20);
    expect(run("nested.nothing.here", book)).toBeNull();
    expect(run('"hello"[1]')).toBe("e");
    expect(run('"hello".length')).toBe(5);
  });

  it("stays empty along a chain through a missing property", () => {
    expect(run("missing.deeper.still", book)).toBeNull();
    expect(run("missing[0]", book)).toBeNull();
    expect(run("missing.length", book)).toBeNull();
  });

  it("is empty outside any file", () => {
    expect(run("price")).toBeNull();
    expect(run("file")).toBeNull();
    expect(run("file.name")).toBeNull();
    expect(run("note")).toBeNull();
  });

  it("fails on a field the type does not have", () => {
    expect(failure("price.length", book)).toBe('There is no "length" on a number');
    expect(failure('"abc".size')).toBe('There is no "size" on text');
    expect(failure('"abc"["x"]')).toBe("text is indexed by a number, not text");
    expect(failure("(5)[0]")).toBe("a number cannot be indexed");
  });
});

describe("formula properties", () => {
  const formulas = {
    price_per_unit: "price / quantity",
    with_tax: "formula.price_per_unit * 1.1",
    label: 'if(price, "$" + price.toFixed(2), "")',
    broken: "price +",
    loop_a: "formula.loop_b + 1",
    loop_b: "formula.loop_a + 1",
    self: "formula.self",
  };

  it("uses other formulas", () => {
    expect(run("formula.price_per_unit", book, { formulas })).toBe(3.125);
    expect(run("formula.with_tax", book, { formulas })).toBeCloseTo(3.4375);
    expect(run('formula["label"]', book, { formulas })).toBe("$12.50");
    expect(run("formula.price_per_unit > 3 && formula.with_tax < 4", book, { formulas })).toBe(true);
  });

  it("reports a formula that does not exist or does not parse", () => {
    expect(failure("formula.nosuch", book, { formulas })).toBe('There is no formula called "nosuch"');
    expect(failure("formula.broken", book, { formulas })).toBe('Formula "broken": The expression ends too early');
    expect(failure("formula", book, { formulas })).toMatch(/must be followed by the name of a formula/);
  });

  it("reports a circular reference instead of looping", () => {
    expect(failure("formula.loop_a", book, { formulas })).toBe('Formula "loop_a" refers to itself');
    expect(failure("formula.loop_b", book, { formulas })).toBe('Formula "loop_b" refers to itself');
    expect(failure("formula.self", book, { formulas })).toBe('Formula "self" refers to itself');
  });
});

describe("this", () => {
  const embedding = note("Projects/Website.md", { status: "Active", owner: "[[Dana]]" });
  const task = note("Tasks/Fix nav.md", { project: "[[Website]]", people: ["[[Dana]]", "[[Website]]"] }, {
    links: ["Website"],
  });
  const options = { thisFile: embedding, rows: [embedding, task] };

  it("gives the file the base is shown in", () => {
    expect(run("this.file.name", task, options)).toBe("Website.md");
    expect(run("this.file.folder", task, options)).toBe("Projects");
    expect(run("this.status", task, options)).toBe("Active");
    expect(run('this["status"]', task, options)).toBe("Active");
    expect(typeOf(run("this", task, options))).toBe("file");
  });

  it("compares with links, as in the backlinks example", () => {
    expect(run("file.hasLink(this.file)", task, options)).toBe(true);
    expect(run("file.hasLink(this)", task, options)).toBe(true);
    expect(run("project == this", task, options)).toBe(true);
    expect(run("people.contains(this)", task, options)).toBe(true);
    expect(run("file.hasLink(this.file)", embedding, options)).toBe(false);
  });

  it("is empty when there is no current file", () => {
    expect(run("this", task)).toBeNull();
    expect(run("this.file.name", task)).toBeNull();
    expect(run("this.status", task)).toBeNull();
    expect(run("file.hasLink(this.file)", task)).toBe(false);
  });
});

describe("syntax errors", () => {
  const parseError = (source: string) => {
    const result = parseExpression(source);
    if (result.ok) throw new Error(`Expected ${source} to be rejected`);
    return [result.error, result.position];
  };

  it("says what is wrong and where", () => {
    expect(parseError("")).toEqual(["The expression is empty", 0]);
    expect(parseError("   ")).toEqual(["The expression is empty", 0]);
    expect(parseError("price +")).toEqual(["The expression ends too early", 7]);
    expect(parseError("(price + 1")).toEqual(['Missing ")"', 0]);
    expect(parseError("max(1, 2")).toEqual(['Missing ")"', 3]);
    expect(parseError("[1, 2")).toEqual(['Missing "]"', 0]);
    expect(parseError("price 5")).toEqual(["Unexpected the number 5", 6]);
    expect(parseError('"open')).toEqual(["This text is missing its closing quote", 0]);
    expect(parseError("a = 1")).toEqual(['Use "==" to compare two values', 2]);
    expect(parseError("a === 1")).toEqual(['Use "==" to compare two values', 2]);
    expect(parseError("a & b")).toEqual(['Use "&&" to combine two conditions', 2]);
    expect(parseError("a # b")).toEqual(['Unexpected character "#"', 2]);
    expect(parseError("file.")).toEqual(['Expected a name after "." but found the end of the expression', 5]);
    expect(parseError("* 2")).toEqual(['Unexpected "*"', 0]);
    expect(parseError("x.replace(/abc, 1)")).toEqual(["This regular expression is missing its closing /", 10]);
  });

  it("never throws, however long or deep the expression", () => {
    const deep = `${"(".repeat(5000)}1${")".repeat(5000)}`;
    expect(parseError(deep)[0]).toBe("The expression is nested too deeply");
    expect(parseError("!".repeat(5000) + "true")[0]).toBe("The expression is nested too deeply");

    // Parses, but is too long a chain to evaluate: an error value, not a crash.
    const long = Array.from({ length: 200_000 }, () => "1").join(" + ");
    const value = run(long);
    expect(isError(value) || value === 200_000).toBe(true);
  });

  it("turns a syntax error into an error value when evaluated", () => {
    expect(failure("price +")).toBe("The expression ends too early");
    expect(shown("price +")).toBe("The expression ends too early");
  });

  it("fails on calling something that is not a function", () => {
    expect(failure("(1)(2)")).toBe("Only a function can be called");
    expect(failure("nosuch(1)")).toBe("There is no function called nosuch()");
    expect(failure('"abc".nosuch()')).toBe("There is no function called nosuch()");
    expect(failure("constructor(1)")).toBe("There is no function called constructor()");
    expect(failure('"abc".constructor()')).toBe("There is no function called constructor()");
  });
});
