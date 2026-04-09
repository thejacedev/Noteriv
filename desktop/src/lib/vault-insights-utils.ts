/**
 * Vault Insights data computation utilities.
 * Aggregates vault-level analytics: heatmap, hub/orphan notes,
 * tag distribution, daily streaks, growth, and vault health.
 */

import { parseTags } from "./tag-utils";
import { hasFrontmatter } from "./frontmatter-utils";

// ── Types ──────────────────────────────────────────────────

export interface FileStatEntry {
  filePath: string;
  fileName: string;
  relativePath: string;
  mtimeMs: number;
  birthtimeMs: number;
}

export interface HeatmapDay {
  date: string;   // "YYYY-MM-DD"
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HubNote {
  filePath: string;
  fileName: string;
  incomingCount: number;
  outgoingCount: number;
  totalConnections: number;
}

export interface OrphanNote {
  filePath: string;
  fileName: string;
}

export interface TagStat {
  tag: string;
  count: number;
}

export interface GrowthPoint {
  month: string;  // "YYYY-MM"
  label: string;  // "Jan 2025"
  cumulative: number;
}

export interface DailyStreak {
  current: number;
  longest: number;
  lastDate: string | null;
}

export interface VaultHealthScore {
  overall: number;
  withBacklinks: number;
  withTags: number;
  withFrontmatter: number;
  totalNotes: number;
}

export interface VaultInsightsData {
  totalNotes: number;
  totalWords: number;
  totalTags: number;
  totalLinks: number;
  avgNoteLength: number;
  heatmap: HeatmapDay[];
  hubNotes: HubNote[];
  orphanNotes: OrphanNote[];
  tagDistribution: TagStat[];
  dailyStreak: DailyStreak;
  growthOverTime: GrowthPoint[];
  vaultHealth: VaultHealthScore;
}

// ── Helpers ────────────────────────────────────────────────

const LINK_REGEX = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
const DAILY_NOTE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CONCURRENCY = 10;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDateStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toMonthStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  return `${MONTH_LABELS[parseInt(month, 10) - 1]} ${year}`;
}

function daysBetween(a: string, b: string): number {
  const msA = new Date(a + "T00:00:00").getTime();
  const msB = new Date(b + "T00:00:00").getTime();
  return Math.round(Math.abs(msB - msA) / 86400000);
}

/** Read files in batches to avoid overwhelming IPC. */
async function batchReadFiles(
  filePaths: string[],
  readFile: (p: string) => Promise<string | null>,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
    const batch = filePaths.slice(i, i + CONCURRENCY);
    const contents = await Promise.all(batch.map((p) => readFile(p)));
    batch.forEach((p, idx) => {
      if (contents[idx] != null) results.set(p, contents[idx]!);
    });
  }
  return results;
}

// ── Heatmap ────────────────────────────────────────────────

function buildHeatmap(files: FileStatEntry[]): HeatmapDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build a map of date -> number of files modified
  const countByDate = new Map<string, number>();
  for (const f of files) {
    const ds = toDateStr(f.mtimeMs);
    countByDate.set(ds, (countByDate.get(ds) || 0) + 1);
  }

  // Generate 365 days ending today
  const days: HeatmapDay[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = toDateStr(d.getTime());
    days.push({ date: ds, count: countByDate.get(ds) || 0, level: 0 });
  }

  // Assign levels based on non-zero distribution
  const nonZero = days.filter((d) => d.count > 0).map((d) => d.count);
  if (nonZero.length > 0) {
    nonZero.sort((a, b) => a - b);
    const p25 = nonZero[Math.floor(nonZero.length * 0.25)] || 1;
    const p50 = nonZero[Math.floor(nonZero.length * 0.5)] || 2;
    const p75 = nonZero[Math.floor(nonZero.length * 0.75)] || 3;
    for (const day of days) {
      if (day.count === 0) day.level = 0;
      else if (day.count <= p25) day.level = 1;
      else if (day.count <= p50) day.level = 2;
      else if (day.count <= p75) day.level = 3;
      else day.level = 4;
    }
  }

  return days;
}

