---
title: Intelligent Knowledge Base Implementation Plan
order: 90
---

# Intelligent Knowledge Base Implementation Plan

This plan is based on the current Noteriv repository at version 2.4.3. It is an implementation document, not a claim that every item below is already available.

## Architecture Baseline

Noteriv currently has four independently built surfaces:

- The desktop app is a Next.js 16 and React 19 renderer inside Tauri 2. `desktop/src/app/page.tsx` is the main application controller. CodeMirror powers the desktop Markdown editor.
- The mobile app is an Expo and React Native application. `phone/context/AppContext.tsx` owns most application state and its editor uses a native multiline `TextInput`.
- The MCP server is a standalone Node ESM process in `mcp/index.js`. It discovers configured vaults and directly performs note operations.
- The browser extension sends clipped content to a local Rust HTTP server in the desktop app.

Markdown files are the source of truth. There is no database, persistent search index, built-in model client, or AI provider abstraction. Desktop workspace state, snapshots, and flashcard reviews are JSON or Markdown files under `.noteriv/`.

The desktop and mobile implementations are not a shared workspace and duplicate filesystem, frontmatter, recovery, and flashcard behavior. The first knowledge implementation will therefore stabilize contracts on desktop before porting the same behavior to mobile.

## Existing Components To Reuse

- Note listing, reading, writing, and full-text search through `window.electronAPI` and `desktop/src-tauri/src/commands_fs.rs`.
- CodeMirror selection access through the existing `EditorView` reference in `desktop/src/app/page.tsx`.
- Wiki-link parsing and resolution in `desktop/src/lib/wiki-link-utils.ts`.
- Flashcard formats and SM-2 review storage in `desktop/src/lib/flashcard-utils.ts`.
- Frontmatter parsing and serialization in `desktop/src/lib/frontmatter-utils.ts`.
- Line-based diffs in `desktop/src/lib/note-history.ts`.
- Pre-write snapshots in `desktop/src/lib/file-recovery.ts`.
- Vault analytics and batched note reads in `desktop/src/lib/vault-insights-utils.ts`.
- Command registration in `desktop/src/lib/hotkeys.ts` and command dispatch in `desktop/src/app/page.tsx`.
- Context menu primitives in `desktop/src/components/ContextMenu.tsx` and note menus in `desktop/src/components/Sidebar.tsx`.
- Theme variables and modal conventions demonstrated by `VaultInsights` and its feature stylesheet.

## Required New Modules

The desktop knowledge code should live under `desktop/src/lib/knowledge/`:

- `schemas.ts`: versioned runtime schemas and TypeScript types for ingestion requests, analysis results, proposals, conflicts, relationships, links, and flashcards.
- `path-safety.ts`: relative Markdown path validation and vault containment helpers.
- `related-notes.ts`: deterministic textual retrieval that can later be complemented by embeddings without changing callers.
- `local-analysis.ts`: conservative local extraction used when AI is disabled. It must not present heuristic output as model-generated knowledge.
- `knowledge-service.ts`: orchestration, proposal construction, approval filtering, conflict checks, provenance, and application through an injected vault adapter.
- `provider.ts`: the future provider interface. UI and orchestration depend on this interface rather than a vendor SDK.

User interfaces should be separate from these services:

- `desktop/src/components/KnowledgeIngest.tsx`: source entry and destination/options.
- `desktop/src/components/KnowledgeReview.tsx`: proposal review with editable content, related-note evidence, wiki-link decisions, flashcard decisions, and contradiction isolation.
- `desktop/src/styles/knowledge.css`: theme-aware, responsive desktop styling.

Later views should build on the same contracts: Knowledge Inbox, Knowledge Health, note improvement, and graph intelligence.

## Core Data Contracts

Every persisted object will carry a schema version. The initial contracts include:

