import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

interface OutlinePanelProps {
  content: string;
  onHeadingPress: (line: number) => void;
}

interface HeadingEntry {
  level: number;
  text: string;
  line: number;
}

function parseHeadings(content: string): HeadingEntry[] {
  const lines = content.split('\n');
  const headings: HeadingEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].replace(/\s*#+\s*$/, '').trim(), // Remove trailing #
        line: i,
      });
    }
  }

  return headings;
}

const levelSizes: Record<number, number> = {
  1: 16,
  2: 15,
  3: 14,
  4: 13,
  5: 13,
  6: 12,
};

export default function OutlinePanel({ content, onHeadingPress }: OutlinePanelProps) {
  const { colors } = useTheme();

  const levelColors: Record<number, string> = {
    1: colors.blue,
    2: colors.accent,
    3: colors.mauve,
    4: colors.accent,
    5: colors.teal,
    6: colors.textMuted,
  };

  const headings = useMemo(() => parseHeadings(content), [content]);

  // Find the minimum heading level for relative indentation
  const minLevel = useMemo(
    () => (headings.length > 0 ? Math.min(...headings.map((h) => h.level)) : 1),
    [headings]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: HeadingEntry; index: number }) => {
      const indentLevel = item.level - minLevel;
      const color = levelColors[item.level] || colors.textMuted;
      const fontSize = levelSizes[item.level] || 13;
      const isTopLevel = item.level <= 2;

      return (
        <TouchableOpacity
          style={[
            styles.headingItem,
            { paddingLeft: 16 + indentLevel * 18 },
            index === 0 && styles.firstItem,
          ]}
          activeOpacity={0.6}
          onPress={() => onHeadingPress(item.line)}
        >
          <View style={[styles.levelIndicator, { backgroundColor: color + '40' }]}>
            <Text style={[styles.levelLabel, { color }]}>H{item.level}</Text>
          </View>
          <Text
            style={[
              styles.headingText,
              {
                fontSize,
                fontWeight: isTopLevel ? '600' : '400',
                color: isTopLevel ? colors.textPrimary : colors.textSecondary,
              },
            ]}
            numberOfLines={2}
          >
            {item.text}
          </Text>
        </TouchableOpacity>
      );
    },
    [colors, minLevel, onHeadingPress]
  );

  const keyExtractor = useCallback(
    (item: HeadingEntry, index: number) => `${item.line}-${index}`,
    []
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.bgTertiary, backgroundColor: colors.bgSecondary }]}>
        <Ionicons name="list" size={18} color={colors.blue} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Outline</Text>
        <Text style={[styles.headerCount, { color: colors.textMuted }]}>
          {headings.length} heading{headings.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Headings list */}
      <FlatList
        data={headings}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No headings found</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              Add headings using # syntax
            </Text>
          </View>
        }
      />
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
  listContent: {
    flexGrow: 1,
    paddingVertical: 4,
  },
  firstItem: {
    marginTop: 4,
  },
  headingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 16,
    gap: 10,
  },
  levelIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  levelLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headingText: {
    flex: 1,
    lineHeight: 20,
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
