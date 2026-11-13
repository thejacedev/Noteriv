import { Decoration } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import type { Line } from "@codemirror/state";

/** Context passed to block-level renderers */
export interface BlockContext {
  builder: RangeSetBuilder<Decoration>;
  line: Line;
  text: string;
  lineNumber: number;
}

/**
 * Block renderer — processes a full line of markdown.
 * Return `true` if the line was handled (skips remaining renderers).
 */
export interface BlockRenderer {
  name: string;
  process(ctx: BlockContext): boolean;
  /**
   * Optional: extract the inline-processable content after this
   * block's prefix (e.g. the text after `> ` in a blockquote).
   */
  getContent?(text: string): { offset: number; content: string } | null;
}

/** Replacement produced by an inline renderer */
export interface InlineReplacement {
  from: number;
  to: number;
  html: string;
  className: string;
}

/** What an inline renderer is told about where the text is. */
export interface InlineContext {
  /**
   * The full path of the note being shown, or "" when it is not known. A
   * link can be a path from the folder of the note it is written in.
   */
  notePath: string;
}

/**
 * Inline renderer — finds patterns within a line's text and
 * produces HTML replacements. Called after block renderers.
 */
export interface InlineRenderer {
  name: string;
  /** Order priority — lower runs first. Default 100. */
  priority?: number;
  /** Find all matches in `text`. Positions are relative to `offset`. */
  find(text: string, offset: number, context?: InlineContext): InlineReplacement[];
}
