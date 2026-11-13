"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { findLinkedFile, findLinkedNoteFrom } from "@/lib/wiki-link-utils";
import { isExcludedPath } from "@/lib/file-list";
import { findNoteByAlias, invalidateVaultIndex, loadVaultIndex, type NoteMeta } from "@/lib/vault-index";
import { findMentions, linkMention, markdownFileLinks, outgoingLinks, possibleLinks, type TextRange } from "@/lib/mentions";
import { excludedPatterns } from "@/lib/vault-prefs";
import { loadLinkIndex, peekLinkIndex, writeLink } from "@/lib/vault-links";

interface BacklinksPanelProps {
  /** Full path of the current file being viewed. */
  filePath: string;
  /** Base path of the vault directory. */
  vaultPath: string;
  /** The current note's text, for the links it makes. */
  content: string;
  /** Replaces the current note's text, when a mention in it is turned into a link. */
  onContentChange?: (content: string) => void;
  /** Called when user clicks a backlink to open the linked file. */
  onFileOpen: (filePath: string, line?: number) => void;
  /** Called when the panel close button is clicked. */
  onClose: () => void;
}

/** A line in another note that links to, or mentions, this one. */
interface Mention {
  filePath: string;
  noteName: string;
  relativePath: string;
  line: number;
  text: string;
  /** Where the mention is, for an unlinked one. */
  range?: TextRange;
}

type Section = "linked" | "unlinked" | "outgoing" | "possible";

/** The length at which the search shortens a line (`MAX_LINE_CHARS` in search.rs). */
const LONG_LINE = 400;

/**
 * The note a link's file part points at: by name, by path, or by an alias.
 * `from` is the note the link is written in, as a path inside the vault: a
 * link can be a path from its folder.
 */
function resolve(index: NoteMeta[], from: string, target: string): NoteMeta | null {
  return findLinkedNoteFrom(index, from, target) ?? findNoteByAlias(index, target);
}

function groupByFile(mentions: Mention[]): [string, Mention[]][] {
  const groups = new Map<string, Mention[]>();
  for (const m of mentions) {
    const list = groups.get(m.filePath);
    if (list) list.push(m);
    else groups.set(m.filePath, [m]);
  }
  return [...groups.entries()];
}

