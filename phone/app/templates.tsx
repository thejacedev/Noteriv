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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { listTemplates, loadTemplate, processTemplate } from '@/lib/templates';
import { writeFile } from '@/lib/file-system';
import MarkdownPreview from '@/components/MarkdownPreview';

interface TemplateEntry {
  name: string;
  path: string;
}

export default function TemplatesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { vault, currentDir, refreshFiles, settings } = useApp();

  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateEntry | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (vault?.path) {
      const list = listTemplates(vault.path);
      setTemplates(list);
      setLoading(false);
    }
  }, [vault?.path]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [templates, search]);

  const handleSelect = useCallback(
    async (template: TemplateEntry) => {
      setSelectedTemplate(template);
      const raw = await loadTemplate(template.path);
      const processed = processTemplate(raw ?? '', template.name);
      setPreviewContent(processed);
    },
    []
  );

  const handleUseTemplate = useCallback(async () => {
    if (!selectedTemplate || !vault) return;

    const fileName = `${selectedTemplate.name}-${Date.now()}.md`;
    const dir = currentDir || vault.path;
    const filePath = `${dir.endsWith('/') ? dir : dir + '/'}${fileName}`;

    const ok = writeFile(filePath, previewContent);
    if (ok) {
      refreshFiles();
      router.back();
      setTimeout(() => {
        router.push({ pathname: '/editor', params: { path: filePath } });
      }, 100);
    } else {
      Alert.alert('Error', 'Failed to create file from template.');
    }
  }, [selectedTemplate, vault, currentDir, previewContent, refreshFiles, router]);

  const handleBack = useCallback(() => {
    if (selectedTemplate) {
      setSelectedTemplate(null);
      setPreviewContent('');
    } else {
      router.back();
    }
  }, [selectedTemplate, router]);

  const styles = makeStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  // Preview mode
  if (selectedTemplate) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.previewHeaderCenter}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {selectedTemplate.name}
            </Text>
            <Text style={styles.previewSubtitle}>Preview</Text>
          </View>
          <TouchableOpacity style={styles.useBtn} onPress={handleUseTemplate}>
            <Ionicons name="checkmark" size={20} color={colors.bgPrimary} />
            <Text style={styles.useBtnText}>Use</Text>
          </TouchableOpacity>
        </View>
        <MarkdownPreview content={previewContent} fontSize={settings.fontSize} />
      </SafeAreaView>
    );
  }

  // List mode
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search templates..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {templates.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Templates</Text>
          <Text style={styles.emptySubtitle}>
            Create a "Templates" folder in your vault and add .md files to use as templates.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.path}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.templateItem}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={22} color={colors.accent} />
              <Text style={styles.templateName}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptySubtitle}>No templates match your search.</Text>
            </View>
          }
        />
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
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bgTertiary,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.textPrimary,
      padding: 0,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    templateItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
      backgroundColor: colors.bgSecondary,
      borderRadius: 10,
      marginBottom: 8,
    },
    templateName: {
      flex: 1,
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: 12,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.bgSecondary,
    },
    backBtn: {
      padding: 8,
      borderRadius: 8,
    },
    previewHeaderCenter: {
      flex: 1,
      paddingHorizontal: 8,
    },
    previewTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    previewSubtitle: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
    useBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.green,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      marginRight: 4,
    },
    useBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.bgPrimary,
    },
  });
}
