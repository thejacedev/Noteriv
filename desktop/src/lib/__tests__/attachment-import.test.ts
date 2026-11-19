import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importAttachment } from "../attachment-utils";

const scope = globalThis as { window?: unknown };
const before = scope.window;

describe("a file dropped on the attachment list", () => {
  let made: string[];
  let written: { path: string; base64: string }[];
  let asText: string[];

  beforeEach(() => {
    made = [];
    written = [];
    asText = [];
    scope.window = {
      electronAPI: {
        createDir: async (dir: string) => { made.push(dir); return true; },
        writeBinaryFile: async (path: string, base64: string) => { written.push({ path, base64 }); return true; },
        writeFile: async (path: string) => { asText.push(path); return true; },
      },
    };
  });
  afterEach(() => {
    scope.window = before;
  });

  it("is written as the bytes it holds, not as text about them", async () => {
    const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    const link = await importAttachment(new File([png], "shot.png", { type: "image/png" }), "/vault");

    expect(made).toEqual(["/vault/attachments"]);
    expect(asText).toEqual([]);
    expect(written).toHaveLength(1);
    expect(written[0].path).toMatch(/^\/vault\/attachments\/\d{8}-\d{6}-shot\.png$/);
    expect(written[0].base64).toBe("iVBORw0KGgo=");
    expect(link).toMatch(/^attachments\/\d{8}-\d{6}-shot\.png$/);
  });

  it("says so when the file could not be written", async () => {
    (scope.window as { electronAPI: { writeBinaryFile: unknown } }).electronAPI.writeBinaryFile = async () => false;
    await expect(importAttachment(new File(["x"], "a.txt"), "/vault")).rejects.toThrow(/Failed to import/);
  });
});
