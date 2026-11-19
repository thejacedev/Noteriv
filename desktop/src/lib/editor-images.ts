/**
 * Pictures pasted into an editor or dragged onto it from outside the app.
 * The saving and the naming are in `image-insert.ts`; this is the part that
 * listens to the page.
 */

import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { attachmentFolderName } from "./vault-prefs";
import { fileNameOf } from "./file-path";
import {
  dropPoint,
  imageExtensionFor,
  imageInsertion,
  isImageName,
  isImageType,
  pasteIsEmpty,
  pastedImageName,
  saveImages,
  type ImageSource,
} from "./image-insert";
import { carriesFiles, pageTakesOutsideDrops, startedInApp } from "./outside-drops";

/** What an editor knows about the note it shows, asked for at the moment of the paste or drop. */
export interface ImageTarget {
  vaultPath: () => string | undefined;
  /** The note in front. One editor serves every tab, so this changes under it. */
  notePath: () => string | undefined;
  /** Whether a picture that ends its line gets the cursor moved below it. Off where no pictures are shown. */
  ownLine: boolean;
}

/** A bitmap from the clipboard comes under a name the browser made up. */
function hasMadeUpName(name: string): boolean {
  return /^image\.[a-z0-9]+$/i.test(name);
}

/**
 * Save pictures and write their links into the note. `note` is the note that
 * was in front when the paste or the drop happened; `at` is where a drop
 * landed.
 */
async function insertImages(
  view: EditorView,
  target: ImageTarget,
  images: ImageSource[],
  note: string | undefined,
  at?: number
): Promise<void> {
  const files = window.electronAPI;
  const vault = target.vaultPath();
  if (!files || !vault || images.length === 0) return;

  const links = await saveImages(files, vault, attachmentFolderName(), images);
  // Another tab may have come to the front while the files were written.
  // The picture was for the note that was there, so nothing is written.
  if (target.notePath() !== note || !view.dom.isConnected) return;

  const change = imageInsertion(view.state, links, { at, ownLine: target.ownLine });
  if (!change) return;
  view.dispatch(change);
  view.focus();
}

/**
 * Ctrl+V with a picture on the clipboard: a screenshot, an image copied in a
 * browser or a drawing program, or an image file copied in a file manager
 * where the system hands the file over.
 *
 * When the clipboard holds text as well (cells copied from a spreadsheet
 * come as text and as a picture of it), the text is pasted as before.
 *
 * Not every system hands the picture to the page. On Linux with WebKitGTK
 * 2.50 the paste arrives with nothing in it, and so does the text when the
 * clipboard holds both. The app is then asked what is on the clipboard,
 * which it tells once, right after the paste keys were pressed in this
 * window (`src-tauri/src/clipboard.rs`).
 */
export function imagePaste(target: ImageTarget): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData;
      if (!data || !window.electronAPI || !target.vaultPath()) return false;

      const note = target.notePath();
      const now = new Date();

      // What the app finds on the clipboard, for a paste the page was handed
      // nothing for: the text if there is any, else the picture.
      const pasteFromApp = async () => {
        const pasted = await window.electronAPI.takeClipboardPaste?.();
        if (!pasted) return;
        if ("image" in pasted) {
          await insertImages(view, target, [{ name: pastedImageName(now, "png"), base64: pasted.image }], note);
        } else if (target.notePath() === note && view.dom.isConnected) {
          view.dispatch(view.state.replaceSelection(pasted.text), { scrollIntoView: true, userEvent: "input.paste" });
        }
      };

      const pictures: { file: File; extension: string }[] = [];
      for (const file of Array.from(data.files ?? [])) {
        const extension = imageExtensionFor(file);
        if (extension && file.size > 0) pictures.push({ file, extension });
      }

      if (pictures.length === 0) {
        if (!window.electronAPI.takeClipboardPaste || !pasteIsEmpty(data)) return false;
        // Nothing came with the paste. Left to itself the editor would paste
        // that nothing over the selection; the selection stays instead, for
        // what the app finds on the clipboard to replace.
        event.preventDefault();
        void pasteFromApp().catch(() => {});
        return true;
      }
      if (data.getData("text/plain").trim() !== "") return false;

      event.preventDefault();
      void (async () => {
        const images: ImageSource[] = [];
        for (const { file, extension } of pictures) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.length === 0) continue;
          const name = hasMadeUpName(file.name) || !file.name ? pastedImageName(now, extension) : file.name;
          images.push({ name, bytes });
        }
        // A picture that turned out to have nothing in it: the app may be
        // able to read what the page could not.
        if (images.length === 0) await pasteFromApp();
        else await insertImages(view, target, images, note);
      })().catch(() => {});
      return true;
    },
  });
}

