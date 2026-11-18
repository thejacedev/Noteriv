import { describe, expect, it } from "vitest";
import {
  ancestorFoldersOf,
  childPath,
  fileNameOf,
  isInsideFolder,
  isWindowsPath,
  listedPath,
  listedPaths,
  noteTitleOf,
  parentFolderOf,
  pathAfterRename,
  siblingPath,
} from "../file-path";

// The path a note had on the Windows machine where its title showed the
// whole path instead of the name.
const WINDOWS_NOTE = "D:\\a\\_temp\\vault\\A-crlf.md";

describe("isWindowsPath", () => {
  it("knows a drive and a network share", () => {
    expect(isWindowsPath("C:\\Notes\\Plan.md")).toBe(true);
    expect(isWindowsPath("c:/Notes/Plan.md")).toBe(true);
    expect(isWindowsPath("D:")).toBe(true);
    expect(isWindowsPath("\\\\server\\share\\Plan.md")).toBe(true);
  });

  it("leaves every other path alone", () => {
    expect(isWindowsPath("/home/me/Plan.md")).toBe(false);
    expect(isWindowsPath("Projects/Plan.md")).toBe(false);
    expect(isWindowsPath("Plan.md")).toBe(false);
    expect(isWindowsPath("a\\b.md")).toBe(false);
    expect(isWindowsPath("")).toBe(false);
  });
});

describe("fileNameOf", () => {
  it("takes the last part, whichever way the slashes lean", () => {
    expect(fileNameOf("/home/me/Pictures/cat.png")).toBe("cat.png");
    expect(fileNameOf("C:\\Users\\me\\cat.png")).toBe("cat.png");
    expect(fileNameOf(WINDOWS_NOTE)).toBe("A-crlf.md");
    expect(fileNameOf("\\\\server\\share\\Plan.md")).toBe("Plan.md");
    expect(fileNameOf("cat.png")).toBe("cat.png");
  });

  it("reads a Windows path the app joined with a forward slash", () => {
    expect(fileNameOf("D:\\vault/New.md")).toBe("New.md");
    expect(fileNameOf("D:\\vault/sub\\New.md")).toBe("New.md");
  });

  it("keeps a backslash that is part of a name on Linux and macOS", () => {
    expect(fileNameOf("/home/me/vault/a\\b.md")).toBe("a\\b.md");
  });

  it("is empty for a path that ends in a separator", () => {
    expect(fileNameOf("/home/me/")).toBe("");
    expect(fileNameOf("C:\\Notes\\")).toBe("");
  });
});

describe("noteTitleOf", () => {
  it("is the file name without the note extension", () => {
    expect(noteTitleOf(WINDOWS_NOTE)).toBe("A-crlf");
    expect(noteTitleOf("/home/me/vault/Plan.md")).toBe("Plan");
    expect(noteTitleOf("/home/me/vault/Plan.MARKDOWN")).toBe("Plan");
    expect(noteTitleOf("C:\\Notes\\Plan.markdown")).toBe("Plan");
  });

  it("keeps any other extension", () => {
    expect(noteTitleOf("C:\\Notes\\scan.pdf")).toBe("scan.pdf");
    expect(noteTitleOf("/home/me/v1.2.md")).toBe("v1.2");
  });
});

describe("parentFolderOf", () => {
  it("is the folder without a separator at the end", () => {
    expect(parentFolderOf(WINDOWS_NOTE)).toBe("D:\\a\\_temp\\vault");
    expect(parentFolderOf("/home/me/vault/Plan.md")).toBe("/home/me/vault");
    expect(parentFolderOf("D:\\vault/New.md")).toBe("D:\\vault");
    expect(parentFolderOf("\\\\server\\share\\Plan.md")).toBe("\\\\server\\share");
  });

  it("is empty at the very top and for a bare name", () => {
    expect(parentFolderOf("/Plan.md")).toBe("");
    expect(parentFolderOf("Plan.md")).toBe("");
  });

  it("is the drive for a file at the top of a drive", () => {
    expect(parentFolderOf("D:\\Plan.md")).toBe("D:");
  });

  it("does not cut at a backslash on Linux and macOS", () => {
    expect(parentFolderOf("/home/me/vault/a\\b.md")).toBe("/home/me/vault");
  });
});

