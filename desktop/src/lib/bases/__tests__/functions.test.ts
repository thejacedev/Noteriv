import { describe, expect, it } from "vitest";
import { SUPPORTED_FUNCTIONS, UNSUPPORTED_FUNCTIONS, isKind, typeOf } from "..";
import { failure, note, run, shown } from "./helpers";

/** Every function in Obsidian's function reference, by the section it is listed under. */
const DOCUMENTED: Record<string, string[]> = {
  global: [
    "escapeHTML",
    "date",
    "duration",
    "file",
    "html",
    "if",
    "image",
    "icon",
    "link",
    "list",
    "max",
    "min",
    "now",
    "number",
    "today",
    "random",
  ],
  any: ["isTruthy", "isType", "toString"],
  date: ["date", "format", "time", "relative", "isEmpty"],
  string: [
    "contains",
    "containsAll",
    "containsAny",
    "endsWith",
    "isEmpty",
    "lower",
    "replace",
    "repeat",
    "reverse",
    "slice",
    "split",
    "startsWith",
    "title",
    "trim",
  ],
  number: ["abs", "ceil", "floor", "isEmpty", "round", "toFixed"],
  list: [
    "contains",
    "containsAll",
    "containsAny",
    "filter",
    "flat",
    "isEmpty",
    "join",
    "map",
    "reduce",
    "reverse",
    "slice",
    "sort",
    "unique",
  ],
  link: ["asFile", "linksTo"],
  file: ["asLink", "hasLink", "hasProperty", "hasTag", "inFolder"],
  object: ["isEmpty", "keys", "values"],
  regexp: ["matches"],
};

describe("coverage of the function reference", () => {
  it("runs every documented function", () => {
    const missing: string[] = [];
    for (const [type, names] of Object.entries(DOCUMENTED)) {
      for (const name of names) {
        // isEmpty and the like are defined once for every type.
        const known = SUPPORTED_FUNCTIONS[type].includes(name) || SUPPORTED_FUNCTIONS.any.includes(name);
        if (!known) missing.push(`${type}.${name}`);
      }
    }
    expect(missing).toEqual([...UNSUPPORTED_FUNCTIONS]);
    expect(UNSUPPORTED_FUNCTIONS).toEqual([]);
  });
});