export default function BacklinksPanel({
  filePath,
  vaultPath,
  content,
  onContentChange,
  onFileOpen,
  onClose,
}: BacklinksPanelProps) {
  const [index, setIndex] = useState<NoteMeta[]>([]);
  const [linked, setLinked] = useState<Mention[]>([]);
  const [unlinked, setUnlinked] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const [closed, setClosed] = useState<Set<Section>>(new Set(["possible"]));

  // Links to this note, and plain mentions of it, in the rest of the vault.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.electronAPI) return;
      setLoading(true);
      try {
        const notes = await loadVaultIndex(vaultPath, { fresh: reloadTick > 0 });
        // Every file of the vault: the Link buttons write links with it, and
        // an ordinary markdown link is read against it.
        const allFiles = await loadLinkIndex(vaultPath).catch(() => null);
        const self = notes.find((n) => n.filePath === filePath);
        if (cancelled) return;
        setIndex(notes);
        if (!self) {
          setLinked([]);
          setUnlinked([]);
          return;
        }

        // Notes with a link that resolves here, then the lines those links are on.
        const sources = notes.filter(
          (n) => n.filePath !== filePath && n.links.some((l) => resolve(notes, n.relativePath, l)?.filePath === filePath)
        );
        const linkedFound: Mention[] = [];
        await Promise.all(
          sources.map(async (n) => {
            const text = await window.electronAPI.readFile(n.filePath);
            if (!text) return;
            text.split("\n").forEach((line, i) => {
              const regex = /\[\[([^\]]+)\]\]/g;
              let match;
              while ((match = regex.exec(line)) !== null) {
                const target = match[1].split("|")[0].replace(/\\$/, "").split("#")[0].trim();
                if (target && resolve(notes, n.relativePath, target)?.filePath === filePath) {
                  linkedFound.push({
                    filePath: n.filePath,
                    noteName: n.name,
                    relativePath: n.relativePath,
                    line: i + 1,
                    text: line.trim().slice(0, 160),
                  });
                  return;
                }
              }
              // The same for an ordinary markdown link, read from that note's folder.
              const selfRel = self.relativePath;
              if (allFiles && markdownFileLinks(line).some((l) => allFiles.markdown(n.relativePath, l.path) === selfRel)) {
                linkedFound.push({
                  filePath: n.filePath,
                  noteName: n.name,
                  relativePath: n.relativePath,
                  line: i + 1,
                  text: line.trim().slice(0, 160),
                });
              }
            });
          })
        );

        // The note's name and aliases as plain text elsewhere.
        const unlinkedFound: Mention[] = [];
        const seen = new Set<string>();
        for (const name of [self.name, ...self.aliases]) {
          if (name.trim().length < 3) continue;
          const result = await window.electronAPI.searchVault(vaultPath, `"${name.replace(/"/g, '\\"')}"`, {
            exclude: excludedPatterns(),
          });
          for (const file of result.files) {
            if (file.filePath === filePath) continue;
            for (const hit of file.lines) {
              for (const range of findMentions(hit.text, name)) {
                const key = `${file.filePath}:${hit.line}:${range.from}`;
                if (seen.has(key)) continue;
                seen.add(key);
                unlinkedFound.push({
                  filePath: file.filePath,
                  noteName: file.name.replace(/\.(md|markdown)$/i, ""),
                  relativePath: file.relativePath,
                  line: hit.line,
                  text: hit.text,
                  range,
                });
              }
            }
          }
        }

        if (cancelled) return;
        const byPlace = (a: Mention, b: Mention) => a.noteName.localeCompare(b.noteName) || a.line - b.line;
        setLinked(linkedFound.sort(byPlace));
        setUnlinked(unlinkedFound.sort(byPlace));
      } catch (err) {
        console.error("Failed to scan for backlinks:", err);
        if (!cancelled) {
          setLinked([]);
          setUnlinked([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath, vaultPath, reloadTick]);

  const self = useMemo(() => index.find((n) => n.filePath === filePath) ?? null, [index, filePath]);

  // Every file of the vault, so a link to a picture or a PDF is not shown as leading nowhere.
  const [vaultFiles, setVaultFiles] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.listVaultFiles?.(vaultPath).then((files) => {
      if (!cancelled) setVaultFiles(files.filter((f) => !/\.(md|markdown)$/i.test(f)));
    });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, reloadTick]);

  // The links this note makes, and whether each leads anywhere: to a note, or to another file.
  const outgoing = useMemo(
    () =>
      outgoingLinks(content).map((link) => {
        if (link.markdown) {
          // A markdown link's path starts from this note's folder; the list of every file reads it.
          const found = peekLinkIndex(vaultPath, Infinity)?.markdown(self?.relativePath ?? "", link.target) ?? null;
          return { ...link, opens: found ? `${vaultPath}/${found}` : null, where: found };
        }
        const note = resolve(index, self?.relativePath ?? "", link.target);
        const file = note ? null : findLinkedFile(vaultFiles, link.target);
        const opens = note ? note.filePath : file ? `${vaultPath}/${file}` : null;
        return { ...link, opens, where: note ? note.relativePath : file };
      }),
    [content, index, self, vaultFiles, vaultPath]
  );

  // Other notes' names in this note's text that are not links yet.
  const possible = useMemo(() => {
    if (!self) return [];
    // Notes left out of search and link suggestions are not suggested here either.
    const excluded = excludedPatterns();
    const names = index
      .filter((n) => n.filePath !== filePath && !isExcludedPath(n.relativePath, excluded))
      .flatMap((n) => [n.name, ...n.aliases].map((name) => ({ name, noteName: n.name, notePath: n.relativePath })));
    return possibleLinks(content, names, 60);
  }, [content, index, self, filePath]);

  const toggle = useCallback((section: Section) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  /** Turn a plain mention in another note into a link to this one. */
  const linkUnlinked = useCallback(
    async (mention: Mention) => {
      if (!window.electronAPI || !self || !mention.range) return;
      const text = await window.electronAPI.readFile(mention.filePath);
      if (text === null) return;
      const lines = text.split("\n");
      // Only if the line is still what the search showed. The search cuts a
      // very long line short, so such a line only has to begin the same way.
      const line = lines[mention.line - 1] ?? "";
      const cut = [...mention.text].length >= LONG_LINE;
      if (cut ? !line.startsWith(mention.text) : line !== mention.text) {
        setReloadTick((t) => t + 1);
        return;
      }
      // Written in the other note, in the link format chosen in Settings.
      const files = await loadLinkIndex(vaultPath, 0);
      lines[mention.line - 1] = linkMention(line, mention.range, self.name, (shown) =>
        writeLink(files, vaultPath, mention.filePath, self.relativePath, { alias: shown })
      );
      await window.electronAPI.writeFile(mention.filePath, lines.join("\n"));
      invalidateVaultIndex();
      setReloadTick((t) => t + 1);
    },
    [self, vaultPath]
  );

  /** Turn another note's name in this note into a link. */
  const linkPossible = useCallback(
    (line: number, range: TextRange, noteName: string, notePath: string | undefined) => {
      if (!onContentChange) return;
      // The files were loaded with the panel. Not waiting for them here
      // keeps the note's text from changing between the click and the edit.
      const files = peekLinkIndex(vaultPath);
      const lines = content.split("\n");
      if (lines[line - 1] === undefined) return;
      lines[line - 1] = linkMention(
        lines[line - 1],
        range,
        noteName,
        files && notePath !== undefined
          ? (shown) => writeLink(files, vaultPath, filePath, notePath, { alias: shown })
          : undefined
      );
      onContentChange(lines.join("\n"));
    },
    [content, onContentChange, vaultPath, filePath]
  );

  const renderMentions = (mentions: Mention[], withLinkButton: boolean) =>
    groupByFile(mentions).map(([sourcePath, rows]) => (
      <div key={sourcePath} className="bl-group">
        <button className="bl-file-header" onClick={() => onFileOpen(sourcePath)} title={rows[0].relativePath}>
          <svg width="12" height="12" viewBox="0 0 16 16" className="bl-file-icon" aria-hidden="true">
            <path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
          <span className="bl-file-name">{rows[0].noteName}</span>
        </button>
        {rows.map((m, idx) => (
          <div key={`${m.line}:${m.range?.from ?? idx}`} className="bl-row">
            <button className="bl-snippet" onClick={() => onFileOpen(m.filePath, m.line)} title={`Line ${m.line}`}>
              <span className="bl-line-num">L{m.line}</span>
              <span className="bl-snippet-text">
                {m.range ? (
                  <>
                    {m.text.slice(0, m.range.from).trimStart()}
                    <mark className="search-highlight">{m.text.slice(m.range.from, m.range.to)}</mark>
                    {m.text.slice(m.range.to)}
                  </>
                ) : (
                  m.text
                )}
              </span>
            </button>
            {withLinkButton && (
              <button className="bl-action" onClick={() => linkUnlinked(m)} title="Turn this mention into a link">
                Link
              </button>
            )}
          </div>
        ))}
      </div>
    ));

  const sectionHeader = (section: Section, label: string, count: number) => (
    <button className="bl-section" onClick={() => toggle(section)} aria-expanded={!closed.has(section)}>
      <span className="bl-section-arrow">{closed.has(section) ? "▸" : "▾"}</span>
      <span className="bl-section-label">{label}</span>
      <span className="bl-count">{count}</span>
    </button>
  );

  return (
    <div className="bl-panel">
      <div className="bl-header">
        <span className="bl-title">Links</span>
        <div className="bl-header-right">
          <button onClick={onClose} className="bl-close" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="bl-list">
        {sectionHeader("linked", "Backlinks", linked.length)}
        {!closed.has("linked") &&
          (loading ? (
            <div className="bl-loading">
              <div className="bl-spinner" />
              <span>Scanning vault...</span>
            </div>
          ) : linked.length === 0 ? (
            <div className="bl-empty">No other note links here.</div>
          ) : (
            renderMentions(linked, false)
          ))}

        {sectionHeader("unlinked", "Unlinked mentions", unlinked.length)}
        {!closed.has("unlinked") &&
          !loading &&
          (unlinked.length === 0 ? (
            <div className="bl-empty">No other note mentions this one by name.</div>
          ) : (
            renderMentions(unlinked, true)
          ))}

        {sectionHeader("outgoing", "Outgoing links", outgoing.length)}
        {!closed.has("outgoing") &&
          (outgoing.length === 0 ? (
            <div className="bl-empty">This note links to nothing.</div>
          ) : (
            outgoing.map((link) => (
              <div key={`${link.markdown ? "md:" : ""}${link.target.toLowerCase()}`} className="bl-row">
                <button
                  className={`bl-snippet${link.opens ? "" : " bl-unresolved"}`}
                  onClick={() => link.opens && onFileOpen(link.opens)}
                  disabled={!link.opens}
                  title={link.where ?? "No note or file with this name"}
                >
                  <span className="bl-snippet-text">{link.target}</span>
                  {link.count > 1 && <span className="bl-line-num">×{link.count}</span>}
                </button>
              </div>
            ))
          ))}

        {sectionHeader("possible", "Possible links", possible.length)}
        {!closed.has("possible") &&
          (possible.length === 0 ? (
            <div className="bl-empty">No other note is named in this one without a link.</div>
          ) : (
            possible.map((p) => (
              <div key={`${p.line}:${p.range.from}`} className="bl-row">
                <span className="bl-snippet bl-static" title={`Line ${p.line}`}>
                  <span className="bl-line-num">L{p.line}</span>
                  <span className="bl-snippet-text">
                    {p.text.slice(0, p.range.from).trimStart()}
                    <mark className="search-highlight">{p.text.slice(p.range.from, p.range.to)}</mark>
                    {p.text.slice(p.range.to)}
                  </span>
                </span>
                {onContentChange && (
                  <button
                    className="bl-action"
                    onClick={() => linkPossible(p.line, p.range, p.noteName, p.notePath)}
                    title={`Link to ${p.noteName}`}
                  >
                    Link
                  </button>
                )}
              </div>
            ))
          ))}
      </div>
    </div>
  );
}