describe("ancestorFoldersOf", () => {
  it("lists the folders above a file, nearest first", () => {
    expect(ancestorFoldersOf("/home/me/vault/sub/Plan.md")).toEqual(["/home/me/vault/sub", "/home/me/vault", "/home/me", "/home"]);
    expect(ancestorFoldersOf("D:\\vault\\sub\\Plan.md")).toEqual(["D:\\vault\\sub", "D:\\vault", "D:"]);
  });

  it("is empty for a bare name", () => {
    expect(ancestorFoldersOf("Plan.md")).toEqual([]);
  });
});

describe("childPath", () => {
  it("joins the way the folder is written", () => {
    expect(childPath("D:\\a\\_temp\\vault", "New.md")).toBe("D:\\a\\_temp\\vault\\New.md");
    expect(childPath("/home/me/vault", "New.md")).toBe("/home/me/vault/New.md");
    // The system joins with a backslash even when the folder was typed with forward slashes.
    expect(childPath("C:/Notes", "New.md")).toBe("C:/Notes\\New.md");
    expect(childPath("\\\\server\\share", "New.md")).toBe("\\\\server\\share\\New.md");
  });

  it("does not double a separator the folder ends in", () => {
    expect(childPath("D:\\", "New.md")).toBe("D:\\New.md");
    expect(childPath("D:\\vault\\", "New.md")).toBe("D:\\vault\\New.md");
    expect(childPath("/home/me/vault/", "New.md")).toBe("/home/me/vault/New.md");
  });

  it("puts a file at the top when there is no folder", () => {
    expect(childPath("D:", "New.md")).toBe("D:\\New.md");
    expect(childPath("", "New.md")).toBe("/New.md");
    expect(childPath("/", "New.md")).toBe("/New.md");
  });

  it("gives back the path a file was taken apart from", () => {
    for (const path of [WINDOWS_NOTE, "/home/me/vault/Plan.md", "D:\\Plan.md", "/Plan.md", "\\\\server\\share\\Plan.md"]) {
      expect(childPath(parentFolderOf(path), fileNameOf(path))).toBe(path);
    }
  });
});

describe("siblingPath", () => {
  it("renames a note where it is", () => {
    expect(siblingPath(WINDOWS_NOTE, "Renamed.md")).toBe("D:\\a\\_temp\\vault\\Renamed.md");
    expect(siblingPath("/home/me/vault/Plan.md", "Renamed.md")).toBe("/home/me/vault/Renamed.md");
  });

  it("stays in the vault for a note the app made with a forward slash", () => {
    expect(siblingPath("D:\\vault/New.md", "Renamed.md")).toBe("D:\\vault\\Renamed.md");
  });
});

describe("renaming and moving a note", () => {
  // What the title and the sidebar do: keep the folder, change the name.
  it("renames the note from the Windows run in its own folder", () => {
    const newName = "Renamed" + (fileNameOf(WINDOWS_NOTE).match(/\.(md|markdown)$/i)?.[0] ?? "");
    expect(childPath(parentFolderOf(WINDOWS_NOTE), newName)).toBe("D:\\a\\_temp\\vault\\Renamed.md");
  });

  // What a drag onto a folder does: keep the name, change the folder.
  it("moves a note into a folder under its own name", () => {
    expect(childPath("D:\\a\\_temp\\vault\\Projects", fileNameOf(WINDOWS_NOTE))).toBe("D:\\a\\_temp\\vault\\Projects\\A-crlf.md");
    expect(childPath("/home/me/vault/Projects", fileNameOf("/home/me/vault/Plan.md"))).toBe("/home/me/vault/Projects/Plan.md");
  });

  it("knows a note is already in the folder it is dropped on", () => {
    expect(parentFolderOf(WINDOWS_NOTE)).toBe("D:\\a\\_temp\\vault");
  });
});

describe("isInsideFolder", () => {
  it("finds what is inside a folder", () => {
    expect(isInsideFolder("D:\\vault\\Projects\\Plan.md", "D:\\vault\\Projects")).toBe(true);
    expect(isInsideFolder("D:\\vault\\Projects/Plan.md", "D:\\vault\\Projects")).toBe(true);
    expect(isInsideFolder("/home/me/vault/Projects/Plan.md", "/home/me/vault/Projects")).toBe(true);
    expect(isInsideFolder("/home/me/vault/Projects/a/b/Plan.md", "/home/me/vault/Projects")).toBe(true);
  });

  it("leaves out the folder itself and a neighbour with a longer name", () => {
    expect(isInsideFolder("D:\\vault\\Projects", "D:\\vault\\Projects")).toBe(false);
    expect(isInsideFolder("D:\\vault\\Projects2\\Plan.md", "D:\\vault\\Projects")).toBe(false);
    expect(isInsideFolder("/home/me/vault/Projects2/Plan.md", "/home/me/vault/Projects")).toBe(false);
  });

  it("does not take a backslash in a name for a folder on Linux and macOS", () => {
    expect(isInsideFolder("/home/me/vault/a\\b.md", "/home/me/vault/a")).toBe(false);
  });

  it("holds nothing when there is no folder", () => {
    expect(isInsideFolder("/home/me/Plan.md", "")).toBe(false);
  });
});

