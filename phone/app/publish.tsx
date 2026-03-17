import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { WebView } from 'react-native-webview';
import { shareAsync } from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { generatePublishHTML } from '@/lib/publish';
import { readFile } from '@/lib/file-system';

export default function PublishScreen() {
  const router = useRouter();
  const { filePath } = useLocalSearchParams<{ filePath: string }>();
  const { colors } = useTheme();
  const { content: currentContent } = useApp();

  const [publishing, setPublishing] = useState(false);

  const fileName = filePath ? filePath.split('/').pop()?.replace(/\.md$/i, '') || 'note' : 'note';
  const html = generatePublishHTML(currentContent || '', fileName);

  const handleShare = useCallback(async () => {
    setPublishing(true);
    try {
      const safeName = fileName.replace(/[^a-zA-Z0-9-_ ]/g, '');
      const tmpPath = `${Paths.cache.uri}/${safeName}.html`;
      const file = new File(tmpPath);
      file.write(html);
      await shareAsync(tmpPath, {
        mimeType: 'text/html',
        dialogTitle: `Share ${fileName}`,
        UTI: 'public.html',
      });
    } catch (err: any) {
      if (err?.message !== 'User did not share') {
        Alert.alert('Error', 'Failed to share HTML file.');
      }
    } finally {
      setPublishing(false);
    }
  }, [html, fileName]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.header, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            Publish
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            {fileName}.html
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: colors.accent }]}
          onPress={handleShare}
          disabled={publishing}
        >
          {publishing ? (
            <ActivityIndicator size="small" color={colors.bgPrimary} />
          ) : (
            <>
              <Ionicons name="share-outline" size={16} color={colors.bgPrimary} />
              <Text style={[styles.shareBtnText, { color: colors.bgPrimary }]}>Share</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <WebView
        source={{ html }}
        style={styles.webview}
        originWhitelist={['*']}
        scrollEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headerBtn: { padding: 8, borderRadius: 8 },
  headerCenter: { flex: 1, paddingHorizontal: 8 },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 4,
  },
  shareBtnText: { fontSize: 14, fontWeight: '600' },
  webview: { flex: 1 },
});
