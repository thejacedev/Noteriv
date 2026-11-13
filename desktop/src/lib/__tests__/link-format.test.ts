import { describe, expect, it } from "vitest";
import { formatLink, type LinkFormat, type LinkRequest } from "../link-format";
import { LinkIndex, isNotePath, parseDestination, percentDecode } from "../link-resolve";

// Two notes at the top and two in folders share the name "Plan"; "Deep/Spec"
// exists at the top and under Projects; names hold spaces, "#", "%", "|",
// brackets and parentheses; a note is called like a picture; a file has no
// extension at all.
const VAULT = [
  "Archive/Plan.md",
  "Deep/Spec.md",
  "Inbox.md",
  "Notes/100% done.md",
  "Notes/50%25 off.md",
  "Notes/C# basics.md",
  "Notes/Draft",
  "Notes/Draft.md",
  "Notes/My note (draft).md",
  "Notes/Old Style.markdown",
  "Notes/[x] (y).md",
  "Notes/a|b.md",
  "Notes/photo.png.md",
  "Plan.md",
  "Projects/Deep/Plan.md",
  "Projects/Deep/Spec.md",
  "Projects/Plan.md",
  "Projects/img/photo.png",
  "Projects/paper.pdf",
  "attachments/photo.png",
  "attachments/team photo (1).png",
  "paper.pdf",
  "Ünïcode/Café.md",
].sort();

const index = new LinkIndex(VAULT);

function link(target: string, from: string, format: LinkFormat, wikilinks: boolean, more: Partial<LinkRequest> = {}) {
  return formatLink({ target, from, files: index, format, wikilinks, ...more });
}

/**
 * What a written link is and where it leads, read with the patterns the
 * editor itself uses to find links in a line.
 */
function readBack(from: string, text: string) {
  const embed = text.startsWith("!");
  const wiki = text.match(/^!?\[\[([^\]]+)\]\]$/);
  if (wiki) {
    // As the wiki link renderer splits it: target, then "|" and what is shown.
    const parts = text.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (!parts) return null;
    const read = index.wikiLink(from, parts[1]);
    return { form: "wiki", embed, file: read?.file ?? null, fragment: read?.fragment ?? "", shown: parts[2] };
  }
  // As the link renderer finds it: text without "]", a path with at most one level of parentheses.
  const markdown = text.match(/^!?\[([^\]]+)\]\(((?:[^()]|\([^()]*\))+?)\)$/);
  if (!markdown) return null;
  const dest = parseDestination(markdown[2]);
  return {
    form: "markdown",
    embed,
    file: index.markdown(from, dest.path),
    fragment: percentDecode(dest.fragment) ?? dest.fragment,
    shown: markdown[1],
  };
}