- `KnowledgeSource`: type, title, content, optional source path or URL, and capture timestamp.
- `KnowledgeIngestionRequest`: destination vault/folder, processing mode, optional instruction, and privacy/context limits.
- `KnowledgeAnalysisResult`: summary, concepts, facts, relationships, existing-note matches, missing knowledge, contradictions, wiki links, and flashcards.
- `KnowledgeProposal`: immutable analysis metadata plus individually reviewable note changes, links, cards, and contradictions.
- `NoteChange`: create or update, vault-relative target path, base content hash, base content, proposed content, rationale, and provenance.
- `ApprovalDecision`: accepted, rejected, or edited state for every proposed item.
- `ApplyResult`: exact changed files, rejected items, conflicts, and errors.

Runtime schema validation is mandatory at model, persistence, IPC, and MCP boundaries. Unknown actions, invalid confidence scores, unsupported card types, and unsafe paths are rejected rather than coerced.

## UI Entry Points

Desktop entry points will be added in this order:

1. Command palette: `Knowledge: Ingest Source`.
2. Editor context menu: `Analyze for Knowledge Base`.
3. Editor context menu: `Add Selection to Knowledge Base`, enabled only for a non-empty CodeMirror selection.
4. Sidebar note context menu: `Analyze for Knowledge Base`.
5. Later commands for related notes, missing links, contradictions, note improvement, flashcards, inbox, and health.

The ingestion flow is a focused tool, not a chatbot. It captures a source, selects a destination and mode, performs analysis, and always enters review before a Markdown write.

## AI Provider Architecture

There is no reusable AI layer today. A provider interface will expose a structured-analysis operation with provider identity, model identity, cancellation, and explicit context. Provider responses must pass the same runtime schema used by local analysis and MCP.

Provider configuration will be split between:

- Non-secret settings: enabled state, provider ID, model, endpoint, vault-read permission, related-note limit, automatic suggestion preferences, and feature toggles.
- Secrets: stored behind native Tauri commands, never returned to the renderer or placed in normal settings JSON.

Initial provider targets are OpenAI-compatible endpoints and local models. Anthropic and Gemini adapters can follow without changing knowledge-service callers. When AI is disabled, ingestion and review remain functional through conservative local processing; provider-only analysis is clearly identified as unavailable rather than silently downgraded.

## Files Requiring Modification

Initial desktop slice:

- `desktop/src/app/page.tsx`
- `desktop/src/lib/hotkeys.ts`
- `desktop/src/components/Sidebar.tsx`
- `desktop/package.json` and lockfile for runtime validation and tests
- `desktop/src-tauri/src/commands_fs.rs`, `desktop/src-tauri/src/lib.rs`, `desktop/src-tauri/src/shim.rs`, and `desktop/src/types/electron.d.ts` for guarded, atomic knowledge writes
- `docs/features/index.md`

Provider phase:

- `desktop/src/lib/settings.ts`
- `desktop/src/components/SettingsModal.tsx`
- `desktop/src/types/electron.d.ts`
- `desktop/src-tauri/src/lib.rs`
- `desktop/src-tauri/src/shim.rs`
- New Rust provider/secret commands

MCP phase:

- `mcp/index.js`
- `mcp/package.json`
- `docs/mcp/index.md`
- `docs/mcp/tools.md`

Mobile parity will modify `phone/context/AppContext.tsx`, `phone/app/editor.tsx`, `phone/app/_layout.tsx`, mobile settings, and new knowledge screens only after the desktop contracts and persistence format are stable.

## MCP Expansion

Existing tools remain compatible. New tools are divided into two groups:

- Read-only suggestions: analyze source, find related knowledge, find gaps, find contradictions, suggest wiki links, suggest flashcards, and get knowledge health.
- Guarded mutations: create a proposal or apply an explicitly identified approved proposal.

Suggestion tools never write Markdown. Mutation results return exact paths and statuses. MCP arguments and resource paths must use the same containment checks as the desktop service. The current direct mutation tools remain for compatibility, but documentation must distinguish them from the review-first knowledge workflow.

## Safety And Privacy

The following are release blockers for knowledge mutations:

- Reject absolute paths, `..`, empty segments, non-Markdown targets, null bytes, and paths that resolve outside the active vault.
- Re-read every update target before applying and compare it with the proposal base hash.
- Treat detected changed files as conflicts and serialize Noteriv filesystem mutations. Document the narrow residual race with writes from separate processes.
- Snapshot existing notes before an approved update.
- Use atomic native writes where practical and report partial failures explicitly.
- Keep contradictions outside blanket approval.
- Return exact changed files from every multi-note operation.
- Bound provider context by settings and visibly disclose whether full notes leave the device.
- Do not store provider secrets in `settings.json`.
- Sanitize or safely render all externally generated Markdown and HTML.

The existing unrestricted renderer filesystem bridge, MCP path joining, clipper folder handling, WebDAV path handling, and raw HTML rendering are broader security concerns. Knowledge code must not copy those unsafe patterns. Shared containment and rendering hardening should be completed before exposing remote mutation workflows.

## Metadata And Migration

Normal Markdown remains authoritative. Initial provenance uses flat, namespaced frontmatter fields compatible with the current parser, such as `noteriv-source-title`, `noteriv-source-type`, and `noteriv-ingested-at`. AI-added sections may include a compact HTML comment carrying a proposal ID when section-level provenance is needed.

Pending proposals and inbox state can later use a versioned `.noteriv/knowledge-inbox.json`. This is local-only in the first design because current sync providers disagree about whether `.noteriv` is included. Cross-device inbox sync requires an explicit product decision and consistent provider behavior, not an accidental migration.

No existing note or flashcard format requires migration for the first slice.

## Testing Strategy

Pure knowledge services will use mocked vault and provider adapters. Tests must cover:

- Valid and invalid structured analysis responses.
- Path traversal and invalid note paths.
- Related-note matching and score ordering.
- Duplicate wiki-link suppression.
- Q/A and cloze card validation and Markdown creation.
- Accepted, edited, and rejected proposals.
- Changed-file conflict detection.
- Contradictions excluded from blanket approval.
- Provider disabled/error/malformed-response behavior.
- MCP schema, containment, and exact changed-file reporting.

Each desktop increment runs unit tests, focused ESLint on knowledge-specific files, TypeScript checking, the Next static build, and Rust tests if native code changed. Repository-wide ESLint remains a separate baseline cleanup because current Next and React Compiler rules expose established violations outside this slice. Mobile lint/type checking and export are required when mobile work begins.

## Incremental Delivery

1. **Foundation and ingestion:** schemas, path safety, local related-note retrieval, review-first ingestion for text/current note/selection, conflict-checked note application, tests, and documentation.
2. **Provider layer:** native secret handling, provider abstraction, structured model calls, privacy settings, cancellation, and provider tests.
3. **Review depth:** multi-note diffs, merge targeting, explicit contradiction decisions, and editable wiki-link candidates. Editable cards, snapshots, and guarded atomic native writes are already established by the foundation slice.
4. **Inbox and maintenance:** persisted suggestions, background read-only jobs, inbox categories, and explicit review lifecycle.
5. **Knowledge health and graph:** actionable counts/lists and optional graph metadata/filters without a synthetic score.
6. **Flashcard integration:** note-level counts, due/mastered/suggested states, generation commands, and review by source note.
7. **MCP knowledge tools:** read-only tools first, then proposal-based guarded mutations.
8. **Mobile parity:** ingestion, review, inbox, health, settings, and conflict behavior using the stabilized contracts.

## First Slice Acceptance Criteria

- Pasted text, the current note, and a non-empty editor selection can enter ingestion.
- The command palette, editor context menu, and sidebar note context menu open the same flow.
- Destination vault, folder, mode, title, and instruction are validated.
- Related-note matches reuse vault file listing/reads and explain their textual relevance.
- Local analysis is labeled as local and does not invent contradictions or unsupported facts.
- No file changes before review.
- Applying a reviewed change rejects unsafe paths and stale update bases.
- Applied Markdown includes lightweight provenance and remains readable outside Noteriv.
- Tests, focused lint for the slice, type checking, and the desktop build pass.
