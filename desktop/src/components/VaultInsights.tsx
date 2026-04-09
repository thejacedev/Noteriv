"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  computeVaultInsights,
  type VaultInsightsData,
  type HeatmapDay,
} from "@/lib/vault-insights-utils";
import "@/styles/vault-insights.css";

interface VaultInsightsProps {
  vaultPath: string;
  onFileSelect: (filePath: string) => void;
  onClose: () => void;
}

// ── Heatmap constants ──────────────────────────────────────

const CELL_SIZE = 11;
const CELL_GAP = 2;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const HEATMAP_ROWS = 7;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LEVEL_OPACITY = [0, 0.25, 0.5, 0.75, 1.0];

// ── Component ──────────────────────────────────────────────

export default function VaultInsights({ vaultPath, onFileSelect, onClose }: VaultInsightsProps) {
  const [data, setData] = useState<VaultInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const colorsRef = useRef<{ accent: string; bgSurface: string; green: string; yellow: string; red: string }>({
    accent: "#89b4fa",
    bgSurface: "#313244",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    red: "#f38ba8",
  });

  // Resolve CSS variable colors for SVG fills
  useEffect(() => {
    const el = document.documentElement;
    const cs = getComputedStyle(el);
    colorsRef.current = {
      accent: cs.getPropertyValue("--accent").trim() || "#89b4fa",
      bgSurface: cs.getPropertyValue("--bg-surface").trim() || "#313244",
      green: cs.getPropertyValue("--green").trim() || "#a6e3a1",
      yellow: cs.getPropertyValue("--yellow").trim() || "#f9e2af",
      red: cs.getPropertyValue("--red").trim() || "#f38ba8",
    };
  }, []);

  // Load data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    computeVaultInsights(vaultPath).then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [vaultPath]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const healthColor = (pct: number): string => {
    if (pct >= 70) return colorsRef.current.green;
    if (pct >= 40) return colorsRef.current.yellow;
    return colorsRef.current.red;
  };

  // ── Heatmap rendering ──────────────────────────────────

  function renderHeatmap(heatmap: HeatmapDay[]) {
    // First day of the heatmap tells us which column to start
    const firstDate = new Date(heatmap[0].date + "T00:00:00");
    const startDay = firstDate.getDay(); // 0=Sun

    const cols = Math.ceil((heatmap.length + startDay) / 7);
    const labelW = 28;
    const svgW = labelW + cols * CELL_STEP;
    const svgH = 20 + HEATMAP_ROWS * CELL_STEP;

    // Month labels
    const monthLabels: { x: number; label: string }[] = [];
    let lastMonth = -1;
    for (let i = 0; i < heatmap.length; i++) {
      const d = new Date(heatmap[i].date + "T00:00:00");
      const m = d.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        const col = Math.floor((i + startDay) / 7);
        monthLabels.push({ x: labelW + col * CELL_STEP, label: MONTH_NAMES[m] });
      }
    }

    const { accent, bgSurface } = colorsRef.current;

    return (
      <div className="vi-heatmap-scroll">
        <svg width={svgW} height={svgH}>
          {/* Month labels */}
          {monthLabels.map((ml, i) => (
            <text key={i} x={ml.x} y={10} fontSize={10} fill="var(--text-muted)">{ml.label}</text>
          ))}
          {/* Day labels */}
          {DAY_LABELS.map((dl, i) => (
            dl ? <text key={i} x={0} y={20 + i * CELL_STEP + CELL_SIZE - 2} fontSize={9} fill="var(--text-muted)">{dl}</text> : null
          ))}
          {/* Cells */}
          {heatmap.map((day, i) => {
            const col = Math.floor((i + startDay) / 7);
            const row = (i + startDay) % 7;
            return (
              <rect
                key={day.date}
                x={labelW + col * CELL_STEP}
                y={20 + row * CELL_STEP}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={2}
                fill={day.level === 0 ? bgSurface : accent}
                opacity={day.level === 0 ? 1 : LEVEL_OPACITY[day.level]}
                onMouseEnter={(e) => {
                  setTooltip({
                    x: e.clientX + 10,
                    y: e.clientY - 30,
                    text: `${day.date}: ${day.count} file${day.count !== 1 ? "s" : ""} modified`,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </svg>
        <div className="vi-heatmap-legend">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((lvl) => (
            <div
              key={lvl}
              className="vi-heatmap-legend-cell"
              style={{
                background: lvl === 0 ? bgSurface : accent,
                opacity: lvl === 0 ? 1 : LEVEL_OPACITY[lvl],
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    );
  }

  // ── Tag distribution bars ──────────────────────────────

  function renderTagBars() {
    if (!data || data.tagDistribution.length === 0) return <p className="vi-empty">No tags found</p>;
    const max = data.tagDistribution[0].count;
    return (
      <div>
        {data.tagDistribution.map((t) => (
          <div key={t.tag} className="vi-tag-bar-row">
            <span className="vi-tag-label" title={`#${t.tag}`}>#{t.tag}</span>
            <div className="vi-tag-bar-track">
              <div
                className="vi-tag-bar-fill"
                style={{
                  width: `${(t.count / max) * 100}%`,
                  background: colorsRef.current.accent,
                }}
              />
            </div>
            <span className="vi-tag-count">{t.count}</span>
          </div>
        ))}
      </div>
    );
  }

  // ── Growth line chart ──────────────────────────────────

  function renderGrowthChart() {
    if (!data || data.growthOverTime.length === 0) return <p className="vi-empty">No data yet</p>;
    const points = data.growthOverTime;
    const maxVal = points[points.length - 1].cumulative;
    const chartW = Math.max(400, points.length * 50);
    const chartH = 140;
    const padL = 40;
    const padR = 10;
    const padT = 10;
    const padB = 30;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;

    const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;
    const yScale = maxVal > 0 ? plotH / maxVal : 0;

    const linePoints = points.map((p, i) => {
      const x = padL + i * xStep;
      const y = padT + plotH - p.cumulative * yScale;
      return `${x},${y}`;
    }).join(" ");

    const areaPoints = `${padL},${padT + plotH} ${linePoints} ${padL + (points.length - 1) * xStep},${padT + plotH}`;

    const { accent } = colorsRef.current;

    // Y-axis ticks
    const ticks = [0, Math.round(maxVal / 2), maxVal];

    return (
      <div className="vi-growth-chart">
        <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`}>
          <defs>
            <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.3} />
              <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {/* Y-axis ticks */}
          {ticks.map((v) => {
            const y = padT + plotH - v * yScale;
            return (
              <g key={v}>
                <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="var(--border)" strokeWidth={0.5} />
                <text x={padL - 6} y={y + 4} fontSize={9} fill="var(--text-muted)" textAnchor="end">{v}</text>
              </g>
            );
          })}
          {/* Area fill */}
          <polygon points={areaPoints} fill="url(#growthGrad)" />
          {/* Line */}
          <polyline points={linePoints} fill="none" stroke={accent} strokeWidth={2} />
          {/* Dots */}
          {points.map((p, i) => {
            const x = padL + i * xStep;
            const y = padT + plotH - p.cumulative * yScale;
            return <circle key={p.month} cx={x} cy={y} r={3} fill={accent} />;
          })}
          {/* X-axis labels (show every other if crowded) */}
          {points.map((p, i) => {
            const skip = points.length > 12 ? 2 : 1;
            if (i % skip !== 0 && i !== points.length - 1) return null;
            const x = padL + i * xStep;
            return (
              <text key={p.month} x={x} y={chartH - 4} fontSize={9} fill="var(--text-muted)" textAnchor="middle">
                {p.label.split(" ")[0]}
              </text>
            );
          })}
        </svg>
      </div>
    );
  }

  // ── Health bars ────────────────────────────────────────

  function renderHealth() {
    if (!data) return null;
    const h = data.vaultHealth;
    const items = [
      { label: "With backlinks", pct: h.withBacklinks },
      { label: "With tags", pct: h.withTags },
      { label: "With frontmatter", pct: h.withFrontmatter },
    ];
    return (
      <div>
        <div className="vi-health-grid">
          {items.map((item) => (
            <>
              <span key={item.label + "-l"} className="vi-health-label">{item.label}</span>
              <div key={item.label + "-b"} className="vi-health-bar-track">
                <div
                  className="vi-health-bar-fill"
                  style={{ width: `${item.pct}%`, background: healthColor(item.pct) }}
                />
              </div>
            </>
          ))}
        </div>
        <div className="vi-health-overall">
          <div>
            <div className="vi-health-score" style={{ color: healthColor(h.overall) }}>
              {h.overall}%
            </div>
            <div className="vi-health-score-label">Overall Health</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────

  return (
    <div className="vault-insights-overlay" onClick={handleBackdropClick}>
      <div className="vault-insights-container">
        {/* Header */}
        <div className="vault-insights-header">
          <h2>Vault Insights</h2>
          <button className="vault-insights-close" onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="vault-insights-loading">
            <div className="vault-insights-spinner" />
            <span>Analyzing vault...</span>
          </div>
        ) : data ? (
          <div className="vault-insights-grid">
            {/* Heatmap — full width */}
            <div className="vi-card vi-card-full">
              <h3>Writing Activity</h3>
              {renderHeatmap(data.heatmap)}
            </div>

            {/* Overview stats */}
            <div className="vi-card">
              <h3>Overview</h3>
              <div className="vi-stats-row">
                <div className="vi-stat">
                  <div className="vi-stat-value">{formatNumber(data.totalNotes)}</div>
                  <div className="vi-stat-label">Notes</div>
                </div>
                <div className="vi-stat">
                  <div className="vi-stat-value">{formatNumber(data.totalWords)}</div>
                  <div className="vi-stat-label">Words</div>
                </div>
                <div className="vi-stat">
                  <div className="vi-stat-value">{formatNumber(data.totalTags)}</div>
                  <div className="vi-stat-label">Tags</div>
                </div>
                <div className="vi-stat">
                  <div className="vi-stat-value">{formatNumber(data.totalLinks)}</div>
                  <div className="vi-stat-label">Links</div>
                </div>
                <div className="vi-stat">
                  <div className="vi-stat-value">{formatNumber(data.avgNoteLength)}</div>
                  <div className="vi-stat-label">Avg Words</div>
                </div>
              </div>
            </div>

            {/* Daily streak */}
            <div className="vi-card">
              <h3>Daily Notes Streak</h3>
              <div className="vi-streak-row">
                <div className="vi-streak-item">
                  <div className="vi-streak-value">{data.dailyStreak.current}</div>
                  <div className="vi-streak-label">Current</div>
                </div>
                <div className="vi-streak-item">
                  <div className="vi-streak-value">{data.dailyStreak.longest}</div>
                  <div className="vi-streak-label">Longest</div>
                </div>
              </div>
              {data.dailyStreak.lastDate && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
                  Last: {data.dailyStreak.lastDate}
                </div>
              )}
            </div>

            {/* Hub notes */}
            <div className="vi-card">
              <h3>Hub Notes (Most Connected)</h3>
              {data.hubNotes.length === 0 ? (
                <p className="vi-empty">No connected notes</p>
              ) : (
                <div className="vi-note-list">
                  {data.hubNotes.map((n) => (
                    <button
                      key={n.filePath}
                      className="vi-note-item"
                      onClick={() => onFileSelect(n.filePath)}
                    >
                      <span className="vi-note-name">{n.fileName}</span>
                      <span className="vi-note-count">
                        {n.incomingCount} in / {n.outgoingCount} out
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Orphan notes */}
            <div className="vi-card">
              <h3>Orphan Notes (No Links)</h3>
              {data.orphanNotes.length === 0 ? (
                <p className="vi-empty">No orphan notes</p>
              ) : (
                <div className="vi-note-list">
                  {data.orphanNotes.map((n) => (
                    <button
                      key={n.filePath}
                      className="vi-note-item"
                      onClick={() => onFileSelect(n.filePath)}
                    >
                      <span className="vi-note-name">{n.fileName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tag distribution */}
            <div className="vi-card">
              <h3>Top Tags</h3>
              {renderTagBars()}
            </div>

            {/* Growth over time */}
            <div className="vi-card">
              <h3>Growth Over Time</h3>
              {renderGrowthChart()}
            </div>

            {/* Vault health — full width */}
            <div className="vi-card vi-card-full">
              <h3>Vault Health</h3>
              {renderHealth()}
            </div>
          </div>
        ) : null}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="vi-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
