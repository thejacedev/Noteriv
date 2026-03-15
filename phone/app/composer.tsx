import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { mergeNotes, splitByHeadings, sanitizeFileName } from '@/lib/note-composer';
import { listAllMarkdownFiles, writeFile } from '@/lib/file-system';

type Mode = 'merge' | 'split';

interface MarkdownFile {
  filePath: string;
  fileName: string;
  relativePath: string;
}

export default function ComposerScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { vault, currentDir, content, currentFile, refreshFiles } = useApp();

  const [mode, setMode] = useState<Mode>('merge');
  const [allFiles, setAllFiles] = useState<MarkdownFile[]>([]);
  const [loading, setLoading] = useState(true);

  // Merge state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [addHeadings, setAddHeadings] = useState(true);
  const [mergedName, setMergedName] = useState('');
  const [merging, setMerging] = useState(false);

  // Split state
  const [splitLevel, setSplitLevel] = useState<1 | 2>(1);
  const [splitSource, setSplitSource] = useState<string>(content || '');
  const [splitSourceFile, setSplitSourceFile] = useState<string | null>(currentFile);

  useEffect(() => {
    if (vault?.path) {
      listAllMarkdownFiles(vault.path).then((files) => {
        setAllFiles(files);
        setLoading(false);
      });
    }
  }, [vault?.path]);

  const splitSections = useMemo(() => {
    if (!splitSource) return [];
    return splitByHeadings(splitSource, splitLevel);
  }, [splitSource, splitLevel]);

  const toggleFile = useCallback((filePath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const handleMerge = useCallback(async () => {
    if (selectedPaths.size < 2) {
      Alert.alert('Select Files', 'Select at least 2 files to merge.');
      return;
    }
    if (!mergedName.trim()) {
      Alert.alert('Name Required', 'Enter a name for the merged file.');
      return;
    }
    if (!vault) return;

    setMerging(true);
    try {
      const paths = Array.from(selectedPaths);
      const merged = await mergeNotes(paths, { addHeadings });
      const safeName = sanitizeFileName(mergedName.trim());
      const fileName = safeName.endsWith('.md') ? safeName : `${safeName}.md`;
      const dir = currentDir || vault.path;
      const filePath = `${dir.endsWith('/') ? dir : dir + '/'}${fileName}`;

      const ok = writeFile(filePath, merged);
      if (ok) {
        refreshFiles();
        router.back();
        setTimeout(() => {
          router.push({ pathname: '/editor', params: { path: filePath } });
        }, 100);
      } else {
        Alert.alert('Error', 'Failed to create merged file.');
      }
    } finally {
      setMerging(false);
    }
  }, [selectedPaths, mergedName, addHeadings, vault, currentDir, refreshFiles, router]);

  const handleSplit = useCallback(async () => {
    if (splitSections.length < 2) {
      Alert.alert('Cannot Split', 'Content does not have enough headings to split.');
      return;
    }
    if (!vault) return;

    const dir = currentDir || vault.path;
    let created = 0;

    for (const section of splitSections) {
      if (!section.title && !section.content.trim()) continue;
      const title = section.title || `Section ${created + 1}`;
      const safeName = sanitizeFileName(title);
      const fileName = `${safeName}.md`;
      const filePath = `${dir.endsWith('/') ? dir : dir + '/'}${fileName}`;

      const sectionContent = section.title
        ? `# ${section.title}\n\n${section.content}`
        : section.content;

      const ok = writeFile(filePath, sectionContent);
      if (ok) created++;
    }

    if (created > 0) {
      refreshFiles();
      Alert.alert('Split Complete', `Created ${created} file${created !== 1 ? 's' : ''}.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      Alert.alert('Error', 'Failed to create split files.');
    }
  }, [splitSections, vault, currentDir, refreshFiles, router]);

  const handlePickSourceFile = useCallback(
    async (file: MarkdownFile) => {
      const { readFile } = await import('@/lib/file-system');
      const fileContent = await readFile(file.filePath);
      setSplitSource(fileContent ?? '');
      setSplitSourceFile(file.filePath);
    },
    []
  );

  const styles = makeStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Segmented Control */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.segment, mode === 'merge' && styles.segmentActive]}
          onPress={() => setMode('merge')}
        >
          <Ionicons
            name="git-merge-outline"
            size={18}
            color={mode === 'merge' ? colors.bgPrimary : colors.textSecondary}
          />
          <Text
            style={[
              styles.segmentText,
              mode === 'merge' && styles.segmentTextActive,
            ]}
          >
            Merge
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, mode === 'split' && styles.segmentActive]}
          onPress={() => setMode('split')}
        >
          <Ionicons
            name="git-branch-outline"
            size={18}
            color={mode === 'split' ? colors.bgPrimary : colors.textSecondary}
          />
          <Text
            style={[
              styles.segmentText,
              mode === 'split' && styles.segmentTextActive,
            ]}
          >
            Split
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'merge' ? (
        <View style={styles.body}>
          {/* Merged file name */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.nameInput}
              placeholder="Merged file name..."
              placeholderTextColor={colors.textMuted}
              value={mergedName}
              onChangeText={setMergedName}
              autoCorrect={false}
            />
          </View>

          {/* Options */}
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setAddHeadings(!addHeadings)}
          >
            <Ionicons
              name={addHeadings ? 'checkbox' : 'square-outline'}
              size={22}
              color={addHeadings ? colors.accent : colors.textMuted}
            />
            <Text style={styles.optionText}>Add heading for each file</Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>
            Select files ({selectedPaths.size} selected)
          </Text>

          {/* File list */}
          <FlatList
            data={allFiles}
            keyExtractor={(item) => item.filePath}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const selected = selectedPaths.has(item.filePath);
              return (
                <TouchableOpacity
                  style={[styles.fileItem, selected && styles.fileItemSelected]}
                  onPress={() => toggleFile(item.filePath)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={selected ? colors.accent : colors.textMuted}
                  />
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {item.fileName}
                    </Text>
                    <Text style={styles.filePath} numberOfLines={1}>
                      {item.relativePath}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />

          {/* Merge button */}
          <TouchableOpacity
            style={[
              styles.actionBtn,
              (selectedPaths.size < 2 || !mergedName.trim()) && styles.actionBtnDisabled,
            ]}
            onPress={handleMerge}
            disabled={selectedPaths.size < 2 || !mergedName.trim() || merging}
          >
            {merging ? (
              <ActivityIndicator size="small" color={colors.bgPrimary} />
            ) : (
              <>
                <Ionicons name="git-merge-outline" size={20} color={colors.bgPrimary} />
                <Text style={styles.actionBtnText}>
                  Merge {selectedPaths.size} Files
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.body}>
          {/* Source file info */}
          <View style={styles.sourceInfo}>
            <Ionicons name="document-text-outline" size={18} color={colors.textMuted} />
            <Text style={styles.sourceText} numberOfLines={1}>
              {splitSourceFile
                ? splitSourceFile.split('/').pop() ?? 'Current file'
                : 'No file selected'}
            </Text>
          </View>

          {/* Split level selector */}
          <View style={styles.splitLevelRow}>
            <Text style={styles.splitLevelLabel}>Split by:</Text>
            <TouchableOpacity
              style={[styles.levelBtn, splitLevel === 1 && styles.levelBtnActive]}
              onPress={() => setSplitLevel(1)}
            >
              <Text
                style={[
                  styles.levelBtnText,
                  splitLevel === 1 && styles.levelBtnTextActive,
                ]}
              >
                H1
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.levelBtn, splitLevel === 2 && styles.levelBtnActive]}
              onPress={() => setSplitLevel(2)}
            >
              <Text
                style={[
                  styles.levelBtnText,
                  splitLevel === 2 && styles.levelBtnTextActive,
                ]}
              >
                H2
              </Text>
            </TouchableOpacity>
          </View>

          {/* Preview of sections or file picker */}
          {splitSource ? (
            <>
              <Text style={styles.sectionLabel}>
                {splitSections.length} section{splitSections.length !== 1 ? 's' : ''} found
              </Text>
              <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
                {splitSections.map((section, idx) => (
                  <View key={idx} style={styles.sectionPreview}>
                    <Text style={styles.sectionTitle}>
                      {section.title || '(Untitled section)'}
                    </Text>
                    <Text style={styles.sectionSnippet} numberOfLines={3}>
                      {section.content.slice(0, 200)}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  splitSections.length < 2 && styles.actionBtnDisabled,
                ]}
                onPress={handleSplit}
                disabled={splitSections.length < 2}
              >
                <Ionicons name="git-branch-outline" size={20} color={colors.bgPrimary} />
                <Text style={styles.actionBtnText}>
                  Split into {splitSections.length} Files
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Pick a file to split</Text>
              <FlatList
                data={allFiles}
                keyExtractor={(item) => item.filePath}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.fileItem}
                    onPress={() => handlePickSourceFile(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="document-text-outline" size={20} color={colors.accent} />
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {item.fileName}
                      </Text>
                      <Text style={styles.filePath} numberOfLines={1}>
                        {item.relativePath}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              />
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
    },
    segmentedControl: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 12,
      backgroundColor: colors.bgTertiary,
      borderRadius: 10,
      padding: 3,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 8,
    },
    segmentActive: {
      backgroundColor: colors.accent,
    },
    segmentText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    segmentTextActive: {
      color: colors.bgPrimary,
    },
    body: {
      flex: 1,
    },
    inputRow: {
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    nameInput: {
      backgroundColor: colors.bgTertiary,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.textPrimary,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    optionText: {
      fontSize: 15,
      color: colors.textPrimary,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      paddingHorizontal: 16,
      paddingVertical: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 100,
    },
    fileItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.bgSecondary,
      borderRadius: 10,
      marginBottom: 6,
    },
    fileItemSelected: {
      backgroundColor: colors.accent + '18',
      borderWidth: 1,
      borderColor: colors.accent + '40',
    },
    fileInfo: {
      flex: 1,
    },
    fileName: {
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    filePath: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accent,
      marginHorizontal: 16,
      marginBottom: 24,
      paddingVertical: 14,
      borderRadius: 12,
    },
    actionBtnDisabled: {
      opacity: 0.4,
    },
    actionBtnText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.bgPrimary,
    },
    sourceInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sourceText: {
      flex: 1,
      fontSize: 14,
      color: colors.textSecondary,
    },
    splitLevelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    splitLevelLabel: {
      fontSize: 15,
      color: colors.textPrimary,
      marginRight: 4,
    },
    levelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.bgTertiary,
    },
    levelBtnActive: {
      backgroundColor: colors.accent,
    },
    levelBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    levelBtnTextActive: {
      color: colors.bgPrimary,
    },
    previewScroll: {
      flex: 1,
    },
    previewContent: {
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    sectionPreview: {
      backgroundColor: colors.bgSecondary,
      borderRadius: 10,
      padding: 14,
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    sectionSnippet: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
  });
}
