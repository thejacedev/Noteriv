import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { listAllMarkdownFiles, searchInFiles } from '@/lib/file-system';
import { SearchResult } from '@/types';

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  vaultPath: string;
  onFileSelect: (path: string) => void;
}

type TabId = 'quickOpen' | 'vaultSearch';

interface FileInfo {
  filePath: string;
  fileName: string;
  relativePath: string;
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact match at start gets highest score
  if (t.startsWith(q)) return 1000;
  // Contains gets high score
  if (t.includes(q)) return 500;

  let score = 0;
  let qi = 0;
  let prevMatchIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      // Consecutive matches bonus
      if (prevMatchIdx === ti - 1) score += 15;
      // Early match bonus
      score += Math.max(0, 5 - ti);
      prevMatchIdx = ti;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export default function SearchModal({
  visible,
  onClose,
  vaultPath,
  onFileSelect,
}: SearchModalProps) {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>('quickOpen');
  const [query, setQuery] = useState('');
  const [allFiles, setAllFiles] = useState<FileInfo[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load all files when modal opens
  useEffect(() => {
    if (visible && vaultPath) {
      loadFiles();
      // Focus input after a short delay for animation
      setTimeout(() => inputRef.current?.focus(), 200);
    } else {
      // Reset state when closing
      setQuery('');
      setSearchResults([]);
      setFilesLoaded(false);
    }
  }, [visible, vaultPath]);

  const loadFiles = useCallback(async () => {
    const files = await listAllMarkdownFiles(vaultPath);
    setAllFiles(files);
    setFilesLoaded(true);
  }, [vaultPath]);

  // Filtered files for Quick Open
  const filteredFiles = useMemo(() => {
    if (!query.trim()) return allFiles.slice(0, 50);

    const scored = allFiles
      .map((f) => ({ file: f, score: fuzzyScore(query, f.fileName) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    return scored.map((x) => x.file);
  }, [allFiles, query]);

  // Vault search with debounce
  useEffect(() => {
    if (activeTab !== 'vaultSearch' || !query.trim()) {
      setSearchResults([]);
      return;
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setIsSearching(true);

    searchTimeout.current = setTimeout(async () => {
      const results = await searchInFiles(vaultPath, query);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [query, activeTab, vaultPath]);

  const handleTabSwitch = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setQuery('');
    setSearchResults([]);
  }, []);

  const handleFileSelect = useCallback(
    (path: string) => {
      Keyboard.dismiss();
      onFileSelect(path);
      onClose();
    },
    [onFileSelect, onClose]
  );

  const highlightMatch = useCallback(
    (text: string, q: string) => {
      if (!q.trim()) return <Text style={[styles.resultText, { color: colors.textPrimary }]}>{text}</Text>;

      const idx = text.toLowerCase().indexOf(q.toLowerCase());
      if (idx === -1) return <Text style={[styles.resultText, { color: colors.textPrimary }]}>{text}</Text>;

      return (
        <Text style={[styles.resultText, { color: colors.textPrimary }]}>
          {text.substring(0, idx)}
          <Text style={[styles.highlight, { color: colors.blue }]}>{text.substring(idx, idx + q.length)}</Text>
          {text.substring(idx + q.length)}
        </Text>
      );
    },
    [colors]
  );

  const renderQuickOpenItem = useCallback(
    ({ item }: { item: FileInfo }) => (
      <TouchableOpacity
        style={[styles.resultItem, { borderBottomColor: colors.bgTertiary }]}
        activeOpacity={0.6}
        onPress={() => handleFileSelect(item.filePath)}
      >
        <Ionicons name="document-text" size={18} color={colors.blue} style={styles.resultIcon} />
        <View style={styles.resultContent}>
          {highlightMatch(item.fileName, query)}
          <Text style={[styles.resultPath, { color: colors.textMuted }]} numberOfLines={1}>
            {item.relativePath}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [colors, query, handleFileSelect, highlightMatch]
  );

  const renderSearchResult = useCallback(
    ({ item }: { item: SearchResult }) => (
      <TouchableOpacity
        style={[styles.resultItem, { borderBottomColor: colors.bgTertiary }]}
        activeOpacity={0.6}
        onPress={() => handleFileSelect(item.filePath)}
      >
        <Ionicons name="search" size={16} color={colors.textMuted} style={styles.resultIcon} />
        <View style={styles.resultContent}>
          <Text style={[styles.resultFileName, { color: colors.textPrimary }]}>{item.fileName}</Text>
          <Text style={[styles.resultLine, { color: colors.textSecondary }]} numberOfLines={2}>
            <Text style={[styles.lineNumber, { color: colors.textMuted }]}>L{item.line}: </Text>
            {item.text}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [colors, handleFileSelect]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.bgSecondary }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Search</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, { backgroundColor: colors.bgSecondary }]}>
          <TouchableOpacity
            style={[styles.tab, { backgroundColor: colors.bgTertiary }, activeTab === 'quickOpen' && { backgroundColor: colors.blue + '20', borderWidth: 1, borderColor: colors.blue + '40' }]}
            onPress={() => handleTabSwitch('quickOpen')}
          >
            <Ionicons
              name="flash"
              size={16}
              color={activeTab === 'quickOpen' ? colors.blue : colors.textMuted}
            />
            <Text
              style={[styles.tabText, { color: colors.textMuted }, activeTab === 'quickOpen' && { color: colors.blue, fontWeight: '600' }]}
            >
              Quick Open
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, { backgroundColor: colors.bgTertiary }, activeTab === 'vaultSearch' && { backgroundColor: colors.blue + '20', borderWidth: 1, borderColor: colors.blue + '40' }]}
            onPress={() => handleTabSwitch('vaultSearch')}
          >
            <Ionicons
              name="search"
              size={16}
              color={activeTab === 'vaultSearch' ? colors.blue : colors.textMuted}
            />
            <Text
              style={[styles.tabText, { color: colors.textMuted }, activeTab === 'vaultSearch' && { color: colors.blue, fontWeight: '600' }]}
            >
              Vault Search
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search input */}
        <View style={[styles.inputContainer, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.inputIcon} />
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.textPrimary }]}
            value={query}
            onChangeText={setQuery}
            placeholder={
              activeTab === 'quickOpen'
                ? 'Search file name...'
                : 'Search in file contents...'
            }
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.blue}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Results */}
        {activeTab === 'quickOpen' ? (
          <FlatList
            data={filteredFiles}
            renderItem={renderQuickOpenItem}
            keyExtractor={(item) => item.filePath}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                {!filesLoaded ? (
                  <ActivityIndicator color={colors.blue} size="small" />
                ) : query.trim() ? (
                  <>
                    <Ionicons name="document-outline" size={40} color={colors.border} />
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>No files found</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="flash-outline" size={40} color={colors.border} />
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>Type to search files</Text>
                  </>
                )}
              </View>
            }
          />
        ) : (
          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item, idx) => `${item.filePath}:${item.line}:${idx}`}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                {isSearching ? (
                  <>
                    <ActivityIndicator color={colors.blue} size="small" />
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>Searching...</Text>
                  </>
                ) : query.trim() ? (
                  <>
                    <Ionicons name="search-outline" size={40} color={colors.border} />
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>No results found</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="search-outline" size={40} color={colors.border} />
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>Search file contents</Text>
                  </>
                )}
              </View>
            }
            ListHeaderComponent={
              searchResults.length > 0 ? (
                <Text style={[styles.resultCount, { color: colors.textMuted }]}>
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </Text>
              ) : null
            }
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 12,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 12,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultIcon: {
    marginRight: 12,
    width: 20,
    textAlign: 'center',
  },
  resultContent: {
    flex: 1,
  },
  resultText: {
    fontSize: 15,
  },
  highlight: {
    fontWeight: '600',
  },
  resultPath: {
    fontSize: 12,
    marginTop: 2,
  },
  resultFileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultLine: {
    fontSize: 13,
    marginTop: 2,
  },
  lineNumber: {
    fontWeight: '500',
  },
  resultCount: {
    fontSize: 12,
    fontWeight: '500',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
});
