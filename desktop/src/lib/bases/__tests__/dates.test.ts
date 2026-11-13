import { describe, expect, it } from "vitest";
import { formatDate, formatDuration, parseDateText, parseDuration, relativeTime, typeOf } from "..";
import { failure, note, NOW, run, shown } from "./helpers";

const FULL = "YYYY-MM-DD HH:mm:ss";
const at = (source: string, row = note("A.md")) => shown(`(${source}).format("${FULL}")`, row);

describe("reading dates", () => {
  it("date() reads the documented format", () => {
    expect(at('date("2025-01-01 12:00:00")')).toBe("2025-01-01 12:00:00");
    expect(at('date("2025-05-27")')).toBe("2025-05-27 00:00:00");
    expect(at('date("2025-05-27T08:30")')).toBe("2025-05-27 08:30:00");
    expect(at('date("2025-05-27T08:30:15.250")')).toBe("2025-05-27 08:30:15");
  });

  it("knows a date from a date with a time", () => {
    expect(run('date("2025-05-27")')).toMatchObject({ kind: "date", hasTime: false });
    expect(run('date("2025-05-27 00:00:00")')).toMatchObject({ kind: "date", hasTime: true });
    expect(shown('date("2025-05-27")')).toBe("2025-05-27");
    expect(shown('date("2025-05-27 08:30:00")')).toBe("2025-05-27 08:30:00");
  });

  it("reads a zone as the same moment everywhere", () => {
    const utc = parseDateText("2025-05-27T12:00:00Z");
    const offset = parseDateText("2025-05-27T14:00:00+02:00");
    expect(utc?.ms).toBe(Date.UTC(2025, 4, 27, 12, 0, 0));
    expect(offset?.ms).toBe(utc?.ms);
    expect(parseDateText("2025-05-27T07:00:00-0500")?.ms).toBe(utc?.ms);
  });

  it("rejects dates that do not exist", () => {
    expect(parseDateText("2025-02-30")).toBeNull();
    expect(parseDateText("2025-13-01")).toBeNull();
    expect(parseDateText("2025-01-01 25:00")).toBeNull();
    expect(parseDateText("20250101")).toBeNull();
    expect(parseDateText("next tuesday")).toBeNull();
    expect(parseDateText("2024-02-29")).not.toBeNull();
    expect(failure('date("not a date")')).toBe('"not a date" is not a date');
    expect(failure("date([1])")).toBe("date() needs text, not a list");
  });

  it("passes a date and an empty value through date()", () => {
    expect(at('date(date("2025-05-27 08:30:00"))')).toBe("2025-05-27 08:30:00");
    expect(run("date(missing)", note("A.md"))).toBeNull();
  });

  it("reads ISO dates in frontmatter as dates", () => {
    const row = note("A.md", {
      due_date: "2025-06-01",
      start: "2025-05-20T09:15:00",
      title: "2025 plans",
      loose: "June 1st",
      parsed: new Date(Date.UTC(2025, 5, 1)),
      moment: new Date(Date.UTC(2025, 5, 1, 10, 30)),
    });
    expect(typeOf(run("due_date", row))).toBe("date");
    expect(run('due_date.format("YYYY-MM-DD")', row)).toBe("2025-06-01");
    expect(at("start", row)).toBe("2025-05-20 09:15:00");
    expect(typeOf(run("title", row))).toBe("string");
    expect(typeOf(run("loose", row))).toBe("string");
    // A YAML parser that knows dates gives midnight UTC for a bare date: still that calendar day.
    expect(shown("parsed", row)).toBe("2025-06-01");
    expect(run("moment", row)).toMatchObject({ ms: Date.UTC(2025, 5, 1, 10, 30), hasTime: true });
  });
});

