import { EditorView } from "@codemirror/view";
import { CompletionContext, autocompletion, type Completion } from "@codemirror/autocomplete";

import { loadVaultIndex } from "./vault-index";
import { isExcludedPath } from "./file-list";
import { excludedPatterns } from "./vault-prefs";
import { notePathFacet } from "./note-path";
import { LinkIndex } from "./link-resolve";
import { buildLinkIndex, writeLink } from "./vault-links";

/** A note that can be suggested: what is shown for it, and its path inside the vault. */
let cachedFiles: { label: string; target: string }[] = [];
/** Aliases, each with the note it stands for. */
let cachedAliases: { alias: string; note: string; target: string }[] = [];
/**
 * Every file in the vault, excluded ones too. A link is written by checking
 * what it would resolve to, and an excluded note can still take a name.
 */
let cachedIndex = new LinkIndex([]);
let cacheVaultPath = "";
let cacheTime = 0;
const CACHE_TTL = 5000;

const withoutNoteExt = (path: string) => path.replace(/\.(md|markdown)$/i, "");
const forwardSlashes = (path: string) => path.replace(/\\/g, "/");

async function loadFiles(vaultPath: string): Promise<void> {
  if (!window.electronAPI || !vaultPath) return;
  const now = Date.now();
  if (vaultPath === cacheVaultPath && now - cacheTime < CACHE_TTL) return;

  try {
    const [files, allFiles] = await Promise.all([
      window.electronAPI.listAllFiles(vaultPath),
      window.electronAPI.listVaultFiles(vaultPath),
    ]);
    const patterns = excludedPatterns();
    cachedIndex = buildLinkIndex(files, allFiles);
    cachedFiles = files
      .filter((f) => !isExcludedPath(f.relativePath, patterns))
      .map((f) => ({
        label: withoutNoteExt(f.relativePath),
        target: forwardSlashes(f.relativePath),
      }));
    const index = (await loadVaultIndex(vaultPath)).filter((n) => !isExcludedPath(n.relativePath, patterns));
    cachedAliases = index.flatMap((n) =>
      n.aliases.map((alias) => ({
        alias,
        note: withoutNoteExt(n.relativePath),
        target: forwardSlashes(n.relativePath),
      }))
    );
    cacheVaultPath = vaultPath;
    cacheTime = now;
  } catch {
    // ignore
  }
}

function wikilinkCompletions(vaultPath: string) {
  return async (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos);
    const textBefore = line.text.slice(0, context.pos - line.from);
    const match = textBefore.match(/\[\[([^\]]*)$/);
    if (!match) return null;

    const query = match[1].toLowerCase();
    const from = context.pos - match[1].length;

    await loadFiles(vaultPath);

    // Put a link to the note in place of everything typed for it: the `[[`,
    // the text after it and any `]]` already there. The link is written in
    // the format chosen in Settings, which may not be a `[[wiki link]]`.
    const insertLink = (target: string, alias?: string) =>
      (view: EditorView, _completion: Completion, from: number, to: number) => {
        // Count how many ] chars exist right after the cursor
        const docLen = view.state.doc.length;
        let closingBrackets = 0;
        for (let i = to; i < Math.min(to + 2, docLen); i++) {
          if (view.state.doc.sliceString(i, i + 1) === "]") closingBrackets++;
          else break;
        }
        // `from` is just after the `[[`. A `!` before that makes it an embed,
        // and the link is then written with its own `!`.
        const open = from - 2;
        const embed = open > 0 && view.state.doc.sliceString(open - 1, open) === "!";
        const insert = writeLink(cachedIndex, vaultPath, view.state.facet(notePathFacet), target, { alias, embed });
        const replaceFrom = embed ? open - 1 : open;
        view.dispatch({
          changes: { from: replaceFrom, to: to + closingBrackets, insert },
          selection: { anchor: replaceFrom + insert.length },
        });
      };

    const options: Completion[] = cachedFiles
      .filter((f) => !query || f.label.toLowerCase().includes(query))
      .slice(0, 30)
      .map((f) => ({ label: f.label, apply: insertLink(f.target) }));

    // An alias links to its note and shows the alias: [[Note|alias]].
    if (query) {
      for (const a of cachedAliases) {
        if (options.length >= 40) break;
        if (!a.alias.toLowerCase().includes(query)) continue;
        options.push({
          label: a.alias,
          detail: `alias of ${a.note}`,
          apply: insertLink(a.target, a.alias),
        });
      }
    }

    return {
      from,
      options,
      filter: false,
    };
  };
}

export function wikilinkAutocompletion(vaultPath: string) {
  return autocompletion({
    override: [wikilinkCompletions(vaultPath)],
    activateOnTyping: true,
    defaultKeymap: true,
  });
}
