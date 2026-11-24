import React, { useCallback, useState, useEffect } from 'react';
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
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { BUILT_IN_THEMES, AccentColors, ThemeDefinition } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import { KEYS, setItem } from '@/lib/storage';
import * as GitSync from '@/lib/provider-sync';
import * as WebDav from '@/lib/webdav-sync';
import { GitProvider } from '@/types';
import { loadSnippets } from '@/lib/css-snippets';
import { getInstalledPlugins, getEnabledPluginIds } from '@/lib/plugins';
import {
  CommunityThemeEntry,
  fetchCommunityThemes,
  installCommunityTheme,
  loadCustomThemes,
} from '@/lib/community';
import Constants from 'expo-constants';

const AUTO_SAVE_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
];

const TAB_SIZE_OPTIONS = [2, 4, 8];

export default function SettingsScreen() {
  const { settings, updateSettings, vault, vaults, refreshFiles, refreshVaults, syncWebDav } = useApp();
  const { colors } = useTheme();
  const router = useRouter();

  // Git sync state
  const [ghToken, setGhToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [remoteInput, setRemoteInput] = useState('');
  const [providerInput, setProviderInput] = useState<GitProvider>('gitlab');
  const [remoteError, setRemoteError] = useState<string | null>(null);

  // Repo picker state (inside token modal)
  const [validatingToken, setValidatingToken] = useState(false);
  const [ghUser, setGhUser] = useState<string | null>(null);
  const [repos, setRepos] = useState<{ id: number; name: string; full_name: string; clone_url: string; private: boolean }[]>([]);
  const [selectedRepoUrl, setSelectedRepoUrl] = useState<string | null>(null);
  const [tokenStep, setTokenStep] = useState<'token' | 'repo'>('token');

  // Ecosystem counts
  const [snippetCount, setSnippetCount] = useState(0);
  const [pluginCount, setPluginCount] = useState(0);
  const [enabledPluginCount, setEnabledPluginCount] = useState(0);

  // Community themes
  const [communityThemes, setCommunityThemes] = useState<CommunityThemeEntry[]>([]);
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>([]);
  const [showCommunityThemes, setShowCommunityThemes] = useState(false);
  const [loadingCommunityThemes, setLoadingCommunityThemes] = useState(false);
  const [installingThemeId, setInstallingThemeId] = useState<string | null>(null);

  // WebDAV sync state
  const [davUrl, setDavUrl] = useState('');
  const [davUser, setDavUser] = useState('');
  const [davPassword, setDavPassword] = useState('');
  const [davPath, setDavPath] = useState('/Noteriv');
  const [davBusy, setDavBusy] = useState(false);
  const [davError, setDavError] = useState<string | null>(null);
  const [davStatus, setDavStatus] = useState<string | null>(null);
  const [davLastSync, setDavLastSync] = useState<string | null>(null);

  // Load the provider-neutral token, falling back to the legacy GitHub token.
  useEffect(() => {
    if (vault) {
      GitSync.getVaultToken(vault.id).then((token) => {
        setGhToken(token);
      });
      setRemoteInput(vault.gitRemote ?? '');
      setProviderInput(vault.gitProvider ?? GitSync.detectProvider(vault.gitRemote ?? '') ?? 'gitlab');
    }
  }, [vault]);

  // Load ecosystem counts and custom themes
  useEffect(() => {
    if (vault?.path) {
      loadSnippets(vault.path).then((snippets) => setSnippetCount(snippets.length));
      getInstalledPlugins(vault.path).then((plugins) => setPluginCount(plugins.length));
      getEnabledPluginIds(vault.path).then((ids) => setEnabledPluginCount(ids.length));
      loadCustomThemes(vault.path).then(setCustomThemes);
    }
  }, [vault?.path]);

  const handleValidateToken = useCallback(async () => {
    if (!tokenInput.trim()) return;
    setValidatingToken(true);
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${tokenInput.trim()}` },
      });
      if (!userRes.ok) {
        Alert.alert('Invalid Token', 'Could not authenticate. Check your token has the "repo" scope.');
        setValidatingToken(false);
        return;
      }
      const user = await userRes.json();
      setGhUser(user.login);

      const reposRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: { Authorization: `token ${tokenInput.trim()}` },
      });
      if (reposRes.ok) {
        setRepos(await reposRes.json());
      }
      setTokenStep('repo');
    } catch {
      Alert.alert('Error', 'Network error. Check your connection.');
    } finally {
      setValidatingToken(false);
    }
  }, [tokenInput]);

  const handleSaveTokenAndRepo = useCallback(async () => {
    if (!vault || !tokenInput.trim() || !selectedRepoUrl) return;
    await setItem(KEYS.GITHUB_TOKEN(vault.id), tokenInput.trim());
    setGhToken(tokenInput.trim());

    // Save the repo URL on the vault
    const { updateVault } = await import('@/lib/vault');
    // GitHub sync has always used "main"; say so, in case this vault last synced another provider's branch.
    await updateVault(vault.id, { gitRemote: selectedRepoUrl, gitProvider: 'github', gitBranch: 'main' });
    await refreshVaults();

    // Reset modal state
    setTokenInput('');
    setSelectedRepoUrl(null);
    setTokenStep('token');
    setRepos([]);
    setGhUser(null);
    setShowTokenModal(false);

    // Trigger immediate sync
    setSyncStatus('Syncing...');
    setSyncing(true);
    try {
      const result = await GitSync.sync(vault.path, tokenInput.trim(), selectedRepoUrl, 'main', 'github');
      setLastSyncTime(new Date().toLocaleTimeString());
      setSyncStatus(GitSync.describeResult(result));
    } catch (err) {
      setSyncStatus(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }, [vault, tokenInput, selectedRepoUrl]);

  const handleDisconnectGitHub = useCallback(async () => {
    if (!vault) return;
    Alert.alert('Disconnect Remote', 'Remove the stored token for this vault?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(KEYS.GITHUB_TOKEN(vault.id));
          await AsyncStorage.removeItem(KEYS.GIT_TOKEN(vault.id));
          setGhToken(null);
        },
      },
    ]);
  }, [vault]);

  const handleSyncNow = useCallback(async () => {
    if (!vault || !ghToken || !vault.gitRemote) return;
    setSyncing(true);
    setSyncStatus(null);
    try {
      const result = await GitSync.sync(
        vault.path,
        ghToken,
        vault.gitRemote,
        vault.gitBranch || undefined,
        vault.gitProvider
      );
      refreshFiles();
      const now = new Date().toLocaleTimeString();
      setLastSyncTime(now);
      setSyncStatus(GitSync.describeResult(result));
    } catch (err) {
      setSyncStatus(
        `Sync failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSyncing(false);
    }
  }, [vault, ghToken, refreshFiles]);

  const handleSaveCustomRemote = useCallback(async () => {
    if (!vault || !remoteInput.trim() || !tokenInput.trim()) return;
    const provider = GitSync.detectProvider(remoteInput.trim(), providerInput);
    if (!provider || provider === 'github') return;
    const token = tokenInput.trim();
    setRemoteError(null);
    setSyncing(true);
    try {
      // Ask the server first: a remote that cannot work is not saved, and the
      // reason is shown under the form instead of a "connected" vault that never syncs.
      const check = await GitSync.checkRemote(remoteInput.trim(), token, provider);
      if (!check.ok) {
        setRemoteError(check.problem);
        return;
      }
      await setItem(KEYS.GIT_TOKEN(vault.id), token);
      const { updateVault } = await import('@/lib/vault');
      // Sync the branch the repository really has; a vault starts out assuming "main".
      await updateVault(vault.id, { gitRemote: remoteInput.trim(), gitProvider: provider, gitBranch: check.branch });
      setGhToken(token);
      setTokenInput('');
      await refreshVaults();
      const result = await GitSync.sync(vault.path, token, remoteInput.trim(), check.branch, provider);
      refreshFiles();
      setLastSyncTime(new Date().toLocaleTimeString());
      setSyncStatus(GitSync.describeResult(result));
    } catch (err) {
      setSyncStatus(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }, [vault, remoteInput, tokenInput, providerInput, refreshFiles, refreshVaults]);

  const handleSaveWebDav = useCallback(async () => {
    if (!vault || !davUrl.trim() || !davUser.trim() || !davPassword) return;
    const cfg: WebDav.WebDavConfig = {
      url: davUrl.trim(),
      username: davUser.trim(),
      password: davPassword,
      remotePath: davPath.trim() || '/',
    };
    setDavError(null);
    setDavStatus(null);
    setDavBusy(true);
    try {
      const other = WebDav.vaultSharingFolder(vaults, vault.id, cfg);
      if (other) {
        setDavError(`The vault "${other}" already syncs with this folder. Two vaults in one folder would be mixed into each other: choose another remote folder.`);
        return;
      }
      // Ask the server first: details that cannot work are not saved, and the
      // reason is shown under the form instead of a "connected" vault that never syncs.
      await WebDav.testConnection(cfg);
      const { updateVault } = await import('@/lib/vault');
      const webdav = { url: cfg.url, username: cfg.username, remotePath: cfg.remotePath };
      await setItem(KEYS.WEBDAV_PASSWORD(vault.id), cfg.password);
      await updateVault(vault.id, { webdav });
      setDavPassword('');
      try {
        const outcome = await syncWebDav({ ...vault, webdav }, cfg);
        setDavLastSync(new Date().toLocaleTimeString());
        setDavStatus(WebDav.describeOutcome(outcome));
        refreshFiles();
      } catch (err) {
        setDavStatus(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      // From here on the vault syncs by itself.
      await refreshVaults();
    } catch (err) {
      setDavError(err instanceof Error ? err.message : String(err));
    } finally {
      setDavBusy(false);
    }
  }, [vault, vaults, davUrl, davUser, davPassword, davPath, syncWebDav, refreshFiles, refreshVaults]);

  const handleWebDavSyncNow = useCallback(async () => {
    if (!vault?.webdav) return;
    setDavBusy(true);
    setDavStatus(null);
    try {
      const cfg = await WebDav.vaultConfig(vault);
      if (!cfg) {
        setDavStatus('Sync failed: the password for this server is no longer stored. Disconnect and connect again.');
        return;
      }
      const outcome = await syncWebDav(vault, cfg);
      setDavLastSync(new Date().toLocaleTimeString());
      setDavStatus(WebDav.describeOutcome(outcome));
      refreshFiles();
    } catch (err) {
      setDavStatus(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDavBusy(false);
    }
  }, [vault, syncWebDav, refreshFiles]);

  const handleDisconnectWebDav = useCallback(() => {
    if (!vault) return;
    Alert.alert('Disconnect WebDAV', 'Stop syncing this vault with the server? Your notes stay on the phone and on the server.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          const { updateVault } = await import('@/lib/vault');
          await updateVault(vault.id, { webdav: null });
          await AsyncStorage.removeItem(KEYS.WEBDAV_PASSWORD(vault.id));
          setDavStatus(null);
          setDavLastSync(null);
          await refreshVaults();
        },
      },
    ]);
  }, [vault, refreshVaults]);

  const handleFreshClone = useCallback(async () => {
    if (!vault || !ghToken || !vault.gitRemote) return;
    Alert.alert(
      'Fresh Clone',
      'This will DELETE all local notes and re-download everything from GitHub. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete & Clone',
          style: 'destructive',
          onPress: async () => {
            setSyncing(true);
            setSyncStatus('Deleting local files & cloning...');
            try {
              const result = await GitSync.freshClone(
                vault.path,
                ghToken,
                vault.gitRemote!,
                vault.gitBranch || undefined,
                vault.gitProvider
              );
              refreshFiles();
              setLastSyncTime(new Date().toLocaleTimeString());
              if (result.errors.length > 0) {
                setSyncStatus(`Cloned: ${result.pulled} files, Errors: ${result.errors.length}`);
              } else {
                setSyncStatus(`Fresh clone: ${result.pulled} files downloaded`);
              }
            } catch (err) {
              setSyncStatus(`Clone failed: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  }, [vault, ghToken]);

  const handleBrowseCommunityThemes = useCallback(async () => {
    if (showCommunityThemes) {
      setShowCommunityThemes(false);
      return;
    }
    setShowCommunityThemes(true);
    if (communityThemes.length === 0) {
      setLoadingCommunityThemes(true);
      try {
        const themes = await fetchCommunityThemes();
        setCommunityThemes(themes);
      } finally {
        setLoadingCommunityThemes(false);
      }
    }
  }, [showCommunityThemes, communityThemes.length]);

  const handleInstallTheme = useCallback(
    async (entry: CommunityThemeEntry) => {
      if (!vault?.path) return;
      setInstallingThemeId(entry.id);
      try {
        const theme = await installCommunityTheme(vault.path, entry);
        if (theme) {
          setCustomThemes((prev) =>
            [...prev.filter((t) => t.id !== theme.id), theme].sort((a, b) =>
              a.name.localeCompare(b.name)
            )
          );
          Alert.alert('Installed', `"${entry.name}" theme has been installed.`);
        } else {
          Alert.alert('Error', 'Failed to install theme.');
        }
      } catch {
        Alert.alert('Error', 'Failed to install theme.');
      } finally {
        setInstallingThemeId(null);
      }
    },
    [vault?.path]
  );

  const handleResetApp = useCallback(() => {
    Alert.alert(
      'Reset App',
      'This will delete all vaults, settings, and data. You will go through setup again. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            router.replace('/setup');
          },
        },
      ]
    );
  }, [router]);

  const renderSectionHeader = useCallback(
    (title: string, icon: keyof typeof Ionicons.glyphMap) => (
      <View style={s.sectionHeader}>
        <Ionicons name={icon} size={18} color={colors.accent} />
        <Text style={[s.sectionTitle, { color: colors.accent }]}>{title}</Text>
      </View>
    ),
    [colors]
  );

  const renderToggle = useCallback(
    (label: string, value: boolean, onToggle: (val: boolean) => void) => (
      <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
        <Text style={[s.settingLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.textPrimary}
        />
      </View>
    ),
    [colors]
  );

  const renderPicker = useCallback(
    (
      label: string,
      options: { label: string; value: number | string }[],
      currentValue: number | string,
      onSelect: (val: number | string) => void
    ) => (
      <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
        <Text style={[s.settingLabel, { color: colors.textPrimary }]}>{label}</Text>
        <View style={s.pickerRow}>
          {options.map((opt) => (
            <TouchableOpacity
              key={String(opt.value)}
              style={[
                s.pickerOption,
                { backgroundColor: colors.border },
                currentValue === opt.value && { backgroundColor: colors.accent },
              ]}
              onPress={() => onSelect(opt.value)}
            >
              <Text
                style={[
                  s.pickerOptionText,
                  { color: colors.textSecondary },
                  currentValue === opt.value && { color: colors.bgPrimary },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    ),
    [colors]
  );

  const renderSlider = useCallback(
    (
      label: string,
      value: number,
      min: number,
      max: number,
      step: number,
      formatter: (v: number) => string,
      onUpdate: (val: number) => void
    ) => (
      <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
        <View style={s.sliderHeader}>
          <Text style={[s.settingLabel, { color: colors.textPrimary }]}>{label}</Text>
          <Text style={[s.sliderValue, { color: colors.accent }]}>
            {formatter(value)}
          </Text>
        </View>
        <View style={s.sliderTrack}>
          {Array.from(
            { length: Math.round((max - min) / step) + 1 },
            (_, i) => min + i * step
          ).map((v) => {
            const rounded = Math.round(v * 10) / 10;
            const isActive = rounded <= value;
            return (
              <TouchableOpacity
                key={rounded}
                style={[
                  s.sliderDot,
                  { backgroundColor: colors.border },
                  isActive && { backgroundColor: colors.accent + '60' },
                  rounded === value && {
                    backgroundColor: colors.accent,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                  },
                ]}
                onPress={() => onUpdate(rounded)}
              />
            );
          })}
        </View>
      </View>
    ),
    [colors]
  );

  const renderThemeCard = useCallback(
    (theme: ThemeDefinition) => {
      const isActive = settings.theme === theme.id;
      const previewColors = [
        theme.colors.bgPrimary,
        theme.colors.accent,
        theme.colors.green,
        theme.colors.red,
        theme.colors.yellow,
        theme.colors.blue,
      ];
      return (
        <TouchableOpacity
          key={theme.id}
          style={[
            s.themeCard,
            { backgroundColor: theme.colors.bgTertiary, borderColor: theme.colors.border },
            isActive && { borderColor: colors.accent, borderWidth: 2 },
          ]}
          onPress={() => updateSettings({ theme: theme.id })}
        >
          <View style={s.themeCardHeader}>
            <Text
              style={[
                s.themeCardName,
                { color: theme.colors.textPrimary },
              ]}
              numberOfLines={1}
            >
              {theme.name}
            </Text>
            {isActive && (
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            )}
          </View>
          <View style={s.themeColorBar}>
            {previewColors.map((c, i) => (
              <View
                key={i}
                style={[s.themeColorDot, { backgroundColor: c }]}
              />
            ))}
          </View>
        </TouchableOpacity>
      );
    },
    [settings.theme, colors, updateSettings]
  );

  const appVersion =
    Constants.expoConfig?.version ??
    Constants.manifest2?.extra?.expoClient?.version ??
    '1.0.0';

  const gitConnected = !!ghToken && !!vault?.gitRemote;
  const provider = vault?.gitRemote
    ? GitSync.detectProvider(vault.gitRemote, vault.gitProvider)
    : null;

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={s.contentContainer}
    >
      {/* General */}
      {renderSectionHeader('General', 'settings-outline')}
      <View style={[s.section, { backgroundColor: colors.bgTertiary }]}>
        {renderPicker(
          'Auto-save',
          AUTO_SAVE_OPTIONS,
          settings.autoSaveInterval,
          (val) => updateSettings({ autoSaveInterval: val as number })
        )}
        {renderToggle('Spell check', settings.spellCheck, (val) =>
          updateSettings({ spellCheck: val })
        )}
      </View>

      {/* Appearance */}
      {renderSectionHeader('Appearance', 'color-palette-outline')}
      <View style={[s.section, { backgroundColor: colors.bgTertiary }]}>
        {/* Theme Picker */}
        <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
          <Text style={[s.settingLabel, { color: colors.textPrimary }]}>Theme</Text>
        </View>
        <View style={s.themeGrid}>
          {BUILT_IN_THEMES.map(renderThemeCard)}
          {customThemes.map(renderThemeCard)}
        </View>

        {/* Community Themes */}
        <TouchableOpacity
          style={[s.settingRow, { borderBottomColor: colors.border }]}
          onPress={handleBrowseCommunityThemes}
        >
          <Text style={[s.settingLabel, { color: colors.textPrimary }]}>
            Community Themes
          </Text>
          <View style={s.linkRow}>
            <Ionicons
              name={showCommunityThemes ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textMuted}
            />
          </View>
        </TouchableOpacity>

        {showCommunityThemes && (
          <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
            {loadingCommunityThemes ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
                  Loading community themes...
                </Text>
              </View>
            ) : communityThemes.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
                No community themes available
              </Text>
            ) : (
              communityThemes.map((entry) => {
                const isInstalled = customThemes.some((t) => t.id === `custom-${entry.id}`);
                const isInstalling = installingThemeId === entry.id;
                return (
                  <View
                    key={entry.id}
                    style={[
                      s.communityThemeRow,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.communityThemeName, { color: colors.textPrimary }]}>
                        {entry.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                        {entry.description}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                        by {entry.author} · {entry.type}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        s.communityThemeInstall,
                        {
                          backgroundColor: isInstalled ? colors.bgSecondary : colors.accent,
                        },
                        isInstalling && { opacity: 0.6 },
                      ]}
                      onPress={() => !isInstalled && !isInstalling && handleInstallTheme(entry)}
                      disabled={isInstalled || isInstalling}
                    >
                      {isInstalling ? (
                        <ActivityIndicator size="small" color={colors.bgPrimary} />
                      ) : (
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: isInstalled ? colors.textMuted : colors.bgPrimary,
                          }}
                        >
                          {isInstalled ? 'Installed' : 'Install'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Accent color */}
        <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
          <Text style={[s.settingLabel, { color: colors.textPrimary }]}>
            Accent Color
          </Text>
          <View style={s.colorRow}>
            {Object.entries(AccentColors).map(([name, accentColors]) => {
              const themeType = BUILT_IN_THEMES.find(
                (t) => t.id === settings.theme
              )?.type;
              const dotColor =
                themeType === 'light' ? accentColors.light : accentColors.dark;
              return (
                <TouchableOpacity
                  key={name}
                  style={[
                    s.colorDot,
                    { backgroundColor: dotColor },
                    settings.accentColor === dotColor && {
                      borderWidth: 2,
                      borderColor: colors.textPrimary,
                    },
                  ]}
                  onPress={() => updateSettings({ accentColor: dotColor })}
                >
                  {settings.accentColor === dotColor && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={colors.bgPrimary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {renderSlider(
          'Font size',
          settings.fontSize,
          12,
          24,
          1,
          (v) => `${v}px`,
          (val) => updateSettings({ fontSize: val })
        )}
      </View>

      {/* Editor */}
      {renderSectionHeader('Editor', 'code-slash-outline')}
      <View style={[s.section, { backgroundColor: colors.bgTertiary }]}>
        {renderSlider(
          'Line height',
          settings.lineHeight,
          1.2,
          2.0,
          0.2,
          (v) => v.toFixed(1),
          (val) => updateSettings({ lineHeight: val })
        )}
        {renderPicker(
          'Tab size',
          TAB_SIZE_OPTIONS.map((sz) => ({ label: String(sz), value: sz })),
          settings.tabSize,
          (val) => updateSettings({ tabSize: val as number })
        )}
      </View>

      {/* Ecosystem */}
      {renderSectionHeader('Ecosystem', 'apps-outline')}
      <View style={[s.section, { backgroundColor: colors.bgTertiary }]}>
        <TouchableOpacity
          style={[s.settingRow, { borderBottomColor: colors.border }]}
          onPress={() => router.push('/snippets')}
        >
          <View style={s.ecosystemRow}>
            <Ionicons name="code-slash-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[s.settingLabel, { color: colors.textPrimary }]}>
                CSS Snippets
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                {snippetCount} snippet{snippetCount !== 1 ? 's' : ''} installed
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.settingRow, { borderBottomColor: colors.border }]}
          onPress={() => router.push('/plugins')}
        >
          <View style={s.ecosystemRow}>
            <Ionicons name="extension-puzzle-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[s.settingLabel, { color: colors.textPrimary }]}>
                Plugins
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                {pluginCount} installed · {enabledPluginCount} enabled
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Git sync */}
      {renderSectionHeader('Git Sync', 'git-branch-outline')}
      <View style={[s.section, { backgroundColor: colors.bgTertiary }]}>
        {gitConnected ? (
          <>
            <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
              <Text style={[s.settingLabel, { color: colors.textPrimary }]}>
                Status
              </Text>
              <View style={s.statusRow}>
                <View style={[s.statusDot, { backgroundColor: colors.green }]} />
                <Text style={{ color: colors.green, fontSize: 14, fontWeight: '500' }}>
                  Connected
                </Text>
              </View>
            </View>

            {lastSyncTime && (
              <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
                <Text style={[s.settingLabel, { color: colors.textPrimary }]}>
                  Last sync
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                  {lastSyncTime}
                </Text>
              </View>
            )}

            {syncStatus && (
              <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
                <Text
                  style={{
                    color: syncStatus.includes('failed')
                      ? colors.red
                      : colors.textSecondary,
                    fontSize: 13,
                    flex: 1,
                  }}
                >
                  {syncStatus}
                </Text>
              </View>
            )}

            <View style={[s.settingRow, { borderBottomColor: colors.border, gap: 8 }]}>
              <TouchableOpacity
                style={[
                  s.syncButton,
                  { backgroundColor: colors.accent },
                  syncing && { opacity: 0.6 },
                ]}
                onPress={handleSyncNow}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={colors.bgPrimary} />
                ) : (
                  <Ionicons name="sync" size={18} color={colors.bgPrimary} />
                )}
                <Text style={[s.syncButtonText, { color: colors.bgPrimary }]}>
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Text>
              </TouchableOpacity>
              {provider === 'github' && (
                <TouchableOpacity
                  style={[
                    s.syncButton,
                    { backgroundColor: colors.red },
                    syncing && { opacity: 0.6 },
                  ]}
                  onPress={handleFreshClone}
                  disabled={syncing}
                >
                  <Ionicons name="cloud-download-outline" size={18} color={colors.bgPrimary} />
                  <Text style={[s.syncButtonText, { color: colors.bgPrimary }]}>
                    Fresh Clone
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
              <Text style={[s.settingLabel, { color: colors.textPrimary }]}>Auto-sync</Text>
              <Text style={{ color: colors.green, fontSize: 13, fontWeight: '500' }}>Every 5s</Text>
            </View>

            <TouchableOpacity
              style={[s.settingRow, { borderBottomColor: colors.border }]}
              onPress={handleDisconnectGitHub}
            >
              <Text style={{ color: colors.red, fontSize: 15, fontWeight: '500' }}>
                Disconnect Remote
              </Text>
              <Ionicons name="close-circle-outline" size={20} color={colors.red} />
            </TouchableOpacity>
          </>
        ) : (
          <View style={s.gitDisconnected}>
            <Text style={[s.gitDisconnectedText, { color: colors.textMuted }]}>
                Connect GitHub, GitLab, Gitea, or Forgejo to sync notes across devices.
            </Text>
            <TouchableOpacity
              style={[s.connectButton, { backgroundColor: colors.accent }]}
              onPress={() => setShowTokenModal(true)}
            >
              <Ionicons name="logo-github" size={20} color={colors.bgPrimary} />
              <Text style={[s.connectButtonText, { color: colors.bgPrimary }]}>
                Connect GitHub
              </Text>
            </TouchableOpacity>
            <View style={s.customRemoteForm}>
              <Text style={[s.modalHint, { color: colors.textMuted }]}>
                {providerInput === 'gitlab'
                  ? 'For GitLab, enter the HTTPS clone URL and an access token with the "api" scope. A token with only read_repository and write_repository will not work here. A project or group access token also needs the Maintainer role (Developer if the branch is not protected).'
                  : 'For Gitea or Forgejo, enter the HTTPS clone URL and an access token with read and write access to repositories.'}
              </Text>
              <View style={s.providerRow}>
                {(['gitlab', 'gitea'] as GitProvider[]).map((item) => (
                  <TouchableOpacity key={item} style={[s.providerOption, { backgroundColor: colors.bgSecondary }, providerInput === item && { backgroundColor: colors.accent }]} onPress={() => { setProviderInput(item); setRemoteError(null); }}>
                    <Text style={{ color: providerInput === item ? colors.bgPrimary : colors.textSecondary, fontWeight: '600' }}>{item === 'gitlab' ? 'GitLab' : 'Gitea / Forgejo'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={[s.tokenInput, { color: colors.textPrimary, backgroundColor: colors.bgSecondary, borderColor: colors.border }]} placeholder="https://git.example.com/group/repo.git" placeholderTextColor={colors.textMuted} value={remoteInput} onChangeText={(text) => { setRemoteInput(text); setRemoteError(null); }} autoCapitalize="none" autoCorrect={false} />
              <TextInput style={[s.tokenInput, { color: colors.textPrimary, backgroundColor: colors.bgSecondary, borderColor: colors.border }]} placeholder="Access token" placeholderTextColor={colors.textMuted} value={tokenInput} onChangeText={(text) => { setTokenInput(text); setRemoteError(null); }} autoCapitalize="none" autoCorrect={false} secureTextEntry />
              <TouchableOpacity style={[s.connectButton, { backgroundColor: colors.accent }, (!remoteInput.trim() || !tokenInput.trim() || syncing) && { opacity: 0.5 }]} onPress={handleSaveCustomRemote} disabled={!remoteInput.trim() || !tokenInput.trim() || syncing}>
                <Text style={[s.connectButtonText, { color: colors.bgPrimary }]}>{syncing ? 'Saving...' : 'Save & Sync Remote'}</Text>
              </TouchableOpacity>
              {remoteError ? <Text style={[s.modalHint, { color: colors.red }]}>{remoteError}</Text> : null}
            </View>
          </View>
        )}
      </View>

      {/* WebDAV sync */}
      {renderSectionHeader('WebDAV Sync', 'cloud-outline')}
      <View style={[s.section, { backgroundColor: colors.bgTertiary }]}>
        {vault?.webdav?.url ? (
          <>
            <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
              <Text style={[s.settingLabel, { color: colors.textPrimary }]}>Status</Text>
              <View style={s.statusRow}>
                <View style={[s.statusDot, { backgroundColor: colors.green }]} />
                <Text style={{ color: colors.green, fontSize: 14, fontWeight: '500' }}>Connected</Text>
              </View>
            </View>

            <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={2}>
                {vault.webdav.url.replace(/\/+$/, '')}/{vault.webdav.remotePath.replace(/^\/+|\/+$/g, '')} as {vault.webdav.username}
              </Text>
            </View>

            {davLastSync && (
              <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
                <Text style={[s.settingLabel, { color: colors.textPrimary }]}>Last sync</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{davLastSync}</Text>
              </View>
            )}

            {davStatus && (
              <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
                <Text style={{ color: davStatus.includes('failed') || davStatus.includes('could not') ? colors.red : colors.textSecondary, fontSize: 13, flex: 1 }}>
                  {davStatus}
                </Text>
              </View>
            )}

            <View style={[s.settingRow, { borderBottomColor: colors.border, gap: 8 }]}>
              <TouchableOpacity
                style={[s.syncButton, { backgroundColor: colors.accent }, davBusy && { opacity: 0.6 }]}
                onPress={handleWebDavSyncNow}
                disabled={davBusy}
              >
                {davBusy ? (
                  <ActivityIndicator size="small" color={colors.bgPrimary} />
                ) : (
                  <Ionicons name="sync" size={18} color={colors.bgPrimary} />
                )}
                <Text style={[s.syncButtonText, { color: colors.bgPrimary }]}>{davBusy ? 'Syncing...' : 'Sync Now'}</Text>
              </TouchableOpacity>
            </View>

            <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
              <Text style={[s.settingLabel, { color: colors.textPrimary }]}>Auto-sync</Text>
              <Text style={{ color: colors.green, fontSize: 13, fontWeight: '500' }}>Every minute</Text>
            </View>

            {gitConnected && (
              <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
                <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
                  This vault also syncs with Git. On the phone, Git sync brings back a note that was deleted on another device, so deletions do not last while both are connected.
                </Text>
              </View>
            )}

            <TouchableOpacity style={[s.settingRow, { borderBottomColor: colors.border }]} onPress={handleDisconnectWebDav}>
              <Text style={{ color: colors.red, fontSize: 15, fontWeight: '500' }}>Disconnect WebDAV</Text>
              <Ionicons name="close-circle-outline" size={20} color={colors.red} />
            </TouchableOpacity>
          </>
        ) : (
          <View style={s.gitDisconnected}>
            <Text style={[s.gitDisconnectedText, { color: colors.textMuted }]}>
              Sync this vault with a folder on a WebDAV server: Nextcloud, ownCloud, a NAS, or the same folder the desktop app syncs with.
            </Text>
            <View style={s.customRemoteForm}>
              <Text style={[s.modalHint, { color: colors.textMuted }]}>
                The server address has to start with https://. For Nextcloud it looks like https://cloud.example.com/remote.php/dav/files/your-name, and the password can be an app password. A folder the desktop app encrypted cannot be used yet.
              </Text>
              <TextInput style={[s.tokenInput, { color: colors.textPrimary, backgroundColor: colors.bgSecondary, borderColor: colors.border }]} placeholder="https://cloud.example.com/remote.php/dav/files/you" placeholderTextColor={colors.textMuted} value={davUrl} onChangeText={(text) => { setDavUrl(text); setDavError(null); }} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              <TextInput style={[s.tokenInput, { color: colors.textPrimary, backgroundColor: colors.bgSecondary, borderColor: colors.border }]} placeholder="Username" placeholderTextColor={colors.textMuted} value={davUser} onChangeText={(text) => { setDavUser(text); setDavError(null); }} autoCapitalize="none" autoCorrect={false} />
              <TextInput style={[s.tokenInput, { color: colors.textPrimary, backgroundColor: colors.bgSecondary, borderColor: colors.border }]} placeholder="Password or app password" placeholderTextColor={colors.textMuted} value={davPassword} onChangeText={(text) => { setDavPassword(text); setDavError(null); }} autoCapitalize="none" autoCorrect={false} secureTextEntry />
              <TextInput style={[s.tokenInput, { color: colors.textPrimary, backgroundColor: colors.bgSecondary, borderColor: colors.border }]} placeholder="Remote folder, for example /Noteriv" placeholderTextColor={colors.textMuted} value={davPath} onChangeText={(text) => { setDavPath(text); setDavError(null); }} autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity style={[s.connectButton, { backgroundColor: colors.accent }, (!davUrl.trim() || !davUser.trim() || !davPassword || davBusy) && { opacity: 0.5 }]} onPress={handleSaveWebDav} disabled={!davUrl.trim() || !davUser.trim() || !davPassword || davBusy}>
                <Text style={[s.connectButtonText, { color: colors.bgPrimary }]}>{davBusy ? 'Checking...' : 'Save & Sync'}</Text>
              </TouchableOpacity>
              {davError ? <Text style={[s.modalHint, { color: colors.red }]}>{davError}</Text> : null}
              {davStatus ? <Text style={[s.modalHint, { color: colors.textMuted }]}>{davStatus}</Text> : null}
            </View>
          </View>
        )}
      </View>

      {/* About */}
      {renderSectionHeader('About', 'information-circle-outline')}
      <View style={[s.section, { backgroundColor: colors.bgTertiary }]}>
        <View style={[s.settingRow, { borderBottomColor: colors.border }]}>
          <Text style={[s.settingLabel, { color: colors.textPrimary }]}>Version</Text>
          <Text style={{ fontSize: 15, color: colors.textSecondary }}>
            {appVersion}
          </Text>
        </View>
        <TouchableOpacity style={[s.settingRow, { borderBottomColor: colors.border }]}>
          <Text style={[s.settingLabel, { color: colors.textPrimary }]}>
            Source Code
          </Text>
          <View style={s.linkRow}>
            <Text style={{ fontSize: 14, color: colors.accent }}>GitHub</Text>
            <Ionicons name="open-outline" size={16} color={colors.accent} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[s.settingRow, { borderBottomColor: colors.border }]}>
          <Text style={[s.settingLabel, { color: colors.textPrimary }]}>
            Report an Issue
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Danger Zone */}
      {renderSectionHeader('Danger Zone', 'warning-outline')}
      <View style={[s.section, { backgroundColor: colors.bgTertiary }]}>
        <TouchableOpacity style={s.resetRow} onPress={handleResetApp}>
          <Ionicons name="trash-outline" size={20} color={colors.red} />
          <View style={{ flex: 1 }}>
            <Text style={[s.resetLabel, { color: colors.red }]}>Reset App</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
              Delete all vaults, settings, and start over
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.red} />
        </TouchableOpacity>
      </View>

      <View style={s.footer}>
        <Text style={[s.footerText, { color: colors.textMuted }]}>Noteriv</Text>
        <Text style={[s.footerSubtext, { color: colors.textMuted }]}>
          A markdown notes app built with care.
        </Text>
      </View>

      {/* GitHub connect modal (token + repo picker) */}
      <Modal
        visible={showTokenModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowTokenModal(false);
          setTokenStep('token');
          setRepos([]);
          setGhUser(null);
          setSelectedRepoUrl(null);
        }}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.bgSecondary }]}>
            {tokenStep === 'token' ? (
              <>
                <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                  Connect GitHub
                </Text>
                <Text style={[s.modalHint, { color: colors.textMuted }]}>
                  Enter a Personal Access Token with the repo scope.
                </Text>
                <TextInput
                  style={[
                    s.tokenInput,
                    {
                      color: colors.textPrimary,
                      backgroundColor: colors.bgTertiary,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  placeholderTextColor={colors.textMuted}
                  value={tokenInput}
                  onChangeText={setTokenInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                <View style={s.modalButtons}>
                  <TouchableOpacity
                    style={[s.modalButton, { backgroundColor: colors.bgTertiary }]}
                    onPress={() => {
                      setTokenInput('');
                      setShowTokenModal(false);
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      s.modalButton,
                      { backgroundColor: colors.accent },
                      (!tokenInput.trim() || validatingToken) && { opacity: 0.5 },
                    ]}
                    onPress={handleValidateToken}
                    disabled={!tokenInput.trim() || validatingToken}
                  >
                    {validatingToken ? (
                      <ActivityIndicator size="small" color={colors.bgPrimary} />
                    ) : (
                      <Text style={{ color: colors.bgPrimary, fontWeight: '600' }}>
                        Connect
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                  Pick a Repository
                </Text>
                {ghUser && (
                  <Text style={[s.modalHint, { color: colors.green }]}>
                    Authenticated as @{ghUser}
                  </Text>
                )}
                <FlatList
                  data={repos}
                  keyExtractor={(r) => String(r.id)}
                  style={{ maxHeight: 300, marginBottom: 16 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        s.repoRow,
                        { borderColor: colors.border },
                        selectedRepoUrl === item.clone_url && {
                          borderColor: colors.accent,
                          backgroundColor: colors.accent + '15',
                        },
                      ]}
                      onPress={() => setSelectedRepoUrl(item.clone_url)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>
                          {item.name}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                          {item.full_name}
                        </Text>
                      </View>
                      {item.private && (
                        <Text style={{ color: colors.yellow, fontSize: 11 }}>private</Text>
                      )}
                      {selectedRepoUrl === item.clone_url && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.accent} style={{ marginLeft: 8 }} />
                      )}
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 20 }}>
                      No repositories found
                    </Text>
                  }
                />
                <View style={s.modalButtons}>
                  <TouchableOpacity
                    style={[s.modalButton, { backgroundColor: colors.bgTertiary }]}
                    onPress={() => setTokenStep('token')}
                  >
                    <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>
                      Back
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      s.modalButton,
                      { backgroundColor: colors.accent },
                      !selectedRepoUrl && { opacity: 0.5 },
                    ]}
                    onPress={handleSaveTokenAndRepo}
                    disabled={!selectedRepoUrl}
                  >
                    <Text style={{ color: colors.bgPrimary, fontWeight: '600' }}>
                      Connect & Sync
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Setting rows
  settingRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
  },

  // Picker
  pickerRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  pickerOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pickerOptionText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Slider
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  sliderTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: '100%',
    paddingTop: 8,
    justifyContent: 'space-between',
  },
  sliderDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },

  // Colors
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Theme grid
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
  },
  themeCard: {
    width: '47%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  themeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  themeCardName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 4,
  },
  themeColorBar: {
    flexDirection: 'row',
    gap: 4,
  },
  themeColorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },

  // Links
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Reset
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  resetLabel: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footerSubtext: {
    fontSize: 13,
    marginTop: 4,
  },

  // GitHub section
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
  },
  syncButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  gitDisconnected: {
    padding: 20,
    alignItems: 'center',
    gap: 14,
  },
  gitDisconnectedText: {
    fontSize: 14,
    textAlign: 'center',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  connectButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  customRemoteForm: {
    marginTop: 18,
    width: '100%',
    gap: 10,
  },
  providerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  providerOption: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },

  // Ecosystem
  ecosystemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  // Community themes
  communityThemeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  communityThemeName: {
    fontSize: 14,
    fontWeight: '600',
  },
  communityThemeInstall: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
  },

  // Repo picker
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 6,
  },

  // Modal
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
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  tokenInput: {
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