describe("now and today", () => {
  it("now() is the moment of the run and today() its midnight", () => {
    expect(at("now()")).toBe("2025-05-27 23:59:59");
    expect(at("today()")).toBe("2025-05-27 00:00:00");
    expect(shown("today()")).toBe("2025-05-27");
    expect(run("now()")).toMatchObject({ ms: NOW, hasTime: true });
  });

  it("accepts a Date for the moment of the run", () => {
    expect(shown("today()", null, { now: new Date(2030, 0, 15, 8, 0, 0) })).toBe("2030-01-15");
  });
});

describe("date fields and functions", () => {
  it("has a field for each part", () => {
    const stamp = 'date("2025-05-27 08:09:10")';
    expect(run(`${stamp}.year`)).toBe(2025);
    expect(run(`${stamp}.month`)).toBe(5);
    expect(run(`${stamp}.day`)).toBe(27);
    expect(run(`${stamp}.hour`)).toBe(8);
    expect(run(`${stamp}.minute`)).toBe(9);
    expect(run(`${stamp}.second`)).toBe(10);
    expect(run(`${stamp}.millisecond`)).toBe(0);
    expect(run("now().hour")).toBe(23);
    expect(failure(`${stamp}.week`)).toBe('There is no "week" on a date');
  });

  it("date() removes the time", () => {
    expect(run('now().date().format("YYYY-MM-DD HH:mm:ss")')).toBe("2025-05-27 00:00:00");
    expect(run("now().date()")).toMatchObject({ hasTime: false });
    // "You can create a link from any string", as the syntax page does with a date.
    expect(run("link(now().date().toString())")).toMatchObject({ kind: "link", path: "2025-05-27" });
  });

  it("format() follows a Moment format string", () => {
    const stamp = 'date("2025-05-27 23:59:59")';
    expect(run(`${stamp}.format("YYYY-MM-DD")`)).toBe("2025-05-27");
    expect(run(`${stamp}.format("D MMMM YYYY")`)).toBe("27 May 2025");
    expect(run(`${stamp}.format("ddd, MMM Do YY")`)).toBe("Tue, May 27th 25");
    expect(run(`${stamp}.format("h:mm A")`)).toBe("11:59 PM");
    expect(run(`${stamp}.format("[Week] W [of] GGGG")`)).toBe("Week 22 of 2025");
    expect(run(`${stamp}.format("dddd [the] Do")`)).toBe("Tuesday the 27th");
    expect(run(`${stamp}.format("[Q]Q-YYYY")`)).toBe("Q2-2025");
    expect(run(`${stamp}.format("LL")`)).toBe("May 27, 2025");
    expect(run(`${stamp}.format("L LT")`)).toBe("05/27/2025 11:59 PM");
  });

  it("time() gives the time as text", () => {
    expect(run("now().time()")).toBe("23:59:59");
    expect(run('date("2025-05-27").time()')).toBe("00:00:00");
  });

  it("relative() compares with now", () => {
    expect(run('(now() - "3d").relative()')).toBe("3 days ago");
    expect(run('(now() + "2h").relative()')).toBe("in 2 hours");
    expect(run('(now() - "10s").relative()')).toBe("a few seconds ago");
    expect(run('(now() - "1m").relative()')).toBe("a minute ago");
    expect(run('(now() + "1y").relative()')).toBe("in a year");
  });

  it("isEmpty() is false for a date", () => {
    expect(run("now().isEmpty()")).toBe(false);
  });
});

