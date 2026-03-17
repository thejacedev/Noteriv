import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import {
  extractAllCards,
  loadReviews,
  saveReviews,
  getDueCards,
  gradeCard,
  Flashcard,
  CardReview,
} from '@/lib/flashcard-utils';

type Phase = 'loading' | 'lobby' | 'question' | 'answer' | 'done';

export default function FlashcardsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { vault } = useApp();

  const [phase, setPhase] = useState<Phase>('loading');
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [reviews, setReviews] = useState<Record<string, CardReview>>({});
  const [index, setIndex] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    if (!vault) return;
    (async () => {
      const cards = await extractAllCards(vault.path);
      const revs = await loadReviews(vault.path);
      const due = getDueCards(cards, revs);
      setAllCards(cards);
      setReviews(revs);
      setDueCards(due);
      setPhase('lobby');
    })();
  }, [vault]);

  const startReview = useCallback(() => {
    setIndex(0);
    setSessionCount(0);
    setPhase('question');
  }, []);

  const handleGrade = useCallback(async (grade: number) => {
    if (!vault || index >= dueCards.length) return;
    const card = dueCards[index];
    const updated = gradeCard(card.id, grade, reviews);
    const newReviews = { ...reviews, [card.id]: updated };
    setReviews(newReviews);
    await saveReviews(vault.path, newReviews);
    setSessionCount((c) => c + 1);

    const next = index + 1;
    if (next >= dueCards.length) {
      setPhase('done');
    } else {
      setIndex(next);
      setPhase('question');
    }
  }, [vault, index, dueCards, reviews]);

  const currentCard = dueCards[index];

  const gradeButtons = [
    { label: 'Again', grade: 0, color: colors.red },
    { label: 'Hard', grade: 2, color: colors.peach },
    { label: 'Good', grade: 3, color: colors.green },
    { label: 'Easy', grade: 5, color: colors.blue },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.header, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Flashcards</Text>
        <View style={{ width: 40 }} />
      </View>

      {phase === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Scanning vault…</Text>
        </View>
      )}

      {phase === 'lobby' && (
        <View style={styles.center}>
          <Ionicons name="school-outline" size={64} color={colors.accent} style={{ marginBottom: 16 }} />
          <Text style={[styles.bigNum, { color: colors.textPrimary }]}>{dueCards.length}</Text>
          <Text style={[styles.bigLabel, { color: colors.textSecondary }]}>
            {dueCards.length === 1 ? 'card due today' : 'cards due today'}
          </Text>
          <Text style={[styles.subLabel, { color: colors.textMuted }]}>
            {allCards.length} total in vault
          </Text>
          {dueCards.length > 0 ? (
            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: colors.accent }]}
              onPress={startReview}
              activeOpacity={0.8}
            >
              <Text style={[styles.startBtnText, { color: colors.bgPrimary }]}>Start Review</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.allDoneText, { color: colors.green }]}>
              All caught up!
            </Text>
          )}
        </View>
      )}

      {(phase === 'question' || phase === 'answer') && currentCard && (
        <View style={styles.reviewContainer}>
          <View style={styles.progress}>
            <Text style={[styles.progressText, { color: colors.textMuted }]}>
              {index + 1} / {dueCards.length}
            </Text>
            <View style={[styles.progressBar, { backgroundColor: colors.bgTertiary }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.accent, width: `${((index) / dueCards.length) * 100}%` },
                ]}
              />
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.cardArea}>
            <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={[styles.cardTypeLabel, { color: colors.textMuted }]}>
                {currentCard.type === 'cloze' ? 'Complete the sentence' : 'Question'}
              </Text>
              <Text style={[styles.cardText, { color: colors.textPrimary }]}>
                {currentCard.question}
              </Text>
            </View>

            {phase === 'answer' && (
              <View style={[styles.card, styles.answerCard, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}>
                <Text style={[styles.cardTypeLabel, { color: colors.textMuted }]}>Answer</Text>
                <Text style={[styles.cardText, { color: colors.textPrimary }]}>
                  {currentCard.answer}
                </Text>
                <Text style={[styles.sourceText, { color: colors.textMuted }]}>
                  {currentCard.source.split('/').pop()?.replace(/\.md$/i, '')}
                </Text>
              </View>
            )}
          </ScrollView>

          {phase === 'question' && (
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.flipBtn, { backgroundColor: colors.accent }]}
                onPress={() => setPhase('answer')}
                activeOpacity={0.8}
              >
                <Text style={[styles.flipBtnText, { color: colors.bgPrimary }]}>Show Answer</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'answer' && (
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <View style={styles.gradeRow}>
                {gradeButtons.map(({ label, grade, color }) => (
                  <TouchableOpacity
                    key={label}
                    style={[styles.gradeBtn, { backgroundColor: color + '22', borderColor: color }]}
                    onPress={() => handleGrade(grade)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.gradeBtnText, { color }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {phase === 'done' && (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={72} color={colors.green} style={{ marginBottom: 16 }} />
          <Text style={[styles.bigNum, { color: colors.textPrimary }]}>{sessionCount}</Text>
          <Text style={[styles.bigLabel, { color: colors.textSecondary }]}>
            {sessionCount === 1 ? 'card reviewed' : 'cards reviewed'}
          </Text>
          <Text style={[styles.allDoneText, { color: colors.green }]}>Session complete!</Text>
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: colors.bgSecondary }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.startBtnText, { color: colors.textPrimary }]}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headerBtn: { padding: 8, borderRadius: 8 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  loadingText: { marginTop: 12, fontSize: 15 },
  bigNum: { fontSize: 64, fontWeight: '700', lineHeight: 72 },
  bigLabel: { fontSize: 18, fontWeight: '500' },
  subLabel: { fontSize: 14, marginTop: 4 },
  startBtn: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
  },
  startBtnText: { fontSize: 17, fontWeight: '600' },
  allDoneText: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  reviewContainer: { flex: 1 },
  progress: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 6 },
  progressText: { fontSize: 13, textAlign: 'right' },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  cardArea: { padding: 16, gap: 12 },
  card: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    gap: 12,
  },
  answerCard: { marginTop: 4 },
  cardTypeLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardText: { fontSize: 18, lineHeight: 26 },
  sourceText: { fontSize: 12, marginTop: 4 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  flipBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  flipBtnText: { fontSize: 16, fontWeight: '600' },
  gradeRow: { flexDirection: 'row', gap: 8 },
  gradeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  gradeBtnText: { fontSize: 14, fontWeight: '600' },
});