describe("global functions", () => {
  it("escapeHTML() makes text safe to put in HTML", () => {
    expect(run(`escapeHTML("<b>Tom & 'Jerry'</b>")`)).toBe("&lt;b&gt;Tom &amp; &#39;Jerry&#39;&lt;/b&gt;");
    expect(run('escapeHTML("a \\"quote\\"")')).toBe("a &quot;quote&quot;");
  });

  it("if() picks a branch, and gives nothing without an else", () => {
    const modified = note("A.md", { isModified: true, price: 4.5 });
    const untouched = note("B.md", { isModified: false });
    expect(run('if(isModified, "Modified", "Unmodified")', modified)).toBe("Modified");
    expect(run('if(isModified, "Modified", "Unmodified")', untouched)).toBe("Unmodified");
    expect(run('if(price, price.toFixed(2) + " dollars")', modified)).toBe("4.50 dollars");
    expect(run('if(price, price.toFixed(2) + " dollars")', untouched)).toBeNull();
    expect(run('if(price, "$" + price.toFixed(2), "")', untouched)).toBe("");
  });

  it("if() runs only the branch it picks", () => {
    expect(run('if(true, "yes", nosuch())')).toBe("yes");
    expect(run('if(false, nosuch(), "no")')).toBe("no");
    expect(failure("if(true)")).toBe("if() takes 2 to 3 arguments, not 1");
    expect(failure("if(nosuch(), 1, 2)")).toBe("There is no function called nosuch()");
  });

  it("list() wraps a single value and leaves a list alone", () => {
    expect(run('list("value")')).toEqual(["value"]);
    expect(run("list([1, 2])")).toEqual([1, 2]);
    expect(run("list(missing)", note("A.md"))).toEqual([]);
  });

  it("max() and min() pick among numbers", () => {
    expect(run("max(1, 5, 3)")).toBe(5);
    expect(run("min(1, 5, 3)")).toBe(1);
    expect(run("max(-2, -7)")).toBe(-2);
    expect(run("max([4, 9], 2)")).toBe(9);
    expect(run("min(3, missing)", note("A.md"))).toBe(3);
    expect(run("max(missing)", note("A.md"))).toBeNull();
    expect(failure('max(1, "abc")')).toBe("max() needs a number, not text");
  });

  it("number() converts what it can", () => {
    expect(run('number("3.4")')).toBe(3.4);
    expect(run("number(true)")).toBe(1);
    expect(run("number(false)")).toBe(0);
    expect(run("number(7)")).toBe(7);
    expect(run('number(date("2025-01-11 00:00:00")) - number(date("2025-01-10 00:00:00"))')).toBe(86_400_000);
    expect(failure('number("abc")')).toBe('"abc" is not a number');
    expect(failure("number([1])")).toBe("number() cannot read a list");
  });

  it("random() gives a number from the run's source", () => {
    expect(run("random()", null, { random: () => 0.25 })).toBe(0.25);
    const value = run("random()");
    expect(typeof value === "number" && value >= 0 && value < 1).toBe(true);
  });

  it("link() makes a link, or a URL from a web address", () => {
    expect(run('link("filename")')).toEqual({
      kind: "link",
      path: "filename",
      subpath: null,
      display: null,
      embed: false,
    });
    expect(run('link("[[Folder/Note#Heading|shown]]")')).toEqual({
      kind: "link",
      path: "Folder/Note",
      subpath: "#Heading",
      display: "shown",
      embed: false,
    });
    expect(run('link("filename", "display")')).toMatchObject({ path: "filename", display: "display" });
    expect(run('link("filename", icon("plus"))')).toMatchObject({ display: { kind: "icon", name: "plus" } });
    expect(run('link("https://obsidian.md")')).toEqual({ kind: "url", href: "https://obsidian.md", display: null });
    expect(run('link("https://obsidian.md", "Obsidian")')).toEqual({
      kind: "url",
      href: "https://obsidian.md",
      display: "Obsidian",
    });
    expect(shown('link("https://obsidian.md", "Obsidian")')).toBe("Obsidian");
    expect(shown('link("filename")')).toBe("filename");
  });

  it("link() takes the map page's Google Maps formula", () => {
    const place = note("Places/Eiffel Tower.md");
    const value = run(
      'link("https://www.google.com/maps/search/" + file.basename.replace(" ","+"),"Google Maps")',
      place,
    );
    expect(value).toEqual({
      kind: "url",
      href: "https://www.google.com/maps/search/Eiffel+Tower",
      display: "Google Maps",
    });
  });

  it("html(), image() and icon() give values for the view to draw", () => {
    expect(run('html("<b>bold</b>")')).toEqual({ kind: "html", html: "<b>bold</b>" });
    expect(run('icon("arrow-right")')).toEqual({ kind: "icon", name: "arrow-right" });
    expect(run('image("https://obsidian.md/images/obsidian-logo-gradient.svg")')).toEqual({
      kind: "image",
      src: "https://obsidian.md/images/obsidian-logo-gradient.svg",
    });

    const cover = note("Assets/cover.png");
    const book = note("Books/Dune.md", { cover: "[[cover.png]]" });
    expect(run("image(cover)", book, { rows: [cover, book] })).toEqual({ kind: "image", src: "Assets/cover.png" });
    expect(run("image(missing)", book)).toBeNull();
  });

  it("file() finds a file by path, by name or through a link", () => {
    const target = note("Projects/Website.md", { status: "Active" });
    const other = note("Inbox.md");
    const rows = [target, other];
    expect(run('file("Projects/Website.md").name', other, { rows })).toBe("Website.md");
    expect(run('file("Website").properties.status', other, { rows })).toBe("Active");
    expect(run('file(link("[[Website]]")).path', other, { rows })).toBe("Projects/Website.md");
    expect(run("file(file).name", other, { rows })).toBe("Inbox.md");
    expect(run('file("Nowhere")', other, { rows })).toBeNull();
  });

  it("checks how many arguments it was given", () => {
    expect(failure("now(1)")).toBe("now() takes 0 arguments, not 1");
    expect(failure("list()")).toBe("list() takes 1 argument, not 0");
    expect(failure("link()")).toBe("link() takes 1 to 2 arguments, not 0");
    expect(failure("max()")).toBe("max() takes at least 1 argument, not 0");
  });
});