describe("date arithmetic", () => {
  it("adds and subtracts durations written as text", () => {
    // The examples from the syntax page.
    expect(at('date("2024-12-01") + "1M" + "4h" + "3m"')).toBe("2025-01-01 04:03:00");
    expect(at('now() + "1 day"')).toBe("2025-05-28 23:59:59");
    expect(at('now() + "1 hour"')).toBe("2025-05-28 00:59:59");
    expect(shown('today() + "7d"')).toBe("2025-06-03");
    expect(at('date("2025-03-15 10:00:00") - "2h"')).toBe("2025-03-15 08:00:00");
  });

  it("accepts every way of writing a unit", () => {
    const from = 'date("2025-01-10 10:10:10")';
    for (const unit of ["y", "year", "years"]) expect(at(`${from} + "1${unit}"`)).toBe("2026-01-10 10:10:10");
    for (const unit of ["M", "month", "months"]) expect(at(`${from} + "1 ${unit}"`)).toBe("2025-02-10 10:10:10");
    for (const unit of ["w", "week", "weeks"]) expect(at(`${from} + "1${unit}"`)).toBe("2025-01-17 10:10:10");
    for (const unit of ["d", "day", "days"]) expect(at(`${from} + "2 ${unit}"`)).toBe("2025-01-12 10:10:10");
    for (const unit of ["h", "hour", "hours"]) expect(at(`${from} + "3${unit}"`)).toBe("2025-01-10 13:10:10");
    for (const unit of ["m", "minute", "minutes"]) expect(at(`${from} + "5 ${unit}"`)).toBe("2025-01-10 10:15:10");
    for (const unit of ["s", "second", "seconds"]) expect(at(`${from} + "20${unit}"`)).toBe("2025-01-10 10:10:30");
  });

  it("keeps to the end of a shorter month", () => {
    expect(shown('date("2025-01-31") + "1M"')).toBe("2025-02-28");
    expect(shown('date("2024-02-29") + "1y"')).toBe("2025-02-28");
    expect(shown('date("2025-03-31") - "1M"')).toBe("2025-02-28");
  });

  it("computes a deadline from a note property", () => {
    const project = note("P.md", { start_date: "2025-05-01" });
    expect(shown('start_date + "2w"', project)).toBe("2025-05-15");
  });

  it("compares dates", () => {
    const recent = note("A.md", {}, { mtime: NOW - 3 * 86_400_000 });
    const old = note("B.md", {}, { mtime: NOW - 30 * 86_400_000 });
    expect(run('file.mtime > now() - "1 week"', recent)).toBe(true);
    expect(run('file.mtime > now() - "1 week"', old)).toBe(false);
    expect(run("file.mtime > now() - '7d'", recent)).toBe(true);
    expect(run('date("2025-01-01") < date("2025-01-02")')).toBe(true);
    expect(run('date("2025-01-01") == date("2025-01-01")')).toBe(true);
    expect(run('date("2025-01-01") >= "2025-01-01"')).toBe(true);
    expect(run('date("2025-01-01") == "2025-01-01"')).toBe(true);
  });

  it("shows an overdue status, as in the formulas page", () => {
    const formula = 'if(due_date < now() && status != "Done", "Overdue", "")';
    expect(run(formula, note("A.md", { due_date: "2025-05-01", status: "Open" }))).toBe("Overdue");
    expect(run(formula, note("B.md", { due_date: "2025-05-01", status: "Done" }))).toBe("");
    expect(run(formula, note("C.md", { due_date: "2025-12-01", status: "Open" }))).toBe("");
    expect(run(formula, note("D.md", { status: "Open" }))).toBe("");
  });

  it("subtracts two dates to get a duration", () => {
    const release = note("A.md", { release_date: "2025-06-06" });
    expect(typeOf(run("release_date - today()", release))).toBe("duration");
    expect(run("(release_date - today()).days", release)).toBe(10);
    expect(shown("release_date - today()", release)).toBe("10 days");
    expect(shown("today() - release_date", release)).toBe("-10 days");
    expect(run('(date("2025-01-01 12:00:00") - date("2025-01-01 10:30:00")).minutes')).toBe(90);
    expect(run('(date("2025-01-01 12:00:00") - "2025-01-01").hours')).toBe(12);
  });

  it("joins a date to text that is not a duration", () => {
    expect(run('"Due " + date("2025-06-01")')).toBe("Due 2025-06-01");
    expect(run('date("2025-06-01") + " (soon)"')).toBe("2025-06-01 (soon)");
  });

  it("gives nothing when the date is missing", () => {
    const row = note("A.md");
    // Not the text "2w": next to an empty value a duration can only be date arithmetic.
    expect(run('start_date + "2w"', row)).toBeNull();
    expect(run('start_date + " (start)"', row)).toBe(" (start)");
    expect(run("due - today()", row)).toBeNull();
    expect(run("today() - due", row)).toBeNull();
    expect(run("today() + missing", row)).toBeNull();
  });

  it("fails on arithmetic that means nothing", () => {
    expect(failure("today() + today()")).toBe("Cannot add a date and a date");
    expect(failure("today() - 5")).toBe("Cannot subtract a date and a number");
    expect(failure("today() * 2")).toBe("Cannot multiply a date and a number");
  });
});

