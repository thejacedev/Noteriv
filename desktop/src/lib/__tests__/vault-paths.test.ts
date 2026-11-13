import { describe, expect, it } from "vitest";
import { fromVaultRelative, isAbsolutePath, toVaultRelative } from "../vault-paths";

describe("vault paths", () => {
  it("gives a path from the top of the vault", () => {
    expect(toVaultRelative("/v/Notes/A.md", "/v")).toBe("Notes/A.md");
    expect(toVaultRelative("/v/Notes/A.md", "/v/")).toBe("Notes/A.md");
    expect(toVaultRelative("C:\\Vault\\Notes\\A.md", "C:\\Vault")).toBe("Notes/A.md");
    expect(toVaultRelative("/v", "/v")).toBeNull();
    expect(toVaultRelative("/vault2/A.md", "/v")).toBeNull();
    expect(toVaultRelative("/other/A.md", "/v")).toBeNull();
  });

  it("builds the full path the way the vault's path is written", () => {
    expect(fromVaultRelative("Notes/A.md", "/v")).toBe("/v/Notes/A.md");
    expect(fromVaultRelative("Notes/A.md", "C:\\Vault")).toBe("C:\\Vault\\Notes\\A.md");
    expect(fromVaultRelative("Notes\\A.md", "/v/")).toBe("/v/Notes/A.md");
    expect(fromVaultRelative("./A.md", "/v")).toBe("/v/A.md");
  });

  it("refuses a path that leaves the vault", () => {
    expect(fromVaultRelative("../A.md", "/v")).toBeNull();
    expect(fromVaultRelative("Notes/../../A.md", "/v")).toBeNull();
    expect(fromVaultRelative("/etc/passwd", "/v")).toBeNull();
    expect(fromVaultRelative("C:\\Windows\\x", "/v")).toBeNull();
    expect(fromVaultRelative("", "/v")).toBeNull();
  });

  it("tells a full path from one inside the vault", () => {
    expect(isAbsolutePath("/a/b")).toBe(true);
    expect(isAbsolutePath("C:\\a")).toBe(true);
    expect(isAbsolutePath("\\\\server\\share")).toBe(true);
    expect(isAbsolutePath("Notes/A.md")).toBe(false);
  });
});
