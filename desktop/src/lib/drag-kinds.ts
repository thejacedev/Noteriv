/**
 * What a drag that starts in the file list or on the tab strip says it
 * carries.
 *
 * The list and the tab strip remember themselves what is being dragged; the
 * drag only has to carry something. It used to carry text (the path of the
 * note, the number of the tab), and dragged text is typed in wherever it is
 * let go: a note dropped on the open note wrote its path into it, and a tab
 * wrote its number. A kind of the app's own is taken by nothing else, in
 * the app or outside it.
 */

/** A row of the file list: a note or a folder. */
export const FILE_LIST_DRAG = "application/x-noteriv-file";

/** A tab of the tab strip. */
export const TAB_DRAG = "application/x-noteriv-tab";
