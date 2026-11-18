import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listTrash, restoreFile, trashFile } from "../trash-utils";

/** The file commands the trash uses, over a list of files kept in memory. */
function fakeFiles(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial));
  const folders: string[] = [];
  const api = {
    createDir: async (path: string) => {
      folders.push(path);
      return true;
    },
    readFile: async (path: string) => files.get(path) ?? null,
    writeFile: async (path: string, content: string) => {
      files.set(path, content);
      return true;
    },
    deleteFile: async (path: string) => files.delete(path),
    readDir: async (dir: string) =>
      [...files.keys()]
        .filter((path) => path.startsWith(`${dir}/`))
        .map((path) => ({ name: path.slice(dir.length + 1), path, isDirectory: false })),
  };
  return { files, folders, api };
}

const scope = globalThis as { window?: unknown };
const before = scope.window;

describe("the app's own trash", () => {
  let fake: ReturnType<typeof fakeFiles>;

  const use = (initial: Record<string, string>) => {
    fake = fakeFiles(initial);
    scope.window = { electronAPI: fake.api };
  };

  beforeEach(() => use({}));
  afterEach(() => {
    scope.window = before;
  });

  it("keeps a deleted note under its own name", async () => {
    use({ "/home/me/vault/Projects/Plan.md": "text" });
    expect(await trashFile("/home/me/vault", "/home/me/vault/Projects/Plan.md")).toBe(true);

    expect(fake.files.has("/home/me/vault/Projects/Plan.md")).toBe(false);
    const [item] = await listTrash("/home/me/vault");
    expect(item.fileName).toBe("Plan.md");
    expect(item.id).toMatch(/^\d+-Plan\.md$/);
    expect(item.originalPath).toBe("/home/me/vault/Projects/Plan.md");
    expect(fake.files.get(item.contentFile)).toBe("text");
  });

  it("does the same for a note on Windows", async () => {
    const vault = "D:\\a\\_temp\\vault";
    const note = `${vault}\\Projects\\A-crlf.md`;
    use({ [note]: "one\r\ntwo\r\n" });
    expect(await trashFile(vault, note)).toBe(true);

    const [item] = await listTrash(vault);
    // The name alone: a drive letter and backslashes cannot be part of a file name.
    expect(item.fileName).toBe("A-crlf.md");
    expect(item.id).toMatch(/^\d+-A-crlf\.md$/);
    expect(item.originalPath).toBe(note);
  });

  it("puts a note back where it was", async () => {
    const vault = "D:\\a\\_temp\\vault";
    const note = `${vault}\\Projects\\A-crlf.md`;
    use({ [note]: "one\r\ntwo\r\n" });
    await trashFile(vault, note);
    const [item] = await listTrash(vault);

    expect(await restoreFile(vault, item.id)).toBe(true);
    expect(fake.files.get(note)).toBe("one\r\ntwo\r\n");
    // Its folder is made again first, in case it was deleted too.
    expect(fake.folders).toContain(`${vault}\\Projects`);
    expect(await listTrash(vault)).toEqual([]);
  });

  it("makes the folder again on Linux and macOS too", async () => {
    use({ "/home/me/vault/Projects/Plan.md": "text" });
    await trashFile("/home/me/vault", "/home/me/vault/Projects/Plan.md");
    const [item] = await listTrash("/home/me/vault");

    expect(await restoreFile("/home/me/vault", item.id)).toBe(true);
    expect(fake.files.get("/home/me/vault/Projects/Plan.md")).toBe("text");
    expect(fake.folders).toContain("/home/me/vault/Projects");
  });
});
