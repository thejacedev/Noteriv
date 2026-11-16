import { describe, expect, it } from "vitest";
import {
  addCard,
  hiddenLineCount,
  isBoardContent,
  moveCard,
  parseBoard,
  removeCard,
  serializeBoard,
  toggleCard,
  updateCard,
} from "../board-utils";

/** What the file holds after the board view has read it and written it back. */
function rewritten(content: string): string {
  return serializeBoard(parseBoard(content));
}

function board(...cardLines: string[]): string {
  return ["---", "board: true", "---", "", "## To Do", "", ...cardLines, ""].join("\n");
}

function onlyCard(content: string) {
  return parseBoard(content).columns[0].cards[0];
}

describe("a board the app wrote", () => {
  const content = [
    "---",
    "board: true",
    "---",
    "",
    "## To Do",
    "",
    "- [ ] Write integration tests #backend @due(2026-04-01)",
    "- [ ] Design onboarding flow #design",
    "",
    "## In Progress",
    "",
    "- [x] Fix sidebar layout bug #frontend #urgent",
    "",
    "## Done",
    "",
    "",
  ].join("\n");

  it("is read into columns, cards, tags and due dates", () => {
    const { columns } = parseBoard(content);
    expect(columns.map((c) => c.title)).toEqual(["To Do", "In Progress", "Done"]);
    expect(columns[0].cards[0]).toMatchObject({
      text: "Write integration tests",
      completed: false,
      tags: ["backend"],
      dueDate: "2026-04-01",
    });
    expect(columns[1].cards[0]).toMatchObject({
      text: "Fix sidebar layout bug",
      completed: true,
      tags: ["frontend", "urgent"],
      dueDate: null,
    });
    expect(columns[2].cards).toEqual([]);
  });

  it("is written back as it was", () => {
    expect(rewritten(content)).toBe(content);
  });

  it("changes only the card that was ticked", () => {
    const data = parseBoard(content);
    const col = data.columns[0];
    const after = serializeBoard(toggleCard(data, col.id, col.cards[1].id));
    expect(after).toBe(content.replace("- [ ] Design onboarding", "- [x] Design onboarding"));
  });
});

describe("a due date", () => {
  it("that is not a date stays on the card", () => {
    const content = board("- [ ] Call Bob @due(friday)");
    expect(onlyCard(content)).toMatchObject({ text: "Call Bob @due(friday)", dueDate: null });
    expect(rewritten(content)).toBe(content);
  });

  it("that is not a date stays beside one that is", () => {
    const content = board("- [ ] Call Bob @due(soon) @due(2026-12-01)");
    expect(onlyCard(content)).toMatchObject({ text: "Call Bob @due(soon)", dueDate: "2026-12-01" });
    expect(rewritten(content)).toBe(content);
  });

  it("written twice keeps the first", () => {
    const content = board("- [ ] Ship it @due(2026-12-24) @due(2026-12-01)");
    expect(onlyCard(content)).toMatchObject({ text: "Ship it", dueDate: "2026-12-24" });
  });

  it("typed into the card text replaces the one the card had", () => {
    const data = parseBoard(board("- [ ] Ship it #release @due(2026-12-01)"));
    const col = data.columns[0];
    const after = serializeBoard(updateCard(data, col.id, col.cards[0].id, "Ship it @due(2026-12-24)"));
    // At once, not only when the file is read again.
    expect(after).toBe(board("- [ ] Ship it #release @due(2026-12-24)"));
  });

  it("stays when the card text is changed without one", () => {
    const data = parseBoard(board("- [ ] Ship it #release @due(2026-12-01)"));
    const col = data.columns[0];
    const after = serializeBoard(updateCard(data, col.id, col.cards[0].id, "Ship it today #now #release"));
    expect(after).toBe(board("- [ ] Ship it today #now #release @due(2026-12-01)"));
  });
});

