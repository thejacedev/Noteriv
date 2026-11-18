import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { lineEndingOf, sameText, toLf, withLineEndingsOf } from "../line-endings";

const windows = "# Title\r\n\r\nFirst line.\r\nSecond line.\r\n";
const unix = "# Title\n\nFirst line.\nSecond line.\n";

/** What the editor hands back for a text it was given. */
const throughEditor = (text: string) => EditorState.create({ doc: text }).doc.toString();

describe("toLf", () => {
  it("turns every kind of line break into \\n", () => {
    expect(toLf(windows)).toBe(unix);
    expect(toLf("a\rb\rc")).toBe("a\nb\nc");
    expect(toLf("a\r\nb\nc\rd")).toBe("a\nb\nc\nd");
  });

  it("hands back a text without \\r as it is", () => {
    expect(toLf(unix)).toBe(unix);
    expect(toLf("")).toBe("");
  });

  it("gives what the editor holds", () => {
    for (const text of [windows, unix, "a\rb", "a\r\nb\nc\rd", "no break", "", "ends\r\n\r\n"]) {
      expect(toLf(text)).toBe(throughEditor(text));
    }
  });
});

describe("sameText", () => {
  it("is true for a note and the same note with other line endings", () => {
    expect(sameText(windows, unix)).toBe(true);
    expect(sameText(unix, windows)).toBe(true);
    expect(sameText(windows, windows)).toBe(true);
    expect(sameText("a\rb", "a\nb")).toBe(true);
    expect(sameText("", "")).toBe(true);
  });

  it("is true for a note with Windows line endings and what the editor holds for it", () => {
    expect(sameText(throughEditor(windows), windows)).toBe(true);
  });

  it("is false when anything else differs", () => {
    expect(sameText(windows, unix + "more")).toBe(false);
    expect(sameText("a\r\n\r\nb", "a\nb")).toBe(false);
    expect(sameText("a \nb", "a\nb")).toBe(false);
    expect(sameText("a\nb\n", "a\nb")).toBe(false);
  });
});

describe("lineEndingOf", () => {
  it("reads the ending of a file that has one kind", () => {
    expect(lineEndingOf(windows)).toBe("\r\n");
    expect(lineEndingOf(unix)).toBe("\n");
  });

  it("is \\n for a text with no line break, or with only \\r", () => {
    expect(lineEndingOf("")).toBe("\n");
    expect(lineEndingOf("one line")).toBe("\n");
    expect(lineEndingOf("a\rb\rc")).toBe("\n");
  });

  it("takes the ending most lines have in a file that mixes them", () => {
    expect(lineEndingOf("a\r\nb\r\nc\nd")).toBe("\r\n");
    expect(lineEndingOf("a\r\nb\nc\nd")).toBe("\n");
    expect(lineEndingOf("a\r\nb\nc")).toBe("\r\n");
  });
});

describe("withLineEndingsOf", () => {
  it("gives the editor's text the line endings of the file", () => {
    expect(withLineEndingsOf(unix, windows)).toBe(windows);
  });

  it("writes back a note with Windows line endings byte for byte", () => {
    expect(withLineEndingsOf(throughEditor(windows), windows)).toBe(windows);
  });

  it("changes only the edited line of such a note", () => {
    const edited = throughEditor(windows).replace("First line.", "First line, edited.");
    expect(withLineEndingsOf(edited, windows)).toBe("# Title\r\n\r\nFirst line, edited.\r\nSecond line.\r\n");
  });

  it("leaves the text alone for a file with \\n, a new file and a file with no line break", () => {
    expect(withLineEndingsOf(unix, unix)).toBe(unix);
    expect(withLineEndingsOf(unix, "")).toBe(unix);
    expect(withLineEndingsOf(unix, "one line")).toBe(unix);
  });

  it("does not double the \\r of a text that already has Windows line endings", () => {
    expect(withLineEndingsOf(windows, windows)).toBe(windows);
    expect(withLineEndingsOf("a\r\nb\nc", windows)).toBe("a\r\nb\r\nc");
  });

  it("gives every line the ending most lines have in a file that mixes them", () => {
    const mixed = "a\r\nb\r\nc\nd\r\n";
    expect(withLineEndingsOf(throughEditor(mixed), mixed)).toBe("a\r\nb\r\nc\r\nd\r\n");
  });
});
