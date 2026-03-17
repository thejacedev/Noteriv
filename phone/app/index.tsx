import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { getOrCreateDailyNote } from '@/lib/daily-note';
import { getRandomNote } from '@/lib/random-note';
import NotesList from '@/components/NotesList';
import SearchModal from '@/components/SearchModal';
import CreateModal from '@/components/CreateModal';
import VaultSwitcher from '@/components/VaultSwitcher';
import { FileEntry } from '@/types';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    vault,
    setupComplete,
    isLoading,
    files,
    currentDir,
    setCurrentDir,
    refreshFiles,
  } = useApp();

  const [searchVisible, setSearchVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [vaultSwitcherVisible, setVaultSwitcherVisible] = useState(false);

  const isAtRoot = vault ? currentDir === vault.path : true;

  const handleDailyNote = useCallback(async () => {
    if (!vault) return;
    const notePath = await getOrCreateDailyNote(vault.path);
    router.push({ pathname: '/editor', params: { path: notePath } });
  }, [vault, router]);

  const handleRandomNote = useCallback(async () => {
    if (!vault) return;
    const notePath = await getRandomNote(vault.path);
    if (notePath) {
      router.push({ pathname: '/editor', params: { path: notePath } });
    }
  }, [vault, router]);

  const handleFilePress = useCallback(
    (file: FileEntry) => {
      router.push({ pathname: '/editor', params: { path: file.path } });
    },
    [router]
  );

  const handleFileSelect = useCallback(
    (filePath: string) => {
      router.push({ pathname: '/editor', params: { path: filePath } });
    },
    [router]
  );

  const handleFolderPress = useCallback(
    (folder: FileEntry) => {
      setCurrentDir(folder.path);
    },
    [setCurrentDir]
  );

  const handleNavigateUp = useCallback(() => {
    if (!currentDir || !vault) return;
    const parent = currentDir.replace(/[^/]+\/$/, '');
    if (parent.length >= vault.path.length) {
      setCurrentDir(parent);
    }
  }, [currentDir, vault, setCurrentDir]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loading, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
      </SafeAreaView>
    );
  }

  if (!setupComplete) {
    return <Redirect href="/setup" />;
  }

  if (!vault) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Vault Selected</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Create a vault to start taking notes
          </Text>
          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: colors.blue }]}
            onPress={() => setVaultSwitcherVisible(true)}
          >
            <Ionicons name="add" size={20} color={colors.bgPrimary} />
            <Text style={[styles.emptyButtonText, { color: colors.bgPrimary }]}>Create a Vault</Text>
          </TouchableOpacity>
        </View>
        <VaultSwitcher
          visible={vaultSwitcherVisible}
          onClose={() => setVaultSwitcherVisible(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.bgTertiary }]}>
        <TouchableOpacity
          style={styles.vaultButton}
          onPress={() => setVaultSwitcherVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.vaultName, { color: colors.textPrimary }]} numberOfLines={1}>
            {vault.name}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={handleDailyNote}
          >
            <Ionicons name="today-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/calendar')}
          >
            <Ionicons name="calendar-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/flashcards')}
          >
            <Ionicons name="school-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={handleRandomNote}
          >
            <Ionicons name="shuffle-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setSearchVisible(true)}
          >
            <Ionicons name="search" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Notes list */}
      <NotesList
        files={files}
        currentDir={currentDir}
        vaultPath={vault.path}
        onFilePress={handleFilePress}
        onFolderPress={handleFolderPress}
        onNavigateUp={handleNavigateUp}
        onRefresh={refreshFiles}
        isAtRoot={isAtRoot}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.blue }]}
        onPress={() => setCreateVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.bgPrimary} />
      </TouchableOpacity>

      {/* Modals */}
      <SearchModal
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        vaultPath={vault.path}
        onFileSelect={handleFileSelect}
      />
      <CreateModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        currentDir={currentDir}
        onCreated={() => refreshFiles()}
      />
      <VaultSwitcher
        visible={vaultSwitcherVisible}
        onClose={() => setVaultSwitcherVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  vaultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 16,
  },
  vaultName: {
    fontSize: 20,
    fontWeight: '700',
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBtn: {
    padding: 8,
    borderRadius: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
