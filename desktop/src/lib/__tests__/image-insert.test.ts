import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  bytesToBase64,
  dropPoint,
  extensionOf,
  fileNameOf,
  freeName,
  imageExtensionFor,
  imageInsertion,
  isImageName,
  pastedImageName,
  safeImageName,
  saveImages,
  type ImageFiles,
} from "../image-insert";

describe("names", () => {
  it("reads the last part of a path with either slash", () => {
    expect(fileNameOf("/home/me/Pictures/cat.png")).toBe("cat.png");
    expect(fileNameOf("C:\\Users\\me\\cat.png")).toBe("cat.png");
    expect(fileNameOf("cat.png")).toBe("cat.png");
  });

  it("reads the extension in lower case", () => {
    expect(extensionOf("Photo.PNG")).toBe("png");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("README")).toBe("");
    expect(extensionOf(".gitignore")).toBe("");
  });

  it("knows a picture by its name", () => {
    expect(isImageName("a.jpeg")).toBe(true);
    expect(isImageName("a.SVG")).toBe(true);
    expect(isImageName("a.pdf")).toBe(false);
    expect(isImageName("png")).toBe(false);
  });

  it("takes the extension of a clipboard file from its type first", () => {
    expect(imageExtensionFor({ name: "image.png", type: "image/png" })).toBe("png");
    expect(imageExtensionFor({ name: "whatever", type: "image/jpeg" })).toBe("jpg");
    expect(imageExtensionFor({ name: "drawing.svg", type: "IMAGE/SVG+XML" })).toBe("svg");
    expect(imageExtensionFor({ name: "photo.webp", type: "" })).toBe("webp");
    expect(imageExtensionFor({ name: "notes.txt", type: "text/plain" })).toBeNull();
    expect(imageExtensionFor({ name: "scan.tiff", type: "image/tiff" })).toBeNull();
  });

  it("names a pasted picture after the time", () => {
    expect(pastedImageName(new Date(2026, 10, 7, 9, 5, 3), "png")).toBe("pasted-image-20261107-090503.png");
  });

  it("makes a name that can stand in a link", () => {
    expect(safeImageName("photo.png")).toBe("photo.png");
    expect(safeImageName("my cat (1).png")).toBe("my-cat-1.png");
    expect(safeImageName("Screenshot 2026-11-17 at 18.52.30.PNG")).toBe("Screenshot-2026-11-17-at-18.52.30.PNG");
    expect(safeImageName("a%20b#c?.jpg")).toBe("a20bc.jpg");
    expect(safeImageName("<tag>[x]{y}.gif")).toBe("tagxy.gif");
  });

  it("keeps letters of other scripts", () => {
    expect(safeImageName("截图 2026.png")).toBe("截图-2026.png");
    expect(safeImageName("фото кота.jpg")).toBe("фото-кота.jpg");
  });

  it("gives a name to a file that is left with none", () => {
    expect(safeImageName("???.png")).toBe("image.png");
    expect(safeImageName(".hidden.png")).toBe("hidden.png");
    expect(safeImageName("  .png")).toBe("image.png");
    expect(safeImageName("")).toBe("image");
  });

  it("numbers a name that is taken, whatever its case", () => {
    expect(freeName(new Set(), "cat.png")).toBe("cat.png");
    expect(freeName(new Set(["cat.png"]), "cat.png")).toBe("cat-1.png");
    expect(freeName(new Set(["cat.png", "cat-1.png"]), "Cat.PNG")).toBe("Cat-2.PNG");
    expect(freeName(new Set(["noext"]), "noext")).toBe("noext-1");
  });
});

