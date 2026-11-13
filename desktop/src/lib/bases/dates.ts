/**
 * Dates and durations for base formulas: reading them from text, the
 * arithmetic between them, and Moment-style formatting. Everything is in
 * local time, as it is in Obsidian.
 */

import { dateValue, durationValue, type DateValue, type DurationValue } from "./values";

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
/** A month's average length, used only where a duration has to become one number. */
export const MS_PER_MONTH = 30.436875 * MS_PER_DAY;

const DATE_TEXT =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Read "YYYY-MM-DD", optionally followed by a time ("T" or a space, then
 * HH:mm, seconds and fractions optional) and a zone ("Z" or an offset).
 * Without a zone the time is local. Returns null for anything else,
 * including dates that do not exist such as 30 February.
 */
export function parseDateText(text: string): DateValue | null {
  const match = DATE_TEXT.exec(text.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hasTime = match[4] !== undefined;
  const hour = hasTime ? Number(match[4]) : 0;
  const minute = hasTime ? Number(match[5]) : 0;
  const second = match[6] !== undefined ? Number(match[6]) : 0;
  const millisecond = match[7] !== undefined ? Math.floor(Number(`0.${match[7]}`) * 1000) : 0;

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month - 1)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const zone = match[8];
  if (zone !== undefined) {
    const utc = new Date(0);
    utc.setUTCFullYear(year, month - 1, day);
    utc.setUTCHours(hour, minute, second, millisecond);
    return dateValue(utc.getTime() - zoneOffsetMs(zone), true);
  }

  // Built field by field: the Date constructor reads years 0 to 99 as 1900 to 1999.
  const local = new Date(0);
  local.setFullYear(year, month - 1, day);
  local.setHours(hour, minute, second, millisecond);
  return dateValue(local.getTime(), hasTime);
}

function zoneOffsetMs(zone: string): number {
  if (zone === "Z") return 0;
  const sign = zone[0] === "-" ? -1 : 1;
  const digits = zone.slice(1).replace(":", "");
  const hours = Number(digits.slice(0, 2));
  const minutes = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
  return sign * (hours * MS_PER_HOUR + minutes * MS_PER_MINUTE);
}

/**
 * Read a date the way `date()` does: the documented format first, then
 * whatever the JavaScript engine can read (for example "5 January 2025").
 */
export function parseDateLoose(text: string): DateValue | null {
  const strict = parseDateText(text);
  if (strict) return strict;
  if (!text.trim()) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return dateValue(ms, ms !== startOfDay(ms));
}

/** Midnight, local time, of the day the moment falls in. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const LONG_UNITS: Record<string, "y" | "M" | "w" | "d" | "h" | "m" | "s"> = {
  year: "y",
  years: "y",
  month: "M",
  months: "M",
  week: "w",
  weeks: "w",
  day: "d",
  days: "d",
  hour: "h",
  hours: "h",
  minute: "m",
  minutes: "m",
  second: "s",
  seconds: "s",
};

/**
 * Read a duration such as "1M", "2h", "1 day" or "1w 2d". The one-letter
 * units are case sensitive ("M" is a month, "m" a minute); the words are not.
 */
export function parseDuration(text: string): DurationValue | null {
  const part = /\s*([+-]?\d+(?:\.\d+)?)\s*([A-Za-z]+)\s*/y;
  let months = 0;
  let days = 0;
  let ms = 0;
  let position = 0;
  let parts = 0;

  while (position < text.length) {
    part.lastIndex = position;
    const match = part.exec(text);
    if (!match) return null;
    const amount = Number(match[1]);
    const word = match[2];
    const unit = word.length === 1 ? word : LONG_UNITS[word.toLowerCase()];
    switch (unit) {
      case "y":
        months += amount * 12;
        break;
      case "M":
        months += amount;
        break;
      case "w":
        days += amount * 7;
        break;
      case "d":
        days += amount;
        break;
      case "h":
        ms += amount * MS_PER_HOUR;
        break;
      case "m":
        ms += amount * MS_PER_MINUTE;
        break;
      case "s":
        ms += amount * MS_PER_SECOND;
        break;
      default:
        return null;
    }
    position = part.lastIndex;
    parts++;
  }
  return parts > 0 ? durationValue(months, days, ms) : null;
}

