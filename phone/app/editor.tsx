import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  BackHandler,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import MarkdownEditor from '@/components/MarkdownEditor';
import MarkdownPreview from '@/components/MarkdownPreview';
import { rename as renameFile } from '@/lib/file-system';

export default function EditorScreen() {
  const router = useRouter();
  const { path } = useLocalSearchParams<{ path: string }>();
  const { colors } = useTheme();
  const {
    currentFile,
    content,
    setContent,
    setCurrentFile,
    saveFile,
    isDirty,
    settings,
    workspace,
    updateWorkspace,
    vault,
  } = useApp();

  const [menuVisible, setMenuVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const hasLoaded = useRef(false);

  // Load file on mount
  useEffect(() => {
    if (path && !hasLoaded.current) {
      hasLoaded.current = true;
      setCurrentFile(path);
    }
  }, [path, setCurrentFile]);

  // Handle hardware back button
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleBack();
        return true;
      }
    );
    return () => subscription.remove();
  }, [isDirty]);

  const handleBack = useCallback(async () => {
    if (isDirty) {
      await saveFile();
    }
    setCurrentFile(null);
    router.back();
  }, [isDirty, saveFile, setCurrentFile, router]);

  const handleSave = useCallback(async () => {
    const ok = await saveFile();
    if (!ok) {
      Alert.alert('Error', 'Failed to save file.');
    }
  }, [saveFile]);

  const toggleViewMode = useCallback(() => {
    updateWorkspace({
      viewMode: workspace.viewMode === 'edit' ? 'preview' : 'edit',
    });
  }, [workspace.viewMode, updateWorkspace]);

  const handleBookmark = useCallback(() => {
    if (!currentFile) return;
    const bookmarks = workspace.bookmarks ?? [];
    const isBookmarked = bookmarks.includes(currentFile);
    updateWorkspace({
      bookmarks: isBookmarked
        ? bookmarks.filter((b) => b !== currentFile)
        : [...bookmarks, currentFile],
    });
    setMenuVisible(false);
  }, [currentFile, workspace.bookmarks, updateWorkspace]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete File', 'Are you sure you want to delete this file?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setCurrentFile(null);
          router.back();
        },
      },
    ]);
    setMenuVisible(false);
  }, [setCurrentFile, router]);

  const handleRename = useCallback(() => {
    setMenuVisible(false);
    setRenameValue(fileName);
    setRenameVisible(true);
  }, []);

  const confirmRename = useCallback(() => {
    if (!currentFile || !renameValue.trim()) return;
    const newName = renameValue.trim().endsWith('.md')
      ? renameValue.trim()
      : renameValue.trim() + '.md';
    renameFile(currentFile, newName);
    setRenameVisible(false);
    router.back();
  }, [currentFile, renameValue, router]);

  const fileName = currentFile
    ? currentFile.split('/').pop() ?? 'Untitled'
    : 'Untitled';

  const isBookmarked =
    currentFile && (workspace.bookmarks ?? []).includes(currentFile);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.bgTertiary }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={colors.textPrimary}
          />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
            {fileName}
          </Text>
          {isDirty && <View style={[styles.dirtyDot, { backgroundColor: colors.peach }]} />}
        </View>

        <View style={styles.headerActions}>
          {isDirty && (
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.blue }]}
              onPress={handleSave}
              activeOpacity={0.7}
            >
              <Text style={[styles.saveButtonText, { color: colors.bgPrimary }]}>Save</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={toggleViewMode}
          >
            <Ionicons
              name={
                workspace.viewMode === 'edit' ? 'eye-outline' : 'create-outline'
              }
              size={22}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setMenuVisible(!menuVisible)}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={22}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* More Menu */}
      {menuVisible && (
        <View style={[styles.menu, { backgroundColor: colors.bgTertiary }]}>
          <TouchableOpacity style={styles.menuItem} onPress={handleBookmark}>
            <Ionicons
              name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={
                isBookmarked ? colors.yellow : colors.textPrimary
              }
            />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>
              {isBookmarked ? 'Remove Bookmark' : 'Bookmark'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleRename}>
            <Ionicons
              name="pencil-outline"
              size={20}
              color={colors.textPrimary}
            />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Rename</Text>
          </TouchableOpacity>
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setMenuVisible(false);
              router.push('/templates');
            }}
          >
            <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Templates</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setMenuVisible(false);
              if (currentFile && vault) {
                router.push({
                  pathname: '/backlinks',
                  params: { filePath: currentFile, vaultPath: vault.path },
                });
              }
            }}
          >
            <Ionicons name="link-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Backlinks</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setMenuVisible(false);
              if (currentFile) {
                router.push({
                  pathname: '/recovery',
                  params: { filePath: currentFile },
                });
              }
            }}
          >
            <Ionicons name="time-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>File Recovery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setMenuVisible(false);
              router.push('/frontmatter');
            }}
          >
            <Ionicons name="code-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Frontmatter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setMenuVisible(false);
              router.push('/slides');
            }}
          >
            <Ionicons name="easel-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Present as Slides</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setMenuVisible(false);
              router.push('/attachments');
            }}
          >
            <Ionicons name="attach-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Attachments</Text>
          </TouchableOpacity>
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color={colors.red} />
            <Text style={[styles.menuItemText, { color: colors.red }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Dismiss menu on tap */}
      {menuVisible && (
        <TouchableOpacity
          style={styles.menuOverlay}
          onPress={() => setMenuVisible(false)}
          activeOpacity={1}
        />
      )}

      {/* Editor / Preview */}
      <View style={styles.editorContainer}>
        {workspace.viewMode === 'edit' ? (
          <MarkdownEditor
            content={content}
            onChange={setContent}
            fontSize={settings.fontSize}
          />
        ) : (
          <MarkdownPreview
            content={content}
            fontSize={settings.fontSize}
          />
        )}
      </View>

      {/* Rename Modal */}
      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
      >
        <View style={styles.renameOverlay}>
          <View style={[styles.renameDialog, { backgroundColor: colors.bgTertiary }]}>
            <Text style={[styles.renameTitle, { color: colors.textPrimary }]}>Rename File</Text>
            <TextInput
              style={[styles.renameInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.border }]}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              selectTextOnFocus
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.renameActions}>
              <TouchableOpacity
                style={styles.renameCancelBtn}
                onPress={() => setRenameVisible(false)}
              >
                <Text style={[styles.renameCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.renameConfirmBtn, { backgroundColor: colors.blue }]}
                onPress={confirmRename}
              >
                <Text style={[styles.renameConfirmText, { color: colors.bgPrimary }]}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  dirtyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerButton: {
    padding: 8,
    borderRadius: 8,
  },
  saveButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 4,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  menu: {
    position: 'absolute',
    top: 56,
    right: 12,
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 180,
    zIndex: 100,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 15,
  },
  menuDivider: {
    height: 1,
    marginHorizontal: 12,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 56,
    zIndex: 99,
  },
  editorContainer: {
    flex: 1,
  },
  // Rename modal
  renameOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  renameDialog: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  renameTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  renameInput: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  renameCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  renameCancelText: {
    fontSize: 15,
  },
  renameConfirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  renameConfirmText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
