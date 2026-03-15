import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

interface BookmarksPanelProps {
  bookmarks: string[];
  onFileSelect: (path: string) => void;
  onRemoveBookmark: (path: string) => void;
}

function getFileName(path: string): string {
  const parts = path.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || path;
}

function getParentPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return '/';
  // Return the parent folder name
  return parts[parts.length - 2] || '';
}

interface SwipeableBookmarkProps {
  path: string;
  onPress: () => void;
  onRemove: () => void;
}

function SwipeableBookmark({ path, onPress, onRemove }: SwipeableBookmarkProps) {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipedOpen = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(Math.max(gestureState.dx, -80));
        } else if (isSwipedOpen.current) {
          translateX.setValue(Math.min(gestureState.dx - 80, 0));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -40) {
          Animated.spring(translateX, {
            toValue: -80,
            useNativeDriver: true,
            tension: 80,
            friction: 10,
          }).start();
          isSwipedOpen.current = true;
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 10,
          }).start();
          isSwipedOpen.current = false;
        }
      },
    })
  ).current;

  const fileName = getFileName(path);
  const parentFolder = getParentPath(path);

  return (
    <View style={styles.swipeContainer}>
      {/* Delete button behind */}
      <View style={[styles.deleteBackground, { backgroundColor: colors.red }]}>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={onRemove}
          activeOpacity={0.7}
        >
          <Ionicons name="bookmark-outline" size={18} color={colors.bgPrimary} />
          <Text style={[styles.removeText, { color: colors.bgPrimary }]}>Remove</Text>
        </TouchableOpacity>
      </View>

      {/* Foreground item */}
      <Animated.View
        style={[styles.bookmarkItem, { backgroundColor: colors.bgPrimary }, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={[styles.bookmarkTouchable, { borderBottomColor: colors.bgTertiary }]}
          activeOpacity={0.6}
          onPress={onPress}
        >
          <View style={[styles.bookmarkIcon, { backgroundColor: colors.peach + '18' }]}>
            <Ionicons name="bookmark" size={16} color={colors.peach} />
          </View>
          <View style={styles.bookmarkInfo}>
            <Text style={[styles.bookmarkName, { color: colors.textPrimary }]} numberOfLines={1}>
              {fileName.replace(/\.(md|markdown)$/i, '')}
            </Text>
            {parentFolder ? (
              <View style={styles.pathRow}>
                <Ionicons name="folder-outline" size={11} color={colors.textMuted} />
                <Text style={[styles.bookmarkPath, { color: colors.textMuted }]} numberOfLines={1}>
                  {parentFolder}
                </Text>
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.border} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function BookmarksPanel({
  bookmarks,
  onFileSelect,
  onRemoveBookmark,
}: BookmarksPanelProps) {
  const { colors } = useTheme();

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <SwipeableBookmark
        path={item}
        onPress={() => onFileSelect(item)}
        onRemove={() => onRemoveBookmark(item)}
      />
    ),
    [onFileSelect, onRemoveBookmark]
  );

  const keyExtractor = useCallback((item: string) => item, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.bgTertiary, backgroundColor: colors.bgSecondary }]}>
        <Ionicons name="bookmarks" size={18} color={colors.peach} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Bookmarks</Text>
        <Text style={[styles.headerCount, { color: colors.textMuted }]}>
          {bookmarks.length} item{bookmarks.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Bookmarks list */}
      <FlatList
        data={bookmarks}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="bookmarks-outline" size={48} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No bookmarks yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              Long press a file to bookmark it
            </Text>
          </View>
        }
        ListFooterComponent={
          bookmarks.length > 0 ? (
            <Text style={[styles.swipeHint, { color: colors.textMuted }]}>Swipe left to remove</Text>
          ) : null
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
  swipeContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  deleteBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  removeText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  bookmarkItem: {},
  bookmarkTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookmarkIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bookmarkInfo: {
    flex: 1,
  },
  bookmarkName: {
    fontSize: 15,
    fontWeight: '500',
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  bookmarkPath: {
    fontSize: 12,
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
  swipeHint: {
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