describe("pathAfterRename", () => {
  it("moves the thing that was renamed", () => {
    expect(pathAfterRename(WINDOWS_NOTE, WINDOWS_NOTE, "D:\\a\\_temp\\vault\\B.md")).toBe("D:\\a\\_temp\\vault\\B.md");
  });

  it("moves what is inside a renamed folder", () => {
    expect(pathAfterRename("D:\\vault\\Old\\sub\\Plan.md", "D:\\vault\\Old", "D:\\vault\\New")).toBe("D:\\vault\\New\\sub\\Plan.md");
    expect(pathAfterRename("/home/me/vault/Old/Plan.md", "/home/me/vault/Old", "/home/me/vault/New")).toBe("/home/me/vault/New/Plan.md");
  });

  it("leaves everything else where it is", () => {
    expect(pathAfterRename("D:\\vault\\Older\\Plan.md", "D:\\vault\\Old", "D:\\vault\\New")).toBe("D:\\vault\\Older\\Plan.md");
    expect(pathAfterRename("/home/me/vault/Other.md", "/home/me/vault/Old", "/home/me/vault/New")).toBe("/home/me/vault/Other.md");
  });

  it("changes the folder once when its name comes up again further down", () => {
    expect(pathAfterRename("/v/a/a/Plan.md", "/v/a", "/v/b")).toBe("/v/b/a/Plan.md");
  });
});

describe("listedPath", () => {
  // The two paths 3.0.5 saved for one note: made with Ctrl+N, then clicked in the file list.
  const root = "D:\\a\\_temp\\vault-up";

  it("writes a path the app built with a forward slash the way the file list does", () => {
    expect(listedPath(`${root}/Untitled.md`, root)).toBe(`${root}\\Untitled.md`);
    expect(listedPath(`${root}/Daily/2026-11-18.md`, root)).toBe(`${root}\\Daily\\2026-11-18.md`);
    expect(listedPath(`${root}\\Projects/Plan.md`, root)).toBe(`${root}\\Projects\\Plan.md`);
  });

  it("leaves a path from the file list as it is", () => {
    expect(listedPath(`${root}\\Untitled.md`, root)).toBe(`${root}\\Untitled.md`);
  });

  it("keeps the root as it is written", () => {
    expect(listedPath("C:/Notes/sub/Plan.md", "C:/Notes")).toBe("C:/Notes\\sub\\Plan.md");
    expect(listedPath("D:/Plan.md", "D:\\")).toBe("D:\\Plan.md");
  });

  it("leaves a path outside the root alone", () => {
    expect(listedPath("E:\\other/Plan.md", root)).toBe("E:\\other/Plan.md");
    expect(listedPath(`${root}2/Plan.md`, root)).toBe(`${root}2/Plan.md`);
  });

  it("changes nothing on Linux and macOS", () => {
    expect(listedPath("/home/me/vault/a\\b.md", "/home/me/vault")).toBe("/home/me/vault/a\\b.md");
    expect(listedPath("/home/me/vault/sub/Plan.md", "/home/me/vault")).toBe("/home/me/vault/sub/Plan.md");
  });
});

describe("listedPaths", () => {
  it("keeps one tab for a note that was saved under two paths", () => {
    const root = "D:\\a\\_temp\\vault-up";
    expect(listedPaths([`${root}\\A-crlf.md`, `${root}/Untitled.md`, `${root}\\Untitled.md`], root)).toEqual([
      `${root}\\A-crlf.md`,
      `${root}\\Untitled.md`,
    ]);
  });

  it("keeps every tab on Linux and macOS", () => {
    const tabs = ["/home/me/vault/A.md", "/home/me/vault/sub/B.md"];
    expect(listedPaths(tabs, "/home/me/vault")).toEqual(tabs);
  });
});
