import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import {
  CSSSnippet,
  CommunitySnippetEntry,
  loadSnippets,
  toggleSnippet,
  createSnippet,
  deleteSnippet,
  updateSnippetContent,
  fetchCommunitySnippets,
  installCommunitySnippet,
} from '@/lib/css-snippets';

type Tab = 'installed' | 'community';

export default function SnippetsScreen() {
  const { vault } = useApp();
  const { colors } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>('installed');
  const [snippets, setSnippets] = useState<CSSSnippet[]>([]);
  const [communitySnippets, setCommunitySnippets] = useState<CommunitySnippetEntry[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Editor modal
  const [editingSnippet, setEditingSnippet] = useState<CSSSnippet | null>(null);
  const [editContent, setEditContent] = useState('');

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSnippetName, setNewSnippetName] = useState('');

  const vaultPath = vault?.path ?? '';

  const refreshSnippets = useCallback(async () => {
    if (!vaultPath) return;
    const loaded = await loadSnippets(vaultPath);
    setSnippets(loaded);
  }, [vaultPath]);

  useEffect(() => {
    refreshSnippets();
  }, [refreshSnippets]);

  useEffect(() => {
    if (activeTab === 'community' && communitySnippets.length === 0) {
      setLoadingCommunity(true);
      fetchCommunitySnippets()
        .then(setCommunitySnippets)
        .finally(() => setLoadingCommunity(false));
    }
  }, [activeTab]);

  const handleToggle = useCallback(
    async (snippet: CSSSnippet) => {
      if (!vaultPath) return;
      const newEnabled = !snippet.enabled;
      await toggleSnippet(vaultPath, snippet.id, newEnabled);
      setSnippets((prev) =>
        prev.map((s) => (s.id === snippet.id ? { ...s, enabled: newEnabled } : s))
      );
    },
    [vaultPath]
  );

  const handleDelete = useCallback(
    (snippet: CSSSnippet) => {
      Alert.alert(
        'Delete Snippet',
        `Delete "${snippet.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteSnippet(vaultPath, snippet.id);
              setSnippets((prev) => prev.filter((s) => s.id !== snippet.id));
            },
          },
        ]
      );
    },
    [vaultPath]
  );

  const handleCreate = useCallback(() => {
    if (!vaultPath || !newSnippetName.trim()) return;
    const snippet = createSnippet(vaultPath, newSnippetName.trim());
    setSnippets((prev) => [...prev, snippet].sort((a, b) => a.name.localeCompare(b.name)));
    setNewSnippetName('');
    setShowCreateModal(false);
  }, [vaultPath, newSnippetName]);

  const handleSaveEdit = useCallback(() => {
    if (!editingSnippet || !vaultPath) return;
    updateSnippetContent(vaultPath, editingSnippet.id, editContent);
    setSnippets((prev) =>
      prev.map((s) =>
        s.id === editingSnippet.id ? { ...s, content: editContent } : s
      )
    );
    setEditingSnippet(null);
  }, [editingSnippet, editContent, vaultPath]);

  const handleInstallCommunity = useCallback(
    async (entry: CommunitySnippetEntry) => {
      if (!vaultPath) return;
      setInstallingId(entry.id);
      try {
        const snippet = await installCommunitySnippet(vaultPath, entry);
        setSnippets((prev) =>
          [...prev, snippet].sort((a, b) => a.name.localeCompare(b.name))
        );
        Alert.alert('Installed', `"${entry.name}" has been installed.`);
      } catch {
        Alert.alert('Error', 'Failed to install snippet.');
      } finally {
        setInstallingId(null);
      }
    },
    [vaultPath]
  );

  const categories = Array.from(
    new Set(communitySnippets.map((s) => s.category).filter(Boolean))
  );

  const filteredCommunity = selectedCategory
    ? communitySnippets.filter((s) => s.category === selectedCategory)
    : communitySnippets;

  const installedIds = new Set(snippets.map((s) => s.id));

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'installed' && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('installed')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'installed' ? colors.accent : colors.textMuted }]}>
            Installed
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'community' && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('community')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'community' ? colors.accent : colors.textMuted }]}>
            Community
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'installed' ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Create button */}
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: colors.accent }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add" size={20} color={colors.bgPrimary} />
            <Text style={[styles.createButtonText, { color: colors.bgPrimary }]}>
              New Snippet
            </Text>
          </TouchableOpacity>

          {snippets.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="code-slash-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No CSS snippets yet
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                Create one or browse community snippets
              </Text>
            </View>
          ) : (
            snippets.map((snippet) => (
              <View
                key={snippet.id}
                style={[styles.snippetCard, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
              >
                <View style={styles.snippetHeader}>
                  <TouchableOpacity
                    style={styles.snippetInfo}
                    onPress={() => {
                      setEditingSnippet(snippet);
                      setEditContent(snippet.content);
                    }}
                  >
                    <Text style={[styles.snippetName, { color: colors.textPrimary }]}>
                      {snippet.name}
                    </Text>
                    <Text style={[styles.snippetFilename, { color: colors.textMuted }]}>
                      {snippet.filename}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.snippetActions}>
                    <Switch
                      value={snippet.enabled}
                      onValueChange={() => handleToggle(snippet)}
                      trackColor={{ false: colors.border, true: colors.accent }}
                      thumbColor={colors.textPrimary}
                    />
                    <TouchableOpacity onPress={() => handleDelete(snippet)}>
                      <Ionicons name="trash-outline" size={20} color={colors.red} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {loadingCommunity ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                Fetching community snippets...
              </Text>
            </View>
          ) : communitySnippets.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No community snippets available
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                Check your internet connection or try again later
              </Text>
            </View>
          ) : (
            <>
              {/* Category pills */}
              {categories.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryBar}
                  contentContainerStyle={styles.categoryBarContent}
                >
                  <TouchableOpacity
                    style={[
                      styles.categoryPill,
                      { backgroundColor: !selectedCategory ? colors.accent : colors.bgTertiary },
                    ]}
                    onPress={() => setSelectedCategory(null)}
                  >
                    <Text
                      style={[
                        styles.categoryPillText,
                        { color: !selectedCategory ? colors.bgPrimary : colors.textSecondary },
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryPill,
                        { backgroundColor: selectedCategory === cat ? colors.accent : colors.bgTertiary },
                      ]}
                      onPress={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                    >
                      <Text
                        style={[
                          styles.categoryPillText,
                          { color: selectedCategory === cat ? colors.bgPrimary : colors.textSecondary },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Snippet cards */}
              {filteredCommunity.map((entry) => {
                const isInstalled = installedIds.has(entry.id);
                const isInstalling = installingId === entry.id;

                return (
                  <View
                    key={entry.id}
                    style={[styles.communityCard, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                  >
                    <View style={styles.communityCardBody}>
                      <Text style={[styles.communityName, { color: colors.textPrimary }]}>
                        {entry.name}
                      </Text>
                      <Text style={[styles.communityDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                        {entry.description}
                      </Text>
                      {entry.category ? (
                        <View style={[styles.categoryBadge, { backgroundColor: colors.accent + '20' }]}>
                          <Text style={[styles.categoryBadgeText, { color: colors.accent }]}>
                            {entry.category}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.installButton,
                        { backgroundColor: isInstalled ? colors.bgSecondary : colors.accent },
                        isInstalling && { opacity: 0.6 },
                      ]}
                      onPress={() => !isInstalled && !isInstalling && handleInstallCommunity(entry)}
                      disabled={isInstalled || isInstalling}
                    >
                      {isInstalling ? (
                        <ActivityIndicator size="small" color={colors.bgPrimary} />
                      ) : (
                        <Text
                          style={[
                            styles.installButtonText,
                            { color: isInstalled ? colors.textMuted : colors.bgPrimary },
                          ]}
                        >
                          {isInstalled ? 'Installed' : 'Install'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* Snippet editor modal */}
      <Modal
        visible={!!editingSnippet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingSnippet(null)}
      >
        <View style={[styles.editorModal, { backgroundColor: colors.bgPrimary }]}>
          <View style={[styles.editorHeader, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setEditingSnippet(null)}>
              <Text style={{ color: colors.textSecondary, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.editorTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {editingSnippet?.name ?? ''}
            </Text>
            <TouchableOpacity onPress={handleSaveEdit}>
              <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>Save</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[
              styles.editorInput,
              {
                color: colors.textPrimary,
                backgroundColor: colors.bgTertiary,
                borderColor: colors.border,
              },
            ]}
            value={editContent}
            onChangeText={setEditContent}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            placeholder="/* Write your CSS here */"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </Modal>

      {/* Create snippet modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.bgSecondary }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              New CSS Snippet
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.bgTertiary,
                  borderColor: colors.border,
                },
              ]}
              placeholder="Snippet name"
              placeholderTextColor={colors.textMuted}
              value={newSnippetName}
              onChangeText={setNewSnippetName}
              autoCapitalize="words"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => {
                  setNewSnippetName('');
                  setShowCreateModal(false);
                }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.accent },
                  !newSnippetName.trim() && { opacity: 0.5 },
                ]}
                onPress={handleCreate}
                disabled={!newSnippetName.trim()}
              >
                <Text style={{ color: colors.bgPrimary, fontWeight: '600' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },

  // Create button
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
  },

  // Loading
  loadingState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },

  // Snippet card
  snippetCard: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  snippetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  snippetInfo: {
    flex: 1,
    marginRight: 12,
  },
  snippetName: {
    fontSize: 15,
    fontWeight: '600',
  },
  snippetFilename: {
    fontSize: 12,
    marginTop: 2,
  },
  snippetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // Category
  categoryBar: {
    marginBottom: 12,
  },
  categoryBarContent: {
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 6,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Community card
  communityCard: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  communityCardBody: {
    flex: 1,
    marginRight: 12,
  },
  communityName: {
    fontSize: 15,
    fontWeight: '600',
  },
  communityDescription: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },

  // Install button
  installButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  installButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Editor modal
  editorModal: {
    flex: 1,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  editorInput: {
    flex: 1,
    margin: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: 'monospace',
    lineHeight: 20,
  },

  // Create modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  modalInput: {
    fontSize: 15,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});
