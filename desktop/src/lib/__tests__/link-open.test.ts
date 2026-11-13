import { describe, expect, it } from "vitest";
import { findLinkPlace } from "../link-open";
import { linkOpenTag } from "../../components/markdown/renderers/links";

const VAULT = "/home/me/vault";
const ALL = [
  "Archive/Plan.md",
  "Inbox.md",
  "Notes/C# basics.md",
  "Plan.md",
  "Projects/Deep/Spec.md",
  "Projects/Plan.md",
  "Projects/img/chart.png",
  "attachments/paper.pdf",
  "attachments/team photo.png",
];
// The notes as the app lists them. On Windows the listing writes "\".
const NOTES = ALL.filter((rel) => rel.endsWith(".md")).map((rel) => ({
  filePath: `${VAULT}/${rel}`,
  relativePath: rel,
}));

const from = (rel: string) => `${VAULT}/${rel}`;
const markdown = (note: string, dest: string) => findLinkPlace(VAULT, NOTES, ALL, from(note), dest, dest);
const wiki = (note: string, target: string) => findLinkPlace(VAULT, NOTES, ALL, from(note), null, target);

describe("a click on a markdown link", () => {
  it("opens the note it names, from the top of the vault or from the note's folder", () => {
    expect(markdown("Inbox.md", "Projects/Plan.md")).toEqual({ filePath: from("Projects/Plan.md"), anchor: null });
    expect(markdown("Projects/Plan.md", "Deep/Spec.md")?.filePath).toBe(from("Projects/Deep/Spec.md"));
    expect(markdown("Projects/Plan.md", "./Deep/Spec")?.filePath).toBe(from("Projects/Deep/Spec.md"));
    expect(markdown("Projects/Deep/Spec.md", "../../Inbox.md")?.filePath).toBe(from("Inbox.md"));
    expect(markdown("Projects/Plan.md", "/Plan.md")?.filePath).toBe(from("Plan.md"));
    // "Plan.md" from inside Projects is the one at the top of the vault.
    expect(markdown("Projects/Deep/Spec.md", "Plan.md")?.filePath).toBe(from("Plan.md"));
    expect(markdown("Inbox.md", "Spec.md")?.filePath).toBe(from("Projects/Deep/Spec.md"));
  });

  it("goes to the heading or block the link names", () => {
    expect(markdown("Inbox.md", "Projects/Plan.md#Scope")?.anchor).toEqual({ type: "heading", text: "Scope" });
    expect(markdown("Inbox.md", "Projects/Plan.md#Next%20steps \"t\"")?.anchor).toEqual({
      type: "heading",
      text: "Next steps",
    });
    expect(markdown("Inbox.md", "Projects/Plan.md#^b1")?.anchor).toEqual({ type: "block", id: "b1" });
    expect(markdown("Inbox.md", "Notes/C%23%20basics.md#Types")).toEqual({
      filePath: from("Notes/C# basics.md"),
      anchor: { type: "heading", text: "Types" },
    });
  });

  it("stays in the note for a link to one of its own headings", () => {
    expect(markdown("Projects/Plan.md", "#Scope")).toEqual({
      filePath: from("Projects/Plan.md"),
      anchor: { type: "heading", text: "Scope" },
    });
    expect(markdown("Projects/Plan.md", "#")).toBeNull();
  });

  it("opens a file that is not a note, at its page for a PDF", () => {
    expect(markdown("Projects/Plan.md", "../attachments/paper.pdf#page=3")).toEqual({
      filePath: from("attachments/paper.pdf"),
      anchor: null,
      page: 3,
    });
    expect(markdown("Inbox.md", "attachments/team%20photo.png")?.filePath).toBe(from("attachments/team photo.png"));
    expect(markdown("Projects/Plan.md", "img/chart.png")).toEqual({
      filePath: from("Projects/img/chart.png"),
      anchor: null,
      page: undefined,
    });
  });

  it("does nothing for a link that leads nowhere", () => {
    expect(markdown("Inbox.md", "Missing.md")).toBeNull();
    expect(markdown("Inbox.md", "../Inbox.md")).toBeNull();
    expect(markdown("Inbox.md", "https://example.com/Inbox.md")).toBeNull();
  });

  it("opens a note under the path the app lists it by", () => {
    const listed = [{ filePath: "C:\\vault\\Projects\\Plan.md", relativePath: "Projects\\Plan.md" }];
    expect(
      findLinkPlace("C:\\vault", listed, ["Projects/Plan.md"], "C:\\vault\\Inbox.md", "Projects/Plan.md", "")?.filePath
    ).toBe("C:\\vault\\Projects\\Plan.md");
  });
});

describe("a click on a wiki link written from its own note", () => {
  it("opens the file at the end of the path", () => {
    expect(wiki("Projects/Plan.md", "./Deep/Spec")).toEqual({ filePath: from("Projects/Deep/Spec.md"), anchor: null });
    expect(wiki("Projects/Plan.md", "../Plan#Scope")).toEqual({
      filePath: from("Plan.md"),
      anchor: { type: "heading", text: "Scope" },
    });
    expect(wiki("Projects/Deep/Spec.md", "../img/chart.png")?.filePath).toBe(from("Projects/img/chart.png"));
    expect(wiki("Notes/C# basics.md", "./C# basics#Types")).toEqual({
      filePath: from("Notes/C# basics.md"),
      anchor: { type: "heading", text: "Types" },
    });
  });

  it("leaves every other wiki link to the app's own handler", () => {
    expect(wiki("Projects/Plan.md", "Plan")).toBeNull();
    expect(wiki("Projects/Plan.md", "Projects/Deep/Spec")).toBeNull();
    // Nothing at the end of the path: found by name, as before.
    expect(wiki("Projects/Plan.md", "./chart.png")).toBeNull();
  });
});

describe("linkOpenTag", () => {
  it("keeps the address of a web link, without its title", () => {
    expect(linkOpenTag("https://example.com/a?b=1&c=2#top")).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2#top" class="md-link">'
    );
    expect(linkOpenTag('https://example.com "Example"')).toBe('<a href="https://example.com" class="md-link">');
    expect(linkOpenTag("mailto:me@example.com")).toBe('<a href="mailto:me@example.com" class="md-link">');
  });

  it("gives a link into the vault no address the window could go to", () => {
    expect(linkOpenTag("Projects/Plan.md#Scope")).toBe('<a class="md-link" data-vault-link="Projects/Plan.md#Scope">');
    expect(linkOpenTag('my note.md "A <title>"')).toBe(
      '<a class="md-link" data-vault-link="my note.md &quot;A &lt;title&gt;&quot;">'
    );
    expect(linkOpenTag("#Scope")).toBe('<a class="md-link" data-vault-link="#Scope">');
  });
});
