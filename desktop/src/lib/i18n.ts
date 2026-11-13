/**
 * The language of the interface.
 *
 * English is written in the code itself and is the key: `t("Open Daily
 * Note")` looks the sentence up in the chosen language's table and falls
 * back to the English it was given. A string that nobody has translated
 * yet therefore still reads correctly, and nothing breaks when a table is
 * incomplete.
 *
 * Tables live in `src/locales/<code>.json` as { "English": "Translation" }.
 * Values that change go in braces: t("{count} notes", { count: 3 }).
 */

import de from "@/locales/de.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import ja from "@/locales/ja.json";
import ptBR from "@/locales/pt-BR.json";
import zhCN from "@/locales/zh-CN.json";

export type LanguageCode = "en" | "de" | "es" | "fr" | "ja" | "pt-BR" | "zh-CN";

type Table = Record<string, string>;

const TABLES: Record<Exclude<LanguageCode, "en">, Table> = {
  de,
  es,
  fr,
  ja,
  "pt-BR": ptBR,
  "zh-CN": zhCN,
};

/** The languages on offer, each named in its own language. */
export const LANGUAGES: { code: LanguageCode; name: string }[] = [
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "ja", name: "日本語" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "zh-CN", name: "简体中文" },
];

let current: LanguageCode = "en";
let table: Table = {};
const listeners = new Set<() => void>();

/**
 * The language to use for a setting: a language code, or "system" for the
 * one the computer is set to. A language there is no table for is English.
 */
export function resolveLanguage(setting: string | undefined, system?: readonly string[]): LanguageCode {
  const known = (code: string): LanguageCode | null => {
    const exact = LANGUAGES.find((l) => l.code.toLowerCase() === code.toLowerCase());
    if (exact) return exact.code;
    // "es-MX" is served by "es"; "pt" and "zh" by the one variety there is.
    const base = code.split("-")[0].toLowerCase();
    return LANGUAGES.find((l) => l.code.split("-")[0].toLowerCase() === base)?.code ?? null;
  };
  if (setting && setting !== "system") return known(setting) ?? "en";
  const wanted = system ?? (typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : []);
  for (const code of wanted) {
    const match = code ? known(code) : null;
    if (match) return match;
  }
  return "en";
}

/** Switch the interface to a language. Everything that reads `useLanguage` draws again. */
export function setLanguage(setting: string | undefined): void {
  const next = resolveLanguage(setting);
  if (next === current) return;
  current = next;
  table = next === "en" ? {} : TABLES[next];
  if (typeof document !== "undefined") document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}

export function currentLanguage(): LanguageCode {
  return current;
}

/** For `useSyncExternalStore`: tells a component when the language changes. */
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The text in the interface's language. `values` fill the {braces}; a
 * brace with no value is left as written.
 */
export function t(text: string, values?: Record<string, string | number>): string {
  const translated = table[text] ?? text;
  if (!values) return translated;
  return translated.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole
  );
}

/** How much of a list of English strings a language's table covers, from 0 to 1. */
export function coverage(code: LanguageCode, strings: string[]): number {
  if (code === "en" || strings.length === 0) return 1;
  const translations = TABLES[code];
  return strings.filter((s) => typeof translations[s] === "string" && translations[s] !== "").length / strings.length;
}
