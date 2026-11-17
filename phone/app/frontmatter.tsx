import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { readFile } from '@/lib/file-system';
import {
  hasInvalidProperties,
  hasProperties,
  parsePropertyTypes,
  type PropertyType,
} from '@/lib/properties';
import { applyRows, newRow, toRows, type PropertyRow } from '@/lib/property-edits';

const COMMON_PROPERTIES = [
  'title',
  'date',
  'tags',
  'author',
  'category',
  'status',
  'draft',
];

export default function FrontmatterScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { content, setContent, vault } = useApp();

  const hasExisting = useMemo(() => hasProperties(content), [content]);
  // A block that is not valid YAML is never rewritten: the screen only says so.
  const unreadable = useMemo(() => hasInvalidProperties(content), [content]);

  const [properties, setProperties] = useState<PropertyRow[]>(() => toRows(content));
  // The keys of the properties whose rows were deleted here. Save removes
  // these and nothing else, so it never removes a property it did not show.
  const [removed, setRemoved] = useState<string[]>([]);

  // The types the vault has recorded for its properties (the desktop writes
  // them), so a new "people" property is a list here too.
  const [knownTypes, setKnownTypes] = useState<Record<string, PropertyType>>({});
  useEffect(() => {
    if (!vault) return;
    let current = true;
    readFile(`${vault.path.replace(/\/$/, '')}/.noteriv/types.json`).then((text) => {
      if (current) setKnownTypes(parsePropertyTypes(text));
    });
    return () => {
      current = false;
    };
  }, [vault]);

  const [showSuggestions, setShowSuggestions] = useState(false);

  const unusedSuggestions = useMemo(() => {
    const usedKeys = new Set(properties.map((p) => p.key.toLowerCase()));
    return COMMON_PROPERTIES.filter((p) => !usedKeys.has(p));
  }, [properties]);

  const handleUpdateKey = useCallback((index: number, newKey: string) => {
    setProperties((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], key: newKey };
      return next;
    });
  }, []);

  const handleUpdateValue = useCallback((index: number, newValue: string) => {
    setProperties((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], value: newValue };
      return next;
    });
  }, []);

  const handleAddProperty = useCallback((key?: string) => {
    setProperties((prev) => [...prev, newRow(key ?? '')]);
    setShowSuggestions(false);
  }, []);

  const handleDeleteProperty = useCallback((index: number) => {
    const original = properties[index]?.original;
    if (original) setRemoved((prev) => [...prev, original.key]);
    setProperties((prev) => prev.filter((_, i) => i !== index));
  }, [properties]);

  const handleSave = useCallback(() => {
    // Only what was changed here is changed in the note; the rest of the
    // block stays as it was written (see lib/property-edits.ts).
    setContent(applyRows(content, properties, { removed, known: knownTypes }));
    router.back();
  }, [content, properties, removed, knownTypes, setContent, router]);

  const handleAddFrontmatter = useCallback(() => {
    setProperties([newRow('title')]);
  }, []);

  const styles = makeStyles(colors);

  if (unreadable) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Properties cannot be read</Text>
          <Text style={styles.emptySubtitle}>
            The block at the top of this note is not valid YAML, so it is left as it is. Fix it in the note&apos;s text.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // No frontmatter and no properties being edited
  if (!hasExisting && properties.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="code-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Frontmatter</Text>
          <Text style={styles.emptySubtitle}>
            Frontmatter lets you add metadata like title, date, tags, and more to your notes.
          </Text>
          <TouchableOpacity
            style={styles.addFrontmatterBtn}
            onPress={handleAddFrontmatter}
          >
            <Ionicons name="add" size={20} color={colors.bgPrimary} />
            <Text style={styles.addFrontmatterText}>Add Frontmatter</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with save */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Frontmatter</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Ionicons name="checkmark" size={20} color={colors.bgPrimary} />
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Property rows */}
        {properties.map((prop, index) => (
          <View key={index} style={styles.propertyRow}>
            <View style={styles.propertyBody}>
              <View style={styles.propertyInputs}>
                <TextInput
                  style={styles.keyInput}
                  value={prop.key}
                  onChangeText={(text) => handleUpdateKey(index, text)}
                  placeholder="key"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={[styles.valueInput, !prop.editable && styles.valueInputLocked]}
                  value={prop.value}
                  onChangeText={(text) => handleUpdateValue(index, text)}
                  placeholder="value"
                  placeholderTextColor={colors.textMuted}
                  autoCorrect={false}
                  editable={prop.editable}
                />
              </View>
              {!prop.editable && (
                <Text style={styles.lockedHint}>
                  Too long for one line here. Edit it in the note&apos;s text.
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.deletePropertyBtn}
              onPress={() => handleDeleteProperty(index)}
            >
              <Ionicons name="close-circle" size={20} color={colors.red} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Add property button */}
        <TouchableOpacity
          style={styles.addPropertyBtn}
          onPress={() => {
            if (unusedSuggestions.length > 0) {
              setShowSuggestions(!showSuggestions);
            } else {
              handleAddProperty();
            }
          }}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
          <Text style={styles.addPropertyText}>Add Property</Text>
        </TouchableOpacity>

        {/* Suggestions */}
        {showSuggestions && unusedSuggestions.length > 0 && (
          <View style={styles.suggestions}>
            <Text style={styles.suggestionsLabel}>Common properties</Text>
            <View style={styles.suggestionsGrid}>
              {unusedSuggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  style={styles.suggestionChip}
                  onPress={() => handleAddProperty(suggestion)}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.suggestionChip}
                onPress={() => handleAddProperty()}
              >
                <Ionicons name="add" size={14} color={colors.textSecondary} />
                <Text style={styles.suggestionText}>Custom</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.green,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    saveBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.bgPrimary,
    },
    body: {
      flex: 1,
    },
    bodyContent: {
      padding: 16,
      paddingBottom: 80,
    },
    propertyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    propertyBody: {
      flex: 1,
    },
    propertyInputs: {
      flexDirection: 'row',
      gap: 8,
    },
    valueInputLocked: {
      color: colors.textMuted,
    },
    lockedHint: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 4,
    },
    keyInput: {
      flex: 2,
      backgroundColor: colors.bgTertiary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.accent,
      fontWeight: '600',
    },
    valueInput: {
      flex: 3,
      backgroundColor: colors.bgTertiary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.textPrimary,
    },
    deletePropertyBtn: {
      padding: 4,
    },
    addPropertyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      marginTop: 4,
    },
    addPropertyText: {
      fontSize: 15,
      color: colors.accent,
      fontWeight: '500',
    },
    suggestions: {
      marginTop: 8,
      backgroundColor: colors.bgSecondary,
      borderRadius: 12,
      padding: 14,
    },
    suggestionsLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    suggestionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    suggestionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.bgTertiary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    suggestionText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    // Empty state
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
    addFrontmatterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.accent,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 24,
    },
    addFrontmatterText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.bgPrimary,
    },
  });
}