describe("functions on any value", () => {
  it("isTruthy() coerces to a boolean", () => {
    expect(run("(1).isTruthy()")).toBe(true);
    expect(run("(0).isTruthy()")).toBe(false);
    expect(run('"".isTruthy()')).toBe(false);
    expect(run('"a".isTruthy()')).toBe(true);
    expect(run("[].isTruthy()")).toBe(false);
    expect(run("[0].isTruthy()")).toBe(true);
    expect(run("missing.isTruthy()", note("A.md"))).toBe(false);
  });

  it("isType() names the type", () => {
    expect(run('"example".isType("string")')).toBe(true);
    expect(run('true.isType("boolean")')).toBe(true);
    expect(run('(5).isType("number")')).toBe(true);
    expect(run('(5).isType("string")')).toBe(false);
    expect(run('[1].isType("list")')).toBe(true);
    expect(run('now().isType("date")')).toBe(true);
    expect(run('duration("1d").isType("duration")')).toBe(true);
    expect(run('link("a").isType("link")')).toBe(true);
    expect(run('link("https://a.b").isType("url")')).toBe(true);
    expect(run('{"a": 1}.isType("object")')).toBe(true);
    expect(run('/a/.isType("regexp")')).toBe(true);
    expect(run('missing.isType("null")', note("A.md"))).toBe(true);
    expect(run('file.isType("file")', note("A.md"))).toBe(true);
  });

  it("toString() gives the display text", () => {
    expect(run("(123).toString()")).toBe("123");
    expect(run("true.toString()")).toBe("true");
    expect(run("[1, 2].toString()")).toBe("1, 2");
    expect(run('date("2025-05-27").toString()')).toBe("2025-05-27");
    expect(run('date("2025-05-27 08:30:00").toString()')).toBe("2025-05-27 08:30:00");
    expect(run("missing.toString()", note("A.md"))).toBe("");
  });
});

