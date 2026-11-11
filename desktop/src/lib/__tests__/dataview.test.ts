import { describe, expect, it } from "vitest";
import { executeQuery, parseNoteData, parseQuery, type DataviewQuery } from "../dataview";

const stats = { created: "", modified: "", size: 0 };

function note(relativePath: string, content = "") {
  return parseNoteData(`/home/me/Vault/${relativePath}`, content, stats, relativePath);
}

function run(query: string, notes: ReturnType<typeof note>[]) {
  const parsed = parseQuery(query);
  if ("error" in parsed) throw new Error(parsed.error);
  return executeQuery(parsed as DataviewQuery, notes);
}

describe("dataview FROM \"folder\"", () => {
  const notes = [
    note("Home.md"),
    note("Projects/Alpha.md", "---\nstatus: active\n---\n# Alpha"),
    note("Projects/Archive/Beta.md", "---\nstatus: done\n---\n# Beta"),
    note("ProjectsOld/Gamma.md"),
  ];

  it("keeps the folder relative to the vault", () => {
    expect(notes.map((n) => n.file.folder)).toEqual(["", "Projects", "Projects/Archive", "ProjectsOld"]);
    expect(notes[1].file.path).toBe("/home/me/Vault/Projects/Alpha.md");
  });

  it("matches notes in the folder and its subfolders only", () => {
    const result = run('LIST FROM "Projects"', notes);
    expect(result.rows.map((r) => r["file.name"]).sort()).toEqual(["Alpha", "Beta"]);
  });

  it("reads frontmatter fields for a TABLE", () => {
    const result = run('TABLE file.name, status FROM "Projects"', notes);
    const byName = Object.fromEntries(result.rows.map((r) => [r["file.name"], r.status]));
    expect(byName).toEqual({ Alpha: "active", Beta: "done" });
  });

  it("ignores case and surrounding slashes in the folder", () => {
    expect(run('LIST FROM "/projects/archive/"', notes).rows.map((r) => r["file.name"])).toEqual(["Beta"]);
  });

  it("accepts Windows separators in the relative path", () => {
    const win = parseNoteData("C:\\Vault\\Projects\\Delta.md", "", stats, "Projects\\Delta.md");
    expect(win.file.folder).toBe("Projects");
    expect(win.file.name).toBe("Delta");
    expect(run('LIST FROM "Projects"', [win]).rows).toHaveLength(1);
  });
});
