import { EditorView } from "@codemirror/view";
import { CompletionContext, autocompletion, type Completion } from "@codemirror/autocomplete";

import { loadVaultIndex } from "./vault-index";

let cachedFiles: { label: string; filePath: string }[] = [];
/** Aliases, each with the note it stands for. */
let cachedAliases: { alias: string; note: string }[] = [];
let cacheVaultPath = "";
let cacheTime = 0;
const CACHE_TTL = 5000;

async function loadFiles(vaultPath: string): Promise<void> {
  if (!window.electronAPI || !vaultPath) return;
  const now = Date.now();
  if (vaultPath === cacheVaultPath && now - cacheTime < CACHE_TTL) return;

  try {
    const files = await window.electronAPI.listAllFiles(vaultPath);
    cachedFiles = files.map((f) => ({
      label: f.relativePath.replace(/\.(md|markdown)$/i, ""),
      filePath: f.filePath,
    }));
    const index = await loadVaultIndex(vaultPath);
    cachedAliases = index.flatMap((n) =>
      n.aliases.map((alias) => ({ alias, note: n.relativePath.replace(/\.(md|markdown)$/i, "") }))
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

    // Insert `text]]`, replacing what was typed and any ]] already there.
    const insertLink = (text: string) =>
      (view: EditorView, _completion: Completion, from: number, to: number) => {
        // Count how many ] chars exist right after the cursor
        const docLen = view.state.doc.length;
        let closingBrackets = 0;
        for (let i = to; i < Math.min(to + 2, docLen); i++) {
          if (view.state.doc.sliceString(i, i + 1) === "]") closingBrackets++;
          else break;
        }
        // Replace from query start through any existing ]], always end with ]]
        const replaceTo = to + closingBrackets;
        const insert = text + "]]";
        view.dispatch({
          changes: { from, to: replaceTo, insert },
          selection: { anchor: from + insert.length },
        });
      };

    const options: Completion[] = cachedFiles
      .filter((f) => !query || f.label.toLowerCase().includes(query))
      .slice(0, 30)
      .map((f) => ({ label: f.label, apply: insertLink(f.label) }));

    // An alias links to its note and shows the alias: [[Note|alias]].
    if (query) {
      for (const a of cachedAliases) {
        if (options.length >= 40) break;
        if (!a.alias.toLowerCase().includes(query)) continue;
        options.push({
          label: a.alias,
          detail: `alias of ${a.note}`,
          apply: insertLink(`${a.note}|${a.alias}`),
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
