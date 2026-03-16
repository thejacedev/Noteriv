/**
 * PDF Annotation utilities — types, load/save, and markdown export.
 */

export interface PDFAnnotation {
  id: string;
  page: number;
  type: "highlight" | "note" | "underline";
  text: string;
  comment: string;
  color: string;
  rect: { x: number; y: number; w: number; h: number };
  created: number;
}

export interface PDFAnnotationFile {
  pdfPath: string;
  annotations: PDFAnnotation[];
}

/** Derive the annotation sidecar path from a PDF path */
export function annotationPath(pdfPath: string): string {
  const dir = pdfPath.substring(0, pdfPath.lastIndexOf("/"));
  const name = pdfPath.split("/").pop() || "file.pdf";
  return `${dir}/.${name}-annotations.json`;
}

/** Load annotations from the sidecar JSON (returns empty array if none) */
export async function loadAnnotations(pdfPath: string): Promise<PDFAnnotationFile> {
  const path = annotationPath(pdfPath);
  try {
    if (!window.electronAPI) return { pdfPath, annotations: [] };
    const raw = await window.electronAPI.readFile(path);
    if (!raw) return { pdfPath, annotations: [] };
    const data = JSON.parse(raw) as PDFAnnotationFile;
    return data;
  } catch {
    return { pdfPath, annotations: [] };
  }
}

/** Save annotations to the sidecar JSON */
export async function saveAnnotations(file: PDFAnnotationFile): Promise<boolean> {
  const path = annotationPath(file.pdfPath);
  try {
    if (!window.electronAPI) return false;
    return await window.electronAPI.writeFile(path, JSON.stringify(file, null, 2));
  } catch {
    return false;
  }
}

/** Generate a markdown note from annotations */
export function annotationsToMarkdown(file: PDFAnnotationFile): string {
  const fileName = file.pdfPath.split("/").pop() || "file.pdf";
  const sorted = [...file.annotations].sort((a, b) => a.page - b.page || a.created - b.created);

  const highlights = sorted.filter((a) => a.type === "highlight");
  const notes = sorted.filter((a) => a.type === "note");
  const underlines = sorted.filter((a) => a.type === "underline");

  const lines: string[] = [];
  lines.push(`# Annotations: ${fileName}`);
  lines.push("");

  if (highlights.length > 0) {
    lines.push("## Highlights");
    lines.push("");
    for (const h of highlights) {
      lines.push(`> ${h.text} — (page ${h.page})`);
      if (h.comment) {
        lines.push("");
        lines.push(h.comment);
      }
      lines.push("");
    }
  }

  if (underlines.length > 0) {
    lines.push("## Underlines");
    lines.push("");
    for (const u of underlines) {
      lines.push(`> ${u.text} — (page ${u.page})`);
      if (u.comment) {
        lines.push("");
        lines.push(u.comment);
      }
      lines.push("");
    }
  }

  if (notes.length > 0) {
    lines.push("## Notes");
    lines.push("");
    for (const n of notes) {
      lines.push(`- ${n.text || n.comment} (page ${n.page})`);
      if (n.text && n.comment) {
        lines.push(`  ${n.comment}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** Export annotations as a linked markdown file next to the PDF */
export async function exportAnnotationsAsMarkdown(file: PDFAnnotationFile): Promise<string | null> {
  if (!window.electronAPI) return null;
  const dir = file.pdfPath.substring(0, file.pdfPath.lastIndexOf("/"));
  const baseName = (file.pdfPath.split("/").pop() || "file.pdf").replace(/\.pdf$/i, "");
  const mdPath = `${dir}/${baseName} - Annotations.md`;
  const md = annotationsToMarkdown(file);
  const success = await window.electronAPI.writeFile(mdPath, md);
  return success ? mdPath : null;
}

/** Generate a unique annotation ID */
export function generateAnnotationId(): string {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Check if a file path is a PDF */
export function isPdfFile(path: string): boolean {
  return /\.pdf$/i.test(path);
}
