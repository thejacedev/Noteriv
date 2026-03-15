import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { createFile, createDir, fileExists } from '@/lib/file-system';

interface CreateModalProps {
  visible: boolean;
  onClose: () => void;
  currentDir: string;
  onCreated: () => void;
}

type CreateType = 'file' | 'folder';

export default function CreateModal({
  visible,
  onClose,
  currentDir,
  onCreated,
}: CreateModalProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [createType, setCreateType] = useState<CreateType>('file');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setName('');
      setCreateType('file');
      setIsCreating(false);
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }).start();
      setTimeout(() => inputRef.current?.focus(), 250);
    } else {
      slideAnim.setValue(0);
    }
  }, [visible]);

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter a name.');
      return;
    }

    // Prevent path traversal
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed === '.' || trimmed === '..') {
      Alert.alert('Error', 'Name cannot contain path separators.');
      return;
    }

    setIsCreating(true);

    try {
      if (createType === 'file') {
        const fileName = trimmed.endsWith('.md') || trimmed.endsWith('.markdown')
          ? trimmed
          : `${trimmed}.md`;
        const fullPath = `${currentDir}${fileName}`;

        const exists = await fileExists(fullPath);
        if (exists) {
          Alert.alert('Error', `A file named "${fileName}" already exists.`);
          setIsCreating(false);
          return;
        }

        const success = await createFile(fullPath);
        if (!success) {
          Alert.alert('Error', 'Failed to create file.');
          setIsCreating(false);
          return;
        }
      } else {
        const fullPath = `${currentDir}${trimmed}/`;

        const exists = await fileExists(fullPath);
        if (exists) {
          Alert.alert('Error', `A folder named "${trimmed}" already exists.`);
          setIsCreating(false);
          return;
        }

        const success = await createDir(fullPath);
        if (!success) {
          Alert.alert('Error', 'Failed to create folder.');
          setIsCreating(false);
          return;
        }
      }

      onCreated();
      onClose();
    } catch {
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setIsCreating(false);
    }
  }, [name, createType, currentDir, onCreated, onClose]);

  const previewName = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    if (createType === 'folder') return trimmed;
    return trimmed.endsWith('.md') || trimmed.endsWith('.markdown') ? trimmed : `${trimmed}.md`;
  }, [name, createType]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[
            styles.dialog,
            { backgroundColor: colors.bgTertiary },
            {
              transform: [
                {
                  scale: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
              opacity: slideAnim,
            },
          ]}
        >
          <Pressable>
            {/* Title */}
            <View style={styles.dialogHeader}>
              <Ionicons
                name={createType === 'file' ? 'document-text' : 'folder'}
                size={24}
                color={colors.blue}
              />
              <Text style={[styles.dialogTitle, { color: colors.textPrimary }]}>
                Create {createType === 'file' ? 'File' : 'Folder'}
              </Text>
            </View>

            {/* Type toggle */}
            <View style={[styles.toggleContainer, { backgroundColor: colors.bgPrimary }]}>
              <TouchableOpacity
                style={[styles.toggleButton, createType === 'file' && { backgroundColor: colors.blue }]}
                onPress={() => setCreateType('file')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="document-text"
                  size={16}
                  color={createType === 'file' ? colors.bgPrimary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.toggleText,
                    { color: colors.textMuted },
                    createType === 'file' && { color: colors.bgPrimary, fontWeight: '600' },
                  ]}
                >
                  File
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, createType === 'folder' && { backgroundColor: colors.blue }]}
                onPress={() => setCreateType('folder')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="folder"
                  size={16}
                  color={createType === 'folder' ? colors.bgPrimary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.toggleText,
                    { color: colors.textMuted },
                    createType === 'folder' && { color: colors.bgPrimary, fontWeight: '600' },
                  ]}
                >
                  Folder
                </Text>
              </TouchableOpacity>
            </View>

            {/* Name input */}
            <View style={[styles.inputWrapper, { backgroundColor: colors.bgPrimary, borderColor: colors.border }]}>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: colors.textPrimary }]}
                value={name}
                onChangeText={setName}
                placeholder={createType === 'file' ? 'Note name' : 'Folder name'}
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.blue}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
            </View>

            {/* Preview */}
            {name.trim().length > 0 && (
              <Text style={[styles.preview, { color: colors.textMuted }]} numberOfLines={1}>
                Will create: {previewName()}
              </Text>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                activeOpacity={0.6}
              >
                <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.createButton,
                  { backgroundColor: colors.blue },
                  (!name.trim() || isCreating) && { backgroundColor: colors.border },
                ]}
                onPress={handleCreate}
                disabled={!name.trim() || isCreating}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={createType === 'file' ? 'add' : 'folder-open'}
                  size={18}
                  color={!name.trim() || isCreating ? colors.textMuted : colors.bgPrimary}
                />
                <Text
                  style={[
                    styles.createText,
                    { color: colors.bgPrimary },
                    (!name.trim() || isCreating) && { color: colors.textMuted },
                  ]}
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    borderRadius: 16,
    width: 320,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  inputWrapper: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  input: {
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  preview: {
    fontSize: 12,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 10,
  },
  cancelButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  createText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