// ── Link graph ─────────────────────────────────────────────

interface LinkGraphResult {
  totalLinks: number;
  hubNotes: HubNote[];
  orphanNotes: OrphanNote[];
  incomingMap: Map<string, Set<string>>;
}

function buildLinkGraph(
  files: FileStatEntry[],
  contentMap: Map<string, string>,
): LinkGraphResult {
  // Build label → filePath lookup (case-insensitive)
  const labelToPath = new Map<string, string>();
  for (const f of files) {
    labelToPath.set(f.fileName.toLowerCase(), f.filePath);
  }

  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  let totalLinks = 0;

  for (const f of files) {
    outgoing.set(f.filePath, new Set());
    if (!incoming.has(f.filePath)) incoming.set(f.filePath, new Set());
  }

  for (const f of files) {
    const content = contentMap.get(f.filePath);
    if (!content) continue;

    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    LINK_REGEX.lastIndex = 0;
    while ((match = LINK_REGEX.exec(content)) !== null) {
      const target = match[1].split("#")[0].trim().toLowerCase();
      if (!target || seen.has(target)) continue;
      seen.add(target);

      const targetPath = labelToPath.get(target);
      if (targetPath && targetPath !== f.filePath) {
        outgoing.get(f.filePath)!.add(targetPath);
        if (!incoming.has(targetPath)) incoming.set(targetPath, new Set());
        incoming.get(targetPath)!.add(f.filePath);
        totalLinks++;
      }
    }
  }

  // Hub notes: top 10 by total connections
  const connectionList: HubNote[] = files.map((f) => ({
    filePath: f.filePath,
    fileName: f.fileName,
    incomingCount: incoming.get(f.filePath)?.size || 0,
    outgoingCount: outgoing.get(f.filePath)?.size || 0,
    totalConnections: (incoming.get(f.filePath)?.size || 0) + (outgoing.get(f.filePath)?.size || 0),
  }));
  connectionList.sort((a, b) => b.totalConnections - a.totalConnections);
  const hubNotes = connectionList.slice(0, 10).filter((n) => n.totalConnections > 0);

  // Orphan notes: zero connections
  const orphanNotes: OrphanNote[] = connectionList
    .filter((n) => n.totalConnections === 0)
    .map((n) => ({ filePath: n.filePath, fileName: n.fileName }));

  return { totalLinks, hubNotes, orphanNotes, incomingMap: incoming };
}

// ── Tag distribution ───────────────────────────────────────

