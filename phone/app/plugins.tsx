import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import {
  PluginManifest,
  CommunityPluginEntry,
  getInstalledPlugins,
  getEnabledPluginIds,
  setPluginEnabled,
  uninstallPlugin,
  fetchCommunityPlugins,
  installCommunityPlugin,
} from '@/lib/plugins';

type Tab = 'installed' | 'community';

interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
}

export default function PluginsScreen() {
  const { vault } = useApp();
  const { colors } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>('installed');
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [communityPlugins, setCommunityPlugins] = useState<CommunityPluginEntry[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const vaultPath = vault?.path ?? '';

  const refreshPlugins = useCallback(async () => {
    if (!vaultPath) return;
    const [manifests, enabledIds] = await Promise.all([
      getInstalledPlugins(vaultPath),
      getEnabledPluginIds(vaultPath),
    ]);
    setPlugins(
      manifests.map((m) => ({
        manifest: m,
        enabled: enabledIds.includes(m.id),
      }))
    );
  }, [vaultPath]);

  useEffect(() => {
    refreshPlugins();
  }, [refreshPlugins]);

  useEffect(() => {
    if (activeTab === 'community' && communityPlugins.length === 0) {
      setLoadingCommunity(true);
      fetchCommunityPlugins()
        .then(setCommunityPlugins)
        .finally(() => setLoadingCommunity(false));
    }
  }, [activeTab]);

  const handleToggle = useCallback(
    async (plugin: InstalledPlugin) => {
      if (!vaultPath) return;
      const newEnabled = !plugin.enabled;
      await setPluginEnabled(vaultPath, plugin.manifest.id, newEnabled);
      setPlugins((prev) =>
        prev.map((p) =>
          p.manifest.id === plugin.manifest.id ? { ...p, enabled: newEnabled } : p
        )
      );
    },
    [vaultPath]
  );

  const handleUninstall = useCallback(
    (plugin: InstalledPlugin) => {
      Alert.alert(
        'Uninstall Plugin',
        `Uninstall "${plugin.manifest.name}"? This will remove all plugin files.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Uninstall',
            style: 'destructive',
            onPress: () => {
              uninstallPlugin(vaultPath, plugin.manifest.id);
              setPlugins((prev) =>
                prev.filter((p) => p.manifest.id !== plugin.manifest.id)
              );
            },
          },
        ]
      );
    },
    [vaultPath]
  );

  const handleInstallCommunity = useCallback(
    async (entry: CommunityPluginEntry) => {
      if (!vaultPath) return;
      setInstallingId(entry.id);
      try {
        const success = await installCommunityPlugin(vaultPath, entry);
        if (success) {
          await refreshPlugins();
          Alert.alert('Installed', `"${entry.name}" has been installed.`);
        } else {
          Alert.alert('Error', 'Failed to install plugin.');
        }
      } catch {
        Alert.alert('Error', 'Failed to install plugin.');
      } finally {
        setInstallingId(null);
      }
    },
    [vaultPath, refreshPlugins]
  );

  const installedIds = new Set(plugins.map((p) => p.manifest.id));

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
          {plugins.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="extension-puzzle-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No plugins installed
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                Browse the community tab to find plugins
              </Text>
            </View>
          ) : (
            plugins.map((plugin) => (
              <TouchableOpacity
                key={plugin.manifest.id}
                style={[styles.pluginCard, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onLongPress={() => handleUninstall(plugin)}
                activeOpacity={0.7}
              >
                <View style={styles.pluginCardBody}>
                  <View style={styles.pluginNameRow}>
                    <Text style={[styles.pluginName, { color: colors.textPrimary }]}>
                      {plugin.manifest.name}
                    </Text>
                    <Text style={[styles.pluginVersion, { color: colors.textMuted }]}>
                      v{plugin.manifest.version}
                    </Text>
                  </View>
                  <Text style={[styles.pluginAuthor, { color: colors.textMuted }]}>
                    by {plugin.manifest.author}
                  </Text>
                  <Text style={[styles.pluginDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                    {plugin.manifest.description}
                  </Text>
                </View>
                <View style={styles.pluginActions}>
                  <Switch
                    value={plugin.enabled}
                    onValueChange={() => handleToggle(plugin)}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor={colors.textPrimary}
                  />
                </View>
              </TouchableOpacity>
            ))
          )}

          {plugins.length > 0 && (
            <Text style={[styles.hintText, { color: colors.textMuted }]}>
              Long press a plugin to uninstall
            </Text>
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {loadingCommunity ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                Fetching community plugins...
              </Text>
            </View>
          ) : communityPlugins.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No community plugins available
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                Check your internet connection or try again later
              </Text>
            </View>
          ) : (
            communityPlugins.map((entry) => {
              const isInstalled = installedIds.has(entry.id);
              const isInstalling = installingId === entry.id;

              return (
                <View
                  key={entry.id}
                  style={[styles.communityCard, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                >
                  <View style={styles.communityCardBody}>
                    <View style={styles.pluginNameRow}>
                      <Text style={[styles.communityName, { color: colors.textPrimary }]}>
                        {entry.name}
                      </Text>
                      <Text style={[styles.pluginVersion, { color: colors.textMuted }]}>
                        v{entry.version}
                      </Text>
                    </View>
                    <Text style={[styles.pluginAuthor, { color: colors.textMuted }]}>
                      by {entry.author}
                    </Text>
                    <Text style={[styles.communityDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                      {entry.description}
                    </Text>
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
            })
          )}
        </ScrollView>
      )}
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

  // Plugin card
  pluginCard: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  pluginCardBody: {
    flex: 1,
    marginRight: 12,
  },
  pluginNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pluginName: {
    fontSize: 15,
    fontWeight: '600',
  },
  pluginVersion: {
    fontSize: 12,
  },
  pluginAuthor: {
    fontSize: 12,
    marginTop: 2,
  },
  pluginDescription: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  pluginActions: {
    alignItems: 'center',
  },

  // Hint text
  hintText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
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
});
