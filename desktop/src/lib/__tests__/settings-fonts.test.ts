import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  EDITOR_FONTS,
  TEXT_FONTS,
  codeFontStack,
  mergeSettings,
  textFontStack,
} from "../settings";

const fontsCss = readFileSync(path.resolve(__dirname, "../../app/fonts.css"), "utf8");
/** The families the app ships with, read from the rules it loads. */
const shipped = new Set([...fontsCss.matchAll(/font-family: '([^']+)'/g)].map((m) => m[1]));

describe("fonts the app ships", () => {
  it("ships the two fonts its styles name", () => {
    expect([...shipped].sort()).toEqual(["Inter", "JetBrains Mono"]);
  });

  it("has upright and italic rules for each, and every file is there", () => {
    for (const family of shipped) {
      const rules = fontsCss.split("@font-face").filter((rule) => rule.includes(`font-family: '${family}'`));
      expect(rules.some((rule) => rule.includes("font-style: normal"))).toBe(true);
      expect(rules.some((rule) => rule.includes("font-style: italic"))).toBe(true);
    }
    const files = [...fontsCss.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      // Reading throws for a file the package no longer has.
      expect(readFileSync(path.resolve(__dirname, "../../app", file)).length).toBeGreaterThan(1000);
    }
  });

  it("defaults to fonts that are shipped", () => {
    expect(shipped.has(DEFAULT_SETTINGS.editorFont)).toBe(true);
    expect(shipped.has(DEFAULT_SETTINGS.textFont)).toBe(true);
  });
});

describe("codeFontStack", () => {
  it("never ends in a bare monospace before a shipped or system font was tried", () => {
    // A Mac's bare `monospace` is a typewriter face; every choice has to pass
    // the shipped font or the system's own monospace first (issue 56).
    for (const { value } of EDITOR_FONTS) {
      const stack = codeFontStack(value);
      expect(stack.endsWith("monospace")).toBe(true);
      expect(/'JetBrains Mono'|ui-monospace/.test(stack)).toBe(true);
    }
  });

  it("puts the chosen font first and the shipped one behind it", () => {
    expect(codeFontStack("Fira Code")).toMatch(/^'Fira Code', 'JetBrains Mono', /);
    expect(codeFontStack("JetBrains Mono")).toMatch(/^'JetBrains Mono', ui-monospace/);
    expect(codeFontStack("SF Mono")).toMatch(/^ui-monospace, 'SF Mono', 'JetBrains Mono'/);
    expect(codeFontStack("monospace")).toMatch(/^ui-monospace, /);
    expect(codeFontStack("monospace")).not.toContain("JetBrains");
  });

  it("reads a missing choice as the default and keeps a name from breaking out of its quotes", () => {
    expect(codeFontStack("")).toBe(codeFontStack("JetBrains Mono"));
    expect(codeFontStack("x'; color: red; '")).toMatch(/^'x color: red ', 'JetBrains Mono'/);
  });
});

describe("textFontStack", () => {
  it("sets note text in Inter unless another choice was made", () => {
    expect(textFontStack("Inter", "JetBrains Mono")).toMatch(/^'Inter', system-ui/);
    expect(textFontStack("something old", "JetBrains Mono")).toBe(textFontStack("Inter", "JetBrains Mono"));
    expect(textFontStack("system", "JetBrains Mono")).toMatch(/^system-ui/);
    expect(textFontStack("serif", "JetBrains Mono")).toMatch(/serif$/);
  });

  it("the monospace choice is the code font, whatever that is", () => {
    for (const { value } of EDITOR_FONTS) {
      expect(textFontStack("mono", value)).toBe(codeFontStack(value));
    }
  });

  it("offers each choice once", () => {
    expect(new Set(TEXT_FONTS.map((f) => f.value)).size).toBe(TEXT_FONTS.length);
    expect(TEXT_FONTS[0].value).toBe(DEFAULT_SETTINGS.textFont);
  });
});

describe("settings saved before the text font existed", () => {
  it("get the default text font and keep their code font", () => {
    const merged = mergeSettings({ editorFont: "Fira Code", fontSize: 17 });
    expect(merged.textFont).toBe("Inter");
    expect(merged.editorFont).toBe("Fira Code");
    expect(merged.fontSize).toBe(17);
  });
});
