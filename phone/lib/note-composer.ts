import { readFile } from '@/lib/file-system';

/**
 * Merge multiple markdown files into a single string.
 *
 * When `addHeadings` is true, each file's content is preceded by a level-1
 * heading derived from the filename.
 */
export async function mergeNotes(
  filePaths: string[],
  options: { addHeadings: boolean }
): Promise<string> {
  const sections: string[] = [];

  for (const filePath of filePaths) {
    const content = await readFile(filePath);
    if (content === null) continue;

    if (options.addHeadings) {
      const name = fileNameFromPath(filePath);
      sections.push(`# ${name}\n\n${content.trim()}`);
    } else {
      sections.push(content.trim());
    }
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Split markdown content into sections based on heading level.
 *
 * Each returned section includes the heading text as `title` and everything
 * up to (but not including) the next heading of the same or higher level as
 * `content`.  Content before the first matching heading is grouped under an
 * empty-string title.
 */
export function splitByHeadings(
  content: string,
  level: 1 | 2
): { title: string; content: string }[] {
  const prefix = '#'.repeat(level) + ' ';
  const lines = content.split('\n');
  const sections: { title: string; content: string }[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(prefix)) {
      // Push the previous section
      sections.push({
        title: currentTitle,
        content: currentLines.join('\n').trim(),
      });
      currentTitle = line.slice(prefix.length).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Push the final section
  sections.push({
    title: currentTitle,
    content: currentLines.join('\n').trim(),
  });

  // Remove a leading empty section if it has no content
  if (sections.length > 0 && !sections[0].title && !sections[0].content) {
    sections.shift();
  }

  return sections;
}

/**
 * Sanitize a string for use as a filename.
 * Removes or replaces characters that are not safe in filenames.
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function fileNameFromPath(filePath: string): string {
  const segments = filePath.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  return last.replace(/\.(md|markdown)$/i, '');
}