/** A duration as one number. Months count as their average length. */
export function durationMs(duration: DurationValue): number {
  return duration.months * MS_PER_MONTH + duration.days * MS_PER_DAY + duration.ms;
}

export function scaleDuration(duration: DurationValue, factor: number): DurationValue {
  return durationValue(duration.months * factor, duration.days * factor, duration.ms * factor);
}

export function addDurations(a: DurationValue, b: DurationValue, sign: 1 | -1): DurationValue {
  return durationValue(a.months + sign * b.months, a.days + sign * b.days, a.ms + sign * b.ms);
}

/**
 * Move a date by a duration. Whole months and days move on the calendar, so
 * the time of day survives a clock change and 31 January plus a month is the
 * last day of February; the rest is added as elapsed time.
 */
export function addDuration(date: DateValue, duration: DurationValue, sign: 1 | -1): DateValue {
  const d = new Date(date.ms);

  const months = sign * duration.months;
  const wholeMonths = Math.trunc(months);
  let elapsed = (months - wholeMonths) * MS_PER_MONTH;
  if (wholeMonths !== 0) {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + wholeMonths);
    d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  }

  const days = sign * duration.days;
  const wholeDays = Math.trunc(days);
  elapsed += (days - wholeDays) * MS_PER_DAY;
  if (wholeDays !== 0) d.setDate(d.getDate() + wholeDays);

  elapsed += sign * duration.ms;
  return dateValue(d.getTime() + elapsed, date.hasTime || elapsed !== 0);
}

/**
 * The time from `earlier` to `later`. Between two dates without a time it
 * is a whole number of days, counted on the calendar: a clock change in
 * between must not turn "10 days" into "9 days 23 hours".
 */
export function dateDifference(later: DateValue, earlier: DateValue): DurationValue {
  if (later.hasTime || earlier.hasTime) return durationValue(0, 0, later.ms - earlier.ms);
  const a = new Date(later.ms);
  const b = new Date(earlier.ms);
  const days =
    dayNumber(a.getFullYear(), a.getMonth(), a.getDate()) - dayNumber(b.getFullYear(), b.getMonth(), b.getDate());
  return durationValue(0, days, 0);
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The localized Moment formats, as they expand in English. */
const LOCALIZED: Record<string, string> = {
  LT: "h:mm A",
  LTS: "h:mm:ss A",
  L: "MM/DD/YYYY",
  LL: "MMMM D, YYYY",
  LLL: "MMMM D, YYYY h:mm A",
  LLLL: "dddd, MMMM D, YYYY h:mm A",
};

// Longer tokens come first in each family so "MMMM" is not read as "MM" twice.
const FORMAT_TOKEN =
  /\[([^\]]*)\]|LTS|LT|LLLL|LLL|LL|L|YYYY|YY|Qo|Q|MMMM|MMM|MM|Mo|M|DDDD|DDDo|DDD|DD|Do|D|dddd|ddd|dd|do|d|E|HH|H|hh|h|kk|k|mm|m|ss|s|SSS|SS|S|A|a|ZZ|Z|X|x|GGGG|GG|gggg|gg|WW|Wo|W|ww|wo|w/g;

function pad(value: number, width: number): string {
  const text = String(Math.abs(Math.trunc(value))).padStart(width, "0");
  return value < 0 ? `-${text}` : text;
}

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  const suffix = ["th", "st", "nd", "rd"][value % 10] ?? "th";
  return `${value}${suffix}`;
}

/** A calendar day as a count of days, so day differences ignore clock changes. */
function dayNumber(year: number, monthIndex: number, day: number): number {
  return Math.floor(Date.UTC(year, monthIndex, day) / MS_PER_DAY);
}

function dayOfYear(d: Date): number {
  return dayNumber(d.getFullYear(), d.getMonth(), d.getDate()) - dayNumber(d.getFullYear(), 0, 1) + 1;
}

