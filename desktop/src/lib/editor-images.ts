/**
 * Pictures pasted into an editor or dragged onto it from outside the app.
 * The saving and the naming are in `image-insert.ts`; this is the part that
 * listens to the page.
 */

import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { attachmentFolderName } from "./vault-prefs";
import {
  dropPoint,
  fileNameOf,
  imageExtensionFor,
  imageInsertion,
  isImageName,
  pastedImageName,
  saveImages,
  type ImageSource,
} from "./image-insert";

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

async function insertImages(
  view: EditorView,
  target: ImageTarget,
  images: ImageSource[],
  at?: number
): Promise<void> {
  const files = window.electronAPI;
  const vault = target.vaultPath();
  if (!files || !vault || images.length === 0) return;

  const note = target.notePath();
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
 */
export function imagePaste(target: ImageTarget): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData;
      if (!data || !window.electronAPI || !target.vaultPath()) return false;

      const pictures: { file: File; extension: string }[] = [];
      for (const file of Array.from(data.files ?? [])) {
        const extension = imageExtensionFor(file);
        if (extension) pictures.push({ file, extension });
      }
      if (pictures.length === 0) return false;
      if (data.getData("text/plain").trim() !== "") return false;

      event.preventDefault();
      const now = new Date();
      void (async () => {
        const images: ImageSource[] = [];
        for (const { file, extension } of pictures) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const name = hasMadeUpName(file.name) || !file.name ? pastedImageName(now, extension) : file.name;
          images.push({ name, bytes });
        }
        await insertImages(view, target, images);
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
 * The app takes file drops itself and tells the page about them, which is
 * why this does not listen for "drop" on the element. One drop is reported
 * to every editor in the window; the one under the pointer takes it.
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
  if (!api?.onFileDrag) return () => {};

  let platform = "";
  api.getPlatform?.().then((name) => { platform = name; }).catch(() => {});

  let carriesImage = false;
  const pointOverEditor = (at: { x: number; y: number }) => {
    const point = dropPoint(at, platform, window.devicePixelRatio);
    const element = document.elementFromPoint(point.x, point.y);
    return element && container.contains(element) ? point : null;
  };

  return api.onFileDrag((event) => {
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
    insertImages(view, target, images, at).catch(() => {});
  });
}
