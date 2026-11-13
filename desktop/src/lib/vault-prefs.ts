/**
 * Settings that code far from the settings screen needs to read: the link
 * autocomplete, the embed renderer and the attachment helpers are not React
 * components and cannot be handed props. The app sets these whenever its
 * settings load or change.
 */

import { parseExcludedPatterns } from "./file-list";
import type { LinkFormat } from "./link-format";

let excluded: string[] = [];
let attachmentFolder = "attachments";
let linkFormat: LinkFormat = "shortest";
let useWikilinks = true;

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

/** Kept apart from `setVaultPrefs`, which resets whatever it is not given. */
export function setLinkPrefs(prefs: { linkFormat?: string; useWikilinks?: boolean }): void {
  // A settings file from elsewhere may hold anything.
  linkFormat = prefs.linkFormat === "relative" || prefs.linkFormat === "absolute" ? prefs.linkFormat : "shortest";
  useWikilinks = prefs.useWikilinks !== false;
}

/** How a new link is written: "New link format" and "Use [[Wikilinks]]". */
export function linkPrefs(): { format: LinkFormat; wikilinks: boolean } {
  return { format: linkFormat, wikilinks: useWikilinks };
}