describe("durations", () => {
  it("duration() parses the same text date arithmetic takes", () => {
    expect(run('duration("1d")')).toEqual({ kind: "duration", months: 0, days: 1, ms: 0 });
    expect(run('duration("1y 2M")')).toEqual({ kind: "duration", months: 14, days: 0, ms: 0 });
    expect(run('duration("2w")')).toEqual({ kind: "duration", months: 0, days: 14, ms: 0 });
    expect(run('duration("1h 30m 15s")')).toEqual({ kind: "duration", months: 0, days: 0, ms: 5_415_000 });
    expect(failure('duration("soon")')).toBe('"soon" is not a duration');
  });

  it("tells a month from a minute by the case of the letter", () => {
    expect(parseDuration("1M")).toMatchObject({ months: 1, ms: 0 });
    expect(parseDuration("1m")).toMatchObject({ months: 0, ms: 60_000 });
    expect(parseDuration("1 Month")).toMatchObject({ months: 1 });
    expect(parseDuration("1 MINUTE")).toMatchObject({ ms: 60_000 });
    expect(parseDuration("1 fortnight")).toBeNull();
    expect(parseDuration("1")).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("d")).toBeNull();
  });

  it("multiplies and divides by a number", () => {
    expect(at("now() + (duration('1d') * 2)")).toBe("2025-05-29 23:59:59");
    expect(shown("duration('5h') * 2")).toBe("10 hours");
    expect(shown("duration('5h') / 2")).toBe("2 hours 30 minutes");
    expect(shown("2 * duration('5h')")).toBe("10 hours");
    expect(run("duration('3h') / duration('30m')")).toBe(6);
  });

  it("adds, subtracts, negates and compares", () => {
    expect(shown("duration('1h') + duration('30m')")).toBe("1 hour 30 minutes");
    expect(shown("duration('1h') - duration('15m')")).toBe("45 minutes");
    expect(shown("duration('1h') + '30m'")).toBe("1 hour 30 minutes");
    expect(at("now() - -duration('1d')")).toBe("2025-05-28 23:59:59");
    expect(run("duration('1d') > duration('23h')")).toBe(true);
    expect(run("duration('60m') == duration('1h')")).toBe(true);
    expect(run("(today() - date('2025-05-20')) > '5d'")).toBe(true);
  });

  it("reads its length in any unit", () => {
    expect(run("duration('36h').days")).toBe(1.5);
    expect(run("duration('2d').hours")).toBe(48);
    expect(run("duration('1w').days")).toBe(7);
    expect(run("duration('90s').minutes")).toBe(1.5);
    expect(run("duration('1s').milliseconds")).toBe(1000);
    expect(run("duration('2y').years")).toBe(2);
    expect(run("duration('18M').years")).toBe(1.5);
    expect(run("number(duration('1m'))")).toBe(60_000);
  });
});

