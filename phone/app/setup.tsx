import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Alert,
  FlatList,
  ActivityIndicator,
  Switch,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { setItem, KEYS } from '@/lib/storage';

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  clone_url: string;
  html_url: string;
}

const TOTAL_STEPS = 4;

export default function SetupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { createVault, completeSetup, updateSettings } = useApp();

  const [step, setStep] = useState(0);
  const [vaultName, setVaultName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Git state
  const [enableGit, setEnableGit] = useState(false);
  const [token, setToken] = useState('');
  const [validating, setValidating] = useState(false);
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [createNewRepo, setCreateNewRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [error, setError] = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const tokenRef = useRef<TextInput>(null);

  useEffect(() => {
    if (vaultName && !newRepoName) {
      setNewRepoName(
        vaultName
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
      );
    }
  }, [vaultName]);

  const animateTransition = useCallback(
    (nextStep: number) => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -30,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setStep(nextStep);
        slideAnim.setValue(30);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (nextStep === 1) {
            setTimeout(() => inputRef.current?.focus(), 100);
          } else if (nextStep === 2) {
            setTimeout(() => tokenRef.current?.focus(), 100);
          }
        });
      });
    },
    [fadeAnim, slideAnim]
  );

  const validateToken = useCallback(async () => {
    if (!token.trim()) return;
    setValidating(true);
    setError('');
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${token.trim()}` },
      });
      if (!res.ok) {
        setError('Invalid token. Make sure it has the "repo" scope.');
        setValidating(false);
        return;
      }
      const user: GitHubUser = await res.json();
      setGhUser(user);

      // Fetch repos
      setLoadingRepos(true);
      const reposRes = await fetch(
        'https://api.github.com/user/repos?per_page=100&sort=updated',
        { headers: { Authorization: `token ${token.trim()}` } }
      );
      if (reposRes.ok) {
        const repoList: GitHubRepo[] = await reposRes.json();
        setRepos(repoList);
      }
      setLoadingRepos(false);
    } catch {
      setError('Network error. Check your connection.');
    } finally {
      setValidating(false);
    }
  }, [token]);

  const createGitHubRepo = useCallback(async (): Promise<GitHubRepo | null> => {
    if (!newRepoName.trim()) return null;
    try {
      const res = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `token ${token.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newRepoName.trim(),
          private: newRepoPrivate,
          description: `Notes vault: ${vaultName}`,
          auto_init: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.message || 'Failed to create repo');
        return null;
      }
      return await res.json();
    } catch {
      setError('Failed to create repo');
      return null;
    }
  }, [token, newRepoName, newRepoPrivate, vaultName]);

  const handleCreateVault = useCallback(async () => {
    const trimmed = vaultName.trim();
    if (!trimmed) {
      Alert.alert('Name Required', 'Please enter a name for your vault.');
      return;
    }
    setIsCreating(true);
    try {
      const vault = await createVault(trimmed);

      // If git is enabled, determine the remote URL
      if (enableGit && ghUser) {
        let gitRemote: string | null = null;

        if (createNewRepo && newRepoName.trim()) {
          const repo = await createGitHubRepo();
          if (repo) {
            gitRemote = repo.clone_url;
          }
        } else if (selectedRepo) {
          gitRemote = selectedRepo.clone_url;
        }

        // Store git config and token
        if (gitRemote) {
          const { updateVault } = await import('@/lib/vault');
          await updateVault(vault.id, {
            gitRemote,
            autoSync,
          });
          // Save the GitHub token so sync can use it
          await setItem(KEYS.GITHUB_TOKEN(vault.id), token.trim());
        }
      }

      animateTransition(3);
    } catch {
      Alert.alert('Error', 'Could not create vault. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }, [
    vaultName,
    createVault,
    enableGit,
    ghUser,
    createNewRepo,
    newRepoName,
    selectedRepo,
    autoSync,
    createGitHubRepo,
    animateTransition,
  ]);

  const handleComplete = useCallback(async () => {
    await completeSetup();
    router.replace('/');
  }, [completeSetup, router]);

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            { backgroundColor: colors.border },
            i === step && [styles.stepDotActive, { backgroundColor: colors.blue }],
            i < step && { backgroundColor: colors.green },
          ]}
        />
      ))}
    </View>
  );

  const renderStep = () => {
    switch (step) {
      // ═══════ WELCOME ═══════
      case 0:
        return (
          <View style={styles.stepContent}>
            <View style={[styles.iconContainer, { backgroundColor: colors.bgTertiary }]}>
              <Ionicons
                name="document-text"
                size={72}
                color={colors.blue}
              />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Welcome to Noteriv</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              A beautiful markdown editor for your notes, ideas, and everything
              in between.
            </Text>
            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <Ionicons
                  name="create-outline"
                  size={22}
                  color={colors.green}
                />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                  Write in Markdown with live preview
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons
                  name="folder-outline"
                  size={22}
                  color={colors.mauve}
                />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                  Organize notes in vaults and folders
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons
                  name="git-branch-outline"
                  size={22}
                  color={colors.peach}
                />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                  Sync with GitHub for backup & versioning
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.blue, shadowColor: colors.blue }]}
              onPress={() => animateTransition(1)}
              activeOpacity={0.8}
            >
              <Text style={[styles.primaryButtonText, { color: colors.bgPrimary }]}>Get Started</Text>
              <Ionicons
                name="arrow-forward"
                size={20}
                color={colors.bgPrimary}
              />
            </TouchableOpacity>
          </View>
        );

      // ═══════ VAULT NAME ═══════
      case 1:
        return (
          <KeyboardAvoidingView
            style={styles.stepContent}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.iconContainer, { backgroundColor: colors.bgTertiary }]}>
              <Ionicons
                name="library"
                size={64}
                color={colors.mauve}
              />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Create Your Vault</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              A vault is a folder where your notes live. Give it a name to get
              started.
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                ref={inputRef}
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={vaultName}
                onChangeText={setVaultName}
                placeholder="My Notes"
                placeholderTextColor={colors.textMuted}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (vaultName.trim()) animateTransition(2);
                }}
                selectionColor={colors.blue}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: colors.blue, shadowColor: colors.blue },
                !vaultName.trim() && styles.primaryButtonDisabled,
              ]}
              onPress={() => animateTransition(2)}
              disabled={!vaultName.trim()}
              activeOpacity={0.8}
            >
              <Text style={[styles.primaryButtonText, { color: colors.bgPrimary }]}>Continue</Text>
              <Ionicons
                name="arrow-forward"
                size={20}
                color={colors.bgPrimary}
              />
            </TouchableOpacity>
          </KeyboardAvoidingView>
        );

      // ═══════ GITHUB CONNECT ═══════
      case 2:
        return (
          <KeyboardAvoidingView
            style={styles.stepContent}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={80}
          >
            <View style={[styles.iconContainer, { backgroundColor: colors.bgTertiary }]}>
              <Ionicons
                name="logo-github"
                size={64}
                color={colors.textPrimary}
              />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Connect GitHub</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Back up and sync your notes to a GitHub repo. You can skip this
              and set it up later.
            </Text>

            {!ghUser ? (
              // Token input
              <View style={styles.gitSection}>
                <View style={styles.tokenRow}>
                  <TouchableOpacity
                    onPress={() =>
                      Linking.openURL(
                        'https://github.com/settings/tokens/new?scopes=repo&description=Noteriv'
                      )
                    }
                  >
                    <Text style={[styles.tokenLink, { color: colors.blue }]}>
                      Generate a token on GitHub →
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.tokenHint, { color: colors.textMuted }]}>
                  Select the "repo" scope. Your token stays on this device.
                </Text>
                <View style={styles.tokenInputRow}>
                  <TextInput
                    ref={tokenRef}
                    style={[styles.tokenInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                    value={token}
                    onChangeText={(t) => {
                      setToken(t);
                      setError('');
                    }}
                    placeholder="ghp_xxxxxxxxxxxx"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={() => {
                      if (token.trim()) validateToken();
                    }}
                    selectionColor={colors.blue}
                  />
                  <TouchableOpacity
                    style={[
                      styles.connectButton,
                      { backgroundColor: colors.blue },
                      (!token.trim() || validating) &&
                        styles.connectButtonDisabled,
                    ]}
                    onPress={validateToken}
                    disabled={!token.trim() || validating}
                  >
                    {validating ? (
                      <ActivityIndicator size="small" color={colors.bgPrimary} />
                    ) : (
                      <Text style={[styles.connectButtonText, { color: colors.bgPrimary }]}>Connect</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {error ? <Text style={[styles.errorText, { color: colors.red, backgroundColor: colors.red + '15' }]}>{error}</Text> : null}
              </View>
            ) : (
              // Authenticated - show user + repo picker
              <View style={styles.gitSection}>
                {/* User card */}
                <View style={[styles.userCard, { backgroundColor: colors.green + '15', borderColor: colors.green + '30' }]}>
                  <View style={[styles.userAvatar, { backgroundColor: colors.bgTertiary }]}>
                    <Ionicons
                      name="person"
                      size={20}
                      color={colors.green}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userName, { color: colors.textPrimary }]}>
                      {ghUser.name || ghUser.login}
                    </Text>
                    <Text style={[styles.userLogin, { color: colors.green }]}>@{ghUser.login}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setGhUser(null);
                      setToken('');
                      setRepos([]);
                      setSelectedRepo(null);
                      setEnableGit(false);
                    }}
                  >
                    <Text style={[styles.disconnectText, { color: colors.textMuted }]}>Disconnect</Text>
                  </TouchableOpacity>
                </View>

                {/* Create new repo option */}
                <TouchableOpacity
                  style={[
                    styles.repoOption,
                    { borderColor: colors.border },
                    createNewRepo && [styles.repoOptionSelected, { borderColor: colors.blue, backgroundColor: colors.blue + '10' }],
                  ]}
                  onPress={() => {
                    setCreateNewRepo(true);
                    setSelectedRepo(null);
                    setEnableGit(true);
                  }}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={20}
                    color={colors.blue}
                  />
                  <Text style={[styles.repoOptionText, { color: colors.textPrimary }]}>Create new repo</Text>
                </TouchableOpacity>

                {createNewRepo && (
                  <View style={styles.newRepoForm}>
                    <TextInput
                      style={[styles.repoNameInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                      value={newRepoName}
                      onChangeText={(t) =>
                        setNewRepoName(
                          t.replace(/[^a-zA-Z0-9-_.]/g, '-')
                        )
                      }
                      placeholder="my-notes"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      selectionColor={colors.blue}
                    />
                    <View style={styles.privateRow}>
                      <Text style={[styles.privateLabel, { color: colors.textSecondary }]}>Private repo</Text>
                      <Switch
                        value={newRepoPrivate}
                        onValueChange={setNewRepoPrivate}
                        trackColor={{
                          false: colors.border,
                          true: colors.blue,
                        }}
                        thumbColor={colors.textPrimary}
                      />
                    </View>
                  </View>
                )}

                {/* Existing repos */}
                {loadingRepos ? (
                  <ActivityIndicator
                    style={{ marginTop: 12 }}
                    color={colors.blue}
                  />
                ) : (
                  <View style={styles.repoList}>
                    <Text style={[styles.repoListLabel, { color: colors.textMuted }]}>Or pick an existing repo:</Text>
                    <FlatList
                      data={repos.slice(0, 20)}
                      keyExtractor={(r) => String(r.id)}
                      style={{ maxHeight: 160 }}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[
                            styles.repoItem,
                            selectedRepo?.id === item.id &&
                              { borderColor: colors.blue + '50', backgroundColor: colors.blue + '10' },
                          ]}
                          onPress={() => {
                            setSelectedRepo(item);
                            setCreateNewRepo(false);
                            setEnableGit(true);
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.repoName, { color: colors.textPrimary }]}>{item.name}</Text>
                            {item.description && (
                              <Text
                                style={[styles.repoDesc, { color: colors.textMuted }]}
                                numberOfLines={1}
                              >
                                {item.description}
                              </Text>
                            )}
                          </View>
                          {item.private && (
                            <Text style={[styles.privateBadge, { color: colors.yellow }]}>private</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                )}

                {/* Auto-sync toggle */}
                <View style={[styles.autoSyncRow, { borderTopColor: colors.bgTertiary }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.autoSyncLabel, { color: colors.textPrimary }]}>Auto-sync</Text>
                    <Text style={[styles.autoSyncHint, { color: colors.textMuted }]}>
                      Automatically push changes
                    </Text>
                  </View>
                  <Switch
                    value={autoSync}
                    onValueChange={setAutoSync}
                    trackColor={{
                      false: colors.border,
                      true: colors.blue,
                    }}
                    thumbColor={colors.textPrimary}
                  />
                </View>

                {error ? <Text style={[styles.errorText, { color: colors.red, backgroundColor: colors.red + '15' }]}>{error}</Text> : null}
              </View>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => animateTransition(1)}
              >
                <Ionicons
                  name="chevron-back"
                  size={18}
                  color={colors.textSecondary}
                />
                <Text style={[styles.backButtonText, { color: colors.textSecondary }]}>Back</Text>
              </TouchableOpacity>

              {ghUser ? (
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    { backgroundColor: colors.blue, shadowColor: colors.blue },
                    styles.smallButton,
                    isCreating && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleCreateVault}
                  disabled={isCreating}
                  activeOpacity={0.8}
                >
                  {isCreating ? (
                    <ActivityIndicator size="small" color={colors.bgPrimary} />
                  ) : (
                    <Text style={[styles.primaryButtonText, { color: colors.bgPrimary }]}>Create Vault</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.skipButton, { backgroundColor: colors.bgTertiary }]}
                  onPress={() => {
                    setEnableGit(false);
                    handleCreateVault();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.skipButtonText, { color: colors.textPrimary }]}>Skip & Create</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        );

      // ═══════ DONE ═══════
      case 3:
        return (
          <View style={styles.stepContent}>
            <View style={[styles.iconContainer, { backgroundColor: colors.bgTertiary }]}>
              <Ionicons
                name="checkmark-circle"
                size={80}
                color={colors.green}
              />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>You're All Set!</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Your vault "{vaultName.trim()}" is ready.
              {enableGit && ghUser
                ? ' GitHub sync is configured.'
                : ' You can connect GitHub later in Settings.'}
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.blue, shadowColor: colors.blue }]}
              onPress={handleComplete}
              activeOpacity={0.8}
            >
              <Ionicons
                name="pencil"
                size={20}
                color={colors.bgPrimary}
              />
              <Text style={[styles.primaryButtonText, { color: colors.bgPrimary }]}>Start Writing</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {renderStepIndicator()}
      <Animated.View
        style={[
          styles.animatedContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {renderStep()}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  animatedContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 24,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepDotActive: {
    width: 24,
  },
  stepContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    marginBottom: 24,
    width: 120,
    height: 120,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  featureList: {
    marginTop: 32,
    gap: 16,
    width: '100%',
    maxWidth: 320,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureText: {
    fontSize: 15,
    flex: 1,
  },
  inputContainer: {
    width: '100%',
    maxWidth: 320,
    marginTop: 32,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    borderWidth: 2,
    textAlign: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 32,
    elevation: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  smallButton: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    marginTop: 0,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },

  // Git section
  gitSection: {
    width: '100%',
    maxWidth: 360,
    marginTop: 24,
    gap: 12,
  },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  tokenLink: {
    fontSize: 13,
    fontWeight: '500',
  },
  tokenHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  tokenInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tokenInput: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  connectButton: {
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  connectButtonDisabled: {
    opacity: 0.4,
  },
  connectButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },

  // User card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
  },
  userLogin: {
    fontSize: 12,
  },
  disconnectText: {
    fontSize: 12,
  },

  // Repo options
  repoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  repoOptionSelected: {},
  repoOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  newRepoForm: {
    paddingLeft: 16,
    gap: 10,
  },
  repoNameInput: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  privateLabel: {
    fontSize: 13,
  },
  repoList: {
    gap: 8,
  },
  repoListLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  repoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  repoName: {
    fontSize: 14,
  },
  repoDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  privateBadge: {
    fontSize: 10,
    fontWeight: '500',
  },
  autoSyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    marginTop: 4,
  },
  autoSyncLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  autoSyncHint: {
    fontSize: 11,
  },

  // Navigation buttons
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    marginTop: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  backButtonText: {
    fontSize: 15,
  },
  skipButton: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12,
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