describe("string functions", () => {
  it("has a length", () => {
    expect(run('"hello".length')).toBe(5);
  });

  it("contains(), containsAll() and containsAny()", () => {
    expect(run('"hello".contains("ell")')).toBe(true);
    expect(run('"hello".contains("xyz")')).toBe(false);
    expect(run('"hello".containsAll("h", "e")')).toBe(true);
    expect(run('"hello".containsAll("h", "x")')).toBe(false);
    expect(run('"hello".containsAny("x", "y", "e")')).toBe(true);
    expect(run('"hello".containsAny("x", "y")')).toBe(false);
  });

  it("startsWith() and endsWith()", () => {
    expect(run('"hello".startsWith("he")')).toBe(true);
    expect(run('"hello".startsWith("lo")')).toBe(false);
    expect(run('"hello".endsWith("lo")')).toBe(true);
    expect(run('"hello".endsWith("he")')).toBe(false);
  });

  it("isEmpty()", () => {
    expect(run('"Hello world".isEmpty()')).toBe(false);
    expect(run('"".isEmpty()')).toBe(true);
    // "or is not present"
    expect(run("missing.isEmpty()", note("A.md"))).toBe(true);
  });

  it("lower(), title() and trim()", () => {
    expect(run('"HeLLo".lower()')).toBe("hello");
    expect(run('"hello world".title()')).toBe("Hello World");
    expect(run('"  hi  ".trim()')).toBe("hi");
    expect(run("file.name.lower()", note("Books/DUNE.md"))).toBe("dune.md");
  });

  it("replace() with text replaces every occurrence", () => {
    expect(run('"a:b:c:d".replace(":", "-")')).toBe("a-b-c-d");
    expect(run('"price: $5".replace("$5", "$$")')).toBe("price: $$");
  });

  it("replace() with a regular expression follows its g flag", () => {
    expect(run('"a:b:c:d".replace(/:/, "-")')).toBe("a-b:c:d");
    expect(run('"a:b:c:d".replace(/:/g, "-")')).toBe("a-b-c-d");
    expect(run('"John Smith".replace(/(\\w+) (\\w+)/, "$2, $1")')).toBe("Smith, John");
  });

  it("repeat() and reverse()", () => {
    expect(run('"123".repeat(2)')).toBe("123123");
    expect(run('"hello".reverse()')).toBe("olleh");
    expect(failure('"x".repeat(-1)')).toBe("repeat() needs a whole number that is not negative");
    expect(failure('"x".repeat(1000000000)')).toBe("repeat() would make the text too long");
  });

  it("slice()", () => {
    expect(run('"hello".slice(1, 4)')).toBe("ell");
    expect(run('"hello".slice(2)')).toBe("llo");
    expect(run('"hello".slice(-3)')).toBe("llo");
  });

  it("split()", () => {
    expect(run('"a,b,c,d".split(",", 3)')).toEqual(["a", "b", "c"]);
    expect(run('"a,b,c,d".split(/,/, 3)')).toEqual(["a", "b", "c"]);
    expect(run('"a,b,c,d".split(",")')).toEqual(["a", "b", "c", "d"]);
  });

  it("works on a URL as on its text", () => {
    const page = note("A.md", { site: "https://obsidian.md/help" });
    expect(run('site.contains("obsidian")', page)).toBe(true);
    expect(run('site.startsWith("https://")', page)).toBe(true);
    expect(run('site.replace("https://", "")', page)).toBe("obsidian.md/help");
    expect(failure("site.asFile()", page)).toBe("asFile() cannot be used on a URL");
  });

  it("fails on the wrong type, or the wrong arguments", () => {
    expect(failure("(5).contains(1)")).toBe("contains() cannot be used on a number");
    expect(failure('"abc".toFixed(2)')).toBe("toFixed() cannot be used on text");
    expect(failure('"abc".slice("x")')).toBe("slice() needs a number, not text");
    expect(failure('"abc".replace("a")')).toBe("replace() takes 2 arguments, not 1");
    expect(failure('"abc".split([1])')).toBe("split() needs text, not a list");
    expect(failure('"abc".replace(/(/, "x")')).toBe("/(/ is not a valid regular expression");
  });
});

describe("number functions", () => {
  it("abs(), ceil() and floor()", () => {
    expect(run("(-5).abs()")).toBe(5);
    expect(run("(2.1).ceil()")).toBe(3);
    expect(run("(2.9).floor()")).toBe(2);
  });

  it("round()", () => {
    expect(run("(2.5).round()")).toBe(3);
    expect(run("(2.3333).round(2)")).toBe(2.33);
    expect(run("(1.005).round(2)")).toBe(1.01);
    expect(run("(2.4).round()")).toBe(2);
    expect(run("(1234.5678).round(1)")).toBe(1234.6);
  });

  it("toFixed() gives text", () => {
    expect(run("(3.14159).toFixed(2)")).toBe("3.14");
    expect(run("(2).toFixed(2)")).toBe("2.00");
    expect(run("(2.5).toFixed()")).toBe("3");
  });

  it("isEmpty()", () => {
    expect(run("(5).isEmpty()")).toBe(false);
    expect(run("(0).isEmpty()")).toBe(false);
    expect(run("price.isEmpty()", note("A.md"))).toBe(true);
  });

  it("works through a formula", () => {
    const formulas = { Owned: "2.6" };
    expect(run("monthlyUses * formula.Owned.round()", note("A.md", { monthlyUses: 4 }), { formulas })).toBe(12);
  });
});

