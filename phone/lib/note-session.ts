/**
 * The note that is open in the editor: its file, its latest text, and whether
 * that text is on disk yet.
 *
 * The app's state lives in React, and anything that runs later than the
 * render it was made in (the auto-save timer, the back button, a sync) sees
 * the text of that render, not the text on the screen. Auto-save used to
 * write the note as it was after the first keystroke and then mark it saved.
 * So the latest text is kept here, outside React, and every save goes
 * through here.
 */

export type WriteFile = (path: string, content: string) => boolean;

/** What became of the open note when its file may have been changed by something else. */
export type DiskChange =
  /** The file holds what the editor last read or wrote. */
  | 'unchanged'
  /** The file changed and the editor had nothing unsaved: the editor now shows the file. */
  | 'reloaded'
  /** The file changed while the editor had unsaved text: the editor's text is kept, the caller keeps the file's. */
  | 'conflict'
  /** The file is not there any more. The editor keeps its text; saving writes the file again. */
  | 'gone';

export class NoteSession {
  /** The open note's file, or null when no note is open. */
  file: string | null = null;
  /** The text in the editor. */
  content = '';
  /** Whether the editor holds text that is not on disk. */
  dirty = false;
  /** The text as it was last read from the file or written to it. */
  private onDisk = '';

  constructor(private readonly write: WriteFile) {}

  /** Start on another note, or on none. Flush the one before first if it is to be kept. */
  open(file: string | null, content: string): void {
    this.file = file;
    this.content = content;
    this.onDisk = content;
    this.dirty = false;
  }

  /** The text changed in the editor. */
  edit(content: string): void {
    this.content = content;
    this.dirty = true;
  }

  /** Write the latest text. False when no note is open or the write failed; the text then stays unsaved. */
  save(): boolean {
    if (this.file === null) return false;
    if (!this.write(this.file, this.content)) return false;
    this.onDisk = this.content;
    this.dirty = false;
    return true;
  }

  /** Write the latest text if it is not on disk yet. True when nothing is left unsaved. */
  flush(): boolean {
    return this.dirty ? this.save() : true;
  }

  /**
   * Something else may have changed the open note's file (a sync that pulled
   * a newer version). `nowOnDisk` is what the file holds, null when it is gone.
   *
   * Unsaved text is never thrown away: on a conflict the editor keeps it, and
   * the caller is expected to keep the file's text somewhere else before the
   * next save writes over it.
   */
  reconcile(nowOnDisk: string | null): DiskChange {
    if (this.file === null) return 'unchanged';
    if (nowOnDisk === null) return 'gone';
    if (nowOnDisk === this.onDisk) return 'unchanged';
    if (this.dirty) {
      // The next save is a deliberate overwrite of what is there now.
      this.onDisk = nowOnDisk;
      return 'conflict';
    }
    this.content = nowOnDisk;
    this.onDisk = nowOnDisk;
    return 'reloaded';
  }
}
