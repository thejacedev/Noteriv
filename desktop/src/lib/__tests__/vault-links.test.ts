import { afterEach, describe, expect, it } from "vitest";
import { buildLinkIndex, vaultRelative, writeLink } from "../vault-links";
import { linkPrefs, setLinkPrefs } from "../vault-prefs";
import { linkMention } from "../mentions";
import { linkForAttachment } from "../attachment-utils";

describe("vaultRelative", () => {
  it("gives a file's path inside the vault", () => {
    expect(vaultRelative("/home/me/vault", "/home/me/vault/Projects/Plan.md")).toBe("Projects/Plan.md");
    expect(vaultRelative("/home/me/vault/", "/home/me/vault/Inbox.md")).toBe("Inbox.md");
    expect(vaultRelative("C:\\vault", "C:\\vault\\Projects\\Plan.md")).toBe("Projects/Plan.md");
  });

  it("gives nothing for a file outside it", () => {
    expect(vaultRelative("/home/me/vault", "/home/me/vault-2/Inbox.md")).toBeNull();
    expect(vaultRelative("/home/me/vault", "/home/me/vault")).toBeNull();
  });
});

describe("buildLinkIndex", () => {
  it("takes the notes in the app's order and the other files from the full list", () => {
    // On Windows the listing writes "\" and sorts by it: AB\Plan before A\Plan.
    const notes = [{ relativePath: "AB\\Plan.md" }, { relativePath: "A\\Plan.md" }];
    const index = buildLinkIndex(notes, ["A/Plan.md", "A/photo.png", "AB/Plan.md"]);
    expect(index.files).toEqual(["AB/Plan.md", "A/Plan.md", "A/photo.png"]);
    expect(index.note("Plan")).toBe("AB/Plan.md");
    expect(index.wiki("A/Plan.md", "photo.png")).toBe("A/photo.png");
  });
});

describe("writeLink", () => {
  const index = buildLinkIndex(
    [{ relativePath: "Inbox.md" }, { relativePath: "Projects/Deep/Spec.md" }, { relativePath: "Projects/Plan.md" }],
    ["Inbox.md", "Projects/Deep/Spec.md", "Projects/Plan.md", "attachments/photo.png"]
  );
  const vault = "/home/me/vault";
  const plan = `${vault}/Projects/Plan.md`;

  afterEach(() => setLinkPrefs({}));

  it("writes a wiki link by name unless the settings say otherwise", () => {
    expect(linkPrefs()).toEqual({ format: "shortest", wikilinks: true });
    expect(writeLink(index, vault, plan, "Projects/Deep/Spec.md")).toBe("[[Spec]]");
    expect(writeLink(index, vault, plan, "attachments/photo.png", { embed: true })).toBe("![[photo.png]]");
  });

  it("follows the format and the wikilinks setting", () => {
    setLinkPrefs({ linkFormat: "relative", useWikilinks: false });
    expect(writeLink(index, vault, plan, "Projects/Deep/Spec.md")).toBe("[Spec](Deep/Spec.md)");
    expect(writeLink(index, vault, plan, "attachments/photo.png", { embed: true })).toBe(
      "![photo.png](../attachments/photo.png)"
    );
    setLinkPrefs({ linkFormat: "absolute", useWikilinks: true });
    expect(writeLink(index, vault, plan, "Projects/Deep/Spec.md", { alias: "the spec" })).toBe(
      "[[Projects/Deep/Spec|the spec]]"
    );
  });

  it("writes from the top of the vault when the note is not known", () => {
    setLinkPrefs({ linkFormat: "relative", useWikilinks: false });
    expect(writeLink(index, vault, null, "Projects/Deep/Spec.md")).toBe("[Spec](Projects/Deep/Spec.md)");
    expect(writeLink(index, vault, "/somewhere/else.md", "Inbox.md")).toBe("[Inbox](Inbox.md)");
  });

  it("falls back to the defaults for a setting it does not know", () => {
    setLinkPrefs({ linkFormat: "sideways", useWikilinks: undefined });
    expect(linkPrefs()).toEqual({ format: "shortest", wikilinks: true });
  });

  it("embeds an attachment the editor can show in place and links the rest", () => {
    const files = buildLinkIndex(
      [{ relativePath: "Projects/Plan.md" }],
      ["Projects/Plan.md", "attachments/photo.png", "attachments/rec.webm", "attachments/paper.pdf", "attachments/data.zip"]
    );
    const at = (name: string) => ({ name, path: `${vault}/attachments/${name}` });
    expect(linkForAttachment(files, vault, plan, at("photo.png"))).toBe("![[photo.png]]");
    expect(linkForAttachment(files, vault, plan, at("rec.webm"))).toBe("![[rec.webm]]");
    expect(linkForAttachment(files, vault, plan, at("paper.pdf"))).toBe("[[paper.pdf]]");
    expect(linkForAttachment(files, vault, plan, at("data.zip"))).toBe("[[data.zip]]");

    setLinkPrefs({ linkFormat: "relative", useWikilinks: false });
    expect(linkForAttachment(files, vault, plan, at("photo.png"))).toBe("![photo.png](../attachments/photo.png)");
    // A recording only plays in place as a wiki embed.
    expect(linkForAttachment(files, vault, plan, at("rec.webm"))).toBe("![[../attachments/rec.webm]]");
    expect(linkForAttachment(files, vault, plan, at("paper.pdf"))).toBe("[paper.pdf](../attachments/paper.pdf)");
    // A file that was saved after the list was read is linked all the same.
    expect(linkForAttachment(files, vault, plan, at("new one.png"))).toBe(
      "![new one.png](../attachments/new%20one.png)"
    );
  });

  it("writes the link for a mention in the chosen format", () => {
    setLinkPrefs({ linkFormat: "shortest", useWikilinks: false });
    const write = (shown: string | undefined) => writeLink(index, vault, plan, "Inbox.md", { alias: shown });
    expect(linkMention("About Inbox today", { from: 6, to: 11 }, "Inbox", write)).toBe(
      "About [Inbox](Inbox.md) today"
    );
    expect(linkMention("About the inbox today", { from: 10, to: 15 }, "Inbox", write)).toBe(
      "About the [inbox](Inbox.md) today"
    );
  });
});
