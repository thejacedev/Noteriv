import { describe, expect, it } from "vitest";
import base from "../../../src-tauri/tauri.conf.json";
import windows from "../../../src-tauri/tauri.windows.conf.json";

// `tauri.windows.conf.json` is laid over `tauri.conf.json` when the app is
// built for Windows. A list in it replaces the list under it, so the main
// window is written out a second time there. This keeps the two the same.
describe("the Windows settings", () => {
  it("repeat every window as it is, with the app's own file drop off", () => {
    expect(windows.app.windows).toEqual(base.app.windows.map((w) => ({ ...w, dragDropEnabled: false })));
  });

  it("change nothing else", () => {
    expect(Object.keys(windows).sort()).toEqual(["$schema", "app"]);
    expect(Object.keys(windows.app)).toEqual(["windows"]);
  });

  it("leave the app's own file drop on everywhere else", () => {
    for (const w of base.app.windows) expect("dragDropEnabled" in w).toBe(false);
  });
});
