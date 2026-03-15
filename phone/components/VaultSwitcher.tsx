import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Pressable,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { Vault } from '@/types';

interface VaultSwitcherProps {
  visible: boolean;
  onClose: () => void;
}

export default function VaultSwitcher({ visible, onClose }: VaultSwitcherProps) {
  const { colors } = useTheme();
  const { vaults, vault, switchVault, createVault, deleteVault } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [newVaultName, setNewVaultName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      setShowCreate(false);
      setNewVaultName('');
      setSwipedId(null);
    }
  }, [visible]);

  useEffect(() => {
    if (showCreate) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [showCreate]);

  const handleSwitch = useCallback(
    async (id: string) => {
      if (id === vault?.id) {
        onClose();
        return;
      }
      await switchVault(id);
      onClose();
    },
    [vault, switchVault, onClose]
  );

  const handleCreate = useCallback(async () => {
    const trimmed = newVaultName.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter a vault name.');
      return;
    }

    // Check for duplicate
    if (vaults.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Error', 'A vault with this name already exists.');
      return;
    }

    setIsCreating(true);
    try {
      await createVault(trimmed);
      setNewVaultName('');
      setShowCreate(false);
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to create vault.');
    } finally {
      setIsCreating(false);
    }
  }, [newVaultName, vaults, createVault, onClose]);

  const handleDelete = useCallback(
    (v: Vault) => {
      Alert.alert(
        'Delete Vault',
        `Are you sure you want to delete "${v.name}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await deleteVault(v.id);
              setSwipedId(null);
            },
          },
        ]
      );
    },
    [deleteVault]
  );

  const renderVaultItem = useCallback(
    ({ item }: { item: Vault }) => {
      const isActive = item.id === vault?.id;
      const isSwiped = swipedId === item.id;

      return (
        <View style={styles.vaultItemWrapper}>
          <TouchableOpacity
            style={[
              styles.vaultItem,
              { backgroundColor: colors.bgTertiary },
              isActive && { backgroundColor: colors.blue + '15', borderWidth: 1, borderColor: colors.blue + '30' },
            ]}
            activeOpacity={0.6}
            onPress={() => handleSwitch(item.id)}
            onLongPress={() => setSwipedId(isSwiped ? null : item.id)}
            delayLongPress={500}
          >
            <View style={[styles.vaultIcon, { backgroundColor: colors.border }, isActive && { backgroundColor: colors.blue + '25' }]}>
              <Ionicons
                name="cube"
                size={20}
                color={isActive ? colors.blue : colors.textMuted}
              />
            </View>
            <View style={styles.vaultInfo}>
              <Text style={[styles.vaultName, { color: colors.textPrimary }, isActive && { color: colors.blue }]}>
                {item.name}
              </Text>
              <Text style={[styles.vaultPath, { color: colors.textMuted }]} numberOfLines={1}>
                {item.path}
              </Text>
            </View>
            {isActive && (
              <View style={styles.activeIndicator}>
                <Ionicons name="checkmark-circle" size={20} color={colors.green} />
              </View>
            )}
          </TouchableOpacity>

          {/* Delete action (shown on long press) */}
          {isSwiped && (
            <View style={styles.swipeActions}>
              <TouchableOpacity
                style={[styles.deleteAction, { backgroundColor: colors.red }]}
                onPress={() => handleDelete(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="trash" size={18} color={colors.bgPrimary} />
                <Text style={[styles.deleteActionText, { color: colors.bgPrimary }]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelSwipe, { backgroundColor: colors.border }]}
                onPress={() => setSwipedId(null)}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelSwipeText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [colors, vault, swipedId, handleSwitch, handleDelete]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { backgroundColor: colors.bgPrimary }]}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.bgTertiary }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Vaults</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Vault list */}
          <FlatList
            data={vaults}
            renderItem={renderVaultItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="cube-outline" size={48} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No vaults yet</Text>
                <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Create your first vault below</Text>
              </View>
            }
          />

          {/* Create section */}
          {showCreate ? (
            <View style={[styles.createSection, { borderTopColor: colors.bgTertiary }]}>
              <View style={styles.createInputRow}>
                <TextInput
                  ref={inputRef}
                  style={[styles.createInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={newVaultName}
                  onChangeText={setNewVaultName}
                  placeholder="Vault name"
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.blue}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                />
                <TouchableOpacity
                  style={[
                    styles.createConfirm,
                    { backgroundColor: colors.blue },
                    (!newVaultName.trim() || isCreating) && { backgroundColor: colors.border },
                  ]}
                  onPress={handleCreate}
                  disabled={!newVaultName.trim() || isCreating}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={!newVaultName.trim() || isCreating ? colors.textMuted : colors.bgPrimary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createCancel, { backgroundColor: colors.bgTertiary }]}
                  onPress={() => {
                    setShowCreate(false);
                    setNewVaultName('');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.createButton, { borderTopColor: colors.bgTertiary }]}
              onPress={() => setShowCreate(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.createButtonIcon, { backgroundColor: colors.blue + '20' }]}>
                <Ionicons name="add" size={20} color={colors.blue} />
              </View>
              <Text style={[styles.createButtonText, { color: colors.blue }]}>Create New Vault</Text>
            </TouchableOpacity>
          )}

          {/* Bottom padding for safe area */}
          <View style={styles.bottomPadding} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: 300,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  vaultItemWrapper: {
    marginBottom: 4,
  },
  vaultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  vaultIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  vaultInfo: {
    flex: 1,
  },
  vaultName: {
    fontSize: 16,
    fontWeight: '600',
  },
  vaultPath: {
    fontSize: 12,
    marginTop: 2,
  },
  activeIndicator: {
    marginLeft: 8,
  },
  swipeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 6,
    gap: 8,
  },
  deleteAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  deleteActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cancelSwipe: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelSwipeText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 4,
  },
  createSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  createInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createInput: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
  },
  createConfirm: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCancel: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  createButtonIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  bottomPadding: {
    height: Platform.OS === 'ios' ? 34 : 16,
  },
});
