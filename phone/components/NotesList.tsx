import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { FileEntry } from '@/types';
import { rename, deleteFile, deleteDir, trashFile } from '@/lib/file-system';

interface NotesListProps {
  files: FileEntry[];
  currentDir: string;
  vaultPath: string;
  onFilePress: (file: FileEntry) => void;
  onFolderPress: (folder: FileEntry) => void;
  onNavigateUp: () => void;
  onRefresh: () => void;
  isAtRoot: boolean;
}

export default function NotesList({
  files,
  currentDir,
  vaultPath,
  onFilePress,
  onFolderPress,
  onNavigateUp,
  onRefresh,
  isAtRoot,
}: NotesListProps) {
  const { colors } = useTheme();
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<'name' | 'name-desc'>('name');

  const sortedFiles = useMemo(() => {
    const sorted = [...files];
    if (sortMode === 'name-desc') {
      sorted.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return b.name.localeCompare(a.name);
      });
    }
    return sorted;
  }, [files, sortMode]);

  const folderName = useMemo(() => {
    if (isAtRoot) return null;
    const parts = currentDir.replace(/\/$/, '').split('/');
    return parts[parts.length - 1];
  }, [currentDir, isAtRoot]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    onRefresh();
    setTimeout(() => setRefreshing(false), 300);
  }, [onRefresh]);

  const handleLongPress = useCallback((entry: FileEntry) => {
    Alert.alert(
      entry.name,
      undefined,
      [
        {
          text: 'Rename',
          onPress: () => {
            setRenameTarget(entry);
            setRenameValue(entry.name);
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              `Move to Trash?`,
              `"${entry.name}" will be moved to .trash and can be restored.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Move to Trash',
                  style: 'destructive',
                  onPress: () => {
                    if (entry.isDirectory) {
                      deleteDir(entry.path);
                    } else {
                      trashFile(entry.path, vaultPath);
                    }
                    onRefresh();
                  },
                },
              ]
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [onRefresh]);

  const handleRename = useCallback(() => {
    if (!renameTarget || !renameValue.trim()) return;
    rename(renameTarget.path, renameValue.trim());
    setRenameTarget(null);
    onRefresh();
  }, [renameTarget, renameValue, onRefresh]);

  const renderItem = useCallback(
    ({ item }: { item: FileEntry }) => {
      if (item.isDirectory) {
        return (
          <TouchableOpacity
            style={styles.item}
            onPress={() => onFolderPress(item)}
            onLongPress={() => handleLongPress(item)}
            activeOpacity={0.6}
          >
            <View style={[styles.folderIcon, { backgroundColor: colors.blue + '15' }]}>
              <Ionicons name="folder" size={20} color={colors.blue} />
            </View>
            <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        );
      }

      const displayName = item.name.replace(/\.(md|markdown)$/i, '');
      return (
        <TouchableOpacity
          style={styles.item}
          onPress={() => onFilePress(item)}
          onLongPress={() => handleLongPress(item)}
          activeOpacity={0.6}
        >
          <View style={[styles.fileIcon, { backgroundColor: colors.bgTertiary }]}>
            <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
          </View>
          <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>
        </TouchableOpacity>
      );
    },
    [colors, onFilePress, onFolderPress, handleLongPress]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={sortedFiles}
        keyExtractor={(item) => item.path}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.blue}
            colors={[colors.blue]}
            progressBackgroundColor={colors.bgTertiary}
          />
        }
        ListHeaderComponent={
          <>
            {!isAtRoot && (
              <TouchableOpacity style={[styles.backRow, { borderBottomColor: colors.bgTertiary }]} onPress={onNavigateUp}>
                <Ionicons name="chevron-back" size={20} color={colors.blue} />
                <Text style={[styles.backText, { color: colors.blue }]}>Back</Text>
                <Text style={[styles.folderTitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {folderName}
                </Text>
              </TouchableOpacity>
            )}
            {files.length > 0 && (
              <View style={[styles.sortRow, { borderBottomColor: colors.bgTertiary }]}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{files.length} items</Text>
                <TouchableOpacity
                  style={styles.sortBtn}
                  onPress={() => setSortMode((m) => m === 'name' ? 'name-desc' : 'name')}
                >
                  <Ionicons
                    name={sortMode === 'name' ? 'arrow-down' : 'arrow-up'}
                    size={14}
                    color={colors.textMuted}
                  />
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>Name</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No notes yet</Text>
            <Text style={[styles.emptyHint, { color: colors.border }]}>
              Tap + to create your first note
            </Text>
          </View>
        }
        contentContainerStyle={files.length === 0 ? styles.emptyList : undefined}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.bgTertiary }]} />}
      />

      {/* Rename modal */}
      <Modal
        visible={renameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalDialog, { backgroundColor: colors.bgTertiary }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Rename</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.border }]}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              selectTextOnFocus
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.blue}
              onSubmitEditing={handleRename}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setRenameTarget(null)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, { backgroundColor: colors.blue }]}
                onPress={handleRename}
              >
                <Text style={[styles.modalConfirmText, { color: colors.bgPrimary }]}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  folderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    marginLeft: 70,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backText: {
    fontSize: 15,
    fontWeight: '500',
  },
  folderTitle: {
    fontSize: 15,
    marginLeft: 8,
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyHint: {
    fontSize: 14,
  },
  emptyList: {
    flex: 1,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalDialog: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalInput: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalCancelText: {
    fontSize: 15,
  },
  modalConfirm: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
