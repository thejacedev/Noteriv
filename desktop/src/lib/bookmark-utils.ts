/**
 * Utilities for managing bookmarked file paths.
 */

/**
 * Toggle a bookmark: add if not present, remove if already bookmarked.
 * Returns the updated bookmarks array.
 */
export function toggleBookmark(bookmarks: string[], filePath: string): string[] {
  if (isBookmarked(bookmarks, filePath)) {
    return bookmarks.filter((b) => b !== filePath);
  }
  return [...bookmarks, filePath];
}

/**
 * Check whether a file path is bookmarked.
 */
export function isBookmarked(bookmarks: string[], filePath: string): boolean {
  return bookmarks.includes(filePath);
}
