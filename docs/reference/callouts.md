---
title: Callouts
order: 4
---

# Callouts

Callouts are styled blockquotes that visually distinguish different types of information in your notes. They are rendered with a colored left border, an icon, and a title. Noteriv supports 14 callout types, each with a distinct color and icon.

## Syntax

A callout is a blockquote with a type identifier on the first line:

```markdown
> [!type] Optional Title
> Content of the callout.
> Can span multiple lines.
```

The `[!type]` marker must be the first thing on the first line of the blockquote. The title after the type is optional. If omitted, the type name is used as the title (capitalized).

## Callout Types

### note

A general-purpose informational callout. Default blue color.

```markdown
> [!note] A Note
> This is additional information that may be useful.
```

Icon: Pencil. Color: Blue.

### tip

A helpful suggestion or best practice.

```markdown
> [!tip] Pro Tip
> You can use Ctrl+P to open the command palette from anywhere.
```

Icon: Flame. Color: Teal.

### info

Neutral informational content.

```markdown
> [!info] For Your Information
> Noteriv stores notes as standard markdown files.
```

Icon: Info circle. Color: Blue.

### warning

A warning about potential issues or things to watch out for.

```markdown
> [!warning] Caution
> Deleting a folder removes all notes inside it permanently.
```

Icon: Alert triangle. Color: Yellow.

### danger

A critical warning about destructive or irreversible actions.

```markdown
> [!danger] Danger
> This operation cannot be undone. Make sure you have a backup.
```

Icon: Zap. Color: Red.

### bug

Used to document bugs, known issues, or unexpected behavior.

```markdown
> [!bug] Known Issue
> The graph view may flicker on high-DPI displays. A fix is in progress.
```

Icon: Bug. Color: Red.

### example

An example, demonstration, or sample usage.

```markdown
> [!example] Example Query
> ```dataview
> TABLE status, due FROM #project WHERE status = "active"
> ```
```

Icon: List. Color: Mauve.

### quote

A quotation or citation.

```markdown
> [!quote] Albert Einstein
> Imagination is more important than knowledge.
```

Icon: Quote marks. Color: Text muted.

### success

Indicates something that worked, passed, or was completed successfully.

```markdown
> [!success] Tests Passed
> All 47 unit tests passed in 2.3 seconds.
```

Icon: Check circle. Color: Green.

### question

A question, something to investigate, or an open item.

```markdown
> [!question] Open Question
> Should we migrate to the new API before or after the release?
```

Icon: Help circle. Color: Yellow.

### abstract

A summary, abstract, or TLDR section.

```markdown
> [!abstract] Summary
> This document covers the architecture of the sync system,
> including conflict resolution and offline support.
```

Icon: Clipboard. Color: Teal.

### todo

An action item or task that needs to be completed.

```markdown
> [!todo] Action Items
> - Finalize the API specification
> - Schedule the design review
> - Update the documentation
```

Icon: Checkbox. Color: Blue.

### failure

Indicates something that failed, did not pass, or needs attention.

```markdown
> [!failure] Build Failed
> The CI pipeline failed at the integration test step.
> See the logs for details.
```

Icon: X circle. Color: Red.

### important

Highlights critical information that should not be missed.

```markdown
> [!important] Read This First
> All API keys must be rotated before the migration.
```

Icon: Flame. Color: Mauve.

## Collapsible Callouts

You can make callouts collapsible by adding `-` or `+` after the type identifier:

### Initially Collapsed

```markdown
> [!tip]- Click to Expand
> This content is hidden by default.
> Click the callout title to reveal it.
```

The `-` after `[!tip]` means the callout starts collapsed. The user must click the title to expand it and see the content.

### Initially Expanded

```markdown
> [!tip]+ Click to Collapse
> This content is visible by default.
> Click the callout title to collapse it.
```

The `+` after `[!tip]` means the callout starts expanded but can be collapsed by clicking the title.

### Non-Collapsible (Default)

```markdown
> [!tip] Always Visible
> This callout has no collapse behavior.
```

Without `-` or `+`, the callout is always expanded and cannot be collapsed.

## Nesting Content

Callouts can contain any markdown content, including:

- Paragraphs
- Lists (ordered, unordered, task lists)
- Code blocks
- Images
- Links and wiki-links
- Math (inline and block)
- Other blockquotes

```markdown
> [!example] Complex Callout
> Here is a list inside a callout:
>
> - Item one
> - Item two
>   - Nested item
>
> And a code block:
>
> ```python
> def hello():
>     print("Hello from a callout!")
> ```
>
> And some math: $E = mc^2$
```

## Callout Color Reference

| Type | Color | Hex |
|---|---|---|
| note | Blue | Uses `--blue` theme variable |
| tip | Teal | Uses `--teal` theme variable |
| info | Blue | Uses `--blue` theme variable |
| warning | Yellow | Uses `--yellow` theme variable |
| danger | Red | Uses `--red` theme variable |
| bug | Red | Uses `--red` theme variable |
| example | Mauve | Uses `--mauve` theme variable |
| quote | Muted | Uses `--text-muted` theme variable |
| success | Green | Uses `--green` theme variable |
| question | Yellow | Uses `--yellow` theme variable |
| abstract | Teal | Uses `--teal` theme variable |
| todo | Blue | Uses `--blue` theme variable |
| failure | Red | Uses `--red` theme variable |
| important | Mauve | Uses `--mauve` theme variable |

Because callout colors use theme CSS variables, they adapt automatically to your active theme. A "danger" callout in Catppuccin Mocha uses a different shade of red than in Solarized Dark, but both are clearly identifiable as danger callouts.

## Custom Callout Styling

You can customize callout appearance using CSS snippets. For example, to add rounded corners to all callouts:

```css
.callout {
  border-radius: 8px;
  overflow: hidden;
}
```

Or to change the color of a specific callout type:

```css
.callout-tip {
  border-left-color: #ff9900;
}
```

See [CSS Snippets](../themes/css-snippets.md) for more details on creating and managing snippets.
