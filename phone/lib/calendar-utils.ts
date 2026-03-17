/**
 * Calendar utilities for date-based note navigation and task aggregation.
 */

export interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasDailyNote: boolean;
  dailyNotePath: string | null;
  taskCount: number;
  noteCount: number;
}

export interface CalendarMonth {
  year: number;
  month: number; // 0-indexed
  days: CalendarDay[];
}

export interface TaskItem {
  text: string;
  completed: boolean;
  dueDate: string | null;
  filePath: string;
  line: number;
}

/** Format a date as YYYY-MM-DD */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a date string YYYY-MM-DD */
export function parseDate(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Generate a month grid (includes trailing/leading days to fill weeks) */
export function generateMonthGrid(year: number, month: number, weekStartMonday = false): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let startDow = firstDay.getDay();
  if (weekStartMonday) startDow = (startDow + 6) % 7;

  const days: Date[] = [];

  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length < 42) {
    const last = days[days.length - 1];
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }

  return days;
}

/** Extract tasks with due dates from markdown content */
export function extractTasks(content: string, filePath: string): TaskItem[] {
  const tasks: TaskItem[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)-\s*\[([ xX])\]\s*(.*)/);
    if (!match) continue;
    const completed = match[2].toLowerCase() === 'x';
    const text = match[3];
    const dueMatch = text.match(/@due\((\d{4}-\d{2}-\d{2})\)/);
    const dueDate = dueMatch ? dueMatch[1] : null;
    tasks.push({ text: text.replace(/@due\([^)]+\)/, '').trim(), completed, dueDate, filePath, line: i + 1 });
  }
  return tasks;
}

/** Extract due date from frontmatter */
export function extractFrontmatterDue(content: string): string | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const dueMatch = fmMatch[1].match(/^due:\s*["']?(\d{4}-\d{2}-\d{2})["']?/m);
  return dueMatch ? dueMatch[1] : null;
}

/** Build calendar data for a month */
export function buildCalendarMonth(
  year: number,
  month: number,
  dailyNotes: Map<string, string>,
  tasksByDate: Map<string, number>,
  notesByDate: Map<string, number>,
  weekStartMonday = false
): CalendarMonth {
  const today = new Date();
  const grid = generateMonthGrid(year, month, weekStartMonday);

  const days: CalendarDay[] = grid.map((date) => {
    const dateStr = formatDate(date);
    return {
      date,
      dayOfMonth: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isToday: isSameDay(date, today),
      hasDailyNote: dailyNotes.has(dateStr),
      dailyNotePath: dailyNotes.get(dateStr) || null,
      taskCount: tasksByDate.get(dateStr) || 0,
      noteCount: notesByDate.get(dateStr) || 0,
    };
  });

  return { year, month, days };
}

/** Get weekday headers */
export function getWeekdayHeaders(weekStartMonday = false): string[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (weekStartMonday) return [...days.slice(1), days[0]];
  return days;
}