describe("an annotation", () => {
  it("is read as a key and a value, and written back after the tags", () => {
    const content = board("- [ ] Validation DU @heure(18:00) #reunion @due(2026-11-09)");
    expect(onlyCard(content)).toMatchObject({
      text: "Validation DU",
      tags: ["reunion"],
      meta: [{ key: "heure", value: "18:00" }],
      dueDate: "2026-11-09",
    });
    const once = rewritten(content);
    expect(once).toBe(board("- [ ] Validation DU #reunion @heure(18:00) @due(2026-11-09)"));
    expect(rewritten(once)).toBe(once);
  });

  it("keeps its place among the others, whatever the key", () => {
    const content = board("- [ ] Atelier #equipe @heure(09:30) @duree_prevue(90) @durée(1 h 30) @lieu(Salle B-12)");
    expect(onlyCard(content).meta).toEqual([
      { key: "heure", value: "09:30" },
      { key: "duree_prevue", value: "90" },
      { key: "durée", value: "1 h 30" },
      { key: "lieu", value: "Salle B-12" },
    ]);
    expect(rewritten(content)).toBe(content);
  });

  it("may have no value, and may be written twice", () => {
    const content = board("- [ ] Call back @urgent() @who(Sam) @who(Alex)");
    expect(onlyCard(content).meta).toEqual([
      { key: "urgent", value: "" },
      { key: "who", value: "Sam" },
      { key: "who", value: "Alex" },
    ]);
    expect(rewritten(content)).toBe(content);
  });

  it("is not read where it is something else", () => {
    // An address, a value with brackets of its own, a key that starts with a
    // digit, a key with nothing after it: all stay in the text as written.
    for (const text of ["Write to me@work(home)", "Check @note(a (b) c)", "Room @2b(first floor)", "Ask @sam about it"]) {
      const content = board(`- [ ] ${text}`);
      expect(onlyCard(content)).toMatchObject({ text, meta: [] });
      expect(rewritten(content)).toBe(content);
    }
  });

  it("is not made of a due date that is not a date", () => {
    const content = board("- [ ] Call Bob @due(friday) @heure(18:00)");
    expect(onlyCard(content)).toMatchObject({
      text: "Call Bob @due(friday)",
      dueDate: null,
      meta: [{ key: "heure", value: "18:00" }],
    });
    expect(rewritten(content)).toBe(content);
  });

  it("typed into the card text replaces the one with that key, where it stood", () => {
    const data = parseBoard(board("- [ ] Atelier #equipe @heure(09:30) @lieu(Salle B) @due(2026-11-09)"));
    const col = data.columns[0];
    const after = serializeBoard(updateCard(data, col.id, col.cards[0].id, "Atelier @heure(14:00) @avec(Sam)"));
    expect(after).toBe(board("- [ ] Atelier #equipe @heure(14:00) @lieu(Salle B) @avec(Sam) @due(2026-11-09)"));
  });

  it("stays when the card text is changed without one", () => {
    const data = parseBoard(board("- [ ] Atelier @heure(09:30)"));
    const col = data.columns[0];
    const after = serializeBoard(updateCard(data, col.id, col.cards[0].id, "Atelier de rentrée"));
    expect(after).toBe(board("- [ ] Atelier de rentrée @heure(09:30)"));
  });

  it("typed into a new card is the card's at once", () => {
    const data = parseBoard(board("- [ ] One"));
    const added = addCard(data, data.columns[0].id, "Two @heure(18:00) #home");
    expect(added.columns[0].cards[1]).toMatchObject({
      text: "Two",
      tags: ["home"],
      meta: [{ key: "heure", value: "18:00" }],
    });
    expect(serializeBoard(added)).toBe(board("- [ ] One", "- [ ] Two #home @heure(18:00)"));
  });

  it("goes with the card when it moves", () => {
    const data = parseBoard(["## To Do", "", "- [ ] Atelier @heure(09:30)", "", "## Done", "", ""].join("\n"));
    const [todo, done] = data.columns;
    expect(serializeBoard(moveCard(data, todo.cards[0].id, todo.id, done.id, 0))).toBe(
      ["## To Do", "", "", "## Done", "", "- [ ] Atelier @heure(09:30)", ""].join("\n"),
    );
  });
});

