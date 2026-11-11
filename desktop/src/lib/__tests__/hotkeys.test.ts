import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_HOTKEYS, isAppHotkey, setActiveHotkeys } from "../hotkeys";

function press(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: !!mods.ctrl,
    metaKey: false,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
  } as KeyboardEvent;
}

describe("isAppHotkey", () => {
  afterEach(() => setActiveHotkeys(DEFAULT_HOTKEYS));

  it("claims keys bound to app actions", () => {
    expect(isAppHotkey(press("g", { ctrl: true }))).toBe(true); // graph view
    expect(isAppHotkey(press("d", { ctrl: true }))).toBe(true); // daily note
    expect(isAppHotkey(press("G", { ctrl: true, shift: true }))).toBe(true); // sync
  });

  it("leaves find, undo and redo to the editor", () => {
    expect(isAppHotkey(press("f", { ctrl: true }))).toBe(false);
    expect(isAppHotkey(press("z", { ctrl: true }))).toBe(false);
    expect(isAppHotkey(press("Z", { ctrl: true, shift: true }))).toBe(false);
  });

  it("ignores ordinary typing and unbound combinations", () => {
    expect(isAppHotkey(press("g"))).toBe(false);
    expect(isAppHotkey(press("Enter"))).toBe(false);
    expect(isAppHotkey(press("j", { ctrl: true }))).toBe(false);
  });

  it("follows rebinding", () => {
    setActiveHotkeys(
      DEFAULT_HOTKEYS.map((b) => (b.action === "graphView" ? { ...b, keys: "Ctrl+Alt+G" } : b))
    );
    expect(isAppHotkey(press("g", { ctrl: true }))).toBe(false);
    expect(isAppHotkey(press("g", { ctrl: true, alt: true }))).toBe(true);
  });
});
