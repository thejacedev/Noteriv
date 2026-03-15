"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  formatDate,
  buildCalendarMonth,
  getWeekdayHeaders,
  extractTasks,
  extractFrontmatterDue,
  type CalendarDay,
  type TaskItem,
} from "@/lib/calendar-utils";

interface CalendarViewProps {
  vaultPath: string;
  onFileSelect: (filePath: string) => void;
  onCreateDailyNote: (date: string) => void;
  onClose: () => void;
}

export default function CalendarView({ vaultPath, onFileSelect, onCreateDailyNote, onClose }: CalendarViewProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(today));
  const [dailyNotes, setDailyNotes] = useState<Map<string, string>>(new Map());
  const [tasksByDate, setTasksByDate] = useState<Map<string, number>>(new Map());
  const [notesByDate, setNotesByDate] = useState<Map<string, number>>(new Map());
  const [dayTasks, setDayTasks] = useState<TaskItem[]>([]);
  const [dayNotes, setDayNotes] = useState<{ name: string; path: string }[]>([]);

  // Scan vault for data
  useEffect(() => {
    async function scan() {
      if (!window.electronAPI) return;
      const files = await window.electronAPI.listAllFiles(vaultPath);
      const daily = new Map<string, string>();
      const tasks = new Map<string, number>();
      const notes = new Map<string, number>();

      for (const file of files) {
        // Check for daily notes (YYYY-MM-DD.md)
        const nameMatch = file.filePath.split("/").pop()?.match(/^(\d{4}-\d{2}-\d{2})\.(md|markdown)$/i);
        if (nameMatch) {
          daily.set(nameMatch[1], file.filePath);
        }

        // Read content for tasks with due dates and modification dates
        const content = await window.electronAPI.readFile(file.filePath);
        if (content) {
          const fileTasks = extractTasks(content, file.filePath);
          for (const task of fileTasks) {
            if (task.dueDate) {
              tasks.set(task.dueDate, (tasks.get(task.dueDate) || 0) + 1);
            }
          }
          const fmDue = extractFrontmatterDue(content);
          if (fmDue) {
            tasks.set(fmDue, (tasks.get(fmDue) || 0) + 1);
          }
        }

        // Note counts by created date (approximation using file name or daily note date)
        if (nameMatch) {
          notes.set(nameMatch[1], (notes.get(nameMatch[1]) || 0) + 1);
        }
      }

      setDailyNotes(daily);
      setTasksByDate(tasks);
      setNotesByDate(notes);
    }
    scan();
  }, [vaultPath, year, month]);

  // Load details for selected date
  useEffect(() => {
    async function loadDay() {
      if (!window.electronAPI || !selectedDate) return;
      const files = await window.electronAPI.listAllFiles(vaultPath);
      const tasks: TaskItem[] = [];
      const notesForDay: { name: string; path: string }[] = [];

      for (const file of files) {
        const content = await window.electronAPI.readFile(file.filePath);
        if (!content) continue;

        // Check daily note
        const name = file.filePath.split("/").pop() || "";
        if (name.startsWith(selectedDate)) {
          notesForDay.push({ name: name.replace(/\.(md|markdown)$/i, ""), path: file.filePath });
        }

        // Tasks due on this date
        const fileTasks = extractTasks(content, file.filePath);
        for (const task of fileTasks) {
          if (task.dueDate === selectedDate) tasks.push(task);
        }
      }

      setDayTasks(tasks);
      setDayNotes(notesForDay);
    }
    loadDay();
  }, [selectedDate, vaultPath]);

  const calendarData = useMemo(
    () => buildCalendarMonth(year, month, dailyNotes, tasksByDate, notesByDate),
    [year, month, dailyNotes, tasksByDate, notesByDate]
  );

  const weekdays = useMemo(() => getWeekdayHeaders(), []);

  const handlePrevMonth = useCallback(() => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }, [month]);

  const handleNextMonth = useCallback(() => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }, [month]);

  const handleToday = useCallback(() => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDate(formatDate(now));
  }, []);

  const handleDayClick = useCallback((day: CalendarDay) => {
    setSelectedDate(formatDate(day.date));
  }, []);

  const handleDayDoubleClick = useCallback((day: CalendarDay) => {
    if (day.dailyNotePath) {
      onFileSelect(day.dailyNotePath);
      onClose();
    } else {
      onCreateDailyNote(formatDate(day.date));
      onClose();
    }
  }, [onFileSelect, onCreateDailyNote, onClose]);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 90,
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#1e1e2e",
        borderRadius: 12,
        border: "1px solid #313244",
        width: 720,
        maxHeight: "80vh",
        display: "flex",
        overflow: "hidden",
      }} onClick={(e) => e.stopPropagation()}>
        {/* Calendar grid */}
        <div style={{ flex: 1, padding: 20 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button onClick={handlePrevMonth} style={navBtnStyle}>&lt;</button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#cdd6f4", fontSize: 18, fontWeight: 600 }}>
                {monthNames[month]} {year}
              </span>
              <button onClick={handleToday} style={{
                padding: "2px 8px", borderRadius: 4, border: "1px solid #45475a",
                background: "transparent", color: "#89b4fa", fontSize: 11, cursor: "pointer",
              }}>Today</button>
            </div>
            <button onClick={handleNextMonth} style={navBtnStyle}>&gt;</button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {weekdays.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, color: "#a6adc8", padding: 4, fontWeight: 600 }}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {calendarData.days.map((day, i) => {
              const dateStr = formatDate(day.date);
              const isSelected = dateStr === selectedDate;
              return (
                <button
                  key={i}
                  onClick={() => handleDayClick(day)}
                  onDoubleClick={() => handleDayDoubleClick(day)}
                  style={{
                    aspectRatio: "1",
                    border: "none",
                    borderRadius: 6,
                    background: isSelected ? "#45475a" : day.isToday ? "#313244" : "transparent",
                    color: !day.isCurrentMonth ? "#585b70" : day.isToday ? "#89b4fa" : "#cdd6f4",
                    fontSize: 13,
                    fontWeight: day.isToday ? 700 : 400,
                    cursor: "pointer",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    outline: isSelected ? "2px solid #89b4fa" : "none",
                    outlineOffset: -2,
                  }}
                >
                  {day.dayOfMonth}
                  <div style={{ display: "flex", gap: 2 }}>
                    {day.hasDailyNote && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#89b4fa" }} />}
                    {day.taskCount > 0 && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#a6e3a1" }} />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "#a6adc8" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#89b4fa" }} /> Daily note
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a6e3a1" }} /> Due tasks
            </span>
          </div>
        </div>

        {/* Day detail sidebar */}
        <div style={{
          width: 240,
          borderLeft: "1px solid #313244",
          padding: 16,
          overflowY: "auto",
          background: "#181825",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#cdd6f4", marginBottom: 12 }}>
            {selectedDate}
          </div>

          {dayNotes.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#a6adc8", marginBottom: 6, fontWeight: 600 }}>Notes</div>
              {dayNotes.map((n) => (
                <button
                  key={n.path}
                  onClick={() => { onFileSelect(n.path); onClose(); }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "4px 8px",
                    border: "none",
                    borderRadius: 4,
                    background: "transparent",
                    color: "#89b4fa",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {n.name}
                </button>
              ))}
            </div>
          )}

          {dayTasks.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#a6adc8", marginBottom: 6, fontWeight: 600 }}>Tasks Due</div>
              {dayTasks.map((t, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                  padding: "4px 0",
                  fontSize: 12,
                  color: t.completed ? "#585b70" : "#cdd6f4",
                  textDecoration: t.completed ? "line-through" : "none",
                }}>
                  <span style={{ color: t.completed ? "#a6e3a1" : "#f9e2af" }}>
                    {t.completed ? "\u2713" : "\u25CB"}
                  </span>
                  <span>{t.text}</span>
                </div>
              ))}
            </div>
          )}

          {dayNotes.length === 0 && dayTasks.length === 0 && (
            <div style={{ fontSize: 12, color: "#585b70", marginTop: 8 }}>
              No notes or tasks for this day.
              <button
                onClick={() => { onCreateDailyNote(selectedDate); onClose(); }}
                style={{
                  display: "block",
                  marginTop: 8,
                  padding: "4px 0",
                  border: "none",
                  background: "transparent",
                  color: "#89b4fa",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Create daily note
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: "1px solid #45475a",
  borderRadius: 6,
  background: "transparent",
  color: "#cdd6f4",
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
