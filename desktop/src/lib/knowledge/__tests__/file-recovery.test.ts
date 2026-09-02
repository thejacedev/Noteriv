import { afterEach, describe, expect, it, vi } from "vitest";
import { getSnapshots, snapshotPrefix } from "../../file-recovery";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recovery snapshot identity", () => {
  it("does not collapse path separators into literal double underscores", () => {
    expect(snapshotPrefix("/vault/A/B.md", "/vault"))
      .not.toBe(snapshotPrefix("/vault/A__B.md", "/vault"));
  });

  it("recognizes Windows vault roots without case-sensitive prefix matching", () => {
    expect(snapshotPrefix("C:\\Vault\\Notes\\One.md", "c:\\vault"))
      .toBe(snapshotPrefix("Notes/One.md", ""));
  });

  it("does not expose ambiguous legacy snapshots", async () => {
    vi.stubGlobal("window", {
      electronAPI: {
        readDir: vi.fn().mockResolvedValue([
          { name: "A__B-1690000000000.md", path: "/vault/.noteriv/snapshots/A__B-1690000000000.md", isDirectory: false },
        ]),
        readFile: vi.fn().mockResolvedValue("# Wrong note\n"),
      },
    });

    await expect(getSnapshots("/vault", "/vault/A/B.md")).resolves.toEqual([]);
  });

  it("does not treat a longer legacy prefix as the requested note", async () => {
    vi.stubGlobal("window", {
      electronAPI: {
        readDir: vi.fn().mockResolvedValue([
          { name: "Foo-123-1690000000000.md", path: "/vault/.noteriv/snapshots/Foo-123-1690000000000.md", isDirectory: false },
        ]),
        readFile: vi.fn().mockResolvedValue("# Wrong note\n"),
      },
    });

    await expect(getSnapshots("/vault", "/vault/Foo.md")).resolves.toEqual([]);
  });

  it("keeps unambiguous root-level legacy snapshots available", async () => {
    vi.stubGlobal("window", {
      electronAPI: {
        readDir: vi.fn().mockResolvedValue([
          { name: "Foo-1690000000000.md", path: "/vault/.noteriv/snapshots/Foo-1690000000000.md", isDirectory: false },
        ]),
        readFile: vi.fn().mockResolvedValue("# Previous version\n"),
      },
    });

    await expect(getSnapshots("/vault", "/vault/Foo.md")).resolves.toEqual([
      {
        timestamp: 1690000000000,
        path: "/vault/.noteriv/snapshots/Foo-1690000000000.md",
        size: 19,
      },
    ]);
  });
});
