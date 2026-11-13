---
title: Web Page Reader
order: 23
---

# Web Page Reader

The web page reader shows a web page inside Noteriv as an article: its text, headings, lists, tables, links and pictures, set in your theme. A page you want to keep can be saved as a note in your vault.

It is a reader, not a browser. Noteriv fetches the page's HTML as text, picks the readable article out of it, and shows only that. The page itself is never run. Its scripts, forms, frames and styling do not reach the app's window, so you cannot sign in to a site, fill in a form, play a video or use a web app in the reader. For those, use **Open in browser**.

The reader is in the desktop app and was added after 2.4.13. Versions up to 2.4.13 do not have it.

## Opening the Reader

### The Command

Run **Open the Web Page Reader** from the [command palette](./command-palette.md) (`Ctrl+Shift+P`). The command has no default shortcut. You can give it one in Settings > Shortcuts.

The reader opens empty, in place of the tab in front, with the cursor in the address box. It says `Type a web address above to read a page here.` Type a web address and press `Enter`.

If the reader is already in front, the command does nothing.

### Web Links in Notes

A web link is a link in a note to an `http://` or `https://` address, written as a markdown link or as a bare address. Live mode and view mode draw it as a link you can click. What the click does depends on the setting **Open web links in the reader**, in Settings > General (`Ctrl+,`):

| Open web links in the reader | A click on a web link in a note |
|---|---|
| Off (the default) | Opens the page in your browser |
| On | Opens the page in the reader, over the tab in front |

The setting is for links in notes. A web page card on a canvas and a link in a base open in your browser whatever the setting says.

