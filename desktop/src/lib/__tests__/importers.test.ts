import { describe, expect, it } from "vitest";
import { IMPORT_FORMATS, defaultImportFolder, importSummary } from "../importers";

describe("import formats", () => {
  it("names every format once and gives each a way to be chosen", () => {
    const kinds = IMPORT_FORMATS.map((f) => f.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const format of IMPORT_FORMATS) {
      expect(format.fileTypes.length > 0 || format.folder).toBe(true);
      expect(format.howTo.length).toBeGreaterThan(20);
    }
  });

  it("puts an import in a folder named after where it came from", () => {
    expect(defaultImportFolder(IMPORT_FORMATS[0])).toBe("Imported/Evernote");
  });
});

describe("importSummary", () => {
  const base = { ok: true, error: null, skipped: [], folder: "Imported/Notion" };

  it("counts notes and attachments", () => {
    expect(importSummary({ ...base, notes: 1, attachments: 0 })).toBe("Imported 1 note into Imported/Notion.");
    expect(importSummary({ ...base, notes: 12, attachments: 3 })).toBe(
      "Imported 12 notes and 3 attachments into Imported/Notion."
    );
  });

  it("says when something was left out", () => {
    const skipped = [{ name: "a", reason: "x" }];
    expect(importSummary({ ...base, notes: 2, attachments: 1, skipped })).toBe(
      "Imported 2 notes and 1 attachment into Imported/Notion. 1 item was left out."
    );
    expect(importSummary({ ...base, notes: 2, attachments: 0, skipped: [...skipped, ...skipped], folder: "" })).toBe(
      "Imported 2 notes into the vault. 2 items were left out."
    );
  });

  it("says so when there was nothing to import", () => {
    expect(importSummary({ ...base, notes: 0, attachments: 0 })).toBe(
      "Nothing was imported: no notes were found in what you chose."
    );
    expect(importSummary({ ...base, notes: 0, attachments: 0, skipped: [{ name: "a", reason: "x" }] })).toBe(
      "Nothing was imported. 1 item was left out."
    );
  });
});
