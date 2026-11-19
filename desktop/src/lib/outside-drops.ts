/**
 * Things dragged onto the window from outside the app, where the page is
 * handed them itself.
 *
 * On Linux and macOS the app takes a dropped file and tells the page about
 * it (`onFileDrag`). On Windows that way of taking drops stops every drag
 * that starts inside the page from being dropped anywhere: a note could not
 * be dragged onto a folder, nor a tab along the tab strip. So it is switched
 * off there (`src-tauri/tauri.windows.conf.json`, and `window_open_popout` for the
 * windows made later), and the page gets the drag events of a file as any
 * web page does.
 */

/** True where the page is handed outside drags itself. `platform` is what `getPlatform` answers. */
export function pageTakesOutsideDrops(platform: string): boolean {
  return platform === "win32";
}

/** True when a drag carries files, and not only text. */
export function carriesFiles(data: { types: ArrayLike<string> } | null | undefined): boolean {
  return !!data && Array.from(data.types ?? []).includes("Files");
}

/**
 * The mark `refuseStrayDrops` puts on every drag that starts inside one of
 * the app's windows.
 */
const OWN_DRAG = "application/x-noteriv-drag";

/**
 * True when a drag started inside the app. A picture shown in a note
 * carries files too when it is dragged, and it is not a file from outside:
 * taken for one, it would be saved a second time. Only told where
 * `refuseStrayDrops` runs.
 */
export function startedInApp(data: { types: ArrayLike<string> } | null | undefined): boolean {
  return !!data && Array.from(data.types ?? []).includes(OWN_DRAG);
}

/**
 * What to do with a drag that has come all the way up the page: "refuse" it,
 * or "leave" it to the webview.
 *
 * Left to the webview, a dropped file or link is opened in place of the app,
 * and the window shows a picture or a web page with no way back. Files are
 * refused wherever nothing in the page took them. Text is left alone over a
 * field or an editor, where the webview types it in, and refused elsewhere,
 * since a link is text too.
 */
export function strayDrag(taken: boolean, files: boolean, overText: boolean): "refuse" | "leave" {
  if (taken) return "leave";
  if (files) return "refuse";
  return overText ? "leave" : "refuse";
}

/** Whether text can be typed where the drag is: a field or an editor. */
function takesText(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!element) return false;
  if (element.closest("input, textarea")) return true;
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * Refuse every outside drag that nothing in the page takes, so that letting
 * go of a file over the tab strip or the status bar does nothing, and mark
 * every drag that starts in this window (`startedInApp`). Call it once per
 * window, where `pageTakesOutsideDrops` is true.
 *
 * Returns the function that stops it.
 */
export function refuseStrayDrops(root: Window = window): () => void {
  const decide = (event: DragEvent) =>
    strayDrag(event.defaultPrevented, carriesFiles(event.dataTransfer), takesText(event.target));

  // On the way down, before whatever is dragged gets to say what it carries.
  const start = (event: DragEvent) => {
    try { event.dataTransfer?.setData(OWN_DRAG, "1"); } catch { /* the drag goes on unmarked */ }
  };

  const over = (event: DragEvent) => {
    if (decide(event) === "leave") return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
  };
  const drop = (event: DragEvent) => {
    if (decide(event) === "refuse") event.preventDefault();
  };

  root.addEventListener("dragstart", start, true);
  root.addEventListener("dragenter", over);
  root.addEventListener("dragover", over);
  root.addEventListener("drop", drop);
  return () => {
    root.removeEventListener("dragstart", start, true);
    root.removeEventListener("dragenter", over);
    root.removeEventListener("dragover", over);
    root.removeEventListener("drop", drop);
  };
}