Links inside the reader are followed in the reader whatever the setting says. See [Links in the Article](#links-in-the-article).

## The Toolbar

The bar at the top of the reader has these controls, from left to right:

| Control | What it does |
|---|---|
| **Back** | Goes to the page before this one in the reader's history. Greyed out on the first page |
| **Forward** | Goes forward again after **Back**. Greyed out on the newest page |
| **Reload** | Fetches the page again |
| Address box | Shows the address of the page. Type an address and press `Enter` to open it |
| **Open in browser** | Opens the page that is showing in your browser |
| **Save to vault** | Saves the page as a note. See [Save to Vault](#save-to-vault) |
| **Close** | Closes the reader and shows what was under it. The reader's history is forgotten |

**Back**, **Forward**, **Reload** and **Close** are icons. Point at one to see its name.

The history belongs to the reader, not to the app. Opening a page from the middle of the history drops the pages that were ahead of it. **Back** and **Forward** fetch the page again each time.

### The Address Box

| What you type | What happens |
|---|---|
| A full address, such as `https://example.com/page` | The page is opened |
| An address without the start, such as `example.com/page` | `https://` is added |
| An address on your own computer, such as `localhost:3000` or `127.0.0.1:8080` | `http://` is added |
| The address that is already showing | The page is loaded again |
| Words with spaces between them | Refused. The reader does not search the web |
| Another kind of address, such as `ftp://` or `mailto:` | Refused |
| An address with a username or password in it | Refused |

Clicking the box selects the whole address. `Esc` puts the page's address back and leaves the box.

When a site redirects, the box shows the address the page was read from in the end.

## What the Reader Shows

Above the article the reader shows the name of the site, the title of the page, and the author when the page names one. Under the article it says `Reader view: scripts, forms and page styling are left out.` with a link, **Open in browser**, for the full page.

### How the Article Is Picked

The reader looks for the article in this order:

1. The page's own `<article>` element, when it holds at least 140 characters of text. On a page with several, such as a list of posts, one of them is taken only when it holds most of their text.
2. The page's `<main>` element, when it holds at least 140 characters of text.
3. The block that holds most of the page's text.

The text of links is not counted, so menus and lists of links weigh nothing. The choice is made from the page's markup alone. If what is shown is not the part you wanted, use **Open in browser**.

The title is the one the page gives for sharing, or else the page's title with the name of the site taken off its start or end. When the page's main heading is the first part of that title, the heading alone is used. A page with no title gets its first top-level heading.

A heading at the top of the article that repeats the title is taken out, and so is a line that only names the author, because both are shown above the article.

### What Is Kept

| Kept | Notes |
|---|---|
| Headings, paragraphs, line breaks and rules | |
| Lists, numbered lists and definition lists | A numbered list keeps the number it starts at |
| Quotes | |
| Code blocks and code in a line | As plain text. The language is kept when the page names it. The page's colouring is not |
| Tables | With cells that span rows or columns |
| Pictures and their captions | See [Pictures](#pictures) |
| Links | To `http`, `https`, `mailto` and `tel` addresses. Every address is written out in full |
| Bold, italic, underline, strikethrough, highlight, subscript and superscript | And other marks on words, such as abbreviations, inline quotes and keyboard keys |
| Sections that open and close (`<details>`) | |

Any other tag is replaced by what is inside it: the words stay, the tag goes.

A formula written in MathML is shown as its TeX source, as code, when the page carries the source. A formula without it is left out.

A page that is plain text and not HTML is shown as it is, in one block.

### What Is Left Out

Anything that runs inside Noteriv's window runs with the app's own access, which includes your notes. So nothing from a page is run, and only a short list of tags and attributes is written out. The result then goes through the same sanitizer Noteriv uses for note content.

| Left out | Why |
|---|---|
| Scripts | The reader never runs anything from a page. A page that needs scripts to show its text shows little or nothing |
| The page's styling: style sheets, classes, ids and inline styles | The article is set in Noteriv's own styles and your theme |
| Frames and embedded pages (`<iframe>`, `<object>`, `<embed>`) | They would load other pages into the app |
| Forms, fields and buttons | Nothing in the reader sends anything to a site. There is no sign-in, search box or comment box |
| Video and audio players, and drawings (`<svg>`, `<canvas>`) | The reader shows text and pictures only |
| Navigation, the site's header, sidebars, share buttons, related links, advertisements, cookie notices, sign-up boxes and comment threads | Not part of the article |
| Footers, including a footer inside the article | A footer holds tags and share links, not the text of the article |
| Parts the page marks as hidden | The page does not show them either, or marks them as decoration |
| Pictures one pixel wide or high | They are there to count visits |
| Links to anything other than `http`, `https`, `mailto` and `tel` addresses | The words of the link stay. The link is removed |

Two notices can appear above the article:

| Notice | When |
|---|---|
| `This page is very long. The reader shows the first part of it.` | The page is longer than the size limit. See [Limits](#limits) |
| `There is little to read on this page. It may build itself with scripts, which the reader does not run.` | The article has fewer than 200 characters of text and no pictures |

### Pictures

Pictures in the article are shown. They are not fetched together with the page: each picture keeps its web address, and the app's window loads it from that address when you scroll to it.

Showing a picture therefore means your computer asks the site that holds it for the picture. That is often a different site from the one the page is on. The reader tells the window to send no referrer with the request, so the picture's site is not told which page you were reading.

What is said under [Privacy](#privacy) about the request for the page does not cover pictures. They are loaded by the app's window, not by that request.

A picture the page holds as data inside its own HTML is shown without any request.

### Links in the Article

| Link | A click |
|---|---|
| To another web page | Opens that page in the reader. If the address names a place on the page, the reader scrolls to it |
| To a place on the page that is open | Scrolls there. Nothing happens when that place is in a part of the page that was left out |
| To another web page, with the middle button or with `Ctrl`, `Cmd` or `Shift` held | Opens that page in your browser |
| A mail or phone link | Does nothing |

## Where the Reader Lives

There is one reader, and it has no tab of its own. It is shown over the tab that was in front when it was opened, in place of that tab's contents.

| Part of the window | With the reader in front |
|---|---|
| Editor area | Replaced by the reader: the note's title, the formatting toolbar, the properties editor and the editor, on both sides of a split. A canvas, a base, an image or a PDF is covered in the same way |
| Title bar and tabs, ribbon, sidebar, side panels and status bar | Stay as they are. The tab keeps the name of the note, and the side panels and the status bar still describe the note under the reader |

How it behaves:

- **Choosing another tab** shows that tab as usual. The reader stays with the tab it was opened over. Choose that tab again and the reader is back on the same page, at the place you had scrolled to, with its **Back** and **Forward** history. The page is not fetched again.
- **To see the note under the reader**, click **Close**. Closing forgets the page and the history.
- **Closing the tab** does not close the reader. If you open the same note again, the reader is shown over it until you click **Close**.
- **Opening the reader over another tab** moves it there. This happens when you run the command, or click a web link in a note with the setting on, while a tab without the reader is in front. The reader starts again on that tab: the pages it showed before are no longer in its history. The first tab shows its note again.
- **With no tab open**, the reader is shown in the empty editor area. It gives way when you open a note.

The reader is not opened again the next time you start Noteriv, and it is not part of a [workspace layout](./workspaces.md). Its history is kept in memory only.

## Save to Vault

**Save to vault** writes the page that is showing to your vault as a markdown note. The button is greyed out until a page is showing.

While the note is written the button reads `Saving…`, and then `Saved`. The status bar shows `Saved the page as "…"` with the name of the note. The note is not opened, and the reader stays on the page. Find the note in the file list.

If the note cannot be written, `The note could not be saved.` appears under the toolbar.

### Where the Note Goes

The note goes where the [New notes go](./file-settings.md#where-new-notes-go) setting says, with one difference from a new note made with `Ctrl+N`:

| New notes go | The page is saved |
|---|---|
| At the top of the vault | In the vault folder itself |
| Beside the open note | At the top of the vault. A saved page is not put beside the note the reader is over |
| In a folder I choose | In the folder named in **Folder for new notes**. The folder is created if it does not exist. If the box is empty, at the top of the vault |

### The Name of the Note

The note is named after the title of the page. A page without a title is named after its site.

These characters cannot be part of the name and are replaced by spaces:

```text
\ / : * ? " < > | # ^ [ ]
```

A name longer than 100 characters is cut off there. If nothing is left of the title, the note is called `Web page`.

If the folder already has a note with that name, a number is added: `Sourdough 2`, `Sourdough 3` and so on. Capital letters are not compared. The note that is already there is not replaced. Saving the same page twice gives two notes.

### Properties

The note starts with a [properties](./properties.md) block:

```yaml
---
title: How to keep a sourdough starter alive
author: Mara Lindqvist
source: https://dailyloaf.example/2026/starter?ref=home
clipped: 2026-11-13T09:30:00.000Z
---
```

| Property | Holds |
|---|---|
| `title` | The title of the page. Left out when the page has none |
| `author` | The author. Written only when the page names one |
| `source` | The address the page was read from, after any redirects |
| `clipped` | When you saved the page: the date and time in UTC |

A value that YAML would misread, such as a title with a colon in it, is put in quotes. For how properties are written and shown, see [Properties](./properties.md) and [Frontmatter](../reference/frontmatter.md).

### The Body of the Note

After the properties come the title as a heading and the article as markdown. This is the rest of the note from the example above:

```markdown
# How to keep a sourdough starter alive

A starter is flour, water and patience. Left alone on the counter it goes sour and thin within a few days, and most people assume at that point that they have killed it. They almost never have.

## Feeding

Feed it once a day with equal weights of flour and water. Read about [which flour to use](https://dailyloaf.example/guides/flour), or skip ahead to [troubleshooting](https://dailyloaf.example/2026/starter?ref=home#troubleshooting) if yours already smells of nail polish.

![A jar of starter](https://dailyloaf.example/img/starter-day-3.jpg)

*Day three: bubbles, and a smell like yoghurt.*

- Use a clean jar.
- Keep it somewhere warm.

## Troubleshooting

A grey liquid on top is only alcohol. Pour it off, feed the starter, and carry on as before.
```

Things to know:

- **The note holds what the reader showed.** What the reader left out is not in the note either.
- **Pictures are not downloaded.** Each one is written as a markdown image that points to its web address. Nothing is copied into your attachment folder. A picture the page held as data is left out of the note.
- **Links keep their full addresses**, including links to a place on the same page.
- **Code blocks** are fenced, with the language when the page named it.
- **Tables** are written as markdown tables. A table the page used only to arrange its layout is written as its contents, in reading order.
- **Text that markdown would read as formatting is escaped** with a backslash. A `#word` in the text, for example, does not become a tag in your vault.

## Limits

These apply to the request for a page. They are fixed: there are no settings for them.

| Limit | Value |
|---|---|
| Addresses | `http://` and `https://` only. An address with a username or password in it is not opened |
| Time | 20 seconds for the whole request: connecting, every redirect and reading the page. Connecting to the site may take 10 of those seconds at most |
| Redirects | 5 at most. A redirect to anything other than an `http` or `https` address is not followed |
| Pages that only send you on | A page whose only job is to pass visitors to another address within 5 seconds is followed, as a request of its own. Two such pages in a row at most |
| Size | The first 5 MiB of the page. The rest is cut off, and the reader says so |
| Content | HTML or text. PDFs, images, video, sound and other files are refused |
| Compression | The reader asks for the page uncompressed. A site that sends it compressed anyway is refused |
| Certificates | An `https` page whose security certificate cannot be checked is not loaded |

The text of a page is decoded by the character set the site names for it, or else the one the page declares near its start, or else as UTF-8.

## Privacy

The request for a page carries nothing that says who you are:

| Not sent | What that means |
|---|---|
| Cookies | None are kept and none are sent. A cookie a site sets during a redirect is not sent back on the next step |
| Logins | No saved login is sent, and an address with a username or password in it is refused |
| Referrer | The site is not told which page or note the link was on |

Because of this the reader only ever gets the public version of a page: what the site shows to a visitor who is not signed in.

The site still learns what any site learns when a page is fetched from it: the network address the request comes from, and which page was asked for. The request names the program as `Noteriv/` followed by the version of the app and ` (reader)`. It does not present itself as a browser.

Pictures are a separate matter. See [Pictures](#pictures).

## Pages That Do Not Work

| Kind of page | What you get |
|---|---|
| Pages you have to sign in to | The reader cannot sign in. You get what the site shows to a visitor who is not signed in, or the message that the site refused |
| Pages built by scripts, such as web apps | The HTML of such a page holds little or no text. The reader shows what there is, with the notice that there is little to read |
| Sites that refuse the request | The message for the site's answer, such as HTTP 403 or 429 |
| Sites that send pages compressed although asked not to | The message about a compressed form |
| Files that are not pages, such as PDFs | `This is not a web page.` and what it is |
| Very long pages | The first 5 MiB |

In each case **Open in browser** opens the page in your browser.

## Messages

When a page cannot be shown, the reader shows a message in its place, with the address under it and two buttons: **Try again** and **Open in browser**.

The number after `HTTP` is the one the site sent. The numbers below are examples.

| Message | When it appears |
|---|---|
| `The page took too long to answer.` | The site did not answer in time. See [Limits](#limits) |
| `The site could not be found. Check the address and your connection.` | The name of the site could not be looked up |
| `Could not connect to the site. Check the address and your connection.` | No connection to the site could be made |
| `The site's security certificate could not be checked, so the page was not loaded.` | The certificate of an `https` site could not be checked |
| `The page stopped arriving before it was complete.` | The connection broke while the page was being read |
| `The page redirected too many times.` | The site redirected more than 5 times |
| `The page redirected to an address the reader does not open.` | A redirect led to something other than an `http` or `https` address, or to one with a username or password in it |
| `The site refused to show this page (HTTP 403). It may need you to sign in.` | The site answered 401 or 403 |
| `The page was not found (HTTP 404).` | The site answered 404 or 410 |
| `The site is turning requests away for now (HTTP 429). Try again later.` | The site answered 429 |
| `The site had a problem answering (HTTP 500).` | The site answered with a number from 500 to 599 |
| `The site answered with an error (HTTP 418).` | Any other answer that is not a success |
| `This is not a web page. It is a PDF document.` | The site sent a file. The second sentence can also end in `an image`, `a video`, `a sound file`, or `a file of type` and the type the site named |
| `This is not a web page.` | The site did not say what it sent, and it is not text |
| `The site sent this page in a compressed form the reader cannot unpack.` | The site sent the page compressed |
| `That is not a web address the reader can open.` | A link in a note led to an address that cannot be read as a web address |
| `Addresses that carry a username or password are not opened in the reader.` | A link led to an address with a username or password in it |
| `The page could not be loaded.` | Anything else that went wrong |

These appear under the toolbar:

| Message | When it appears |
|---|---|
| `Type a web address.` | You pressed `Enter` with the address box empty |
| `That is not a web address. Type one such as example.com.` | What you typed is not an address the reader opens. See [The Address Box](#the-address-box) |
| `The note could not be saved.` | **Save to vault** could not write the note |
