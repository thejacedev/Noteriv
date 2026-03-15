/**
 * Slide presentation utilities for Noteriv mobile.
 * Parses markdown into slides separated by `---` (horizontal rules).
 */

export interface Slide {
  content: string;
  notes: string;
  index: number;
}

/**
 * Parse a full markdown document into an array of slides.
 * Slides are separated by `---` on its own line.
 */
export function parseSlides(content: string): Slide[] {
  const rawSlides = splitByHorizontalRules(content);

  return rawSlides.map((raw, index) => {
    const { body, notes } = extractNotes(raw.trim());
    return {
      content: body,
      notes,
      index,
    };
  });
}

/**
 * Split markdown content by `---` horizontal rules, respecting fenced code blocks.
 */
function splitByHorizontalRules(content: string): string[] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const slides: string[] = [];
  let currentSlide: string[] = [];
  let inCodeBlock = false;
  let codeFence = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inCodeBlock) {
      const fenceMatch = line.match(/^(`{3,}|~{3,})/);
      if (fenceMatch) {
        inCodeBlock = true;
        codeFence = fenceMatch[1];
        currentSlide.push(line);
        continue;
      }
    } else {
      if (line.startsWith(codeFence) && line.trim() === codeFence) {
        inCodeBlock = false;
        codeFence = '';
        currentSlide.push(line);
        continue;
      }
      currentSlide.push(line);
      continue;
    }

    if (line.trim().match(/^(-{3,}|\*{3,}|_{3,})$/) && !inCodeBlock) {
      slides.push(currentSlide.join('\n'));
      currentSlide = [];
      continue;
    }

    currentSlide.push(line);
  }

  if (currentSlide.length > 0 || slides.length > 0) {
    slides.push(currentSlide.join('\n'));
  }

  if (slides.length === 0) {
    return [content];
  }

  return slides;
}

/**
 * Extract speaker notes from the bottom of a slide.
 */
function extractNotes(slideContent: string): { body: string; notes: string } {
  const lines = slideContent.split('\n');
  let noteStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === 'Note:' || trimmed.startsWith('Note:') || trimmed === '???') {
      noteStartIndex = i;
      break;
    }
  }

  if (noteStartIndex === -1) {
    return { body: slideContent, notes: '' };
  }

  const body = lines.slice(0, noteStartIndex).join('\n').trimEnd();
  const notesLines = lines.slice(noteStartIndex);

  let firstNoteLine = notesLines[0].trim();
  if (firstNoteLine.startsWith('Note:')) {
    firstNoteLine = firstNoteLine.slice(5).trim();
  } else if (firstNoteLine === '???') {
    firstNoteLine = '';
  }

  const notes = [firstNoteLine, ...notesLines.slice(1)].join('\n').trim();

  return { body, notes };
}