describe("list functions", () => {
  it("has a length", () => {
    expect(run("[1, 2, 3].length")).toBe(3);
    expect(run("tasks.length", note("A.md", { tasks: ["a", "b"] }))).toBe(2);
  });

  it("contains(), containsAll() and containsAny()", () => {
    expect(run("[1,2,3].contains(2)")).toBe(true);
    expect(run("[1,2,3].contains(4)")).toBe(false);
    expect(run("[1,2,3].containsAll(2,3)")).toBe(true);
    expect(run("[1,2,3].containsAll(2,4)")).toBe(false);
    expect(run("[1,2,3].containsAny(3,4)")).toBe(true);
    expect(run("[1,2,3].containsAny(4,5)")).toBe(false);
    expect(run('tags.contains("urgent")', note("A.md", { tags: ["urgent", "home"] }))).toBe(true);
  });

  it("filter() keeps the elements the expression is true for", () => {
    expect(run("[1,2,3,4].filter(value > 2)")).toEqual([3, 4]);
    expect(run("[1,2,3,4].filter(index % 2 == 0)")).toEqual([1, 3]);
    expect(run('["a", 1, "b", 2].filter(value.isType("number"))')).toEqual([1, 2]);
  });

  it("map() transforms each element", () => {
    expect(run("[1,2,3,4].map(value + 1)")).toEqual([2, 3, 4, 5]);
    expect(run('["a", "b"].map(index + ":" + value)')).toEqual(["0:a", "1:b"]);
  });

  it("reduce() folds the list into one value", () => {
    expect(run("[1,2,3].reduce(acc + value, 0)")).toBe(6);
    const largest = 'values.filter(value.isType("number")).reduce(if(acc == null || value > acc, value, acc), null)';
    expect(run(largest, note("A.md", { values: [3, "x", 9, 4] }))).toBe(9);
    expect(run(largest, note("A.md", { values: ["x"] }))).toBeNull();
  });

  it("binds value, index and acc only inside the call", () => {
    const row = note("A.md", { value: "mine", index: 99, items: [1, 2] });
    expect(run("value", row)).toBe("mine");
    expect(run("items.map(value * 10)", row)).toEqual([10, 20]);
    expect(run("items.map(note.value)", row)).toEqual(["mine", "mine"]);
    // An inner call hides the outer one's value.
    expect(run("[[1, 2], [3]].map(value.map(value * 2))")).toEqual([[2, 4], [6]]);
    expect(run("[[1, 2], [3]].map(value.reduce(acc + value, 0))")).toEqual([3, 3]);
  });

  it("flat() flattens one level", () => {
    expect(run("[1,[2,3]].flat()")).toEqual([1, 2, 3]);
    expect(run("[1,[2,[3]]].flat()")).toEqual([1, 2, [3]]);
  });

  it("isEmpty() and join()", () => {
    expect(run("[1,2,3].isEmpty()")).toBe(false);
    expect(run("[].isEmpty()")).toBe(true);
    expect(run('[1,2,3].join(",")')).toBe("1,2,3");
    expect(run('["a", "b"].join(" and ")')).toBe("a and b");
  });

  it("reverse() and slice()", () => {
    expect(run("[1,2,3].reverse()")).toEqual([3, 2, 1]);
    expect(run("[1,2,3,4].slice(1,3)")).toEqual([2, 3]);
    expect(run("[1,2,3,4].slice(2)")).toEqual([3, 4]);
  });

  it("sort() orders from smallest to largest", () => {
    expect(run("[3, 1, 2].sort()")).toEqual([1, 2, 3]);
    expect(run('["c", "a", "b"].sort()')).toEqual(["a", "b", "c"]);
    expect(run("[10, 9, 100].sort()")).toEqual([9, 10, 100]);
    expect(shown('[date("2025-03-01"), date("2024-03-01")].sort()')).toBe("2024-03-01, 2025-03-01");
  });

  it("unique() removes duplicates", () => {
    expect(run("[1,2,2,3].unique()")).toEqual([1, 2, 3]);
    expect(run('["a", "b", "a"].unique()')).toEqual(["a", "b"]);
  });

  it("mean() averages the numbers, as the summary example uses it", () => {
    expect(run("[1, 2, 4].mean().round(3)")).toBe(2.333);
    expect(run('[1, "x", 3].mean()')).toBe(2);
    expect(run("[].mean()")).toBeNull();
  });

  it("fails when the expression fails for an element", () => {
    expect(failure("[1, 2].map(value.nosuch())")).toBe("There is no function called nosuch()");
    expect(failure("[1, 2].filter()")).toBe("filter() takes 1 argument, not 0");
    expect(failure("[1, 2].reduce(acc + value)")).toBe("reduce() takes 2 arguments, not 1");
    expect(failure('"abc".map(value)')).toBe("map() cannot be used on text");
  });
});

