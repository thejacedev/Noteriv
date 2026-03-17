import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import {
  parseBoard,
  serializeBoard,
  addCard,
  removeCard,
  addColumn,
  removeColumn,
  updateCard,
  toggleCard,
  moveCard,
  type BoardData,
  type BoardCard,
  type BoardColumn,
} from '@/lib/board-utils';

interface BoardViewProps {
  content: string;
  onChange: (newContent: string) => void;
}

const COL_WIDTH = Dimensions.get('window').width * 0.7;

export default function BoardView({ content, onChange }: BoardViewProps) {
  const { colors } = useTheme();
  const [board, setBoard] = useState<BoardData>(() => parseBoard(content));
  const [editingCard, setEditingCard] = useState<{ colId: string; cardId: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [addingToCol, setAddingToCol] = useState<string | null>(null);
  const [newCardText, setNewCardText] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const editRef = useRef<TextInput>(null);
  const newCardRef = useRef<TextInput>(null);

  useEffect(() => {
    setBoard(parseBoard(content));
  }, [content]);

  const emit = useCallback((b: BoardData) => {
    setBoard(b);
    onChange(serializeBoard(b));
  }, [onChange]);

  const handleToggle = useCallback((colId: string, cardId: string) => {
    emit(toggleCard(board, colId, cardId));
  }, [board, emit]);

  const handleAddCard = useCallback((colId: string) => {
    if (!newCardText.trim()) return;
    emit(addCard(board, colId, newCardText.trim()));
    setNewCardText('');
    setAddingToCol(null);
  }, [board, newCardText, emit]);

  const handleRemoveCard = useCallback((colId: string, cardId: string) => {
    Alert.alert('Delete Card', 'Remove this card?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => emit(removeCard(board, colId, cardId)) },
    ]);
  }, [board, emit]);

  const handleStartEdit = useCallback((colId: string, card: BoardCard) => {
    setEditingCard({ colId, cardId: card.id });
    setEditText(card.text);
    setTimeout(() => editRef.current?.focus(), 50);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingCard) return;
    emit(updateCard(board, editingCard.colId, editingCard.cardId, editText.trim()));
    setEditingCard(null);
  }, [board, editingCard, editText, emit]);

  const handleMoveCard = useCallback((card: BoardCard, fromCol: BoardColumn) => {
    const otherCols = board.columns.filter((c) => c.id !== fromCol.id);
    if (otherCols.length === 0) return;
    Alert.alert(
      'Move to',
      undefined,
      [
        ...otherCols.map((col) => ({
          text: col.title,
          onPress: () => emit(moveCard(board, card.id, fromCol.id, col.id, col.cards.length)),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  }, [board, emit]);

  const handleAddColumn = useCallback(() => {
    if (!newColTitle.trim()) return;
    emit(addColumn(board, newColTitle.trim()));
    setNewColTitle('');
    setAddingColumn(false);
  }, [board, newColTitle, emit]);

  const handleRemoveColumn = useCallback((colId: string) => {
    const col = board.columns.find((c) => c.id === colId);
    if (!col) return;
    const msg = col.cards.length > 0
      ? `Delete "${col.title}" and its ${col.cards.length} cards?`
      : `Delete "${col.title}"?`;
    Alert.alert('Delete Column', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => emit(removeColumn(board, colId)) },
    ]);
  }, [board, emit]);

  useEffect(() => {
    if (addingToCol) setTimeout(() => newCardRef.current?.focus(), 50);
  }, [addingToCol]);

  const getTagColor = (tag: string) => {
    const map: Record<string, string> = {
      priority: colors.red, urgent: colors.red, bug: colors.red,
      feature: colors.accent, enhancement: colors.accent,
      blocked: colors.yellow, review: colors.mauve,
    };
    return map[tag.toLowerCase()] || colors.textSecondary;
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.board}
      style={{ backgroundColor: colors.bgPrimary }}
    >
      {board.columns.map((col) => (
        <View key={col.id} style={[styles.column, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          {/* Column header */}
          <View style={[styles.colHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.colTitle, { color: colors.textPrimary }]}>
              {col.title}
              <Text style={{ color: colors.textMuted, fontWeight: '400', fontSize: 11 }}>  {col.cards.length}</Text>
            </Text>
            <View style={styles.colActions}>
              <TouchableOpacity onPress={() => setAddingToCol(col.id)} style={styles.colBtn}>
                <Ionicons name="add" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleRemoveColumn(col.id)} style={styles.colBtn}>
                <Ionicons name="close" size={16} color={colors.red} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Cards */}
          <ScrollView style={styles.cardList} contentContainerStyle={styles.cardListContent}>
            {col.cards.map((card) => (
              <View key={card.id} style={[styles.card, { backgroundColor: colors.bgTertiary }]}>
                <View style={styles.cardRow}>
                  <TouchableOpacity onPress={() => handleToggle(col.id, card.id)} style={styles.checkbox}>
                    <View style={[
                      styles.checkboxBox,
                      { borderColor: card.completed ? colors.green : colors.textMuted },
                      card.completed && { backgroundColor: colors.green },
                    ]}>
                      {card.completed && <Text style={{ color: colors.bgPrimary, fontSize: 10 }}>{'\u2713'}</Text>}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.cardBody}>
                    {editingCard?.cardId === card.id ? (
                      <TextInput
                        ref={editRef}
                        value={editText}
                        onChangeText={setEditText}
                        onSubmitEditing={handleSaveEdit}
                        onBlur={handleSaveEdit}
                        style={[styles.editInput, { color: colors.textPrimary, backgroundColor: colors.bgPrimary, borderColor: colors.accent }]}
                      />
                    ) : (
                      <TouchableOpacity onLongPress={() => handleStartEdit(col.id, card)} onPress={() => handleMoveCard(card, col)}>
                        <Text style={[
                          styles.cardText,
                          { color: card.completed ? colors.textMuted : colors.textPrimary },
                          card.completed && { textDecorationLine: 'line-through' },
                        ]}>{card.text}</Text>
                      </TouchableOpacity>
                    )}

                    {(card.tags.length > 0 || card.dueDate) && (
                      <View style={styles.tagRow}>
                        {card.tags.map((tag) => (
                          <Text key={tag} style={[styles.tag, { color: getTagColor(tag), backgroundColor: getTagColor(tag) + '18' }]}>
                            #{tag}
                          </Text>
                        ))}
                        {card.dueDate && (
                          <Text style={[styles.tag, { color: colors.yellow, backgroundColor: colors.yellow + '18' }]}>
                            {card.dueDate}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  <TouchableOpacity onPress={() => handleRemoveCard(col.id, card.id)} style={styles.deleteCardBtn}>
                    <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {addingToCol === col.id && (
              <View style={[styles.card, { backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.border }]}>
                <TextInput
                  ref={newCardRef}
                  value={newCardText}
                  onChangeText={setNewCardText}
                  onSubmitEditing={() => handleAddCard(col.id)}
                  onBlur={() => { if (!newCardText.trim()) setAddingToCol(null); }}
                  placeholder="Card text..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.newCardInput, { color: colors.textPrimary }]}
                />
              </View>
            )}
          </ScrollView>

          {addingToCol !== col.id && (
            <TouchableOpacity
              style={[styles.addCardBtn, { borderTopColor: colors.border }]}
              onPress={() => setAddingToCol(col.id)}
            >
              <Ionicons name="add" size={16} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Add card</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Add column */}
      <View style={{ width: COL_WIDTH }}>
        {addingColumn ? (
          <View style={[styles.column, { backgroundColor: colors.bgSecondary, borderColor: colors.border, padding: 12 }]}>
            <TextInput
              value={newColTitle}
              onChangeText={setNewColTitle}
              onSubmitEditing={handleAddColumn}
              autoFocus
              placeholder="Column title..."
              placeholderTextColor={colors.textMuted}
              style={[styles.newCardInput, { color: colors.textPrimary, backgroundColor: colors.bgPrimary, borderRadius: 6, padding: 8, marginBottom: 8 }]}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.addColConfirm, { backgroundColor: colors.accent }]}
                onPress={handleAddColumn}
              >
                <Text style={{ color: colors.bgPrimary, fontWeight: '600', fontSize: 13 }}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAddingColumn(false)}>
                <Text style={{ color: colors.textMuted, fontSize: 13, padding: 8 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addColBtn, { borderColor: colors.border }]}
            onPress={() => setAddingColumn(true)}
          >
            <Ionicons name="add" size={20} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Add column</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  board: { padding: 12, gap: 10, paddingRight: 24 },
  column: {
    width: COL_WIDTH,
    borderRadius: 10,
    borderWidth: 1,
    maxHeight: '100%',
    overflow: 'hidden',
  },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  colTitle: { fontSize: 13, fontWeight: '600', flex: 1 },
  colActions: { flexDirection: 'row', gap: 2 },
  colBtn: { padding: 4 },
  cardList: { flex: 1 },
  cardListContent: { padding: 8, gap: 6 },
  card: { borderRadius: 8, padding: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  checkbox: { paddingTop: 1 },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 4 },
  cardText: { fontSize: 13, lineHeight: 18 },
  editInput: {
    fontSize: 13,
    borderWidth: 1,
    borderRadius: 4,
    padding: 4,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tag: { fontSize: 10, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  deleteCardBtn: { padding: 2 },
  newCardInput: { fontSize: 13, padding: 0 },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  addColBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  addColConfirm: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
});
