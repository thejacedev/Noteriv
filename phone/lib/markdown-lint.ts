/** Markdown linting rules and utilities */

export interface LintWarning {
  line: number;
  column: number;
  type: 'error' | 'warning' | 'info';
  message: string;
  rule: string;
}

export function lintMarkdown(
  content: string,
  vaultPath: string,
  fileList?: string[]
): LintWarning[] {
  const warnings: LintWarning[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;

  const headingMap = new Map<string, number>();
  let hasH1 = false;
  const tagSet = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (/^```/.test(line.trimStart())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = line.match(/^(#{1,6})\s*(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].replace(/\s*#+\s*$/, '').trim();
      if (level === 1) hasH1 = true;

      if (!text) {
        warnings.push({ line: lineNum, column: level + 1, type: 'warning', message: 'Empty heading', rule: 'empty-heading' });
      }
      if (text) {
        const key = `${level}:${text.toLowerCase()}`;
        if (headingMap.has(key)) {
          warnings.push({ line: lineNum, column: 1, type: 'warning', message: `Duplicate heading "${text}" (same as line ${headingMap.get(key)})`, rule: 'duplicate-heading' });
        } else {
          headingMap.set(key, lineNum);
        }
      }
    }

    if (fileList) {
      const wikilinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
      let wlMatch;
      while ((wlMatch = wikilinkRegex.exec(line)) !== null) {
        const target = wlMatch[1].trim().toLowerCase();
        const exists = fileList.some((f) => f.toLowerCase() === target);
        if (!exists) {
          warnings.push({ line: lineNum, column: wlMatch.index + 1, type: 'error', message: `Broken wiki-link: [[${wlMatch[1].trim()}]]`, rule: 'broken-wikilink' });
        }
      }
    }

    const tagRegex = /(?:^|\s)#([a-zA-Z][\w-/]*)/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(line)) !== null) {
      const tag = tagMatch[1].toLowerCase();
      if (tagSet.has(tag)) {
        warnings.push({ line: lineNum, column: tagMatch.index + 1, type: 'info', message: `Duplicate tag #${tagMatch[1]} (first used on line ${tagSet.get(tag)})`, rule: 'duplicate-tag' });
      } else {
        tagSet.set(tag, lineNum);
      }
    }

    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(line)) !== null) {
      const imgPath = imgMatch[2].trim();
      if (!imgPath.startsWith('http://') && !imgPath.startsWith('https://') && !imgPath.startsWith('data:')) {
        if (!imgPath || imgPath === '.') {
          warnings.push({ line: lineNum, column: imgMatch.index + 1, type: 'error', message: `Broken image path: ${imgPath || '(empty)'}`, rule: 'broken-image' });
        }
      }
    }
  }

  if (inCodeBlock) {
    let lastFenceLine = 0;
    let tracking = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^```/.test(lines[i].trimStart())) {
        tracking = !tracking;
        if (tracking) lastFenceLine = i + 1;
      }
    }
    warnings.push({ line: lastFenceLine, column: 1, type: 'error', message: 'Unclosed code block', rule: 'unclosed-code-block' });
  }

  if (!hasH1 && lines.length > 0 && content.trim().length > 0) {
    warnings.push({ line: 1, column: 1, type: 'info', message: 'Document has no H1 heading', rule: 'missing-title' });
  }

  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
  warnings.sort((a, b) => {
    const sa = severityOrder[a.type] ?? 3;
    const sb = severityOrder[b.type] ?? 3;
    if (sa !== sb) return sa - sb;
    return a.line - b.line;
  });

  return warnings;
}
