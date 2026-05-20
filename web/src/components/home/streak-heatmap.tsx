'use client';

import { useMemo } from 'react';
import { Flame } from 'lucide-react';

interface StreakHeatmapProps {
  /** Completed-session dates in any order. Only date precision matters. */
  sessions: { started_at: string }[];
  /** Weekly session target (1..7). Streak hits when a week's count >= target. */
  target: number;
}

const WEEKS_SHOWN = 12;
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Start of ISO week (Monday 00:00 local) containing the given timestamp. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local-date key "YYYY-MM-DD" for grouping. */
function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface BuildResult {
  /** WEEKS_SHOWN columns of 7 daily session counts each (Mon..Sun). */
  grid: number[][];
  /** Current streak: consecutive *completed* prior weeks meeting target. */
  currentStreak: number;
  /** Best streak ever observed in the window (includes current week if it qualifies). */
  bestStreak: number;
  /** Current ISO-week session count. */
  thisWeekCount: number;
}

function buildHeatmapData(
  sessions: { started_at: string }[],
  target: number,
): BuildResult {
  const now = new Date();
  const thisMonday = startOfWeek(now);

  // Bucket sessions by local date.
  const countsByDate = new Map<string, number>();
  for (const s of sessions) {
    const d = new Date(s.started_at);
    const key = dateKey(d);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }

  // Build grid: column 0 = oldest week, column WEEKS_SHOWN-1 = current week.
  const grid: number[][] = [];
  for (let weekOffset = WEEKS_SHOWN - 1; weekOffset >= 0; weekOffset--) {
    const weekStart = new Date(thisMonday);
    weekStart.setDate(weekStart.getDate() - weekOffset * 7);
    const days: number[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + dow);
      // Don't count future days as "0 sessions" visually distinct — but the
      // shading is the same as a zero day, which is fine.
      days.push(countsByDate.get(dateKey(d)) ?? 0);
    }
    grid.push(days);
  }

  // Per-week totals
  const weekTotals = grid.map((days) => days.reduce((a, b) => a + b, 0));
  const thisWeekCount = weekTotals[weekTotals.length - 1] ?? 0;

  // Current streak: count back from the *previous* completed week (so the
  // streak number is stable mid-week and ticks up only when the current week
  // also hits target).
  let currentStreak = 0;
  for (let i = weekTotals.length - 2; i >= 0; i--) {
    if (weekTotals[i] >= target) currentStreak++;
    else break;
  }
  // If this week has also hit target, fold it in.
  if (thisWeekCount >= target) currentStreak += 1;

  // Best streak across the window.
  let bestStreak = 0;
  let run = 0;
  for (const total of weekTotals) {
    if (total >= target) {
      run += 1;
      if (run > bestStreak) bestStreak = run;
    } else {
      run = 0;
    }
  }

  return { grid, currentStreak, bestStreak, thisWeekCount };
}

// ── Cell shading tiers ────────────────────────────────────────────────────────

/** Maps a day's session count to a translucent primary fill. */
function cellStyle(count: number): React.CSSProperties {
  if (count === 0) return { background: 'oklch(1 0 0 / 0.05)' };
  if (count === 1) return { background: 'oklch(0.75 0.18 55 / 0.35)' };
  if (count === 2) return { background: 'oklch(0.75 0.18 55 / 0.65)' };
  return { background: 'oklch(0.75 0.18 55 / 0.95)' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StreakHeatmap({ sessions, target }: StreakHeatmapProps) {
  const { grid, currentStreak, bestStreak, thisWeekCount } = useMemo(
    () => buildHeatmapData(sessions, target),
    [sessions, target],
  );

  const overshoot = Math.max(0, thisWeekCount - target);
  const remaining = Math.max(0, target - thisWeekCount);

  const footerCopy = thisWeekCount === 0
    ? `0 of ${target} this week`
    : remaining > 0
      ? `${thisWeekCount} of ${target} this week · ${remaining} to go`
      : overshoot > 0
        ? `${thisWeekCount} of ${target} this week · +${overshoot}`
        : `${thisWeekCount} of ${target} this week · goal hit`;

  return (
    <div className="action-card flex flex-col gap-3 rounded-2xl px-4 py-4">
      {/* Header: streak + best */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame
            className="h-4 w-4"
            style={{ color: currentStreak > 0 ? 'oklch(0.78 0.17 45)' : 'oklch(0.65 0 0 / 0.5)' }}
          />
          <span className="font-display text-base font-bold">
            {currentStreak === 0 ? 'No streak yet' : `${currentStreak} week${currentStreak === 1 ? '' : 's'}`}
          </span>
        </div>
        {bestStreak > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">best · {bestStreak}</span>
        )}
      </div>

      {/* Heatmap */}
      <div className="flex gap-2">
        {/* Day labels */}
        <div className="flex flex-col gap-[3px] pt-px">
          {DAY_LABELS.map((label, i) => (
            <span
              key={i}
              className="flex h-3 w-3 items-center justify-center text-[10px] font-medium leading-none text-muted-foreground/60"
            >
              {label}
            </span>
          ))}
        </div>

        {/* Week columns */}
        <div className="flex flex-1 gap-[3px]">
          {grid.map((days, weekIdx) => (
            <div key={weekIdx} className="flex flex-1 flex-col gap-[3px]">
              {days.map((count, dayIdx) => (
                <div
                  key={dayIdx}
                  className="aspect-square w-full rounded-[3px]"
                  style={cellStyle(count)}
                  aria-label={`${count} session${count === 1 ? '' : 's'}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground tabular-nums">
        {footerCopy}
      </p>
    </div>
  );
}
