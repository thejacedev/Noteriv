import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import {
  getSnapshots,
  loadSnapshot,
  deleteSnapshot,
  SnapshotInfo,
} from '@/lib/file-recovery';
import { writeFile, readFile } from '@/lib/file-system';
import { diffStrings, DiffLine } from '@/lib/note-history';
import MarkdownPreview from '@/components/MarkdownPreview';

export default function RecoveryScreen() {
  const router = useRouter();
  const { filePath } = useLocalSearchParams<{ filePath: string }>();
  const { colors } = useTheme();
  const { vault, settings, setCurrentFile } = useApp();

  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewSnapshot, setPreviewSnapshot] = useState<SnapshotInfo | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);

  const loadSnapshots = useCallback(() => {
    if (!vault?.path || !filePath) return;
    const snaps = getSnapshots(vault.path, filePath);
    setSnapshots(snaps);
    setLoading(false);
  }, [vault?.path, filePath]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const handlePreview = useCallback(
    async (snap: SnapshotInfo) => {
      setPreviewSnapshot(snap);
      setShowDiff(false);
      const snapshotContent = await loadSnapshot(snap.snapshotPath);
      setPreviewContent(snapshotContent ?? '');
      // Compute diff against current file
      if (filePath) {
        const currentContent = await readFile(filePath);
        if (currentContent !== null && snapshotContent !== null) {
          setDiffLines(diffStrings(snapshotContent, currentContent));
        }
      }
    },
    [filePath]
  );

  const handleRestore = useCallback(() => {
    if (!previewSnapshot || !filePath) return;

    Alert.alert(
      'Restore Snapshot',
      'This will overwrite the current file with this snapshot. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => {
            const ok = writeFile(filePath, previewContent);
            if (ok) {
              setCurrentFile(filePath);
              router.back();
            } else {
              Alert.alert('Error', 'Failed to restore snapshot.');
            }
          },
        },
      ]
    );
  }, [previewSnapshot, filePath, previewContent, setCurrentFile, router]);

  const handleDelete = useCallback(
    (snap: SnapshotInfo) => {
      Alert.alert('Delete Snapshot', 'Remove this snapshot permanently?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSnapshot(snap.snapshotPath);
            if (previewSnapshot?.id === snap.id) {
              setPreviewSnapshot(null);
              setPreviewContent('');
            }
            loadSnapshots();
          },
        },
      ]);
    },
    [previewSnapshot, loadSnapshots]
  );

  const formatRelativeAge = useCallback((timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }, []);

  const handleBack = useCallback(() => {
    if (previewSnapshot) {
      setPreviewSnapshot(null);
      setPreviewContent('');
    } else {
      router.back();
    }
  }, [previewSnapshot, router]);

  const styles = makeStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  // Preview mode
  if (previewSnapshot) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {previewSnapshot.displayDate}
            </Text>
            <Text style={styles.headerSubtitle}>
              {formatRelativeAge(previewSnapshot.timestamp)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.diffToggle, { backgroundColor: showDiff ? colors.accent + '22' : colors.bgTertiary, borderColor: showDiff ? colors.accent : colors.border }]}
            onPress={() => setShowDiff((d) => !d)}
          >
            <Ionicons name="git-compare-outline" size={16} color={showDiff ? colors.accent : colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore}>
            <Ionicons name="refresh" size={18} color={colors.bgPrimary} />
            <Text style={styles.restoreBtnText}>Restore</Text>
          </TouchableOpacity>
        </View>
        {showDiff ? (
          <ScrollView style={styles.diffContainer} contentContainerStyle={styles.diffContent}>
            {diffLines.map((line, i) => (
              <Text
                key={i}
                style={[
                  styles.diffLine,
                  {
                    color: line.type === 'add' ? colors.green : line.type === 'remove' ? colors.red : colors.textSecondary,
                    backgroundColor: line.type === 'add' ? colors.green + '11' : line.type === 'remove' ? colors.red + '11' : 'transparent',
                  },
                ]}
              >
                {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}{line.text}
              </Text>
            ))}
            {diffLines.length === 0 && (
              <Text style={[styles.diffEmpty, { color: colors.textMuted }]}>No differences</Text>
            )}
          </ScrollView>
        ) : (
          <MarkdownPreview content={previewContent} fontSize={settings.fontSize} />
        )}
      </SafeAreaView>
    );
  }

  // List mode
  const fileName = filePath ? filePath.split('/').pop() ?? '' : '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.fileInfo}>
        <Ionicons name="document-text-outline" size={18} color={colors.textMuted} />
        <Text style={styles.fileInfoText} numberOfLines={1}>
          {fileName}
        </Text>
        <Text style={styles.snapshotCount}>
          {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {snapshots.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Snapshots</Text>
          <Text style={styles.emptySubtitle}>
            Snapshots are created automatically each time you save.
          </Text>
        </View>
      ) : (
        <FlatList
          data={snapshots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.snapshotItem}>
              <TouchableOpacity
                style={styles.snapshotMain}
                onPress={() => handlePreview(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="time-outline" size={20} color={colors.accent} />
                <View style={styles.snapshotInfo}>
                  <Text style={styles.snapshotDate}>{item.displayDate}</Text>
                  <Text style={styles.snapshotAge}>
                    {formatRelativeAge(item.timestamp)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item)}
              >
                <Ionicons name="trash-outline" size={18} color={colors.red} />
              </TouchableOpacity>
            </View>
          )}
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
    fileInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    fileInfoText: {
      flex: 1,
      fontSize: 14,
      color: colors.textSecondary,
    },
    snapshotCount: {
      fontSize: 13,
      color: colors.textMuted,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      paddingBottom: 32,
    },
    snapshotItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bgSecondary,
      borderRadius: 10,
      marginBottom: 8,
      overflow: 'hidden',
    },
    snapshotMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    snapshotInfo: {
      flex: 1,
    },
    snapshotDate: {
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    snapshotAge: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    deleteBtn: {
      padding: 14,
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
    headerCenter: {
      flex: 1,
      paddingHorizontal: 8,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
    restoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      marginRight: 4,
    },
    restoreBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.bgPrimary,
    },
    diffToggle: {
      width: 36,
      height: 36,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: 6,
    },
    diffContainer: {
      flex: 1,
    },
    diffContent: {
      padding: 12,
      paddingBottom: 32,
    },
    diffLine: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 12,
      lineHeight: 18,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    diffEmpty: {
      textAlign: 'center' as const,
      paddingVertical: 32,
      fontSize: 14,
    },
  });
}
