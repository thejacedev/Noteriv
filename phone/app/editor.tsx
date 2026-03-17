import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  BackHandler,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import MarkdownEditor from '@/components/MarkdownEditor';
import MarkdownPreview from '@/components/MarkdownPreview';
import BoardView from '@/components/BoardView';
import { rename as renameFile, listAllMarkdownFiles } from '@/lib/file-system';
import { lintMarkdown, LintWarning } from '@/lib/markdown-lint';
import { isBoardContent } from '@/lib/board-utils';
import { resolveWikiLink } from '@/lib/wiki-links';

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
    files,
  } = useApp();

  const [menuVisible, setMenuVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [lintVisible, setLintVisible] = useState(false);
  const [lintWarnings, setLintWarnings] = useState<LintWarning[]>([]);
  const hasLoaded = useRef(false);

  // Sibling notes for swipe navigation
  const siblingNotes = useMemo(() => {
    return files.filter((f) => !f.isDirectory && /\.(md|markdown)$/i.test(f.name));
  }, [files]);

  const currentIndex = useMemo(() => {
    if (!currentFile) return -1;
    return siblingNotes.findIndex((f) => f.path === currentFile);
  }, [siblingNotes, currentFile]);

  const navigateToNote = useCallback(async (notePath: string) => {
    if (isDirty) await saveFile();
    hasLoaded.current = false;
    setCurrentFile(null);
    router.replace({ pathname: '/editor', params: { path: notePath } });
  }, [isDirty, saveFile, setCurrentFile, router]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-10, 10])
    .onEnd((e) => {
      if (Math.abs(e.velocityX) < 300) return;
      if (e.translationX > 80 && currentIndex > 0) {
        navigateToNote(siblingNotes[currentIndex - 1].path);
      } else if (e.translationX < -80 && currentIndex < siblingNotes.length - 1) {
        navigateToNote(siblingNotes[currentIndex + 1].path);
      }
    })
    .runOnJS(true);

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

  const handleWikiLink = useCallback(async (name: string) => {
    if (!vault) return;
    const resolved = await resolveWikiLink(name, vault.path);
    if (resolved) {
      if (isDirty) await saveFile();
      setCurrentFile(null);
      router.push({ pathname: '/editor', params: { path: resolved } });
    }
  }, [vault, isDirty, saveFile, setCurrentFile, router]);

  const handleLint = useCallback(async () => {
    setMenuVisible(false);
    if (!vault) return;
    const files = await listAllMarkdownFiles(vault.path);
    const fileNames = files.map((f) => f.fileName);
    const warnings = lintMarkdown(content, vault.path, fileNames);
    setLintWarnings(warnings);
    setLintVisible(true);
  }, [content, vault]);

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
      {!focusMode && <View style={[styles.header, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.bgTertiary }]}>
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
      </View>}

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
              if (currentFile) {
                router.push({
                  pathname: '/publish',
                  params: { filePath: currentFile },
                });
              }
            }}
          >
            <Ionicons name="globe-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Publish as HTML</Text>
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
          <TouchableOpacity style={styles.menuItem} onPress={handleLint}>
            <Ionicons name="warning-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Lint</Text>
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

      {/* Word count bar + note position */}
      {!focusMode && !isBoardContent(content) && (
        <View style={[styles.statsBar, { backgroundColor: colors.bgSecondary, borderTopColor: colors.border }]}>
          <Text style={[styles.statsText, { color: colors.textMuted }]}>
            {content.trim() ? content.trim().split(/\s+/).length : 0} words
          </Text>
          <Text style={[styles.statsText, { color: colors.textMuted }]}>
            {content.length} chars
          </Text>
          <Text style={[styles.statsText, { color: colors.textMuted }]}>
            {content.split('\n').length} lines
          </Text>
          {siblingNotes.length > 1 && currentIndex >= 0 && (
            <Text style={[styles.statsText, { color: colors.textMuted, marginLeft: 'auto' }]}>
              {currentIndex + 1}/{siblingNotes.length} ← swipe →
            </Text>
          )}
        </View>
      )}

      {/* Editor / Preview / Board */}
      <GestureDetector gesture={swipeGesture}>
        <View style={styles.editorContainer}>
          {isBoardContent(content) ? (
            <BoardView content={content} onChange={setContent} />
          ) : workspace.viewMode === 'edit' ? (
            <MarkdownEditor
              content={content}
              onChange={setContent}
              fontSize={settings.fontSize}
              focusMode={focusMode}
              onToggleFocusMode={() => setFocusMode((f) => !f)}
            />
          ) : (
            <MarkdownPreview
              content={content}
              fontSize={settings.fontSize}
              vaultPath={vault?.path}
              onWikiLinkPress={handleWikiLink}
            />
          )}
        </View>
      </GestureDetector>

      {/* Lint Modal */}
      <Modal
        visible={lintVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLintVisible(false)}
      >
        <View style={styles.lintOverlay}>
          <View style={[styles.lintSheet, { backgroundColor: colors.bgSecondary }]}>
            <View style={[styles.lintHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.lintTitle, { color: colors.textPrimary }]}>Lint</Text>
              <TouchableOpacity onPress={() => setLintVisible(false)} style={styles.lintClose}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.lintBody}>
              {lintWarnings.length === 0 ? (
                <View style={styles.lintEmpty}>
                  <Ionicons name="checkmark-circle" size={40} color={colors.green} />
                  <Text style={[styles.lintEmptyText, { color: colors.textSecondary }]}>No issues found</Text>
                </View>
              ) : (
                lintWarnings.map((w, i) => {
                  const iconColor = w.type === 'error' ? colors.red : w.type === 'warning' ? colors.yellow : colors.blue;
                  const iconName = w.type === 'error' ? 'close-circle-outline' : w.type === 'warning' ? 'warning-outline' : 'information-circle-outline';
                  return (
                    <View key={i} style={[styles.lintItem, { borderLeftColor: iconColor }]}>
                      <Ionicons name={iconName as any} size={16} color={iconColor} style={{ marginTop: 1 }} />
                      <View style={styles.lintItemBody}>
                        <Text style={[styles.lintMessage, { color: colors.textPrimary }]}>{w.message}</Text>
                        <Text style={[styles.lintMeta, { color: colors.textMuted }]}>
                          Line {w.line} · {w.rule}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
        </KeyboardAvoidingView>
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
  statsBar: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statsText: {
    fontSize: 11,
  },
  lintOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  lintSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  lintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  lintTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  lintClose: { padding: 4 },
  lintBody: { padding: 16, gap: 10, paddingBottom: 32 },
  lintEmpty: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  lintEmptyText: { fontSize: 15 },
  lintItem: {
    flexDirection: 'row',
    gap: 10,
    paddingLeft: 10,
    borderLeftWidth: 3,
    paddingVertical: 2,
  },
  lintItemBody: { flex: 1, gap: 2 },
  lintMessage: { fontSize: 14, lineHeight: 20 },
  lintMeta: { fontSize: 12 },
});
