import { afterEach, describe, expect, it } from "vitest";
import { LANGUAGES, coverage, currentLanguage, resolveLanguage, setLanguage, subscribeLanguage, t } from "../i18n";

afterEach(() => setLanguage("en"));

describe("resolveLanguage", () => {
  it("takes a chosen language, and English for one there is no table for", () => {
    expect(resolveLanguage("fr")).toBe("fr");
    expect(resolveLanguage("pt-br")).toBe("pt-BR");
    expect(resolveLanguage("xx")).toBe("en");
    expect(resolveLanguage("en")).toBe("en");
  });

  it("follows the system, by exact code first and then by language", () => {
    expect(resolveLanguage("system", ["de-AT", "en-US"])).toBe("de");
    expect(resolveLanguage("system", ["pt-PT"])).toBe("pt-BR");
    expect(resolveLanguage("system", ["zh-TW", "ja"])).toBe("zh-CN");
    expect(resolveLanguage(undefined, ["nl-NL", "es-MX"])).toBe("es");
    expect(resolveLanguage("system", ["nl-NL"])).toBe("en");
    expect(resolveLanguage("system", [])).toBe("en");
  });
});

describe("t", () => {
  it("gives the English it was handed when nothing is translated", () => {
    expect(t("A sentence nobody has translated")).toBe("A sentence nobody has translated");
    expect(t("{count} notes", { count: 3 })).toBe("3 notes");
    expect(t("{a} and {b}", { a: "x" })).toBe("x and {b}");
  });

  it("tells its listeners when the language changes, and only then", () => {
    let calls = 0;
    const stop = subscribeLanguage(() => calls++);
    setLanguage("es");
    expect(currentLanguage()).toBe("es");
    setLanguage("es");
    expect(calls).toBe(1);
    stop();
    setLanguage("fr");
    expect(calls).toBe(1);
  });

  it("names every language in its own words and measures coverage", () => {
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(LANGUAGES.length);
    expect(coverage("en", ["anything"])).toBe(1);
    expect(coverage("de", [])).toBe(1);
    expect(coverage("de", ["A sentence nobody has translated"])).toBe(0);
  });
});