describe("object and regular expression functions", () => {
  const row = note("A.md", { meta: { a: 1, b: "two" }, empty: {} });

  it("isEmpty(), keys() and values()", () => {
    expect(run("meta.isEmpty()", row)).toBe(false);
    expect(run("empty.isEmpty()", row)).toBe(true);
    expect(run("meta.keys()", row)).toEqual(["a", "b"]);
    expect(run("meta.values()", row)).toEqual([1, "two"]);
    expect(run("file.properties.isEmpty()", row)).toBe(false);
    expect(run("file.properties.isEmpty()", note("B.md"))).toBe(true);
    expect(run("file.properties.keys()", row)).toEqual(["meta", "empty"]);
  });

  it("matches()", () => {
    expect(run('/abc/.matches("abcde")')).toBe(true);
    expect(run('/^abc$/.matches("abcde")')).toBe(false);
    expect(run('/ABC/i.matches("abcde")')).toBe(true);
    expect(run("/\\d+/.matches(file.name)", note("Chapter 12.md"))).toBe(true);
  });
});

describe("file functions", () => {
  const textbook = note("Library/Textbook.md", { icon: "book" });
  const book = note(
    "Required Reading/Sub/Calculus.md",
    { status: "open", empty: null },
    { tags: ["#book/math", "Reference"], links: ["Textbook", "[[Nowhere#Part|alias]]"] },
  );
  const rows = [textbook, book];

  it("hasTag() matches any of the tags, and the tags nested under them", () => {
    expect(run('file.hasTag("book")', book)).toBe(true);
    expect(run('file.hasTag("#book")', book)).toBe(true);
    expect(run('file.hasTag("book/math")', book)).toBe(true);
    expect(run('file.hasTag("math")', book)).toBe(false);
    expect(run('file.hasTag("boo")', book)).toBe(false);
    expect(run('file.hasTag("reference")', book)).toBe(true);
    expect(run('file.hasTag("tag1", "tag2")', book)).toBe(false);
    expect(run('file.hasTag("tag1", "book")', book)).toBe(true);
  });

  it("inFolder() matches the folder and the folders inside it", () => {
    expect(run('file.inFolder("Required Reading")', book)).toBe(true);
    expect(run('file.inFolder("Required Reading/Sub")', book)).toBe(true);
    expect(run('file.inFolder("Required Reading/")', book)).toBe(true);
    expect(run('file.inFolder("Required")', book)).toBe(false);
    expect(run('file.inFolder("Sub")', book)).toBe(false);
    expect(run('file.inFolder("Library")', book)).toBe(false);
  });

  it("hasLink() takes a file, a link or a name", () => {
    expect(run('file.hasLink("Textbook")', book, { rows })).toBe(true);
    expect(run('file.hasLink("Library/Textbook.md")', book, { rows })).toBe(true);
    expect(run('file.hasLink(link("Textbook"))', book, { rows })).toBe(true);
    expect(run('file.hasLink(file("Textbook"))', book, { rows })).toBe(true);
    expect(run('file.hasLink("Calculus")', book, { rows })).toBe(false);
    // A link to a note that does not exist is still a link to that name.
    expect(run('file.hasLink("Nowhere")', book, { rows })).toBe(true);
    expect(run('file.hasLink("Elsewhere")', book, { rows })).toBe(false);
  });

  it("hasProperty()", () => {
    expect(run('file.hasProperty("status")', book)).toBe(true);
    expect(run('file.hasProperty("empty")', book)).toBe(true);
    expect(run('file.hasProperty("nosuch")', book)).toBe(false);
    expect(run('file.hasProperty("constructor")', book)).toBe(false);
  });

  it("asLink() and asFile() go between files and links", () => {
    expect(run("file.asLink()", book)).toEqual({
      kind: "link",
      path: "Required Reading/Sub/Calculus",
      subpath: null,
      display: null,
      embed: false,
    });
    expect(run('file.asLink("Calc")', book)).toMatchObject({ display: "Calc" });
    expect(run("file.asLink().asFile().name", book, { rows })).toBe("Calculus.md");
    expect(run('link("[[Textbook]]").asFile().properties.icon', book, { rows })).toBe("book");
    expect(run('link("Nowhere").asFile()', book, { rows })).toBeNull();
    // A lookup through a link that leads nowhere is empty, not an error.
    expect(run('link("Nowhere").asFile().properties.icon', book, { rows })).toBeNull();
  });

  it("linksTo() asks whether the linked file links on", () => {
    expect(run('link("Calculus").linksTo(file("Textbook"))', textbook, { rows })).toBe(true);
    expect(run('link("Textbook").linksTo(file("Calculus"))', textbook, { rows })).toBe(false);
    expect(run('link("Nowhere").linksTo(file)', textbook, { rows })).toBe(false);
  });

  it("lists tags, links and backlinks", () => {
    expect(shown("file.tags", book)).toBe("#book/math, #Reference");
    expect(run('file.tags.contains("Reference")', book)).toBe(true);
    expect(run('file.tags.contains("#reference")', book)).toBe(true);
    expect(run("file.tags.length", book)).toBe(2);
    expect(shown("file.links", book)).toBe("Textbook, alias");
    expect(run("file.links.map(value.asFile().name)", book, { rows })).toEqual(["Textbook.md", null]);
    expect(shown("file.backlinks", textbook, { rows })).toBe("Required Reading/Sub/Calculus");
    expect(run("file.backlinks", book, { rows })).toEqual([]);
    expect(run("file.embeds", book)).toEqual([]);
    const withEmbed = note("C.md", {}, { embeds: ["cover.png"] });
    expect(isKind(run("file.embeds[0]", withEmbed), "link")).toBe(true);
  });

  it("gives dates for the created and modified times", () => {
    const stamped = note(
      "A.md",
      {},
      { ctime: new Date(2025, 0, 2, 3, 4, 5).getTime(), mtime: new Date(2025, 4, 24, 23, 0, 0).getTime() },
    );
    expect(typeOf(run("file.ctime", stamped))).toBe("date");
    expect(run('file.ctime.format("YYYY-MM-DD HH:mm:ss")', stamped)).toBe("2025-01-02 03:04:05");
    // The function reference's own example.
    expect(run("file.mtime.relative()", stamped)).toBe("3 days ago");
  });
});

