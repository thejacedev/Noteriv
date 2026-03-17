import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import {
  buildCalendarMonth,
  getWeekdayHeaders,
  formatDate,
  extractTasks,
  extractFrontmatterDue,
  CalendarMonth,
} from '@/lib/calendar-utils';
import { listAllMarkdownFiles, readFile, writeFile, fileExists, createDir } from '@/lib/file-system';
import { Directory } from 'expo-file-system';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CalendarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { vault } = useApp();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [calData, setCalData] = useState<CalendarMonth | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!vault) return;
    setLoading(true);

    const files = await listAllMarkdownFiles(vault.path);
    const dailyNotes = new Map<string, string>();
    const tasksByDate = new Map<string, number>();

    for (const file of files) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(file.fileName)) {
        dailyNotes.set(file.fileName, file.filePath);
      }
    }

    for (const file of files) {
      const content = await readFile(file.filePath);
      if (!content) continue;
      const tasks = extractTasks(content, file.filePath);
      for (const task of tasks) {
        if (task.dueDate && !task.completed) {
          tasksByDate.set(task.dueDate, (tasksByDate.get(task.dueDate) || 0) + 1);
        }
      }
      const fmDue = extractFrontmatterDue(content);
      if (fmDue) {
        tasksByDate.set(fmDue, (tasksByDate.get(fmDue) || 0) + 1);
      }
    }

    setCalData(buildCalendarMonth(year, month, dailyNotes, tasksByDate, new Map()));
    setLoading(false);
  }, [vault, year, month]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const handleDayPress = useCallback(async (day: CalendarMonth['days'][0]) => {
    if (!vault || !day.isCurrentMonth) return;
    if (day.hasDailyNote && day.dailyNotePath) {
      router.push({ pathname: '/editor', params: { path: day.dailyNotePath } });
      return;
    }
    const base = vault.path.replace(/\/$/, '');
    const dateStr = formatDate(day.date);
    const fileName = `${dateStr}.md`;
    let notePath = `${base}/${fileName}`;
    const dailyDir = `${base}/DailyNotes`;
    try {
      const dir = new Directory(dailyDir);
      if (dir.exists) notePath = `${dailyDir}/${fileName}`;
    } catch {}
    const title = day.date.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
    writeFile(notePath, `# ${title}\n\n`);
    router.push({ pathname: '/editor', params: { path: notePath } });
  }, [vault, router]);

  const headers = getWeekdayHeaders(false);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.header, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
            {MONTH_NAMES[month]} {year}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={goToToday}>
          <Ionicons name="today-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.calBody}>
          <View style={styles.weekdayRow}>
            {headers.map((h) => (
              <Text key={h} style={[styles.weekday, { color: colors.textMuted }]}>{h}</Text>
            ))}
          </View>
          <View style={styles.grid}>
            {calData?.days.map((day, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.dayCell,
                  day.isToday && { backgroundColor: colors.accent + '20' },
                  !day.isCurrentMonth && styles.dayCellOtherMonth,
                ]}
                onPress={() => handleDayPress(day)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayNum,
                    { color: day.isCurrentMonth ? colors.textPrimary : colors.textMuted },
                    day.isToday && { color: colors.accent, fontWeight: '700' },
                  ]}
                >
                  {day.dayOfMonth}
                </Text>
                <View style={styles.dotRow}>
                  {day.hasDailyNote && (
                    <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                  )}
                  {day.taskCount > 0 && (
                    <View style={[styles.dot, { backgroundColor: colors.yellow }]} />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.legend, { borderTopColor: colors.border }]}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>Daily note</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: colors.yellow }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>Due tasks</Text>
            </View>
          </View>
        </ScrollView>
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
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { padding: 6 },
  monthTitle: { fontSize: 17, fontWeight: '600', minWidth: 160, textAlign: 'center' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  calBody: { paddingBottom: 32 },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 4,
  },
  dayCellOtherMonth: { opacity: 0.35 },
  dayNum: { fontSize: 15 },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
    height: 6,
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legend: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    marginTop: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 13 },
});
