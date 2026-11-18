import { describe, expect, it } from "vitest";
import { annotationPath, annotationsToMarkdown } from "../pdf-annotation";

describe("annotationPath", () => {
  it("is a hidden file beside the PDF", () => {
    expect(annotationPath("/home/me/vault/Papers/scan.pdf")).toBe("/home/me/vault/Papers/.scan.pdf-annotations.json");
  });

  it("stays beside the PDF on Windows", () => {
    expect(annotationPath("D:\\vault\\Papers\\scan.pdf")).toBe("D:\\vault\\Papers\\.scan.pdf-annotations.json");
    expect(annotationPath("D:\\vault/scan.pdf")).toBe("D:\\vault\\.scan.pdf-annotations.json");
  });
});

describe("annotationsToMarkdown", () => {
  it("names the PDF by its file name, not its whole path", () => {
    const markdown = annotationsToMarkdown({ pdfPath: "D:\\vault\\Papers\\scan.pdf", annotations: [] });
    expect(markdown).toContain("scan.pdf");
    expect(markdown).not.toContain("D:\\vault");
  });
});