/**
 * Image files dragged onto `container` from outside the app. The link goes
 * in where the files are let go. `setActive` is told while such a drag is
 * over the editor, for the outline that shows where it will land.
 *
 * On Linux and macOS the app takes file drops itself and tells the page
 * about them, which is why this does not listen for "drop" on the element
 * there. One drop is reported to every editor in the window; the one under
 * the pointer takes it. On Windows the page is handed the drag like any web
 * page (`outside-drops.ts` says why), and `listenOnPage` below takes it.
 *
 * Returns the function that stops listening.
 */
export function listenForImageDrops(
  container: HTMLElement,
  getView: () => EditorView | null,
  target: ImageTarget,
  setActive: (active: boolean) => void
): () => void {
  const api = window.electronAPI;
  if (!api) return () => {};

  let platform = "";
  let stopped = false;
  let stopPage = () => {};
  api.getPlatform?.().then((name) => {
    platform = name;
    if (!stopped && pageTakesOutsideDrops(name)) stopPage = listenOnPage(container, getView, target, setActive);
  }).catch(() => {});

  let carriesImage = false;
  const pointOverEditor = (at: { x: number; y: number }) => {
    const point = dropPoint(at, platform, window.devicePixelRatio);
    const element = document.elementFromPoint(point.x, point.y);
    return element && container.contains(element) ? point : null;
  };

  const stopApp = api.onFileDrag?.((event) => {
    if (event.type === "leave") {
      carriesImage = false;
      setActive(false);
      return;
    }
    if (event.type === "enter" || event.type === "over") {
      if (event.type === "enter") carriesImage = event.paths.some((path) => isImageName(fileNameOf(path)));
      setActive(carriesImage && pointOverEditor(event) !== null);
      return;
    }

    carriesImage = false;
    setActive(false);
    const point = pointOverEditor(event);
    const view = getView();
    if (!point || !view) return;
    const images = event.paths.filter((path) => isImageName(fileNameOf(path))).map((path) => ({ path }));
    if (images.length === 0) return;
    const at = view.posAtCoords(point, false);
    insertImages(view, target, images, target.notePath(), at).catch(() => {});
  });

  return () => {
    stopped = true;
    stopPage();
    stopApp?.();
  };
}

/**
 * The same where the page is handed the drag itself: the files come with
 * the "drop" event, to be read, and not as paths.
 *
 * The listeners hear the events on their way down to the editor, before it
 * does. Left to itself the editor reads a dropped file as text and types
 * that into the note, so every file dragged over it is taken here. What is
 * not a picture is then let fall, as on the other systems.
 *
 * A picture shown in the app carries files too when it is dragged. It is
 * not from outside, and is refused here: taken, it would be saved again.
 *
 * A picture that is already in the vault is copied like any other, where
 * the other systems link it where it is: the page is not told where a
 * dropped file came from.
 */
function listenOnPage(
  container: HTMLElement,
  getView: () => EditorView | null,
  target: ImageTarget,
  setActive: (active: boolean) => void
): () => void {
  const over = (event: DragEvent) => {
    const data = event.dataTransfer;
    if (!data || !carriesFiles(data)) return;
    event.preventDefault();
    if (startedInApp(data)) {
      data.dropEffect = "none";
      setActive(false);
      return;
    }
    data.dropEffect = "copy";
    setActive(Array.from(data.items ?? []).some((item) => item.kind === "file" && isImageType(item.type)));
  };

  const leave = (event: DragEvent) => {
    // Going from one part of the editor to another is a "leave" too.
    if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) return;
    setActive(false);
  };

  const drop = (event: DragEvent) => {
    const data = event.dataTransfer;
    if (!data || !carriesFiles(data)) return;
    event.preventDefault();
    event.stopPropagation();
    setActive(false);
    if (startedInApp(data)) return;

    const view = getView();
    const pictures = Array.from(data.files ?? []).filter((file) => file.size > 0 && imageExtensionFor(file) !== null);
    if (!view || pictures.length === 0) return;
    const at = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    const note = target.notePath();
    void (async () => {
      const images: ImageSource[] = [];
      for (const file of pictures) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length > 0) images.push({ name: file.name || `image.${imageExtensionFor(file)}`, bytes });
      }
      await insertImages(view, target, images, note, at);
    })().catch(() => {});
  };

  container.addEventListener("dragenter", over, true);
  container.addEventListener("dragover", over, true);
  container.addEventListener("dragleave", leave, true);
  container.addEventListener("drop", drop, true);
  return () => {
    container.removeEventListener("dragenter", over, true);
    container.removeEventListener("dragover", over, true);
    container.removeEventListener("dragleave", leave, true);
    container.removeEventListener("drop", drop, true);
  };
}
