import { describe, expect, it } from "vitest";
import { findMentions, linkMention, outgoingLinks, possibleLinks } from "../mentions";

describe("findMentions", () => {
  it("finds a name written as plain text, ignoring case", () => {
    expect(findMentions("We met about Project Alpha today.", "Project Alpha")).toEqual([{ from: 13, to: 26 }]);
    expect(findMentions("project alpha and PROJECT ALPHA", "Project Alpha")).toEqual([
      { from: 0, to: 13 },
      { from: 18, to: 31 },
    ]);
  });

  it("only counts whole words", () => {
    expect(findMentions("planning the plans", "plan")).toEqual([]);
    expect(findMentions("the plan, the (plan) and plan.", "plan")).toHaveLength(3);
    expect(findMentions("a_plan plan2", "plan")).toEqual([]);
  });

  it("skips text that is already a link, code, an address or a tag", () => {
    const name = "Inbox";
    expect(findMentions("[[Inbox]] and [[Other|Inbox]] and ![[Inbox]]", name)).toEqual([]);
    expect(findMentions("[Inbox](Inbox.md) and ![Inbox](inbox.png)", name)).toEqual([]);
    expect(findMentions("`Inbox` and ``the Inbox``", name)).toEqual([]);
    expect(findMentions("see https://example.com/Inbox for more", name)).toEqual([]);
    expect(findMentions("tagged #Inbox here", name)).toEqual([]);
    expect(findMentions("[[Inbox]] but also Inbox", name)).toEqual([{ from: 19, to: 24 }]);
  });

  it("finds nothing for an empty name", () => {
    expect(findMentions("anything", "  ")).toEqual([]);
  });
});

describe("linkMention", () => {
  it("links the text, keeping what was written when it differs from the name", () => {
    expect(linkMention("About Inbox today", { from: 6, to: 11 }, "Inbox")).toBe("About [[Inbox]] today");
    expect(linkMention("About inbox today", { from: 6, to: 11 }, "Inbox")).toBe("About [[Inbox|inbox]] today");
    expect(linkMention("See the roadmap", { from: 8, to: 15 }, "Plan")).toBe("See the [[Plan|roadmap]]");
  });
});

describe("outgoingLinks", () => {
  it("lists each linked note once, with how often and where first", () => {
    const content = "[[Inbox]] and [[inbox#Today|today]]\n![[photo.png|160]] [[Projects/Plan]]\n[[#Top]] [[]]\n";
    expect(outgoingLinks(content)).toEqual([
      { target: "Inbox", line: 1, count: 2 },
      { target: "photo.png", line: 2, count: 1 },
      { target: "Projects/Plan", line: 2, count: 1 },
    ]);
  });

  it("skips links inside code", () => {
    expect(outgoingLinks("`[[Code]]`\n```\n[[Fenced]]\n```\n[[Real]]")).toEqual([{ target: "Real", line: 5, count: 1 }]);
  });
});

describe("possibleLinks", () => {
  const names = [
    { name: "Project Alpha", noteName: "Project Alpha" },
    { name: "Roadmap", noteName: "Plan" },
    { name: "Go", noteName: "Go" },
  ];

  it("finds other notes' names and aliases that are not linked", () => {
    const content = "The roadmap for Project Alpha.\n[[Project Alpha]] again, go ahead.\n```\nProject Alpha in code\n```";
    expect(possibleLinks(content, names).map((p) => [p.noteName, p.line, p.text.slice(p.range.from, p.range.to)])).toEqual([
      ["Plan", 1, "roadmap"],
      ["Project Alpha", 1, "Project Alpha"],
    ]);
  });

  it("stops at the limit", () => {
    const content = Array.from({ length: 50 }, () => "roadmap").join("\n");
    expect(possibleLinks(content, names, 10)).toHaveLength(10);
  });
});