describe("a # that is not a tag", () => {
  it("in a web address stays in the address", () => {
    const content = board("- [ ] Read https://example.com/guide#install");
    expect(onlyCard(content)).toMatchObject({ text: "Read https://example.com/guide#install", tags: [] });
    expect(rewritten(content)).toBe(content);
  });

  it("in a link to a heading stays in the link", () => {
    const content = board("- [ ] Review [[Plan#Risks]] #planning");
    expect(onlyCard(content)).toMatchObject({ text: "Review [[Plan#Risks]]", tags: ["planning"] });
    expect(rewritten(content)).toBe(content);
  });

  it("in a markdown link stays in the link", () => {
    const content = board("- [ ] See [the guide](docs/setup.md#linux)");
    expect(onlyCard(content)).toMatchObject({ text: "See [the guide](docs/setup.md#linux)", tags: [] });
    expect(rewritten(content)).toBe(content);
  });
});

describe("a tag", () => {
  it("with a slash is one tag", () => {
    const content = board("- [ ] Pay the invoice #work/urgent");
    expect(onlyCard(content)).toMatchObject({ text: "Pay the invoice", tags: ["work/urgent"] });
    expect(rewritten(content)).toBe(content);
  });

  it("in another language is one tag", () => {
    const content = board("- [ ] Validation DU #réunion #日本語");
    expect(onlyCard(content)).toMatchObject({ text: "Validation DU", tags: ["réunion", "日本語"] });
    expect(rewritten(content)).toBe(content);
  });

  it("keeps the marks and joiners its letters are written with", () => {
    // Devanagari vowel signs, an "e" with a separate accent, a Persian word
    // with a zero-width non-joiner: none of them may end the tag early.
    const tags = ["हिंदी", "re\u0301union", "می\u200cخواهم"];
    const content = board(`- [ ] Lire ${tags.map((t) => `#${t}`).join(" ")}`);
    expect(onlyCard(content)).toMatchObject({ text: "Lire", tags });
    expect(rewritten(content)).toBe(content);
  });

  it("glued to a due date is not lost when the date is taken out", () => {
    const content = board("- [ ] Task @due(2026-01-01)#x");
    expect(onlyCard(content)).toMatchObject({ text: "Task #x", tags: [], dueDate: "2026-01-01" });
    const once = rewritten(content);
    expect(once).toBe(board("- [ ] Task #x @due(2026-01-01)"));
    expect(rewritten(once)).toBe(once);
  });

  it("followed by a comma leaves the comma in the text", () => {
    const content = board("- [ ] Fix this #bug, then that");
    expect(onlyCard(content)).toMatchObject({ text: "Fix this , then that", tags: ["bug"] });
    expect(rewritten(content)).toBe(board("- [ ] Fix this , then that #bug"));
  });

  it("typed into a new card is a tag at once, and when the file is read again", () => {
    const data = parseBoard(board("- [ ] One"));
    const added = addCard(data, data.columns[0].id, "Two #home @due(2026-12-01)");
    const read = { text: "Two", tags: ["home"], dueDate: "2026-12-01" };
    expect(added.columns[0].cards[1]).toMatchObject(read);
    expect(parseBoard(serializeBoard(added)).columns[0].cards[1]).toMatchObject(read);
  });

  it("may be a number, and may open the line", () => {
    const content = board("- [ ] #42 Fix the login");
    expect(onlyCard(content)).toMatchObject({ text: "Fix the login", tags: ["42"] });
    expect(rewritten(content)).toBe(board("- [ ] Fix the login #42"));
  });
});

describe("lines the board does not show", () => {
  it("above the first column are kept", () => {
    const content = [
      "---",
      "board: true",
      "---",
      "",
      "# Sprint 12",
      "",
      "Ends on the 14th.",
      "",
      "## To Do",
      "",
      "- [ ] One",
      "",
    ].join("\n");
    expect(rewritten(content)).toBe(content);
  });

  it("under a card are kept with the card", () => {
    const content = board(
      "- [ ] Plan the trip #travel",
      "  - [ ] Book the train",
      "  - [x] Renew the passport",
      "  Ask Sam about the hotel.",
      "- [ ] Water the plants",
    );
    expect(rewritten(content)).toBe(content);
  });

  it("under a column heading are kept", () => {
    const content = [
      "---",
      "board: true",
      "---",
      "",
      "## To Do",
      "",
      "Things for this week.",
      "",
      "- [ ] One",
      "",
    ].join("\n");
    expect(rewritten(content)).toBe(content);
  });

  it("under a column without cards are kept", () => {
    const content = ["## Later", "", "Nothing yet.", ""].join("\n");
    expect(rewritten(content)).toBe(content);
  });

  it("go with the card when it moves, and go when it is removed", () => {
    const content = [
      "## To Do",
      "",
      "- [ ] Plan the trip",
      "  - [ ] Book the train",
      "- [ ] Water the plants",
      "",
      "## Done",
      "",
      "",
    ].join("\n");
    const data = parseBoard(content);
    const [todo, done] = data.columns;
    const moved = moveCard(data, todo.cards[0].id, todo.id, done.id, 0);
    expect(serializeBoard(moved)).toBe(
      [
        "## To Do",
        "",
        "- [ ] Water the plants",
        "",
        "## Done",
        "",
        "- [ ] Plan the trip",
        "  - [ ] Book the train",
        "",
      ].join("\n"),
    );
    expect(serializeBoard(removeCard(data, todo.id, todo.cards[0].id))).toBe(
      ["## To Do", "", "- [ ] Water the plants", "", "## Done", "", ""].join("\n"),
    );
  });

  it("keep the empty line between a card and a paragraph under it", () => {
    const content = board("- [ ] One", "- [ ] Two", "", "Notes about this column.");
    expect(parseBoard(content).columns[0].cards[1].extra).toEqual(["", "Notes about this column."]);
    expect(rewritten(content)).toBe(content);
  });

  it("are code when they are in a code block, whatever they look like", () => {
    const content = [
      "## To Do",
      "",
      "- [ ] Write the template",
      "  ```markdown",
      "## Not a column",
      "- [ ] Not a card",
      "  ```",
      "- [ ] Two",
      "",
    ].join("\n");
    const data = parseBoard(content);
    expect(data.columns.map((c) => c.title)).toEqual(["To Do"]);
    expect(data.columns[0].cards.map((c) => c.text)).toEqual(["Write the template", "Two"]);
    expect(rewritten(content)).toBe(content);
  });

  it("between cards are the only thing a loose list loses", () => {
    const content = board("- [ ] One", "", "- [ ] Two");
    expect(rewritten(content)).toBe(board("- [ ] One", "- [ ] Two"));
  });

  it("are counted, so that deleting a card or a column can ask first", () => {
    const data = parseBoard(
      [
        "## To Do",
        "",
        "Things for this week.",
        "",
        "- [ ] Plan the trip",
        "  - [ ] Book the train",
        "",
        "  Ask Sam about the hotel.",
        "- [ ] Water the plants",
        "",
        "## Notes",
        "",
        "Only text here.",
        "",
      ].join("\n"),
    );
    const [todo, notes] = data.columns;
    expect(hiddenLineCount(todo.cards[0])).toBe(2);
    expect(hiddenLineCount(todo.cards[1])).toBe(0);
    expect(hiddenLineCount(todo)).toBe(3);
    expect(notes.cards).toEqual([]);
    expect(hiddenLineCount(notes)).toBe(1);
  });

  it("are not touched by a change to another card", () => {
    const content = board(
      "- [ ] Plan the trip",
      "  Ask Sam about the hotel.",
      "",
      "  The second paragraph of the note.",
      "- [ ] Water the plants",
    );
    const data = parseBoard(content);
    const col = data.columns[0];
    expect(serializeBoard(toggleCard(data, col.id, col.cards[1].id))).toBe(
      content.replace("- [ ] Water", "- [x] Water"),
    );
  });
});

describe("a file with Windows line endings", () => {
  const content = [
    "---",
    "board: true",
    "---",
    "",
    "# Sprint 12",
    "",
    "## To Do",
    "",
    "- [ ] One #home @due(2026-12-01)",
    "  a note",
    "- [x] Two",
    "",
  ].join("\r\n");

  it("is a board", () => {
    expect(isBoardContent(content)).toBe(true);
  });

  it("is read without the line endings in the text", () => {
    const data = parseBoard(content);
    expect(data.frontmatter).toBe("---\nboard: true\n---");
    expect(data.columns.map((c) => c.title)).toEqual(["To Do"]);
    expect(data.columns[0].cards.map((c) => c.text)).toEqual(["One", "Two"]);
    expect(data.columns[0].cards[0]).toMatchObject({ tags: ["home"], dueDate: "2026-12-01", extra: ["  a note"] });
  });

  it("is written back with them", () => {
    expect(rewritten(content)).toBe(content);
  });
});