describe("formatLink", () => {
  it("writes the bare name when that is enough, and the path when it is not", () => {
    expect(link("Inbox.md", "Projects/Plan.md", "shortest", true)).toBe("[[Inbox]]");
    // "Plan" alone is the first Plan in the listing, Archive/Plan.
    expect(link("Archive/Plan.md", "Inbox.md", "shortest", true)).toBe("[[Plan]]");
    expect(link("Projects/Plan.md", "Inbox.md", "shortest", true)).toBe("[[Projects/Plan]]");
    expect(link("attachments/photo.png", "Inbox.md", "shortest", true)).toBe("[[photo.png]]");
    expect(link("Projects/img/photo.png", "Inbox.md", "shortest", true)).toBe("[[Projects/img/photo.png]]");
    // No name and no path reaches the Plan at the top; a path from the note does.
    expect(link("Plan.md", "Inbox.md", "shortest", true)).toBe("[[./Plan]]");
    expect(link("Plan.md", "Projects/Deep/Spec.md", "shortest", true)).toBe("[[../../Plan]]");
  });

  it("writes the path from the top of the vault", () => {
    expect(link("Projects/Deep/Spec.md", "Projects/Plan.md", "absolute", true)).toBe("[[Projects/Deep/Spec]]");
    expect(link("Inbox.md", "Projects/Plan.md", "absolute", true)).toBe("[[Inbox]]");
    expect(link("Projects/Deep/Spec.md", "Projects/Plan.md", "absolute", false)).toBe(
      "[Spec](Projects/Deep/Spec.md)"
    );
    expect(link("attachments/photo.png", "Projects/Plan.md", "absolute", false, { embed: true })).toBe(
      "![photo.png](attachments/photo.png)"
    );
  });

  it("writes the path from the note's folder", () => {
    expect(link("Inbox.md", "Projects/Plan.md", "relative", false)).toBe("[Inbox](../Inbox.md)");
    expect(link("Inbox.md", "Projects/Plan.md", "relative", true)).toBe("[[../Inbox]]");
    expect(link("Projects/img/photo.png", "Projects/Plan.md", "relative", false, { embed: true })).toBe(
      "![photo.png](img/photo.png)"
    );
    expect(link("Ünïcode/Café.md", "Inbox.md", "relative", false)).toBe("[Café](%C3%9Cn%C3%AFcode/Caf%C3%A9.md)");
  });

  it("writes ./ only when the bare path would be found somewhere else", () => {
    // Deep/Spec.md exists at the top of the vault and is looked for there first.
    expect(link("Projects/Deep/Spec.md", "Projects/Plan.md", "relative", false)).toBe("[Spec](./Deep/Spec.md)");
    expect(link("Projects/Deep/Plan.md", "Projects/Plan.md", "relative", false)).toBe("[Plan](Deep/Plan.md)");
    // Beside the note, but "Plan.md" is found at the top of the vault first.
    expect(link("Projects/Deep/Plan.md", "Projects/Deep/Spec.md", "relative", false)).toBe("[Plan](./Plan.md)");
    expect(link("Notes/Draft.md", "Notes/C# basics.md", "relative", false)).toBe("[Draft](Draft.md)");
    // A wiki link's path is from the top of the vault unless it says otherwise.
    expect(link("Projects/Deep/Spec.md", "Projects/Plan.md", "relative", true)).toBe("[[./Deep/Spec]]");
    expect(link("Notes/Old Style.markdown", "Notes/Draft.md", "relative", true)).toBe("[[Old Style]]");
    expect(link("Projects/Deep/Plan.md", "Projects/Deep/Spec.md", "relative", true)).toBe("[[./Plan]]");
  });

  it("writes a markdown link with wikilinks off", () => {
    expect(link("Inbox.md", "Projects/Plan.md", "shortest", false)).toBe("[Inbox](Inbox.md)");
    expect(link("Notes/C# basics.md", "Inbox.md", "shortest", false)).toBe("[C# basics](C%23%20basics.md)");
    expect(link("Notes/100% done.md", "Inbox.md", "absolute", false)).toBe("[100% done](Notes/100%25%20done.md)");
    expect(link("Notes/My note (draft).md", "Inbox.md", "shortest", false)).toBe(
      "[My note (draft)](My%20note%20%28draft%29.md)"
    );
    expect(link("Archive/Plan.md", "Inbox.md", "shortest", false)).toBe("[Plan](Archive/Plan.md)");
    expect(link("Plan.md", "Projects/Plan.md", "shortest", false)).toBe("[Plan](Plan.md)");
  });

  it("adds a heading, a block and the text to show", () => {
    expect(link("Inbox.md", "Plan.md", "shortest", true, { fragment: "Today" })).toBe("[[Inbox#Today]]");
    expect(link("Inbox.md", "Plan.md", "shortest", true, { fragment: "#^b1", alias: "that line" })).toBe(
      "[[Inbox#^b1|that line]]"
    );
    expect(link("Inbox.md", "Plan.md", "shortest", false, { fragment: "#To do", alias: "the list" })).toBe(
      "[the list](Inbox.md#To%20do)"
    );
    expect(link("Inbox.md", "Plan.md", "shortest", false, { fragment: "^b1" })).toBe("[Inbox](Inbox.md#^b1)");
    expect(link("paper.pdf", "Plan.md", "shortest", false, { fragment: "page=3" })).toBe("[paper.pdf](paper.pdf#page=3)");
    expect(link("attachments/photo.png", "Plan.md", "shortest", true, { embed: true, alias: "160" })).toBe(
      "![[photo.png|160]]"
    );
  });

  it("keeps the wiki form for an embed the editor can only show that way", () => {
    expect(link("Inbox.md", "Plan.md", "shortest", false, { embed: true })).toBe("![[Inbox]]");
    expect(link("paper.pdf", "Plan.md", "shortest", false, { embed: true })).toBe("![[paper.pdf]]");
    expect(link("attachments/photo.png", "Plan.md", "shortest", false, { embed: true })).toBe(
      "![photo.png](photo.png)"
    );
  });

  it("falls back to a markdown link for a name a wiki link cannot hold", () => {
    expect(link("Notes/[x] (y).md", "Inbox.md", "shortest", true)).toBe("[x (y)](%5Bx%5D%20%28y%29.md)");
    expect(link("Notes/a|b.md", "Inbox.md", "shortest", true)).toBe("[a|b](a%7Cb.md)");
    // A name with "#" can be linked, but not together with a heading.
    expect(link("Notes/C# basics.md", "Inbox.md", "shortest", true)).toBe("[[C# basics]]");
    expect(link("Notes/C# basics.md", "Inbox.md", "shortest", true, { fragment: "Types" })).toBe(
      "[C# basics](C%23%20basics.md#Types)"
    );
  });

  it("keeps a note's extension when the name without it is something else", () => {
    // "photo.png" is the picture.
    expect(link("Notes/photo.png.md", "Inbox.md", "shortest", true)).toBe("[[photo.png.md]]");
    // "Draft" and "Notes/Draft" are the note. The file without an extension
    // is only reached by a path from the linking note, which is read exactly.
    expect(link("Notes/Draft.md", "Inbox.md", "shortest", true)).toBe("[[Draft]]");
    expect(link("Notes/Draft", "Inbox.md", "shortest", true)).toBe("[[./Notes/Draft]]");
    expect(link("Notes/Draft", "Inbox.md", "shortest", false)).toBe("[Draft](Notes/Draft)");
  });

  it("links a file that is not in the list yet", () => {
    expect(link("attachments/new.png", "Inbox.md", "shortest", true, { embed: true })).toBe("![[new.png]]");
    expect(link("attachments/new.png", "Projects/Plan.md", "relative", false, { embed: true })).toBe(
      "![new.png](../attachments/new.png)"
    );
    expect(formatLink({ target: "A/b.md", from: "c.md", files: ["c.md"], format: "shortest", wikilinks: true })).toBe(
      "[[b]]"
    );
  });

  // Whatever is written has to lead back to the file it was written for.
  it("always resolves back to its target", () => {
    const notes = VAULT.filter(isNotePath);
    const formats: LinkFormat[] = ["shortest", "relative", "absolute"];
    const fragments = ["", "#Scope", "#^b1", "#A heading (2) & more"];
    let checked = 0;
    for (const from of notes) {
      for (const target of VAULT) {
        for (const format of formats) {
          for (const wikilinks of [true, false]) {
            for (const embed of [false, true]) {
              for (const fragment of fragments) {
                for (const alias of [undefined, "shown text"]) {
                  const text = link(target, from, format, wikilinks, { embed, fragment, alias });
                  const where = `${text} in ${from} (${format}, wikilinks ${wikilinks}) for ${target}`;
                  const read = readBack(from, text);
                  expect(read, where).not.toBeNull();
                  expect(read?.file, where).toBe(target);
                  expect(read?.fragment, where).toBe(fragment);
                  expect(read?.embed, where).toBe(embed);
                  if (alias) expect(read?.shown, where).toBe(alias);
                  checked++;
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });

  it("writes a markdown link whenever wikilinks are off, except to embed what only a wiki link shows", () => {
    for (const from of ["Inbox.md", "Projects/Deep/Spec.md"]) {
      for (const target of VAULT) {
        for (const format of ["shortest", "relative", "absolute"] as LinkFormat[]) {
          expect(link(target, from, format, false)).not.toContain("[[");
          const embedded = link(target, from, format, false, { embed: true });
          const isImage = /\.png$/.test(target);
          const wikiCannotHoldIt = /[[\]|]/.test(target);
          expect(embedded.startsWith("![["), embedded).toBe(!isImage && !wikiCannotHoldIt);
        }
      }
    }
  });
});