function buildTagDistribution(contentMap: Map<string, string>): { tags: TagStat[]; totalUnique: number } {
  const tagCounts = new Map<string, number>();

  for (const content of contentMap.values()) {
    const fileTags = new Set(parseTags(content));
    for (const tag of fileTags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const sorted = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return { tags: sorted.slice(0, 20), totalUnique: tagCounts.size };
}

// ── Daily streak ───────────────────────────────────────────

function computeDailyStreak(files: FileStatEntry[]): DailyStreak {
  const dailyDates = files
    .filter((f) => DAILY_NOTE_REGEX.test(f.fileName))
    .map((f) => f.fileName)
    .sort();

  if (dailyDates.length === 0) {
    return { current: 0, longest: 0, lastDate: null };
  }

  const unique = [...new Set(dailyDates)].sort();
  const todayStr = toDateStr(Date.now());

  // Longest streak
  let longest = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i++) {
    if (daysBetween(unique[i - 1], unique[i]) === 1) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // Current streak (must include today or yesterday)
  let current = 0;
  const last = unique[unique.length - 1];
  const gap = daysBetween(last, todayStr);
  if (gap <= 1) {
    current = 1;
    for (let i = unique.length - 2; i >= 0; i--) {
      if (daysBetween(unique[i], unique[i + 1]) === 1) {
        current++;
      } else {
        break;
      }
    }
  }

  return { current, longest, lastDate: last };
}

// ── Growth over time ───────────────────────────────────────

function buildGrowthTimeline(files: FileStatEntry[]): GrowthPoint[] {
  // Use birthtimeMs, fall back to mtimeMs if they match ctimeMs (Linux quirk)
  const monthCounts = new Map<string, number>();

  for (const f of files) {
    const ts = f.birthtimeMs > 0 && f.birthtimeMs !== f.mtimeMs ? f.birthtimeMs : f.mtimeMs;
    const ms = toMonthStr(ts);
    monthCounts.set(ms, (monthCounts.get(ms) || 0) + 1);
  }

  const months = Array.from(monthCounts.keys()).sort();
  if (months.length === 0) return [];

  const points: GrowthPoint[] = [];
  let cumulative = 0;
  for (const m of months) {
    cumulative += monthCounts.get(m)!;
    points.push({ month: m, label: toMonthLabel(m), cumulative });
  }

  return points;
}

// ── Vault health ───────────────────────────────────────────

function computeVaultHealth(
  files: FileStatEntry[],
  contentMap: Map<string, string>,
  incomingMap: Map<string, Set<string>>,
): VaultHealthScore {
  const total = files.length;
  if (total === 0) {
    return { overall: 0, withBacklinks: 0, withTags: 0, withFrontmatter: 0, totalNotes: 0 };
  }

  let bl = 0, tg = 0, fm = 0;

  for (const f of files) {
    const content = contentMap.get(f.filePath);
    if (!content) continue;

    if ((incomingMap.get(f.filePath)?.size || 0) > 0) bl++;
    if (parseTags(content).length > 0) tg++;
    if (hasFrontmatter(content)) fm++;
  }

  const withBacklinks = Math.round((bl / total) * 100);
  const withTags = Math.round((tg / total) * 100);
  const withFrontmatter = Math.round((fm / total) * 100);
  const overall = Math.round(withBacklinks * 0.4 + withTags * 0.3 + withFrontmatter * 0.3);

  return { overall, withBacklinks, withTags, withFrontmatter, totalNotes: total };
}

// ── Main entry point ───────────────────────────────────────

export async function computeVaultInsights(vaultPath: string): Promise<VaultInsightsData> {
  const api = window.electronAPI;

  // 1. Get file list with timestamps
  const files = await api.getFileStats(vaultPath);

  // 2. Read all file contents in batches
  const contentMap = await batchReadFiles(
    files.map((f) => f.filePath),
    (p) => api.readFile(p),
  );

  // 3. Overview stats
  let totalWords = 0;
  for (const content of contentMap.values()) {
    totalWords += content.split(/\s+/).filter(Boolean).length;
  }
  const totalNotes = files.length;
  const avgNoteLength = totalNotes > 0 ? Math.round(totalWords / totalNotes) : 0;

  // 4. Heatmap
  const heatmap = buildHeatmap(files);

  // 5. Link graph
  const { totalLinks, hubNotes, orphanNotes, incomingMap } = buildLinkGraph(files, contentMap);

  // 6. Tag distribution
  const { tags: tagDistribution, totalUnique: totalTags } = buildTagDistribution(contentMap);

  // 7. Daily streak
  const dailyStreak = computeDailyStreak(files);

  // 8. Growth over time
  const growthOverTime = buildGrowthTimeline(files);

  // 9. Vault health
  const vaultHealth = computeVaultHealth(files, contentMap, incomingMap);

  return {
    totalNotes,
    totalWords,
    totalTags,
    totalLinks,
    avgNoteLength,
    heatmap,
    hubNotes,
    orphanNotes,
    tagDistribution,
    dailyStreak,
    growthOverTime,
    vaultHealth,
  };
}