/**
 * The week a day is in and the year that week belongs to. `firstDay` is the
 * weekday a week starts on, and week 1 is the week that contains
 * `anchorDay` January: ISO weeks start on Monday and contain 4 January,
 * English locale weeks start on Sunday and contain 1 January.
 */
function weekOf(d: Date, firstDay: number, anchorDay: number): { week: number; year: number } {
  const today = dayNumber(d.getFullYear(), d.getMonth(), d.getDate());
  const weekStart = today - ((d.getDay() - firstDay + 7) % 7);

  const firstWeekStart = (year: number): number => {
    const anchor = new Date(Date.UTC(year, 0, anchorDay));
    const anchorNumber = Math.floor(anchor.getTime() / MS_PER_DAY);
    return anchorNumber - ((anchor.getUTCDay() - firstDay + 7) % 7);
  };

  let year = d.getFullYear() + 1;
  while (firstWeekStart(year) > weekStart) year--;
  return { week: Math.floor((weekStart - firstWeekStart(year)) / 7) + 1, year };
}

function zoneText(d: Date, separator: string): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `${sign}${pad(Math.floor(abs / 60), 2)}${separator}${pad(abs % 60, 2)}`;
}

/**
 * Format a date with a Moment.js format string. The common tokens are
 * covered, with English month and weekday names; text in [brackets] is
 * copied as it is, and so is anything that is not a token.
 */
export function formatDate(ms: number, format: string): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "Invalid date";

  const expanded = format.replace(/\[[^\]]*\]|LTS|LT|LLLL|LLL|LL|L/g, (token) => LOCALIZED[token] ?? token);

  return expanded.replace(FORMAT_TOKEN, (token, literal: string | undefined) => {
    if (literal !== undefined) return literal;
    const hours12 = d.getHours() % 12 || 12;
    switch (token) {
      case "YYYY":
        return pad(d.getFullYear(), 4);
      case "YY":
        return pad(d.getFullYear() % 100, 2);
      case "Q":
        return String(Math.floor(d.getMonth() / 3) + 1);
      case "Qo":
        return ordinal(Math.floor(d.getMonth() / 3) + 1);
      case "MMMM":
        return MONTHS[d.getMonth()];
      case "MMM":
        return MONTHS[d.getMonth()].slice(0, 3);
      case "MM":
        return pad(d.getMonth() + 1, 2);
      case "Mo":
        return ordinal(d.getMonth() + 1);
      case "M":
        return String(d.getMonth() + 1);
      case "DDDD":
        return pad(dayOfYear(d), 3);
      case "DDDo":
        return ordinal(dayOfYear(d));
      case "DDD":
        return String(dayOfYear(d));
      case "DD":
        return pad(d.getDate(), 2);
      case "Do":
        return ordinal(d.getDate());
      case "D":
        return String(d.getDate());
      case "dddd":
        return WEEKDAYS[d.getDay()];
      case "ddd":
        return WEEKDAYS[d.getDay()].slice(0, 3);
      case "dd":
        return WEEKDAYS[d.getDay()].slice(0, 2);
      case "do":
        return ordinal(d.getDay());
      case "d":
        return String(d.getDay());
      case "E":
        return String(d.getDay() || 7);
      case "HH":
        return pad(d.getHours(), 2);
      case "H":
        return String(d.getHours());
      case "hh":
        return pad(hours12, 2);
      case "h":
        return String(hours12);
      case "kk":
        return pad(d.getHours() || 24, 2);
      case "k":
        return String(d.getHours() || 24);
      case "mm":
        return pad(d.getMinutes(), 2);
      case "m":
        return String(d.getMinutes());
      case "ss":
        return pad(d.getSeconds(), 2);
      case "s":
        return String(d.getSeconds());
      case "SSS":
        return pad(d.getMilliseconds(), 3);
      case "SS":
        return pad(Math.floor(d.getMilliseconds() / 10), 2);
      case "S":
        return String(Math.floor(d.getMilliseconds() / 100));
      case "A":
        return d.getHours() < 12 ? "AM" : "PM";
      case "a":
        return d.getHours() < 12 ? "am" : "pm";
      case "Z":
        return zoneText(d, ":");
      case "ZZ":
        return zoneText(d, "");
      case "X":
        return String(Math.floor(ms / 1000));
      case "x":
        return String(ms);
      case "GGGG":
        return pad(weekOf(d, 1, 4).year, 4);
      case "GG":
        return pad(weekOf(d, 1, 4).year % 100, 2);
      case "gggg":
        return pad(weekOf(d, 0, 1).year, 4);
      case "gg":
        return pad(weekOf(d, 0, 1).year % 100, 2);
      case "WW":
        return pad(weekOf(d, 1, 4).week, 2);
      case "Wo":
        return ordinal(weekOf(d, 1, 4).week);
      case "W":
        return String(weekOf(d, 1, 4).week);
      case "ww":
        return pad(weekOf(d, 0, 1).week, 2);
      case "wo":
        return ordinal(weekOf(d, 0, 1).week);
      case "w":
        return String(weekOf(d, 0, 1).week);
      default:
        return token;
    }
  });
}

