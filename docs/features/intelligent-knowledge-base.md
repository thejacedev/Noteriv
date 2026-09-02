---
title: Intelligent Knowledge Base
order: 17
---

# Intelligent Knowledge Base

Noteriv's knowledge ingestion flow turns source material into a reviewable Markdown proposal. Notes remain ordinary files in your vault, and nothing is written until you approve the proposed change.

## Ingesting Knowledge

Open the command palette with `Ctrl+Shift+P` and run **Knowledge: Ingest Source**. You can paste text or Markdown, provide a source title, choose a destination vault and folder, and add an optional processing instruction.

You can also start with existing material:

- Right-click a note in the sidebar and choose **Analyze for Knowledge Base**.
- Right-click inside the editor and choose **Analyze for Knowledge Base**.
- Select text in the editor, right-click, and choose **Add Selection to Knowledge Base**.

The available processing modes are:

- **Add as new knowledge** creates a new durable note.
- **Merge with existing knowledge** proposes an addition to the strongest textually related note. If no related note is strong enough, Noteriv proposes a new note instead.
- **Research mode** keeps a source summary, an optional focus instruction, and the original source material together.
- **Generate study material only** creates a source summary and proposes flashcards.

## Local Analysis

The first analysis pass is local. It identifies Markdown sections, durable factual statements, textual overlap with existing notes, useful wiki-link candidates, and flashcard candidates. It does not send vault content to an external AI provider.

Local analysis is intentionally conservative:

- It does not invent missing facts.
- It does not claim to detect semantic contradictions.
- It labels relevance as textual overlap rather than semantic certainty.
- It only creates study cards when the source contains enough explanatory context.

External model providers will use the same validated proposal format in a later release, with explicit privacy controls.

## Knowledge Review

The Knowledge Review screen appears before any write. It shows:

- The source summary and extracted concept counts.
- The proposed new note or existing-note update.
- A line diff for an update.
- Related-note evidence and relevance.
- Individually selectable wiki links.
- Individually selectable and editable flashcards.
- A separate contradiction area that is never included in blanket approval.

Use **Accept all safe changes** to select the locally generated note change plus only high-confidence textual links and source-authored flashcards. Lower-confidence suggestions remain available for individual review, and contradictions are always excluded. You can still edit the proposed Markdown before applying it, and you can edit the destination path for a newly created note.

The source is a captured snapshot, so editor selections and unsaved source-note text remain exactly as reviewed. If an accepted destination is open with unsaved edits, Noteriv refuses to apply the proposal until that editor is saved or closed. The review cannot be dismissed while a native write is in progress.

## Conflict Protection

For an existing-note update, Noteriv records the note's content hash when analysis begins. The native write command verifies the configured vault, authenticates the reviewed base, snapshots the current note, and checks the hash again immediately before replacement. Noteriv serializes its own filesystem mutations, rejects changes it detects as conflicts, and uses atomic replacement so each completed write is all-or-nothing. A separate process can still modify a file in the narrow interval between the final check and replacement, so recovery snapshots remain the fallback for that operating-system-level race.

Existing notes receive a normal Noteriv recovery snapshot before an approved update. Creates use no-overwrite semantics, so a note that appears at the reviewed destination is not replaced.

Normal editor saves also compare the tab's last saved content with the current disk file. If sync, MCP, or another process changes a dirty note, Noteriv pauses autosave for that tab, preserves the editor buffer, and requires explicit confirmation before overwriting the external version.

## Provenance

Newly ingested notes use lightweight, namespaced frontmatter:

```yaml
---
noteriv-source-title: "Source title"
noteriv-source-type: pasted-text
noteriv-ingested-at: 2026-09-01T12:00:00.000Z
noteriv-processing-mode: add-new
---
```

This metadata remains readable in other Markdown applications. Existing notes receive a compact provenance comment only inside the approved added section, avoiding a rewrite of their frontmatter.

## Markdown Is Still The Source Of Truth

Generated knowledge proposals are additive by default. The review editor intentionally allows you to change the complete proposed result before Apply. Disabling or ignoring knowledge tools does not affect normal editing, search, wiki links, graph view, flashcards, vaults, or non-AI MCP tools. No cloud storage is required.