describe("bytesToBase64", () => {
  it("matches the platform's base64 for a picture larger than one piece", () => {
    const bytes = new Uint8Array(100_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 256;
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("handles nothing", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
  });
});

describe("dropPoint", () => {
  it("divides by the pixel ratio on Windows only", () => {
    expect(dropPoint({ x: 300, y: 150 }, "win32", 1.5)).toEqual({ x: 200, y: 100 });
    expect(dropPoint({ x: 300, y: 150 }, "linux", 2)).toEqual({ x: 300, y: 150 });
    expect(dropPoint({ x: 300, y: 150 }, "darwin", 2)).toEqual({ x: 300, y: 150 });
    // Before the platform is known, and with a ratio that makes no sense.
    expect(dropPoint({ x: 300, y: 150 }, "", 2)).toEqual({ x: 300, y: 150 });
    expect(dropPoint({ x: 300, y: 150 }, "win32", 0)).toEqual({ x: 300, y: 150 });
  });
});

/** The file calls, with the folder's contents kept in a list and every call written down. */
function fakeFiles(existing: string[] = [], refuse: (path: string) => boolean = () => false) {
  const names = [...existing];
  const calls: string[] = [];
  const written = new Map<string, string>();
  const files: ImageFiles = {
    createDir: async (dir) => { calls.push(`createDir ${dir}`); return true; },
    readDir: async (dir) => { calls.push(`readDir ${dir}`); return names.map((name) => ({ name })); },
    copyFile: async (src, dest) => {
      calls.push(`copy ${src} -> ${dest}`);
      if (refuse(src)) return false;
      names.push(dest.split("/").pop()!);
      return true;
    },
    writeBinaryFile: async (path, base64) => {
      calls.push(`write ${path}`);
      if (refuse(path)) return false;
      written.set(path, base64);
      names.push(path.split("/").pop()!);
      return true;
    },
  };
  return { files, calls, written };
}

describe("saveImages", () => {
  it("copies a file from outside the vault under its own name", async () => {
    const { files, calls } = fakeFiles();
    const links = await saveImages(files, "/vault", "attachments", [{ path: "/home/me/Pictures/cat.png" }]);
    expect(links).toEqual(["![](attachments/cat.png)"]);
    expect(calls).toEqual([
      "createDir /vault/attachments",
      "readDir /vault/attachments",
      "copy /home/me/Pictures/cat.png -> /vault/attachments/cat.png",
    ]);
  });

  it("does not write over a picture that is there, whatever its case", async () => {
    const { files, calls } = fakeFiles(["Cat.PNG"]);
    const links = await saveImages(files, "/vault", "attachments", [{ path: "/tmp/cat.png" }]);
    expect(links).toEqual(["![](attachments/cat-1.png)"]);
    expect(calls.at(-1)).toBe("copy /tmp/cat.png -> /vault/attachments/cat-1.png");
  });

  it("keeps two pictures of one name apart in a single drop", async () => {
    const { files } = fakeFiles();
    const links = await saveImages(files, "/vault", "attachments", [{ path: "/a/shot.png" }, { path: "/b/shot.png" }]);
    expect(links).toEqual(["![](attachments/shot.png)", "![](attachments/shot-1.png)"]);
  });

  it("makes the saved name safe for a link", async () => {
    const { files } = fakeFiles();
    const links = await saveImages(files, "/vault", "files", [{ path: "C:\\Users\\me\\my cat (1).png" }]);
    expect(links).toEqual(["![](files/my-cat-1.png)"]);
  });

  it("links a file that is already in the vault where it is", async () => {
    const { files, calls } = fakeFiles();
    const links = await saveImages(files, "/vault", "attachments", [{ path: "/vault/Trips/sea view.png" }]);
    expect(links).toEqual(["![](Trips/sea%20view.png)"]);
    expect(calls).toEqual([]);
  });

  it("writes clipboard bytes as base64", async () => {
    const { files, written } = fakeFiles();
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const links = await saveImages(files, "/vault", "attachments", [
      { name: "pasted-image-20261117-185230.png", bytes },
    ]);
    expect(links).toEqual(["![](attachments/pasted-image-20261117-185230.png)"]);
    expect(written.get("/vault/attachments/pasted-image-20261117-185230.png")).toBe(
      Buffer.from(bytes).toString("base64")
    );
  });

  it("leaves out a picture that could not be saved and keeps its name free", async () => {
    const { files } = fakeFiles([], (path) => path === "/x/broken.png");
    const links = await saveImages(files, "/vault", "attachments", [
      { path: "/x/broken.png" },
      { path: "/y/broken.png" },
      { path: "/y/fine.png" },
    ]);
    expect(links).toEqual(["![](attachments/broken.png)", "![](attachments/fine.png)"]);
  });

  it("carries on when the folder cannot be listed or a call throws", async () => {
    const { files } = fakeFiles();
    files.readDir = async () => { throw new Error("no"); };
    files.copyFile = async (src) => { if (src === "/a/1.png") throw new Error("gone"); return true; };
    const links = await saveImages(files, "/vault", "attachments", [{ path: "/a/1.png" }, { path: "/a/2.png" }]);
    expect(links).toEqual(["![](attachments/2.png)"]);
  });
});

describe("imageInsertion", () => {
  const stateAt = (doc: string, anchor: number, head = anchor) =>
    EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });
  const apply = (state: EditorState, links: string[], options: { at?: number; ownLine: boolean }) => {
    const spec = imageInsertion(state, links, options);
    if (!spec) return null;
    const next = state.update(spec).state;
    return { doc: next.doc.toString(), cursor: next.selection.main.head };
  };

  it("writes nothing for no pictures", () => {
    expect(imageInsertion(stateAt("abc", 1), [], { ownLine: true })).toBeNull();
  });

  it("puts the cursor on a new line below a picture that ends its line", () => {
    const result = apply(stateAt("one\n\nthree", 4), ["![](a/x.png)"], { ownLine: true });
    expect(result).toEqual({ doc: "one\n![](a/x.png)\n\nthree", cursor: 17 });
  });

  it("does so at the end of the note too", () => {
    const result = apply(stateAt("one", 3), ["![](a/x.png)"], { ownLine: true });
    expect(result).toEqual({ doc: "one![](a/x.png)\n", cursor: 16 });
  });

  it("keeps a picture in the middle of a line inside it", () => {
    const result = apply(stateAt("see  here", 4), ["![](a/x.png)"], { ownLine: true });
    expect(result).toEqual({ doc: "see ![](a/x.png) here", cursor: 16 });
  });

  it("treats spaces before the end of the line as the end", () => {
    const result = apply(stateAt("one  \ntwo", 3), ["![](a/x.png)"], { ownLine: true });
    expect(result).toEqual({ doc: "one![](a/x.png)\n  \ntwo", cursor: 16 });
  });

  it("replaces the selection", () => {
    const result = apply(stateAt("one OLD two", 4, 7), ["![](a/x.png)"], { ownLine: true });
    expect(result).toEqual({ doc: "one ![](a/x.png) two", cursor: 16 });
  });

  it("writes several pictures one to a line", () => {
    const result = apply(stateAt("", 0), ["![](a/1.png)", "![](a/2.png)"], { ownLine: true });
    expect(result).toEqual({ doc: "![](a/1.png)\n![](a/2.png)\n", cursor: 26 });
  });

  it("goes in at the place given, not at the cursor, and leaves the selection's text alone", () => {
    const result = apply(stateAt("one OLD two\nlast", 4, 7), ["![](a/x.png)"], { at: 16, ownLine: true });
    expect(result).toEqual({ doc: "one OLD two\nlast![](a/x.png)\n", cursor: 29 });
  });

  it("keeps a place that is past the end inside the note", () => {
    const result = apply(stateAt("one", 0), ["![](a/x.png)"], { at: 999, ownLine: false });
    expect(result).toEqual({ doc: "one![](a/x.png)", cursor: 15 });
  });

  it("leaves the cursor behind the link where no pictures are shown", () => {
    const result = apply(stateAt("one\n\nthree", 4), ["![](a/x.png)"], { ownLine: false });
    expect(result).toEqual({ doc: "one\n![](a/x.png)\nthree", cursor: 16 });
  });
});
