import { describe, expect, it } from "vitest";
import { countWords, plural } from "../text-stats";
import { indentWidth, isOutlineLine, listFoldEnd } from "../fold-utils";
import { findInlineComments, isCommentFence, stripComments } from "../comments";

describe("countWords", () => {
  it("counts runs of letters and digits", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t ")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords("one two  three\nfour")).toBe(4);
    expect(countWords("it's a well-known fact, isn’t it?")).toBe(6);
    expect(countWords("version 2 of plan_b")).toBe(4);
  });

  it("does not count markup on its own", () => {
    expect(countWords("# Title\n\n- [ ] task **bold** `code`")).toBe(4);
    expect(countWords("--- *** ===")).toBe(0);
  });

  it("counts accented and non-Latin words", () => {
    expect(countWords("café naïve Über")).toBe(3);
    expect(countWords("привет мир")).toBe(2);
  });

  it("counts each Chinese, Japanese or Korean character", () => {
    expect(countWords("你好世界")).toBe(4);
    expect(countWords("こんにちは")).toBe(5);
    expect(countWords("hello 世界 again")).toBe(4);
  });
});

describe("plural", () => {
  it("picks the right form", () => {
    expect(plural(1, "word", "words")).toBe("1 word");
    expect(plural(0, "word", "words")).toBe("0 words");
    expect(plural(12, "word", "words")).toBe("12 words");
  });
});

describe("listFoldEnd", () => {
  const lines = [
    "- parent", //          0
    "  - child", //         1
    "    - grandchild", //  2
    "", //                  3
    "  - second child", //  4
    "- sibling", //         5
    "", //                  6
    "Paragraph", //         7
    "1. numbered", //       8
    "\t- tabbed child", //  9
    "   continuation", //  10
    "", //                 11
  ];

  it("folds a list item to the end of what is nested under it", () => {
    expect(listFoldEnd(lines, 0)).toBe(4);
    expect(listFoldEnd(lines, 1)).toBe(2);
    expect(listFoldEnd(lines, 8)).toBe(10);
  });

  it("does not fold an item with nothing under it, or a line that is not an item", () => {
    expect(listFoldEnd(lines, 2)).toBeNull();
    expect(listFoldEnd(lines, 4)).toBeNull();
    expect(listFoldEnd(lines, 5)).toBeNull();
    expect(listFoldEnd(lines, 7)).toBeNull();
    expect(listFoldEnd(lines, 99)).toBeNull();
  });

  it("offers folding for headings and list items only", () => {
    for (const line of ["# Title", "###### Deep", "- item", "  * nested", "12. numbered", "3) other style"]) {
      expect(isOutlineLine(line), line).toBe(true);
    }
    for (const line of ["A paragraph", "#tag at the start", "####### seven", "-not a list", "", "> quote"]) {
      expect(isOutlineLine(line), line).toBe(false);
    }
  });

  it("measures tabs as four columns", () => {
    expect(indentWidth("\t- x")).toBe(4);
    expect(indentWidth("  \t- x")).toBe(4);
    expect(indentWidth("      x")).toBe(6);
  });
});

describe("comments", () => {
  it("finds comments inside a line", () => {
    expect(findInlineComments("before %%hidden%% after")).toEqual([{ from: 7, to: 17 }]);
    expect(findInlineComments("%%a%% and %%b%%")).toEqual([
      { from: 0, to: 5 },
      { from: 10, to: 15 },
    ]);
    expect(findInlineComments("50%% off, no closing")).toEqual([]);
    expect(findInlineComments("nothing here")).toEqual([]);
  });

  it("leaves a %% inside inline code alone", () => {
    expect(findInlineComments("use `%%text%%` for a comment")).toEqual([]);
    expect(findInlineComments("`%%code%%` then %%real%%")).toEqual([{ from: 16, to: 24 }]);
  });

  it("recognises a block fence", () => {
    expect(isCommentFence("%%")).toBe(true);
    expect(isCommentFence("  %%  ")).toBe(true);
    expect(isCommentFence("%% note %%")).toBe(false);
  });

  it("strips inline and block comments for readers", () => {
    const text = [
      "Visible %%hidden%% text.",
      "%%a whole line%%",
      "Kept.",
      "%%",
      "A block",
      "of comment",
      "%%",
      "After.",
      "```",
      "%%not a comment in code%%",
      "%%",
      "```",
      "End `%%code%%`.",
    ].join("\n");
    expect(stripComments(text)).toBe(
      [
        "Visible  text.",
        "Kept.",
        "After.",
        "```",
        "%%not a comment in code%%",
        "%%",
        "```",
        "End `%%code%%`.",
      ].join("\n")
    );
  });

  it("leaves a note without comments unchanged", () => {
    const text = "# Title\n\nJust 100% text.\n";
    expect(stripComments(text)).toBe(text);
  });
});

import { markdownToHTML } from "../markdown-to-html";
import { commentRenderer, inlineFootnoteRenderer } from "../../components/markdown/renderers/comments";

describe("comments and inline footnotes when rendered", () => {
  it("leaves comments out of exported HTML", () => {
    const html = markdownToHTML("Shown %%hidden%% text.\n\n%%\nblock\n%%\n\nAfter.");
    expect(html).toContain("Shown");
    expect(html).toContain("After.");
    expect(html).not.toContain("hidden");
    expect(html).not.toContain("block");
    expect(html).not.toContain("%%");
  });

  it("shows an inline footnote where it is written in exported HTML", () => {
    expect(markdownToHTML("A claim^[with its source] here.")).toContain(
      '<sup class="footnote-inline">[with its source]</sup>'
    );
  });

  it("marks comments for the editor, escaping what is inside", () => {
    const found = commentRenderer.find("a %%<b>note</b>%% b", 100);
    expect(found).toHaveLength(1);
    expect(found[0].from).toBe(102);
    expect(found[0].to).toBe(117);
    expect(found[0].html).toBe('<span class="md-comment">%%&lt;b&gt;note&lt;/b&gt;%%</span>');
  });

  it("finds inline footnotes and leaves numbered references alone", () => {
    const found = inlineFootnoteRenderer.find("x^[one] y[^2] z^[three]", 0);
    expect(found.map((f) => f.html)).toEqual([
      '<sup class="md-footnote-inline">one</sup>',
      '<sup class="md-footnote-inline">three</sup>',
    ]);
  });
});
