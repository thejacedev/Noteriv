# Chessboard plugin (example)

Renders static chess diagrams from FEN in ` ```chessboard ` code blocks. See
[Creating Plugins](../../../../docs/plugins/creating-plugins.md) for the
`api.markdown.registerCodeBlockProcessor` API this plugin is built on
(requires Noteriv >= 1.3.0).

## Try it

1. Copy this folder into your vault's `.noteriv/plugins/chessboard/`, **or**
   use Settings > Plugins > Install from Folder and select this folder.
2. Enable the plugin in Settings > Plugins.
3. In a note, write:

   ```chessboard
   fen: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
   orientation: white
   annotations: He4/g, Ae2-e4
   ```

## Syntax

| Field | Required | Default | Meaning |
|---|---|---|---|
| `fen` | Yes | — | Full or partial FEN string. |
| `orientation` | No | `white` | `white` or `black`. |
| `strict` | No | `true` | `true` validates the FEN before drawing; `false` tries anyway. |
| `annotations` | No | (none) | Comma/newline separated list of `H<square>/<color>` (highlight; color is `g`, `r`, `b`, or `y`) and `A<square>-<square>` (arrow). |

## Known limitations (MVP)

- Static FEN diagrams only — no PGN, no move navigation, no drag-and-drop.
- Does not render during note export/publish (falls back to plain code).

## Credits

Chess piece artwork is adapted from [chessnut-pieces](https://github.com/LexLuengas/chessnut-pieces)
by Alexis Luengas (© 2015), licensed under the Apache License 2.0. See
[THIRD-PARTY-LICENSES.md](./THIRD-PARTY-LICENSES.md) for the full license
text and a description of the changes made.