describe("formatting helpers", () => {
  const stamp = new Date(2025, 0, 5, 9, 7, 3, 45).getTime();

  it("formatDate() covers the common Moment tokens", () => {
    expect(formatDate(stamp, "YYYY YY M MM MMM MMMM")).toBe("2025 25 1 01 Jan January");
    expect(formatDate(stamp, "D DD Do DDD DDDD")).toBe("5 05 5th 5 005");
    expect(formatDate(stamp, "d dd ddd dddd E")).toBe("0 Su Sun Sunday 7");
    expect(formatDate(stamp, "H HH h hh k kk")).toBe("9 09 9 09 9 09");
    expect(formatDate(stamp, "m mm s ss S SS SSS")).toBe("7 07 3 03 0 04 045");
    expect(formatDate(stamp, "a A")).toBe("am AM");
    expect(formatDate(stamp, "Q Qo")).toBe("1 1st");
    expect(formatDate(stamp, "x")).toBe(String(stamp));
    expect(formatDate(stamp, "X")).toBe(String(Math.floor(stamp / 1000)));
    expect(formatDate(stamp, "[YYYY] YYYY")).toBe("YYYY 2025");
    expect(formatDate(stamp, "LTS")).toBe("9:07:03 AM");
    expect(formatDate(stamp, "LLLL")).toBe("Sunday, January 5, 2025 9:07 AM");
    expect(formatDate(new Date(2025, 0, 1, 0, 30).getTime(), "h:mm a k")).toBe("12:30 am 24");
    expect(formatDate(new Date(2025, 0, 1, 12, 30).getTime(), "h:mm a")).toBe("12:30 pm");
    expect(formatDate(stamp, "Z")).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(formatDate(stamp, "ZZ")).toMatch(/^[+-]\d{4}$/);
    expect(formatDate(NaN, "YYYY")).toBe("Invalid date");
  });

  it("formatDate() numbers weeks the ISO way and the locale way", () => {
    const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
    // 29 December 2025 is a Monday in ISO week 1 of 2026.
    expect(formatDate(day(2025, 12, 29), "GGGG-[W]WW")).toBe("2026-W01");
    expect(formatDate(day(2021, 1, 3), "GGGG-[W]WW")).toBe("2020-W53");
    expect(formatDate(day(2025, 5, 27), "W Wo GG")).toBe("22 22nd 25");
    // Locale weeks start on Sunday, and the week of 1 January is week 1.
    expect(formatDate(day(2025, 1, 4), "gggg w")).toBe("2025 1");
    expect(formatDate(day(2025, 1, 5), "gggg w ww wo")).toBe("2025 2 02 2nd");
    expect(formatDate(day(2025, 12, 28), "gggg w")).toBe("2026 1");
  });

  it("relativeTime() steps through the units as Moment does", () => {
    const ago = (ms: number) => relativeTime(NOW - ms, NOW);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    expect(ago(0)).toBe("a few seconds ago");
    expect(ago(44_000)).toBe("a few seconds ago");
    expect(ago(45_000)).toBe("a minute ago");
    expect(ago(2 * minute)).toBe("2 minutes ago");
    expect(ago(44 * minute)).toBe("44 minutes ago");
    expect(ago(45 * minute)).toBe("an hour ago");
    expect(ago(5 * hour)).toBe("5 hours ago");
    expect(ago(22 * hour)).toBe("a day ago");
    expect(ago(3 * day)).toBe("3 days ago");
    expect(ago(25 * day)).toBe("25 days ago");
    expect(ago(26 * day)).toBe("a month ago");
    expect(ago(100 * day)).toBe("3 months ago");
    expect(ago(340 * day)).toBe("a year ago");
    expect(ago(800 * day)).toBe("2 years ago");
    expect(relativeTime(NOW + 3 * day, NOW)).toBe("in 3 days");
  });

  it("formatDuration() shows the two largest units", () => {
    const d = (text: string) => formatDuration(parseDuration(text) ?? { kind: "duration", months: 0, days: 0, ms: 0 });
    expect(d("1d")).toBe("1 day");
    expect(d("3d 4h 5m")).toBe("3 days 4 hours");
    expect(d("1y 2M 3d")).toBe("1 year 2 months");
    expect(d("14M")).toBe("1 year 2 months");
    expect(d("1M 3d")).toBe("1 month 3 days");
    expect(d("90s")).toBe("1 minute 30 seconds");
    expect(d("1h 5s")).toBe("1 hour");
    expect(d("0s")).toBe("0 seconds");
    expect(d("0.25s")).toBe("250 milliseconds");
    expect(d("-2h")).toBe("-2 hours");
    expect(d("400d")).toBe("400 days");
  });
});
