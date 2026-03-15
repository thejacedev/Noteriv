import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface MarkdownPreviewProps {
  content: string;
  fontSize: number;
  onLinkPress?: (url: string) => void;
  onWikiLinkPress?: (name: string) => void;
}

// ---- Inline parser ----

type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'strikethrough'; children: InlineNode[] }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'image'; alt: string; url: string }
  | { type: 'wikilink'; name: string }
  | { type: 'tag'; tag: string };

function parseInline(raw: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = 0;

  while (i < raw.length) {
    // Inline code
    if (raw[i] === '`') {
      const end = raw.indexOf('`', i + 1);
      if (end !== -1) {
        nodes.push({ type: 'code', text: raw.substring(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Wiki-link [[...]]
    if (raw[i] === '[' && raw[i + 1] === '[') {
      const end = raw.indexOf(']]', i + 2);
      if (end !== -1) {
        const inner = raw.substring(i + 2, end);
        nodes.push({ type: 'wikilink', name: inner });
        i = end + 2;
        continue;
      }
    }

    // Image ![alt](url)
    if (raw[i] === '!' && raw[i + 1] === '[') {
      const altEnd = raw.indexOf(']', i + 2);
      if (altEnd !== -1 && raw[altEnd + 1] === '(') {
        const urlEnd = raw.indexOf(')', altEnd + 2);
        if (urlEnd !== -1) {
          nodes.push({
            type: 'image',
            alt: raw.substring(i + 2, altEnd),
            url: raw.substring(altEnd + 2, urlEnd),
          });
          i = urlEnd + 1;
          continue;
        }
      }
    }

    // Link [text](url)
    if (raw[i] === '[') {
      const textEnd = raw.indexOf(']', i + 1);
      if (textEnd !== -1 && raw[textEnd + 1] === '(') {
        const urlEnd = raw.indexOf(')', textEnd + 2);
        if (urlEnd !== -1) {
          nodes.push({
            type: 'link',
            text: raw.substring(i + 1, textEnd),
            url: raw.substring(textEnd + 2, urlEnd),
          });
          i = urlEnd + 1;
          continue;
        }
      }
    }

    // Bold **...** or __...__
    if ((raw[i] === '*' && raw[i + 1] === '*') || (raw[i] === '_' && raw[i + 1] === '_')) {
      const marker = raw.substring(i, i + 2);
      const end = raw.indexOf(marker, i + 2);
      if (end !== -1) {
        nodes.push({ type: 'bold', children: parseInline(raw.substring(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // Strikethrough ~~...~~
    if (raw[i] === '~' && raw[i + 1] === '~') {
      const end = raw.indexOf('~~', i + 2);
      if (end !== -1) {
        nodes.push({
          type: 'strikethrough',
          children: parseInline(raw.substring(i + 2, end)),
        });
        i = end + 2;
        continue;
      }
    }

    // Italic *...* or _..._
    if ((raw[i] === '*' || raw[i] === '_') && raw[i + 1] !== raw[i]) {
      const marker = raw[i];
      const end = raw.indexOf(marker, i + 1);
      if (end !== -1 && end > i + 1) {
        nodes.push({ type: 'italic', children: parseInline(raw.substring(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    // #tag (standalone word starting with #, not heading context)
    if (raw[i] === '#' && (i === 0 || raw[i - 1] === ' ') && raw[i + 1] && /[a-zA-Z]/.test(raw[i + 1])) {
      const match = raw.substring(i).match(/^#([a-zA-Z0-9_/\-]+)/);
      if (match) {
        nodes.push({ type: 'tag', tag: match[0] });
        i += match[0].length;
        continue;
      }
    }

    // Plain text - consume until next special char
    let textEnd = i + 1;
    while (textEnd < raw.length && !'[`*_~!#'.includes(raw[textEnd])) {
      textEnd++;
    }
    nodes.push({ type: 'text', text: raw.substring(i, textEnd) });
    i = textEnd;
  }

  return nodes;
}

// ---- Block parser ----

type BlockNode =
  | { type: 'heading'; level: number; text: string; line: number }
  | { type: 'paragraph'; text: string; line: number }
  | { type: 'code_block'; language: string; code: string; line: number }
  | { type: 'blockquote'; lines: string[]; line: number }
  | { type: 'callout'; kind: string; title: string; lines: string[]; line: number }
  | { type: 'hr'; line: number }
  | { type: 'ul'; items: { text: string; checked: boolean | null }[]; line: number }
  | { type: 'ol'; items: { text: string; num: number }[]; line: number }
  | { type: 'table'; headers: string[]; alignments: string[]; rows: string[][]; line: number }
  | { type: 'math_block'; code: string; line: number };

function parseBlocks(content: string): BlockNode[] {
  const lines = content.split('\n');
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Code block (fenced)
    if (line.trimStart().startsWith('```')) {
      const indent = line.indexOf('`');
      const lang = line.trim().substring(3).trim();
      const codeLines: string[] = [];
      const startLine = i;
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code_block', language: lang, code: codeLines.join('\n'), line: startLine });
      continue;
    }

    // Math block ($$)
    if (line.trim() === '$$') {
      const codeLines: string[] = [];
      const startLine = i;
      i++;
      while (i < lines.length && lines[i].trim() !== '$$') {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing $$
      blocks.push({ type: 'math_block', code: codeLines.join('\n'), line: startLine });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
        line: i,
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr', line: i });
      i++;
      continue;
    }

    // Table
    if (i + 1 < lines.length && /^\|(.+)\|$/.test(line.trim()) && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
      const headers = line.trim().slice(1, -1).split('|').map((h) => h.trim());
      const alignRow = lines[i + 1].trim().slice(1, -1).split('|').map((a) => a.trim());
      const alignments = alignRow.map((a) => {
        if (a.startsWith(':') && a.endsWith(':')) return 'center';
        if (a.endsWith(':')) return 'right';
        return 'left';
      });
      const rows: string[][] = [];
      const startLine = i;
      i += 2;
      while (i < lines.length && /^\|(.+)\|$/.test(lines[i].trim())) {
        rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim()));
        i++;
      }
      blocks.push({ type: 'table', headers, alignments, rows, line: startLine });
      continue;
    }

    // Callout (> [!TYPE] ...)
    const calloutMatch = line.match(/^>\s*\[!(\w+)\]\s*(.*)?$/);
    if (calloutMatch) {
      const kind = calloutMatch[1].toLowerCase();
      const title = calloutMatch[2] || kind.charAt(0).toUpperCase() + kind.slice(1);
      const contentLines: string[] = [];
      const startLine = i;
      i++;
      while (i < lines.length && lines[i].startsWith('>')) {
        contentLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'callout', kind, title, lines: contentLines, line: startLine });
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      const startLine = i;
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines, line: startLine });
      continue;
    }

    // Unordered list / Task list
    if (/^[\s]*[-*+]\s/.test(line)) {
      const items: { text: string; checked: boolean | null }[] = [];
      const startLine = i;
      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[\s]*[-*+]\s/, '');
        // Task list
        const taskMatch = itemText.match(/^\[([ xX])\]\s(.*)$/);
        if (taskMatch) {
          items.push({ text: taskMatch[2], checked: taskMatch[1] !== ' ' });
        } else {
          items.push({ text: itemText, checked: null });
        }
        i++;
      }
      blocks.push({ type: 'ul', items, line: startLine });
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+[.)]\s/.test(line)) {
      const items: { text: string; num: number }[] = [];
      const startLine = i;
      while (i < lines.length && /^[\s]*\d+[.)]\s/.test(lines[i])) {
        const match = lines[i].match(/^[\s]*(\d+)[.)]\s(.*)$/);
        if (match) {
          items.push({ num: parseInt(match[1], 10), text: match[2] });
        }
        i++;
      }
      blocks.push({ type: 'ol', items, line: startLine });
      continue;
    }

    // Paragraph (collect contiguous non-empty lines)
    const paraLines: string[] = [];
    const startLine = i;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|```|>|\*{3,}|-{3,}|_{3,}|[-*+]\s|\d+[.)]\s|\|)/.test(lines[i]) && lines[i].trim() !== '$$') {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join('\n'), line: startLine });
    }
  }

  return blocks;
}

// ---- Renderers ----

function RenderInline({
  nodes,
  fontSize,
  colors,
  onLinkPress,
  onWikiLinkPress,
}: {
  nodes: InlineNode[];
  fontSize: number;
  colors: any;
  onLinkPress?: (url: string) => void;
  onWikiLinkPress?: (name: string) => void;
}) {
  return (
    <Text>
      {nodes.map((node, idx) => {
        switch (node.type) {
          case 'text':
            return <Text key={idx} style={{ color: colors.textPrimary, fontSize }}>{node.text}</Text>;
          case 'bold':
            return (
              <Text key={idx} style={{ fontWeight: '700', color: colors.textPrimary, fontSize }}>
                <RenderInline nodes={node.children} fontSize={fontSize} colors={colors} onLinkPress={onLinkPress} onWikiLinkPress={onWikiLinkPress} />
              </Text>
            );
          case 'italic':
            return (
              <Text key={idx} style={{ fontStyle: 'italic', color: colors.textPrimary, fontSize }}>
                <RenderInline nodes={node.children} fontSize={fontSize} colors={colors} onLinkPress={onLinkPress} onWikiLinkPress={onWikiLinkPress} />
              </Text>
            );
          case 'strikethrough':
            return (
              <Text key={idx} style={{ textDecorationLine: 'line-through', color: colors.textMuted, fontSize }}>
                <RenderInline nodes={node.children} fontSize={fontSize} colors={colors} onLinkPress={onLinkPress} onWikiLinkPress={onWikiLinkPress} />
              </Text>
            );
          case 'code':
            return (
              <Text
                key={idx}
                style={{
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  backgroundColor: colors.bgTertiary,
                  color: colors.peach,
                  fontSize: fontSize - 1,
                  borderRadius: 3,
                  paddingHorizontal: 4,
                }}
              >
                {node.text}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={idx}
                style={{ color: colors.blue, fontSize, textDecorationLine: 'underline' }}
                onPress={() => onLinkPress?.(node.url)}
              >
                {node.text}
              </Text>
            );
          case 'image':
            return (
              <Text key={idx} style={{ color: colors.textMuted, fontSize: fontSize - 1 }}>
                [Image: {node.alt}]
              </Text>
            );
          case 'wikilink':
            return (
              <Text
                key={idx}
                style={{ color: colors.blue, fontSize }}
                onPress={() => onWikiLinkPress?.(node.name)}
              >
                {node.name}
              </Text>
            );
          case 'tag':
            return (
              <Text
                key={idx}
                style={{
                  color: colors.mauve,
                  fontSize,
                  fontWeight: '500',
                  backgroundColor: colors.mauve + '18',
                  borderRadius: 3,
                  paddingHorizontal: 3,
                }}
              >
                {node.tag}
              </Text>
            );
          default:
            return null;
        }
      })}
    </Text>
  );
}

function InlineText({
  text,
  fontSize,
  colors,
  onLinkPress,
  onWikiLinkPress,
  style,
}: {
  text: string;
  fontSize: number;
  colors: any;
  onLinkPress?: (url: string) => void;
  onWikiLinkPress?: (name: string) => void;
  style?: any;
}) {
  const nodes = useMemo(() => parseInline(text), [text]);
  return (
    <Text style={style}>
      <RenderInline
        nodes={nodes}
        fontSize={fontSize}
        colors={colors}
        onLinkPress={onLinkPress}
        onWikiLinkPress={onWikiLinkPress}
      />
    </Text>
  );
}

export default function MarkdownPreview({
  content,
  fontSize,
  onLinkPress,
  onWikiLinkPress,
}: MarkdownPreviewProps) {
  const { colors } = useTheme();
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const lineHeight = fontSize * 1.65;

  // Callout color map
  const calloutColors: Record<string, string> = {
    note: colors.blue,
    tip: colors.teal,
    info: colors.accent,
    important: colors.mauve,
    warning: colors.yellow,
    caution: colors.red,
    danger: colors.red,
    example: colors.peach,
    success: colors.green,
    question: colors.yellow,
    quote: colors.textMuted,
    abstract: colors.accent,
    summary: colors.accent,
    bug: colors.red,
    todo: colors.accent,
  };

  const renderBlock = useCallback(
    (block: BlockNode, index: number) => {
      switch (block.type) {
        case 'heading': {
          const sizes = [fontSize * 2, fontSize * 1.65, fontSize * 1.35, fontSize * 1.15, fontSize, fontSize * 0.9];
          const size = sizes[block.level - 1] || fontSize;
          return (
            <View key={index} style={[styles.block, { marginTop: block.level <= 2 ? 20 : 14 }]}>
              <InlineText
                text={block.text}
                fontSize={size}
                colors={colors}
                onLinkPress={onLinkPress}
                onWikiLinkPress={onWikiLinkPress}
                style={{ fontWeight: '700', color: colors.textPrimary, lineHeight: size * 1.3 }}
              />
              {block.level <= 2 && (
                <View style={[styles.headingRule, { marginTop: 6, backgroundColor: colors.border }]} />
              )}
            </View>
          );
        }

        case 'paragraph':
          return (
            <View key={index} style={styles.block}>
              <InlineText
                text={block.text}
                fontSize={fontSize}
                colors={colors}
                onLinkPress={onLinkPress}
                onWikiLinkPress={onWikiLinkPress}
                style={{ color: colors.textPrimary, lineHeight }}
              />
            </View>
          );

        case 'code_block':
          return (
            <View key={index} style={[styles.codeBlock, { backgroundColor: colors.bgTertiary }]}>
              {block.language ? (
                <Text style={[styles.codeLang, { color: colors.textMuted }]}>{block.language}</Text>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text
                  style={[
                    styles.codeText,
                    { color: colors.textPrimary, fontSize: fontSize - 1, lineHeight: (fontSize - 1) * 1.5 },
                  ]}
                  selectable
                >
                  {block.code}
                </Text>
              </ScrollView>
            </View>
          );

        case 'math_block':
          return (
            <View key={index} style={[styles.codeBlock, { backgroundColor: colors.bgTertiary }]}>
              <Text style={[styles.codeLang, { color: colors.textMuted }]}>math</Text>
              <Text
                style={[
                  styles.codeText,
                  { color: colors.textPrimary, fontSize: fontSize - 1, lineHeight: (fontSize - 1) * 1.5 },
                ]}
                selectable
              >
                {block.code}
              </Text>
            </View>
          );

        case 'blockquote':
          return (
            <View key={index} style={styles.blockquote}>
              <View style={[styles.blockquoteBorder, { backgroundColor: colors.textMuted }]} />
              <View style={styles.blockquoteContent}>
                {block.lines.map((line, li) => (
                  <InlineText
                    key={li}
                    text={line}
                    fontSize={fontSize}
                    colors={colors}
                    onLinkPress={onLinkPress}
                    onWikiLinkPress={onWikiLinkPress}
                    style={{ color: colors.textSecondary, lineHeight, fontStyle: 'italic' }}
                  />
                ))}
              </View>
            </View>
          );

        case 'callout': {
          const accentColor = calloutColors[block.kind] || colors.blue;
          return (
            <View
              key={index}
              style={[styles.callout, { borderLeftColor: accentColor, backgroundColor: accentColor + '10' }]}
            >
              <Text style={[styles.calloutTitle, { color: accentColor }]}>
                {block.title}
              </Text>
              {block.lines.map((line, li) => (
                <InlineText
                  key={li}
                  text={line}
                  fontSize={fontSize - 1}
                  colors={colors}
                  onLinkPress={onLinkPress}
                  onWikiLinkPress={onWikiLinkPress}
                  style={{ color: colors.textSecondary, lineHeight: lineHeight * 0.95 }}
                />
              ))}
            </View>
          );
        }

        case 'hr':
          return <View key={index} style={[styles.hr, { backgroundColor: colors.border }]} />;

        case 'ul':
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, li) => (
                <View key={li} style={styles.listItem}>
                  {item.checked !== null ? (
                    <Text style={[styles.listBullet, { color: item.checked ? colors.green : colors.textMuted }]}>
                      {item.checked ? '\u2611' : '\u2610'}
                    </Text>
                  ) : (
                    <Text style={[styles.listBullet, { color: colors.textMuted }]}>{'\u2022'}</Text>
                  )}
                  <View style={styles.listItemContent}>
                    <InlineText
                      text={item.text}
                      fontSize={fontSize}
                      colors={colors}
                      onLinkPress={onLinkPress}
                      onWikiLinkPress={onWikiLinkPress}
                      style={{
                        color: item.checked ? colors.textMuted : colors.textPrimary,
                        lineHeight,
                        textDecorationLine: item.checked ? 'line-through' : 'none',
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          );

        case 'ol':
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, li) => (
                <View key={li} style={styles.listItem}>
                  <Text style={[styles.listNumber, { color: colors.textMuted }]}>{item.num}.</Text>
                  <View style={styles.listItemContent}>
                    <InlineText
                      text={item.text}
                      fontSize={fontSize}
                      colors={colors}
                      onLinkPress={onLinkPress}
                      onWikiLinkPress={onWikiLinkPress}
                      style={{ color: colors.textPrimary, lineHeight }}
                    />
                  </View>
                </View>
              ))}
            </View>
          );

        case 'table':
          return (
            <ScrollView key={index} horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
              <View style={[styles.table, { borderColor: colors.border }]}>
                {/* Header row */}
                <View style={[styles.tableHeaderRow, { backgroundColor: colors.bgTertiary }]}>
                  {block.headers.map((header, hi) => (
                    <View key={hi} style={[styles.tableCell, { backgroundColor: colors.bgTertiary, borderRightColor: colors.border, borderBottomColor: colors.border }]}>
                      <InlineText
                        text={header}
                        fontSize={fontSize - 1}
                        colors={colors}
                        onLinkPress={onLinkPress}
                        onWikiLinkPress={onWikiLinkPress}
                        style={{
                          color: colors.textPrimary,
                          fontWeight: '700',
                          textAlign: (block.alignments[hi] || 'left') as any,
                        }}
                      />
                    </View>
                  ))}
                </View>
                {/* Data rows */}
                {block.rows.map((row, ri) => (
                  <View
                    key={ri}
                    style={[styles.tableRow, ri % 2 === 0 ? { backgroundColor: colors.bgSecondary } : null]}
                  >
                    {row.map((cell, ci) => (
                      <View key={ci} style={[styles.tableCell, { borderRightColor: colors.border, borderBottomColor: colors.border }]}>
                        <InlineText
                          text={cell}
                          fontSize={fontSize - 1}
                          colors={colors}
                          onLinkPress={onLinkPress}
                          onWikiLinkPress={onWikiLinkPress}
                          style={{
                            color: colors.textSecondary,
                            textAlign: (block.alignments[ci] || 'left') as any,
                          }}
                        />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );

        default:
          return null;
      }
    },
    [colors, fontSize, lineHeight, onLinkPress, onWikiLinkPress]
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator
    >
      {blocks.map(renderBlock)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 80,
  },
  block: {
    marginBottom: 10,
  },
  headingRule: {
    height: StyleSheet.hairlineWidth,
  },
  codeBlock: {
    borderRadius: 8,
    padding: 14,
    marginVertical: 8,
  },
  codeLang: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  blockquote: {
    flexDirection: 'row',
    marginVertical: 8,
  },
  blockquoteBorder: {
    width: 3,
    borderRadius: 2,
    marginRight: 12,
  },
  blockquoteContent: {
    flex: 1,
    paddingVertical: 2,
  },
  callout: {
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 14,
    marginVertical: 8,
  },
  calloutTitle: {
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
  },
  list: {
    marginVertical: 6,
    paddingLeft: 4,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  listBullet: {
    fontSize: 16,
    width: 22,
    textAlign: 'center',
    marginTop: 1,
  },
  listNumber: {
    fontSize: 14,
    width: 24,
    textAlign: 'right',
    marginRight: 6,
    fontWeight: '500',
    marginTop: 2,
  },
  listItemContent: {
    flex: 1,
  },
  tableScroll: {
    marginVertical: 8,
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCell: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
