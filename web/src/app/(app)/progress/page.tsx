'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Loader2, Trophy, Award, RefreshCw } from 'lucide-react';
import { useExerciseList, useProgress, usePersonalRecords } from '@/hooks/use-progress';
import { useWeeklySummary } from '@/hooks/use-weekly-summary';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartEmptyState } from '@/components/progress/chart-empty-state';
import type { TimeRange } from '@/hooks/use-progress';

// Dynamic imports — Recharts requires window (no SSR)
const TopSetChart = dynamic(
  () => import('@/components/progress/top-set-chart').then((m) => m.TopSetChart),
  { ssr: false, loading: () => <Skeleton className="h-44 w-full rounded-xl" /> },
);
const E1rmChart = dynamic(
  () => import('@/components/progress/e1rm-chart').then((m) => m.E1rmChart),
  { ssr: false, loading: () => <Skeleton className="h-44 w-full rounded-xl" /> },
);
const VolumeChart = dynamic(
  () => import('@/components/progress/volume-chart').then((m) => m.VolumeChart),
  { ssr: false, loading: () => <Skeleton className="h-44 w-full rounded-xl" /> },
);

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '1M',  value: '1m'  },
  { label: '3M',  value: '3m'  },
  { label: '6M',  value: '6m'  },
  { label: '1Y',  value: '1y'  },
  { label: 'All', value: 'all' },
];

const TABS = ['Top Set', 'Est. 1RM', 'Volume'] as const;
type Tab = typeof TABS[number];

const PR_LABEL: Record<string, string> = {
  best_weight:         'Weight',
  best_reps_at_weight: 'Reps',
  best_e1rm:           'Est. 1RM',
  best_volume:         'Volume',
};

export default function ProgressPage() {
  const exercises                 = useExerciseList();
  const [exerciseId, setExId]     = useState<string | null>(null);
  const [range, setRange]         = useState<TimeRange>('3m');
  const [tab, setTab]             = useState<Tab>('Est. 1RM');

  const { points, loading: ptsLoading } = useProgress(exerciseId, range);
  const records                          = usePersonalRecords(exerciseId);
  const { summary, loading: sumLoading, error: sumErr, generated, generate } = useWeeklySummary();

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3">
        <h1 className="text-lg font-bold">Progress</h1>
      </header>

      <div className="px-4 pt-4 space-y-6">

        {/* ── Exercise picker ───────────────────────────────────────── */}
        <section>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Exercise
          </label>
          {exercises.length === 0 ? (
            <Skeleton className="h-10 w-full rounded-xl" />
          ) : (
            <select
              value={exerciseId ?? ''}
              onChange={(e) => setExId(e.target.value || null)}
              className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select an exercise…</option>
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          )}
        </section>

        {exerciseId && (
          <>
            {/* ── Time range ───────────────────────────────────────── */}
            <div className="flex gap-1.5">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                    range === r.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* ── Chart tabs ───────────────────────────────────────── */}
            <div>
              <div className="flex gap-1.5 mb-4">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                      tab === t
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {ptsLoading ? (
                <Skeleton className="h-44 w-full rounded-xl" />
              ) : points.length === 0 ? (
                <ChartEmptyState message="No data yet for this exercise." />
              ) : (
                <>
                  {tab === 'Top Set'   && <TopSetChart  points={points} />}
                  {tab === 'Est. 1RM'  && <E1rmChart    points={points} />}
                  {tab === 'Volume'    && <VolumeChart  points={points} />}
                </>
              )}
            </div>

            {/* ── Personal Records ─────────────────────────────────── */}
            {records.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                  Personal Records
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {records.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2">
                      <Award className="h-4 w-4 shrink-0 text-yellow-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">{PR_LABEL[r.record_type] ?? r.record_type}</p>
                        <p className="text-sm font-bold">{r.record_value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── Weekly summary ─────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">Weekly Summary</h2>
            <button
              onClick={() => void generate()}
              disabled={sumLoading}
              className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 disabled:opacity-50"
            >
              {sumLoading
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />
              }
              {generated ? 'Regenerate' : 'Generate'}
            </button>
          </div>

          {sumErr && (
            <p className="text-xs text-destructive">{sumErr}</p>
          )}

          {!generated && !sumLoading && (
            <p className="text-sm text-muted-foreground">
              Tap Generate for an AI-written summary of your week.
            </p>
          )}

          {sumLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}

          {summary && !sumLoading && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted py-2">
                  <p className="font-bold">{summary.workouts_completed}</p>
                  <p className="text-[10px] text-muted-foreground">Workouts</p>
                </div>
                <div className="rounded-lg bg-muted py-2">
                  <p className="font-bold">{summary.total_sets}</p>
                  <p className="text-[10px] text-muted-foreground">Sets</p>
                </div>
                <div className="rounded-lg bg-muted py-2">
                  <p className="font-bold">{Math.round(summary.total_volume_kg)}kg</p>
                  <p className="text-[10px] text-muted-foreground">Volume</p>
                </div>
              </div>
              {summary.strongest_lift && (
                <p className="text-muted-foreground">
                  💪 Best lift: <strong>{summary.strongest_lift.exercise}</strong> — {summary.strongest_lift.value}
                </p>
              )}
              {summary.most_improved_group && (
                <p className="text-muted-foreground">
                  📈 Most improved: <strong>{summary.most_improved_group}</strong>
                </p>
              )}
              {summary.insight && (
                <p className="leading-relaxed text-muted-foreground">{summary.insight}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
