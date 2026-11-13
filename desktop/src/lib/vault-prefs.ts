/**
 * Settings that code far from the settings screen needs to read: the link
 * autocomplete, the embed renderer and the attachment helpers are not React
 * components and cannot be handed props. The app sets these whenever its
 * settings load or change.
 */

import { parseExcludedPatterns } from "./file-list";

let excluded: string[] = [];
let attachmentFolder = "attachments";

export function setVaultPrefs(prefs: { excludedFiles?: string; attachmentFolder?: string }): void {
  excluded = parseExcludedPatterns(prefs.excludedFiles);
  const folder = (prefs.attachmentFolder ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  // A folder that points outside the vault is not one to write files into.
  attachmentFolder = folder && !folder.split("/").includes("..") ? folder : "attachments";
}

/** The "Excluded files" patterns, parsed. */
export function excludedPatterns(): string[] {
  return excluded;
}

/** The folder inside the vault that new attachments are saved to. */
export function attachmentFolderName(): string {
  return attachmentFolder;
}
