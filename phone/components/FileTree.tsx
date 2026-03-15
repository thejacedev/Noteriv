import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { FileEntry } from '@/types';
import { rename, deleteFile, deleteDir } from '@/lib/file-system';

interface FileTreeProps {
  files: FileEntry[];
  currentDir: string;
  vaultPath: string;
  bookmarks: string[];
  onFilePress: (file: FileEntry) => void;
  onFolderPress: (folder: FileEntry) => void;
  onNavigateUp: (path: string) => void;
  onRefresh: () => void;
  onToggleBookmark: (path: string) => void;
}

interface ContextMenuState {
  visible: boolean;
  entry: FileEntry | null;
  y: number;
}

export default function FileTree({
  files,
  currentDir,
  vaultPath,
  bookmarks,
  onFilePress,
  onFolderPress,
  onNavigateUp,
  onRefresh,
  onToggleBookmark,
}: FileTreeProps) {
  const { colors } = useTheme();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    entry: null,
    y: 0,
  });
  const [renameModal, setRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Build breadcrumb segments from vaultPath to currentDir
  const buildBreadcrumbs = useCallback(() => {
    if (!vaultPath || !currentDir) return [];

    const vaultName = vaultPath.replace(/\/$/, '').split('/').pop() || 'Vault';
    const relative = currentDir.replace(vaultPath, '');
    const segments: { label: string; path: string }[] = [
      { label: vaultName, path: vaultPath },
    ];

    if (relative) {
      const parts = relative.replace(/\/$/, '').split('/').filter(Boolean);
      let accumulated = vaultPath;
      for (const part of parts) {
        accumulated += part + '/';
        segments.push({ label: part, path: accumulated });
      }
    }

    return segments;
  }, [currentDir, vaultPath]);

  const breadcrumbs = buildBreadcrumbs();

  const handleLongPress = useCallback((entry: FileEntry) => {
    setContextMenu({ visible: true, entry, y: 0 });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, entry: null, y: 0 });
  }, []);

  const handleRename = useCallback(() => {
    if (!contextMenu.entry) return;
    setRenameValue(contextMenu.entry.name);
    setRenameModal(true);
    closeContextMenu();
  }, [contextMenu.entry]);

  const confirmRename = useCallback(async () => {
    if (!contextMenu.entry || !renameValue.trim()) return;
    const dir = contextMenu.entry.path.substring(
      0,
      contextMenu.entry.path.lastIndexOf('/') + 1
    );
    const newPath = dir + renameValue.trim();
    const success = await rename(contextMenu.entry.path, newPath);
    if (success) {
      onRefresh();
    } else {
      Alert.alert('Error', 'Failed to rename item.');
    }
    setRenameModal(false);
    setRenameValue('');
  }, [contextMenu.entry, renameValue, onRefresh]);

  const handleDelete = useCallback(() => {
    if (!contextMenu.entry) return;
    const entry = contextMenu.entry;
    closeContextMenu();
    Alert.alert(
      'Delete',
      `Are you sure you want to delete "${entry.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = entry.isDirectory
              ? await deleteDir(entry.path)
              : await deleteFile(entry.path);
            if (success) {
              onRefresh();
            } else {
              Alert.alert('Error', 'Failed to delete item.');
            }
          },
        },
      ]
    );
  }, [contextMenu.entry, onRefresh]);

  const handleBookmark = useCallback(() => {
    if (!contextMenu.entry) return;
    onToggleBookmark(contextMenu.entry.path);
    closeContextMenu();
  }, [contextMenu.entry, onToggleBookmark]);

  const getFileIcon = useCallback(
    (entry: FileEntry): { name: keyof typeof Ionicons.glyphMap; color: string } => {
      if (entry.isDirectory) {
        return { name: 'folder', color: colors.yellow };
      }
      if (entry.name.endsWith('.md') || entry.name.endsWith('.markdown')) {
        return { name: 'document-text', color: colors.blue };
      }
      if (entry.name.endsWith('.json')) {
        return { name: 'code-slash', color: colors.peach };
      }
      if (
        entry.name.endsWith('.png') ||
        entry.name.endsWith('.jpg') ||
        entry.name.endsWith('.jpeg') ||
        entry.name.endsWith('.gif') ||
        entry.name.endsWith('.svg')
      ) {
        return { name: 'image', color: colors.green };
      }
      return { name: 'document', color: colors.textMuted };
    },
    [colors]
  );

  const isBookmarked = useCallback(
    (path: string) => bookmarks.includes(path),
    [bookmarks]
  );

  const renderItem = useCallback(
    ({ item }: { item: FileEntry }) => {
      const icon = getFileIcon(item);
      const bookmarked = isBookmarked(item.path);

      return (
        <TouchableOpacity
          style={[styles.fileRow, { borderBottomColor: colors.bgTertiary }]}
          activeOpacity={0.6}
          onPress={() => (item.isDirectory ? onFolderPress(item) : onFilePress(item))}
          onLongPress={() => handleLongPress(item)}
          delayLongPress={400}
        >
          <Ionicons name={icon.name} size={20} color={icon.color} style={styles.fileIcon} />
          <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          {bookmarked && (
            <Ionicons
              name="bookmark"
              size={14}
              color={colors.peach}
              style={styles.bookmarkIndicator}
            />
          )}
          {item.isDirectory && (
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
              style={styles.chevron}
            />
          )}
        </TouchableOpacity>
      );
    },
    [colors, getFileIcon, isBookmarked, onFilePress, onFolderPress, handleLongPress]
  );

  const keyExtractor = useCallback((item: FileEntry) => item.path, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Breadcrumb navigation */}
      <View style={[styles.breadcrumbContainer, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.bgTertiary }]}>
        <FlatList
          data={breadcrumbs}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.path}
          contentContainerStyle={styles.breadcrumbContent}
          renderItem={({ item, index }) => (
            <View style={styles.breadcrumbSegment}>
              {index > 0 && (
                <Ionicons
                  name="chevron-forward"
                  size={12}
                  color={colors.textMuted}
                  style={styles.breadcrumbSeparator}
                />
              )}
              <TouchableOpacity
                onPress={() => onNavigateUp(item.path)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text
                  style={[
                    styles.breadcrumbText,
                    { color: colors.textMuted },
                    index === breadcrumbs.length - 1 && { color: colors.textPrimary, fontWeight: '600' },
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>

      {/* File list */}
      <FlatList
        data={files}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={48} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No files yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Create a file or folder to get started</Text>
          </View>
        }
      />

      {/* Context menu modal */}
      <Modal
        visible={contextMenu.visible}
        transparent
        animationType="fade"
        onRequestClose={closeContextMenu}
      >
        <Pressable style={styles.contextOverlay} onPress={closeContextMenu}>
          <View style={[styles.contextMenu, { backgroundColor: colors.bgTertiary }]}>
            <Text style={[styles.contextTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {contextMenu.entry?.name}
            </Text>
            <View style={[styles.contextDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.contextItem} onPress={handleRename}>
              <Ionicons name="pencil" size={18} color={colors.textPrimary} />
              <Text style={[styles.contextItemText, { color: colors.textPrimary }]}>Rename</Text>
            </TouchableOpacity>
            {!contextMenu.entry?.isDirectory && (
              <TouchableOpacity style={styles.contextItem} onPress={handleBookmark}>
                <Ionicons
                  name={
                    contextMenu.entry && isBookmarked(contextMenu.entry.path)
                      ? 'bookmark'
                      : 'bookmark-outline'
                  }
                  size={18}
                  color={colors.peach}
                />
                <Text style={[styles.contextItemText, { color: colors.textPrimary }]}>
                  {contextMenu.entry && isBookmarked(contextMenu.entry.path)
                    ? 'Remove Bookmark'
                    : 'Bookmark'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.contextItem} onPress={handleDelete}>
              <Ionicons name="trash" size={18} color={colors.red} />
              <Text style={[styles.contextItemText, { color: colors.red }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Rename modal */}
      <Modal
        visible={renameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModal(false)}
      >
        <Pressable
          style={styles.contextOverlay}
          onPress={() => setRenameModal(false)}
        >
          <View style={[styles.renameDialog, { backgroundColor: colors.bgTertiary }]}>
            <Text style={[styles.renameTitle, { color: colors.textPrimary }]}>Rename</Text>
            <TextInput
              style={[styles.renameInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.border }]}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              selectTextOnFocus
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.blue}
              onSubmitEditing={confirmRename}
            />
            <View style={styles.renameActions}>
              <TouchableOpacity
                style={styles.renameCancel}
                onPress={() => setRenameModal(false)}
              >
                <Text style={[styles.renameCancelText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.renameConfirm, { backgroundColor: colors.blue }]} onPress={confirmRename}>
                <Text style={[styles.renameConfirmText, { color: colors.bgPrimary }]}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  breadcrumbContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  breadcrumbContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  breadcrumbSegment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbSeparator: {
    marginHorizontal: 4,
  },
  breadcrumbText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    flexGrow: 1,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileIcon: {
    marginRight: 12,
    width: 20,
    textAlign: 'center',
  },
  fileName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
  },
  bookmarkIndicator: {
    marginLeft: 6,
  },
  chevron: {
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 4,
  },
  contextOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    borderRadius: 12,
    width: 260,
    overflow: 'hidden',
  },
  contextTitle: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlign: 'center',
  },
  contextDivider: {
    height: StyleSheet.hairlineWidth,
  },
  contextItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  contextItemText: {
    fontSize: 15,
    marginLeft: 12,
  },
  renameDialog: {
    borderRadius: 12,
    width: 300,
    padding: 20,
  },
  renameTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  renameInput: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 10,
  },
  renameCancel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  renameCancelText: {
    fontSize: 15,
    fontWeight: '500',
  },
  renameConfirm: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  renameConfirmText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
