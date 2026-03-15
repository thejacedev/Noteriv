import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { findBacklinks, Backlink } from '@/lib/wiki-links';

export default function BacklinksScreen() {
  const router = useRouter();
  const { filePath, vaultPath } = useLocalSearchParams<{
    filePath: string;
    vaultPath: string;
  }>();
  const { colors } = useTheme();

  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (filePath && vaultPath) {
      findBacklinks(filePath, vaultPath).then((results) => {
        setBacklinks(results);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [filePath, vaultPath]);

  const handleOpenFile = useCallback(
    (backlink: Backlink) => {
      router.back();
      setTimeout(() => {
        router.push({ pathname: '/editor', params: { path: backlink.filePath } });
      }, 100);
    },
    [router]
  );

  const fileName = filePath ? filePath.split('/').pop() ?? '' : '';
  const styles = makeStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      {/* File info header */}
      <View style={styles.fileInfo}>
        <Ionicons name="link-outline" size={18} color={colors.textMuted} />
        <Text style={styles.fileInfoText} numberOfLines={1}>
          Backlinks to {fileName}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Scanning vault...</Text>
        </View>
      ) : backlinks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="link-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Backlinks Found</Text>
          <Text style={styles.emptySubtitle}>
            No other files link to this note using [[wiki links]].
          </Text>
        </View>
      ) : (
        <FlatList
          data={backlinks}
          keyExtractor={(item, index) => `${item.filePath}:${item.line}:${index}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.backlinkItem}
              onPress={() => handleOpenFile(item)}
              activeOpacity={0.7}
            >
              <View style={styles.backlinkIcon}>
                <Ionicons name="document-text-outline" size={20} color={colors.accent} />
              </View>
              <View style={styles.backlinkInfo}>
                <View style={styles.backlinkHeader}>
                  <Text style={styles.backlinkFileName} numberOfLines={1}>
                    {item.fileName}
                  </Text>
                  <Text style={styles.backlinkLine}>Line {item.line}</Text>
                </View>
                <Text style={styles.backlinkText} numberOfLines={2}>
                  {item.text}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          ListHeaderComponent={
            <Text style={styles.countText}>
              {backlinks.length} backlink{backlinks.length !== 1 ? 's' : ''} found
            </Text>
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
      fontWeight: '500',
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      color: colors.textMuted,
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
    countText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      paddingBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 32,
    },
    backlinkItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.bgSecondary,
      borderRadius: 10,
      marginBottom: 8,
    },
    backlinkIcon: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: colors.bgTertiary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backlinkInfo: {
      flex: 1,
    },
    backlinkHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    backlinkFileName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
      marginRight: 8,
    },
    backlinkLine: {
      fontSize: 12,
      color: colors.textMuted,
    },
    backlinkText: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
  });
}
