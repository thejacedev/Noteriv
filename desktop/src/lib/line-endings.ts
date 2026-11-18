/**
 * The line endings of a note.
 *
 * The editor holds every note with "\n" between its lines, whatever the file
 * has: a note written on Windows comes with "\r\n". So the text in the editor
 * and the text on disk can be the same note and still not be the same string.
 * Two rules follow, and these helpers are for keeping them:
 *
 * - a note has changed only when it differs apart from its line endings;
 * - a note is written with the line endings its file already has.
 *
 * Without them, opening a note with "\r\n" showed it as changed, and the next
 * save rewrote every line of the file with "\n".
 */

export type LineEnding = "\n" | "\r\n";

/** Text with every line break as "\n", the way the editor holds it. */
export function toLf(text: string): string {
  return text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
}

/** True when two texts are the same apart from how their lines end. */
export function sameText(a: string, b: string): boolean {
  return a === b || toLf(a) === toLf(b);
}

/**
 * The line ending a file uses: the one most of its lines end with. A file
 * with as many of one as of the other counts as "\r\n", and one with no line
 * break at all as "\n".
 */
export function lineEndingOf(text: string): LineEnding {
  if (!text.includes("\r\n")) return "\n";
  let windows = 0;
  let unix = 0;
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) {
    if (at > 0 && text[at - 1] === "\r") windows++;
    else unix++;
  }
  return windows >= unix ? "\r\n" : "\n";
}

/**
 * `text` as it is to be written over a file that holds `onDisk`: with that
 * file's line endings.
 *
 * A file that mixes the two gets the ending most of its lines have, on every
 * line. That happens only when the note is saved with a real change in it.
 */
export function withLineEndingsOf(text: string, onDisk: string): string {
  if (lineEndingOf(onDisk) === "\n") return text;
  return toLf(text).replace(/\n/g, "\r\n");
}
