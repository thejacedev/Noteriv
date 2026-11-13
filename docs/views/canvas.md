---
title: Canvas
order: 6
---

# Canvas

The canvas is a whiteboard with no fixed size. You place cards on it wherever you like: text, sticky notes, images, files from your vault, web pages and freehand strokes. You can draw connections between the cards and put groups around them. Each canvas is one `.canvas` file in your vault.

Canvas files are saved as JSON Canvas, the format Obsidian uses for its canvases, so the same file can be opened in both apps. See [File Format](#file-format).

This page describes the desktop app. Web page cards, **Add notes from a folder**, file cards that show what their file holds, the menu on a connection, colours of your own and the JSON Canvas file format were added after 2.4.13. Versions up to 2.4.13 have text, sticky note, image, file, group and drawing cards. A file card there shows the file's name and the first 300 characters of its text, **Add file node** lists notes only, and `.canvas` files are saved in a layout of Noteriv's own.

## Creating and Opening a Canvas

To make a canvas, open the [command palette](../features/command-palette.md) (`Ctrl+Shift+P`) and run **New Canvas / Whiteboard**. The command has no default shortcut. You can give it one in Settings > Shortcuts.

The command creates an empty file called `Canvas.canvas` at the top of the vault and opens it in a tab. If that name is taken, the file is called `Canvas 2.canvas`, then `Canvas 3.canvas`, and so on.

To open a canvas you already have, open its `.canvas` file from the file list, or click a link to it in a note. When a canvas opens, the view is zoomed so that every card is in sight.

## The Toolbar

The toolbar sits at the top of the canvas. Point at a button to see its name.

| Button | What it does |
|---|---|
| Select (V) | Goes back to selecting and moving cards. This is the tool the canvas starts with |
| Add text node | Adds a [text card](#text-cards) |
| Add sticky note | Adds a [sticky note](#sticky-notes) |
| Add image | Asks for an image file and adds an [image card](#image-cards) |
| Add file node | Lists the files of the vault and adds a [file card](#file-cards) for the one you pick |
| Add web page | Asks for an address and adds a [web page card](#web-page-cards) |
| Add notes from a folder | Lists the vault's folders and adds a file card for each note in the one you pick. See [Add Notes from a Folder](#add-notes-from-a-folder) |
| Add group | Adds a [group](#groups) |
| Draw (D) | Switches the [draw tool](#drawing) on and off |
| Zoom out | Zooms out by 10% |
| The percentage | Shows the zoom. Click it to reset the zoom. Its tooltip is `Reset zoom` |
| Zoom in | Zooms in by 10% |
| Zoom to fit | Brings every card into view |
| Delete selected | Deletes the selected cards or the selected connection |

The letters in brackets are shortcuts: press `V` for the select tool and `D` to switch the draw tool on and off, while you are not typing in a card or a box.

A card added from the toolbar is placed in the middle of the view. **Add notes from a folder** places its cards beside what is already on the canvas.

## Cards

| Card | What it shows | New card size | How to add it |
|---|---|---|---|
| Text | Text you type on the card | 260 x 160 | **Add text node** in the toolbar, or right-click the canvas and choose **Add Text Node** |
| Sticky note | Text on a coloured square, set at a slight tilt | 200 x 200 | **Add sticky note** in the toolbar, or **Add Sticky Note** in the right-click menu |
| Image | A picture that fills the card | 300 x 240 | **Add image** in the toolbar, or **Add Image** in the right-click menu |
| File | A file from the vault: a note's text, a picture, a page of a PDF, a player, or the file's name | Depends on the file | **Add file node** or **Add notes from a folder** in the toolbar, or **Add Notes from a Folder** in the right-click menu |
| Web page | The site and the address of a web page, and a button that opens it in your browser | 300 x 140 | **Add web page** in the toolbar, **Add Web Page** in the right-click menu, or paste an address onto the canvas |
| Group | A dashed frame with a label, drawn behind the other cards | 400 x 300 | **Add group** in the toolbar |
| Stroke | A freehand line | The size of the line | Drag on the canvas with the draw tool |

The right-click menu on an empty part of the canvas has five items: **Add Text Node**, **Add Sticky Note**, **Add Image**, **Add Web Page** and **Add Notes from a Folder**. A text card, sticky note, image card or web page card added from this menu is placed where you right-clicked.

File cards have a section of their own. See [File Cards](#file-cards).

### Text Cards

A new text card opens ready for typing. Click anywhere outside the card when you are done. To change the text later, double-click the card. An empty text card reads `Double-click to edit`.

The text is shown as you typed it, with its line breaks. Markdown in a text card is not formatted: `**bold**` stays as it is written.

### Sticky Notes

A sticky note works like a text card: it opens ready for typing, and you double-click it to change the text. Each new sticky note is yellow and is tilted by a small random amount, between 2 degrees to the left and 2 degrees to the right.

To change the colour, right-click the note and click one of the six dots under **Sticky Color**. The dots are not named in the menu. These are the colours:

| Colour | Hex |
|---|---|
| Yellow | `#f9e2af` |
| Pink | `#f5c2e7` |
| Blue | `#89dceb` |
| Green | `#a6e3a1` |
| Purple | `#cba6f7` |
| Peach | `#fab387` |

Sticky notes have these six colours only. The **Color** row described under [Colours](#colours) is for the other cards.

### Image Cards

**Add image** opens your system's file dialog, which offers `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg` and `.bmp` files. The card shows the picture with no title bar. The picture fills the card, so its edges are cut off when the card and the picture have different proportions.

If you pick an image from outside the vault, Noteriv copies it into the [attachment folder](../features/file-settings.md#attachment-folder) and the card shows the copy (after 2.4.13). The copy's name starts with the date and time. A canvas only points at files inside the vault, so that it still works when the vault is opened on another computer. If the copy cannot be made, no card is added and the canvas says `The image could not be copied into the vault.`

Double-click an image card to pick a different image for it.

You can also put an image on the canvas with **Add file node**. That makes a [file card](#file-cards), which has a title bar with the file's name and shows the whole picture.

### Web Page Cards

A web page card (after 2.4.13) points at a page on the web. It shows the site, such as `www.example.com`, the whole address under it, and an **Open** button. The page itself is not shown on the card, and Noteriv does not contact the site to draw the card.

There are three ways to add one:

- Click **Add web page** in the toolbar.
- Right-click the canvas and choose **Add Web Page**. The card is placed where you right-clicked.
- Copy an address and paste it onto the canvas with `Ctrl+V`. The card is placed where the pointer is.

The first two open a box titled `Add web page`. Type or paste the address and press `Enter`, or click **Add**. **Cancel** or `Esc` closes the box.

- You can leave out `https://`. `example.com/page` becomes `https://example.com/page`.
- Only `http://` and `https://` addresses are accepted. For anything else the box says `Enter the address of a web page, such as https://example.com`.
- Pasting onto the canvas makes a card only when the pasted text is one whole address that starts with `http://` or `https://`. Other text is ignored. Pasting does nothing while you are typing in a card or a box.

To open the page in your browser, click **Open** on the card or double-click the card. The right-click menu of a web page card has three more items:

| Item | What it does |
|---|---|
| Open in Browser | Opens the page in your browser |
| Copy Address | Puts the address on the clipboard |
| Change Address... | Opens the address box so you can give the card a different address |

### Groups

A group is a dashed frame with a label above its top-left corner. It is drawn behind the other cards, so you can place cards inside it. A new group is labelled `Group`. Double-click the group to rename it, then press `Enter` or click elsewhere.

A group is a frame and nothing more. Moving a group does not move the cards inside it. To move them together, select the group and the cards and drag.

### Drawing

Click **Draw (D)** in the toolbar to switch on the draw tool. Seven colour dots appear in the toolbar. Click one to pick the colour of the line, then drag on an empty part of the canvas to draw. Each drag makes one stroke.

- While the draw tool is on, dragging the background draws and does not pan. A drag that starts on a card still moves the card.
- To leave the draw tool, click **Draw (D)** again, click **Select (V)**, or press `Esc`.
- A stroke can be selected, moved, duplicated and deleted like a card. It cannot be resized or recoloured, and the line has one thickness.
- There is no eraser. To remove a stroke, select it and delete it.

For shapes, text and more drawing tools, use the [Drawing Editor](./drawing-editor.md).

## File Cards

A file card shows a file from the vault. What you see depends on the kind of file (after 2.4.13):

| File | Endings | What the card shows | New card size |
|---|---|---|---|
| Note | `.md`, `.markdown` | The note as formatted text: all of it, or the part under one heading | 300 x 220 |
| Image | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.avif` | The whole picture, scaled to fit inside the card | 300 x 240 |
| PDF | `.pdf` | One page, drawn as a picture, with a line such as `Page 1 of 12` under it | 300 x 400 |
| Sound | `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.3gp` | A **Play sound** button. Press it and a player takes its place and starts playing | 300 x 120 |
| Video | `.mp4`, `.webm`, `.mov`, `.mkv`, `.ogv` | A **Play video** button. Press it and a player takes its place and starts playing | 360 x 260 |
| Anything else | | The file's name and an **Open** button | 260 x 110 |

Every file card has a title bar with an icon for the kind of file, the file's name (without `.md` for a note) and an **Open** button.

### Adding a File Card

Click **Add file node** in the toolbar. A list of the vault's files opens, with a search box that reads `Search files...`. Type to narrow the list by name or path, then click a file, or move with `Up` and `Down` and press `Enter`. `Esc` closes the list.

- The list holds every file in the vault, not only notes (after 2.4.13). Files and folders whose names start with a dot are left out.
- The list shows the first 50 matches. Type more of the name to find a file further down.

### Add Notes from a Folder

**Add notes from a folder** (after 2.4.13) puts a whole folder of notes on the canvas in one step. Click it in the toolbar, or right-click the canvas and choose **Add Notes from a Folder**.

A list of folders opens, with a search box that reads `Search folders...`. Each row shows a folder's path and how many notes it holds, such as `4 notes`. The vault folder itself is listed as `Top of the vault`. Click a folder, or move with `Up` and `Down` and press `Enter`.

- Only folders that have notes directly in them are listed.
- A card is added for each note directly in the folder. Notes in folders inside it are not added. Other files, such as images, are not added.
- A note that already has a file card on the canvas is left out.
- The new cards are laid out in a grid, in name order, to the right of everything already on the canvas. On an empty canvas the grid is placed in the middle of the view.
- The new cards are selected, and the view is zoomed to show the whole canvas.

A message at the bottom of the canvas says what happened, for example `Added 3 notes. 1 was already on the canvas.` It goes away after five seconds.

### Note Cards

A note card shows the note's text with basic formatting, the way an [embedded note](../features/wiki-links.md#embedding-with) is shown. The note's properties are left out. Callouts, math and diagrams are not drawn the way they are in the editor.

- A card shows the first 300 lines of a note. After that it says how many lines are left, for example `… 40 more lines`.
- When the text is longer than the card, select the card and scroll with the mouse wheel. Over a card that is not selected, the wheel zooms the canvas.
- A `[[link]]` in the text opens that note. A web link opens in your browser.
- When the note's file changes, the card reads it again, so the card keeps up with your edits.

### Showing One Heading

A note card can show only the part of the note under one heading (after 2.4.13). Click the **#** button in the card's title bar (its tooltip is `Show one heading`) and pick a heading from the list. The card then shows that heading and the text under it, up to the next heading of the same or a higher level, and the title bar reads `Note › Heading`.

To go back, click **#** again and pick **Whole note**, or right-click the card and choose **Show Whole Note**.

The **#** button cannot be clicked when the note has no headings. The heading is found by its text. If you reword or remove the heading in the note, the card says that the note has no such heading until you pick another one.

### PDF Cards

A PDF card draws one page of the file. A card you add in Noteriv shows page 1, and there is no control on the card for choosing another page. If the card's entry in the `.canvas` file names a page, with a `subpath` such as `#page=3`, the card shows that page. Noteriv keeps the page when it saves the canvas, but has no way to set one.

### When Files Are Read

The files on a canvas are not all read when the canvas opens:

- A card reads its file when the card first comes into view, or comes within about 200 pixels of it. Cards far off to the side of a large canvas read nothing until you pan to them.
- A sound or video file is read only when you press its play button.

If a file cannot be read, the card says so, for example `This note could not be read.`

### Opening the File

To open a card's file in Noteriv, click the **Open** button in the title bar, double-click the card, or right-click it and choose **Open**. The file opens the way it does from the file list: a note in the editor, a PDF in the [PDF viewer](./pdf-viewer.md), an image in the image view.

A file that Noteriv has no view for is opened as text. If the file cannot be read as text, nothing happens. This is the case for sound and video files, so **Open** does nothing on their cards.

The file opens as a whole. A card that shows one heading or one page of a PDF does not open the file at that heading or page.

## Selecting, Moving and Resizing

| To | Do this |
|---|---|
| Select a card | Click it |
| Add a card to the selection, or take it out | `Shift`+click it |
| Select every card | Press `Ctrl+A` (or `Cmd+A` on macOS) |
| Clear the selection | Click an empty part of the canvas, or press `Esc` |
| Move a card | Drag it. If several cards are selected, they all move |
| Resize a card | Select it and drag one of the four corner handles |
| Duplicate a card | Right-click it and choose **Duplicate** |
| Delete | Press `Delete` or `Backspace`, click **Delete selected** in the toolbar, or right-click and choose **Delete** |

Things to know:

- A card cannot be made smaller than 100 x 60.
- Dragging on an empty part of the canvas moves the view. There is no way to select cards by dragging a box around them.
- A duplicate is placed a little below and to the right of the original. Connections between cards that are duplicated together are duplicated too.
- Deleting a card also deletes its connections.
- Right-clicking a card selects that card alone, so **Duplicate** and **Delete** in the menu act on that card.
- `Delete`, `Backspace` and `Ctrl+A` do nothing while a text box or a button has the keyboard focus. If a key does nothing, click a card first.
- The canvas has no undo.

## Colours

Right-click a text card, image card, file card, web page card or group to give it a colour. The menu has a row of dots under **Color**:

| Dot | What it does |
|---|---|
| No color | Removes the colour |
| red, orange, yellow, green, blue, purple | The six preset colours |
| Another color | Opens your system's colour chooser, for a colour of your own (after 2.4.13) |

A coloured card has a border in that colour and a faint tint. The same row is in the menu of a [connection](#connections), where it colours the line and its arrowheads (after 2.4.13).

Sticky notes have their own six colours. See [Sticky Notes](#sticky-notes). Strokes keep the colour they were drawn in.

## Connections

A connection is a curved line between two cards.

### Drawing a Connection

Point at a card, or select it, and a dot appears in the middle of each side. Drag from one of the dots to another card and let go over it.

- The line is drawn between the sides of the two cards that face each other, whichever dot you started from. When you move or resize one of the cards, the line moves to the sides that face each other then.
- A new connection has an arrow at the card you dragged to.
- Letting go over an empty part of the canvas makes no connection.
- Two cards can have one connection between them.
- Groups and strokes have no dots. A connection can end on a group or a stroke, but cannot start from one.

Click a connection to select it. `Delete` removes it.

### Labels

Double-click a connection to give it a label (after 2.4.13). A box opens in the middle of the line. Type the label and press `Enter` or `Esc`, or click elsewhere. Clearing the text removes the label.

### The Connection Menu

Right-click a connection for its menu (after 2.4.13):

| Item | What it does |
|---|---|
| Add Label | Opens the label box. Reads **Edit Label** when the connection has a label |
| Remove Label | Removes the label. Shown when the connection has one |
| No Arrows | A plain line |
| One Arrow | An arrow at the end of the connection, on the card you dragged to |
| Arrows at Both Ends | An arrow at each end |
| Color | The same row of dots as for cards. See [Colours](#colours) |
| Delete | Removes the connection |

The arrow choice in use is highlighted in the menu.

## Moving Around

| To | Do this |
|---|---|
| Pan | Drag an empty part of the canvas |
| Zoom | Turn the mouse wheel. The canvas zooms toward the pointer |
| Zoom in steps | Click **Zoom in** or **Zoom out** in the toolbar. Each click is 10% |
| See everything | Click **Zoom to fit** |
| Go back to 100% | Click the percentage in the toolbar |

- The wheel and the zoom buttons go from 15% to 300%.
- **Zoom to fit** frames all the cards with a margin around them. It does not zoom in past 150%. On an empty canvas it resets the zoom.
- Clicking the percentage sets the zoom to 100% and moves the view back to where an empty canvas starts.
- The mouse wheel always zooms. The one exception is a selected file card, where the wheel scrolls the card's content.

A small map in the bottom-right corner shows every card as a block and the part of the canvas you are looking at as a frame. It appears once the canvas has a card. It is for looking only: clicking it does nothing.

The background is a grid of dots. Cards do not snap to it.

## Keyboard and Mouse

| Shortcut | Action |
|---|---|
| `Delete` / `Backspace` | Delete the selected cards or the selected connection |
| `Ctrl+A` | Select every card |
| `Ctrl+D` | Duplicate the selected cards |
| `V` | The select tool |
| `D` | Switch the draw tool on and off |
| `Ctrl+V` | Paste a web address as a [web page card](#web-page-cards) |
| `Esc` | Clear the selection, close an open menu, stop a connection that is being drawn and leave the draw tool. With none of those to do, close the canvas |
| `Shift`+click | Add a card to the selection, or take it out |
| Double-click a text card or sticky note | Edit the text |
| Double-click a group | Rename it |
| Double-click a file card | Open the file |
| Double-click a web page card | Open the page in your browser |
| Double-click an image card | Pick a different image |
| Double-click a connection | Edit its label |
| Right-click | Open the menu for the card, the connection or the canvas |
| Mouse wheel | Zoom |
| Drag the background | Pan |

On macOS, use `Cmd` in place of `Ctrl`.

`Ctrl+D` is also the default shortcut for **Open Daily Note**. With cards selected on the canvas it only duplicates them; with nothing selected it opens the daily note as anywhere else.

While you are typing in a text card or a sticky note, the keys go to the text, and `Esc` does not end the typing. Click outside the card to finish. When a list or a box is open over the canvas, `Esc` closes that list or box and leaves the canvas open.

## Saving

There is no save step. Half a second after your last change, the canvas is written to its `.canvas` file.

- Opening a canvas, clicking a card, panning, zooming and closing the canvas do not write the file.
- Closing the canvas with `Esc` writes a change that is still waiting.
- The zoom and the position of the view are not saved. A canvas is zoomed to fit each time it is opened.

## File Format

A `.canvas` file is JSON with two lists: `nodes`, the cards, and `edges`, the connections. Noteriv writes it as a JSON Canvas 1.0 file (after 2.4.13). That is the format Obsidian uses for its canvases, so a `.canvas` file can be opened in both apps. The fields are listed under [Canvas Files](../reference/file-types.md#canvas-files).

JSON Canvas has four kinds of card: text, file, link and group. Four of Noteriv's cards are those kinds exactly. The other three are written as one of the four, with a `noteriv` field that says what they are in Noteriv.

### What Is Written

| On the canvas | In the file |
|---|---|
| Text card | A `text` card with its `text` |
| File card | A `file` card. `file` is the path from the top of the vault, with `/` between folders, such as `Projects/Plan.md`. A card that shows one heading also has a `subpath`, such as `#Plan` |
| Web page card | A `link` card with its `url` |
| Group | A `group` card with its `label` |
| Sticky note | A `text` card with the note's text and its paper colour, plus a `noteriv` field holding `"type": "sticky"` and the tilt |
| Image card | A `file` card that points at the image, plus a `noteriv` field holding `"type": "image"` |
| Strokes | All of them inside one `text` card. See below |
| Connection | An edge with `fromNode` and `toNode`, the side of each card, and its arrows, colour and label when it has them |

- Positions and sizes are written as whole numbers.
- A colour is written as a preset, `"1"` to `"6"` for red, orange, yellow, green, blue and purple, or as a hex colour such as `"#ff8800"`.
- The file is indented with two spaces.

A sticky note and an image card, as they are written:

```json
{
  "id": "3333333333333333",
  "type": "text",
  "text": "Call Dana",
  "x": 100,
  "y": 420,
  "width": 200,
  "height": 200,
  "color": "#f5c2e7",
  "noteriv": {
    "type": "sticky",
    "rotation": -1.37
  }
}
```

```json
{
  "id": "4444444444444444",
  "type": "file",
  "file": "attachments/sketch.png",
  "x": 420,
  "y": 420,
  "width": 300,
  "height": 240,
  "noteriv": {
    "type": "image"
  }
}
```

### Sticky Notes, Image Cards and Strokes in Another App

The file only holds kinds of card that JSON Canvas has, so an app that reads JSON Canvas is given these:

| In Noteriv | What the other app is given |
|---|---|
| Sticky note | A text card with the note's text and a colour |
| Image card | A file card that points at the image file |
| Strokes | One text card, 260 x 60, that reads `Drawings made in Noteriv are kept in this card.` |

Strokes have no counterpart in JSON Canvas. Noteriv keeps all of them, and any connection that touches one, inside the `noteriv` field of a single text card with the id `noteriv-drawings`. Another app is given that one card and not the strokes. The card sits at the top-left corner of the area the strokes cover.

What makes these cards Noteriv's is in the `noteriv` field alone. If another app saves the canvas and writes the field back as it was, the cards come back unchanged in Noteriv. If the field is not written back:

- A sticky note comes back as a text card with its colour.
- An image card comes back as a file card that shows the image.
- The strokes are gone, because they are stored nowhere else.

Deleting the `noteriv-drawings` card in another app also removes the strokes. Moving it does not move them: each stroke keeps its own position.

### Opening a Canvas from Another App

Noteriv reads all four kinds of JSON Canvas card:

| In the file | In Noteriv |
|---|---|
| `text` card | A text card. The text is shown as written. Markdown in it is not formatted |
| `file` card | A file card, as described under [File Cards](#file-cards). A `subpath` such as `#Findings` or `#^block-id` narrows a note card to that heading or block, and `#page=3` sets the page of a PDF card |
| `link` card | A web page card. The page is not shown on the card |
| `group` card | A group with its label. If the group has a background image, it is drawn in the group |
| Colours | The presets `"1"` to `"6"` are shown in Noteriv's shades of red, orange, yellow, green, blue and purple. A hex colour is shown as it is |
| Edges | Drawn with their sides, arrows, colour and label. An edge that names no sides is drawn between the sides that face each other |

Noteriv reads the file when the canvas is opened. If another app changes the file while the canvas is open in Noteriv, close the canvas and open it again to see the change. A change you make in Noteriv before that writes Noteriv's copy over the file.

### Fields and Cards Noteriv Does Not Know

A field that Noteriv does not use is written back as it was. This covers fields on a card, on an edge and at the top of the file.

A card of a kind Noteriv does not know keeps its place. It is drawn as a dashed box that reads, for a card of the kind `mindmap`, `A “mindmap” card, which this version cannot show`. You can move, resize, connect, duplicate and delete it. Everything the card held is written back with it.

### Canvases from Earlier Versions

Versions up to 2.4.13 save a canvas in a layout of Noteriv's own: sticky notes, image cards and strokes as kinds of card of their own, files as full paths under `filePath` and `imagePath`, and colours by name.

These canvases still open:

- A full path inside the vault becomes a path from the top of the vault.
- A colour name becomes its preset number.
- Sticky notes, image cards and strokes are read as what they were.

Opening such a canvas does not change its file. The file is rewritten as JSON Canvas the first time you change the canvas.

An image card from an earlier version can point at a file outside the vault. A file outside the vault cannot be written as a file card, so that card is written as a text card holding the file's name, with the full path kept in its `noteriv` field. Noteriv still reads it as an image card.

Versions up to 2.4.13 look for a card's file under `filePath` and `imagePath`. A canvas saved by a newer version does not have those fields, so file and image cards in it do not show their file there.

## Limits

- The canvas is in the desktop app. The mobile app has no canvas view.
- There is no undo, no snapping and no alignment guides.
- Text cards and sticky notes show plain text. Markdown is formatted only in note cards.
- A web page card shows an address. The page is not embedded.
- A note card shows the first 300 lines of its note.
- A PDF card shows one page, and that page cannot be changed on the card.
- **Add file node** lists the first 50 matches.
- **Add notes from a folder** adds the notes directly in one folder, not the notes in the folders inside it.
- Two cards can have one connection between them, and a connection cannot start from a group or a stroke.
- A group does not hold cards: moving it leaves the cards inside it where they are.
- The mouse wheel and the zoom buttons go from 15% to 300%.
- A card cannot be made smaller than 100 x 60 by resizing it.
- If two cards in a file have the same id, only the first is read, and the second is not written back.
- A `.canvas` file that cannot be read as JSON opens as an empty canvas. The first change you make then replaces what was in the file.