/** The form `toString()` gives a date and `date()` reads back. */
export function dateToText(date: DateValue): string {
  return formatDate(date.ms, date.hasTime ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD");
}

/**
 * How far a moment is from now, in words: "3 days ago", "in 2 hours". The
 * steps between units are Moment's, so 45 seconds is already "a minute".
 */
export function relativeTime(ms: number, now: number): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const seconds = Math.round(abs / MS_PER_SECOND);
  const minutes = Math.round(abs / MS_PER_MINUTE);
  const hours = Math.round(abs / MS_PER_HOUR);
  const days = Math.round(abs / MS_PER_DAY);
  const months = Math.round(abs / MS_PER_MONTH);
  const years = Math.round(abs / (12 * MS_PER_MONTH));

  let text: string;
  if (seconds < 45) text = "a few seconds";
  else if (minutes <= 1) text = "a minute";
  else if (minutes < 45) text = `${minutes} minutes`;
  else if (hours <= 1) text = "an hour";
  else if (hours < 22) text = `${hours} hours`;
  else if (days <= 1) text = "a day";
  else if (days < 26) text = `${days} days`;
  else if (months <= 1) text = "a month";
  else if (months < 11) text = `${months} months`;
  else if (years <= 1) text = "a year";
  else text = `${years} years`;

  return diff > 0 ? `in ${text}` : `${text} ago`;
}

/**
 * A duration in words, to its two largest units: "3 days 4 hours". More
 * would be noise in a table cell, and a formula can still reach every unit.
 */
export function formatDuration(duration: DurationValue): string {
  const parts = [duration.months, duration.days, duration.ms];
  const sameSign = parts.every((n) => n >= 0) || parts.every((n) => n <= 0);
  // "1 month minus 5 days" has no tidy wording, so it is shown as elapsed time.
  const months = sameSign ? Math.abs(duration.months) : 0;
  const rest = sameSign
    ? Math.abs(duration.days) * MS_PER_DAY + Math.abs(duration.ms)
    : Math.abs(durationMs(duration));
  const negative = durationMs(duration) < 0;

  const wholeMonths = Math.floor(months);
  const elapsed = Math.round(rest + (months - wholeMonths) * MS_PER_MONTH);
  const units: [number, string][] = [
    [Math.floor(wholeMonths / 12), "year"],
    [wholeMonths % 12, "month"],
    [Math.floor(elapsed / MS_PER_DAY), "day"],
    [Math.floor((elapsed % MS_PER_DAY) / MS_PER_HOUR), "hour"],
    [Math.floor((elapsed % MS_PER_HOUR) / MS_PER_MINUTE), "minute"],
    [Math.floor((elapsed % MS_PER_MINUTE) / MS_PER_SECOND), "second"],
    [elapsed % MS_PER_SECOND, "millisecond"],
  ];

  const first = units.findIndex(([amount]) => amount > 0);
  if (first < 0) return "0 seconds";
  const shown = units
    .slice(first, first + 2)
    .filter(([amount]) => amount > 0)
    .map(([amount, unit]) => `${amount} ${unit}${amount === 1 ? "" : "s"}`)
    .join(" ");
  return negative ? `-${shown}` : shown;
}
