import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { listAllMarkdownFiles, readFile } from '@/lib/file-system';

interface TagsPanelProps {
  vaultPath: string;
  onTagPress: (tag: string) => void;
}

interface TagNode {
  name: string;
  fullTag: string;
  count: number;
  children: Map<string, TagNode>;
}

interface FlatTagEntry {
  id: string;
  name: string;
  fullTag: string;
  count: number;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

function buildTagTree(tags: Map<string, number>): TagNode {
  const root: TagNode = {
    name: '',
    fullTag: '',
    count: 0,
    children: new Map(),
  };

  for (const [tag, count] of tags) {
    const parts = tag.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const fullPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullTag: fullPath,
          count: 0,
          children: new Map(),
        });
      }

      const child = current.children.get(part)!;
      if (i === parts.length - 1) {
        child.count += count;
      }
      current = child;
    }
  }

  return root;
}

function flattenTree(
  node: TagNode,
  depth: number,
  expandedTags: Set<string>
): FlatTagEntry[] {
  const entries: FlatTagEntry[] = [];

  // Sort children alphabetically
  const sortedChildren = Array.from(node.children.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  for (const child of sortedChildren) {
    const hasChildren = child.children.size > 0;
    const isExpanded = expandedTags.has(child.fullTag);

    // Calculate total count including children
    let totalCount = child.count;
    function countChildren(n: TagNode) {
      totalCount += n.count;
      for (const c of n.children.values()) {
        countChildren(c);
      }
    }
    for (const c of child.children.values()) {
      countChildren(c);
    }

    entries.push({
      id: child.fullTag,
      name: child.name,
      fullTag: child.fullTag,
      count: totalCount,
      depth,
      hasChildren,
      isExpanded,
    });

    if (hasChildren && isExpanded) {
      entries.push(...flattenTree(child, depth + 1, expandedTags));
    }
  }

  return entries;
}

export default function TagsPanel({ vaultPath, onTagPress }: TagsPanelProps) {
  const { colors } = useTheme();
  const [tags, setTags] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  const tagColors = useMemo(() => [colors.mauve, colors.blue, colors.teal, colors.green, colors.peach, colors.pink, colors.accent, colors.accent], [colors]);

  const getTagColor = useCallback((tag: string): string => {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = (hash * 31 + tag.charCodeAt(i)) | 0;
    }
    return tagColors[Math.abs(hash) % tagColors.length];
  }, [tagColors]);

  // Scan files for tags
  useEffect(() => {
    if (!vaultPath) return;

    let cancelled = false;

    async function scan() {
      setIsLoading(true);
      try {
        const allFiles = await listAllMarkdownFiles(vaultPath);
        const tagMap = new Map<string, number>();

        for (const file of allFiles) {
          const content = await readFile(file.filePath);
          if (!content || cancelled) continue;

          // Match #tags (not inside code blocks or headings)
          const lines = content.split('\n');
          let inCodeBlock = false;

          for (const line of lines) {
            if (line.trimStart().startsWith('```')) {
              inCodeBlock = !inCodeBlock;
              continue;
            }
            if (inCodeBlock) continue;
            // Skip headings
            if (/^#{1,6}\s/.test(line)) continue;

            // Find all #tags
            const tagRegex = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/\-]*)/g;
            let match;
            while ((match = tagRegex.exec(line)) !== null) {
              const tag = match[1];
              tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
            }
          }
        }

        if (!cancelled) {
          setTags(tagMap);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    scan();
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);

  const tagTree = useMemo(() => buildTagTree(tags), [tags]);
  const flatEntries = useMemo(
    () => flattenTree(tagTree, 0, expandedTags),
    [tagTree, expandedTags]
  );

  const toggleExpand = useCallback((tagId: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FlatTagEntry }) => {
      const color = getTagColor(item.fullTag);

      return (
        <TouchableOpacity
          style={[styles.tagItem, { paddingLeft: 16 + item.depth * 20, borderBottomColor: colors.bgTertiary + '60' }]}
          activeOpacity={0.6}
          onPress={() => onTagPress(item.fullTag)}
        >
          {item.hasChildren && (
            <TouchableOpacity
              onPress={() => toggleExpand(item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.expandButton}
            >
              <Ionicons
                name={item.isExpanded ? 'chevron-down' : 'chevron-forward'}
                size={14}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          )}
          {!item.hasChildren && <View style={styles.expandSpacer} />}

          <View style={[styles.tagDot, { backgroundColor: color }]} />
          <Text style={[styles.tagName, { color: colors.textPrimary }]} numberOfLines={1}>
            #{item.name}
          </Text>
          <View style={[styles.countBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.countText, { color }]}>{item.count}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [colors, onTagPress, toggleExpand, getTagColor]
  );

  const keyExtractor = useCallback((item: FlatTagEntry) => item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.bgTertiary, backgroundColor: colors.bgSecondary }]}>
        <Ionicons name="pricetags" size={18} color={colors.mauve} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Tags</Text>
        <Text style={[styles.headerCount, { color: colors.textMuted }]}>
          {tags.size} tag{tags.size !== 1 ? 's' : ''}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.blue} size="small" />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Scanning files...</Text>
        </View>
      ) : (
        <FlatList
          data={flatEntries}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="pricetags-outline" size={48} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No tags found</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                Use #tag syntax in your notes
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  headerCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  listContent: {
    flexGrow: 1,
    paddingVertical: 4,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  expandButton: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandSpacer: {
    width: 20,
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  tagName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 4,
  },
});