describe("links between notes", () => {
  const redesign = note("Projects/Website redesign.md", { status: "Active", icon: "globe" });
  const a = note("Tasks/A.md", { hours: 3, status: "Done" });
  const b = note("Tasks/B.md", { hours: 5, status: "Open" });
  const c = note("Tasks/C.md", { hours: 1, status: "Open" });
  const project = note(
    "Plan.md",
    { project: "[[Website redesign]]", tasks: ["[[A]]", "[[B]]", "[[C]]"], type: "[[Website redesign]]" },
    { links: ["Website redesign", "A", "B", "C"] },
  );
  const rows = [redesign, a, b, c, project];

  it("looks up a property of a linked note", () => {
    expect(run("project.asFile().properties.status", project, { rows })).toBe("Active");
    expect(run("list(project)[0].asFile().properties.status", project, { rows })).toBe("Active");
    expect(run("list(type)[0].asFile().properties.icon", project, { rows })).toBe("globe");
    expect(run("list(tasks)[0].asFile().properties.hours", project, { rows })).toBe(3);
  });

  it("rolls up values from several linked notes", () => {
    expect(run("tasks.map(value.asFile().properties.hours).reduce(acc + value, 0)", project, { rows })).toBe(9);
    expect(run('tasks.filter(value.asFile().properties.status != "Done").length', project, { rows })).toBe(2);
    expect(run("tasks.map(value.asFile().properties.status).unique()", project, { rows })).toEqual(["Done", "Open"]);
  });

  it("rolls up values from the notes that link here", () => {
    const hours = "file.backlinks.map(value.asFile().properties.hours).reduce(acc + value, 0)";
    const t1 = note("T1.md", { hours: 2 }, { links: ["Projects/Website redesign.md"] });
    const t2 = note("T2.md", { hours: 4 }, { links: ["[[Website redesign|the project]]"] });
    expect(run(hours, redesign, { rows: [redesign, t1, t2] })).toBe(6);
  });

  it("treats two links to the same note as equal, however they are written", () => {
    expect(run('project == link("Projects/Website redesign")', project, { rows })).toBe(true);
    expect(run('project == link("website redesign.md")', project, { rows })).toBe(true);
    expect(run('project == link("A")', project, { rows })).toBe(false);
    expect(run('tasks.contains(link("B"))', project, { rows })).toBe(true);
    // Neither exists, so the link text decides.
    expect(run('link("Ghost") == link("ghost.md")', project, { rows })).toBe(true);
    expect(run('link("Ghost") == link("Spirit")', project, { rows })).toBe(false);
    expect(run('project == file("Website redesign")', project, { rows })).toBe(true);
  });
});

