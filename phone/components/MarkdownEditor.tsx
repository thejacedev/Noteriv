import React, { useRef, useCallback, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Text,
  Platform,
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

interface MarkdownEditorProps {
  content: string;
  onChange: (text: string) => void;
  fontSize: number;
}

interface Selection {
  start: number;
  end: number;
}

interface ToolbarAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  action: (text: string, selection: Selection) => { text: string; selection: Selection };
}

function wrapSelection(
  text: string,
  sel: Selection,
  before: string,
  after: string
): { text: string; selection: Selection } {
  const { start, end } = sel;
  const selected = text.substring(start, end);

  if (start === end) {
    const placeholder = 'text';
    const newText = text.substring(0, start) + before + placeholder + after + text.substring(end);
    return {
      text: newText,
      selection: { start: start + before.length, end: start + before.length + placeholder.length },
    };
  }

  const textBefore = text.substring(Math.max(0, start - before.length), start);
  const textAfter = text.substring(end, end + after.length);
  if (textBefore === before && textAfter === after) {
    const newText = text.substring(0, start - before.length) + selected + text.substring(end + after.length);
    return { text: newText, selection: { start: start - before.length, end: end - before.length } };
  }

  const newText = text.substring(0, start) + before + selected + after + text.substring(end);
  return { text: newText, selection: { start: start + before.length, end: end + before.length } };
}

function insertAtLineStart(
  text: string,
  sel: Selection,
  prefix: string
): { text: string; selection: Selection } {
  const { start } = sel;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextNewline = text.indexOf('\n', start);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const lineContent = text.substring(lineStart, lineEnd);

  if (lineContent.startsWith(prefix)) {
    const newText = text.substring(0, lineStart) + text.substring(lineStart + prefix.length);
    return {
      text: newText,
      selection: { start: Math.max(lineStart, start - prefix.length), end: Math.max(lineStart, start - prefix.length) },
    };
  }

  const newText = text.substring(0, lineStart) + prefix + text.substring(lineStart);
  return { text: newText, selection: { start: start + prefix.length, end: start + prefix.length } };
}

function insertText(
  text: string,
  sel: Selection,
  insert: string,
  cursorOffset?: number
): { text: string; selection: Selection } {
  const { start, end } = sel;
  const newText = text.substring(0, start) + insert + text.substring(end);
  const pos = start + (cursorOffset ?? insert.length);
  return { text: newText, selection: { start: pos, end: pos } };
}

const toolbarActions: ToolbarAction[] = [
  { icon: 'text', label: 'B', action: (t, s) => wrapSelection(t, s, '**', '**') },
  { icon: 'text-outline' as keyof typeof Ionicons.glyphMap, label: 'I', action: (t, s) => wrapSelection(t, s, '_', '_') },
  { icon: 'reorder-three', label: 'H', action: (t, s) => insertAtLineStart(t, s, '## ') },
  {
    icon: 'link',
    label: 'Link',
    action: (t, s) => {
      const selected = t.substring(s.start, s.end);
      if (s.start === s.end) return insertText(t, s, '[title](url)', 1);
      const newText = t.substring(0, s.start) + '[' + selected + '](url)' + t.substring(s.end);
      return { text: newText, selection: { start: s.end + 2, end: s.end + 5 } };
    },
  },
  { icon: 'list', label: 'List', action: (t, s) => insertAtLineStart(t, s, '- ') },
  { icon: 'checkbox-outline', label: 'Task', action: (t, s) => insertAtLineStart(t, s, '- [ ] ') },
  {
    icon: 'code-slash',
    label: 'Code',
    action: (t, s) => {
      const selected = t.substring(s.start, s.end);
      if (selected.includes('\n')) {
        return wrapSelection(t, s, '\n```\n', '\n```\n');
      }
      return wrapSelection(t, s, '`', '`');
    },
  },
  { icon: 'chatbox', label: 'Quote', action: (t, s) => insertAtLineStart(t, s, '> ') },
  { icon: 'remove-outline', label: 'HR', action: (t, s) => insertText(t, s, '\n---\n') },
  {
    icon: 'grid-outline',
    label: 'Table',
    action: (t, s) => insertText(t, s, '\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| | | |\n', undefined),
  },
];

export default function MarkdownEditor({ content, onChange, fontSize }: MarkdownEditorProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setSelection(e.nativeEvent.selection);
    },
    []
  );

  const handleToolbarPress = useCallback(
    (action: ToolbarAction['action']) => {
      const result = action(content, selection);
      onChange(result.text);
      setTimeout(() => {
        inputRef.current?.setNativeProps({ selection: result.selection });
        setSelection(result.selection);
      }, 10);
    },
    [content, selection, onChange]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <TextInput
        ref={inputRef}
        style={[
          styles.textInput,
          {
            fontSize,
            lineHeight: fontSize * 1.6,
            color: colors.textPrimary,
            backgroundColor: colors.bgPrimary,
          },
        ]}
        value={content}
        onChangeText={onChange}
        onSelectionChange={handleSelectionChange}
        multiline
        textAlignVertical="top"
        autoCapitalize="sentences"
        autoCorrect
        scrollEnabled
        selectionColor={colors.accent + '80'}
        placeholderTextColor={colors.textMuted}
        placeholder="Start writing..."
      />

      <View style={[styles.toolbar, { backgroundColor: colors.bgSecondary, borderTopColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarContent}
          keyboardShouldPersistTaps="always"
        >
          {toolbarActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={[styles.toolbarButton, { backgroundColor: colors.bgTertiary }]}
              onPress={() => handleToolbarPress(action.action)}
              activeOpacity={0.6}
            >
              <Ionicons name={action.icon} size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  textInput: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    textAlignVertical: 'top',
  },
  toolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbarContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  toolbarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 36,
    borderRadius: 8,
  },
});