describe("finding the file a link names", () => {
  const rows = [
    note("Archive/2024/Plan.md", { where: "archive" }),
    note("Projects/Plan.md", { where: "projects" }),
    note("Projects/Alpha/Notes.md", { where: "alpha" }),
    note("Projects/Beta/Notes.md", { where: "beta" }),
    note("Assets/photo.png"),
    note("Assets/Readme"),
  ];
  const where = (target: string) => run(`link("${target}").asFile().properties.where`, rows[0], { rows });
  const found = (target: string) => run(`file("${target}").path`, rows[0], { rows });

  it("takes a full path, with or without the extension", () => {
    expect(where("Archive/2024/Plan.md")).toBe("archive");
    expect(where("Archive/2024/Plan")).toBe("archive");
    expect(where("/Projects/Plan.md")).toBe("projects");
  });

  it("takes the end of a path", () => {
    expect(where("Alpha/Notes")).toBe("alpha");
    expect(where("Beta/Notes.md")).toBe("beta");
    expect(where("2024/Plan")).toBe("archive");
  });

  it("takes a name alone, and prefers the file nearest the vault root", () => {
    expect(where("Plan")).toBe("projects");
    expect(where("plan.MD")).toBe("projects");
    expect(where("Notes")).toBe("alpha");
  });

  it("ignores the heading and the alias of a link", () => {
    expect(where("[[Alpha/Notes#Section|the notes]]")).toBe("alpha");
    expect(where("Plan#Goals")).toBe("projects");
  });

  it("needs the extension for a file that is not a note", () => {
    expect(found("photo.png")).toBe("Assets/photo.png");
    expect(found("Assets/photo.png")).toBe("Assets/photo.png");
    expect(found("photo")).toBeNull();
    expect(found("Readme")).toBe("Assets/Readme");
  });

  it("finds nothing for a name no file has", () => {
    expect(found("Missing")).toBeNull();
    expect(found("lan")).toBeNull();
    expect(found("Projects")).toBeNull();
    expect(found("")).toBeNull();
  });
});

describe("empty values", () => {
  const row = note("A.md", { tags: null });

  it("answer no to a question and give nothing otherwise", () => {
    expect(run('tags.contains("urgent")', row)).toBe(false);
    expect(run('missing.startsWith("a")', row)).toBe(false);
    expect(run("missing.lower()", row)).toBeNull();
    expect(run("(price / age).toFixed(2)", row)).toBeNull();
    expect(run("missing.map(value + 1)", row)).toBeNull();
    expect(run('missing.format("YYYY")', row)).toBeNull();
  });

  it("still fail on a function that does not exist", () => {
    expect(failure("missing.nosuch()", row)).toBe("There is no function called nosuch()");
  });
});
