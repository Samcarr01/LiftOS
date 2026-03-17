'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Search,
  Trophy,
  Award,
  BarChart3,
} from 'lucide-react';
import { useExerciseList, useProgress, usePersonalRecords } from '@/hooks/use-progress';
import { useWeeklySummary } from '@/hooks/use-weekly-summary';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartEmptyState } from '@/components/progress/chart-empty-state';
import { Input } from '@/components/ui/input';
import type { TimeRange } from '@/hooks/use-progress';

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
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: 'All', value: 'all' },
];

const PR_LABEL: Record<string, string> = {
  best_weight: 'Weight',
  best_reps_at_weight: 'Reps',
  best_e1rm: 'Est. 1RM',
  best_volume: 'Volume',
};

export default function ProgressPage() {
  const exercises = useExerciseList();
  const [exerciseId, setExerciseId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<TimeRange>('3m');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedExercise = exercises.find((exercise) => exercise.id === exerciseId) ?? null;
  const filteredExercises = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return exercises;

    return exercises.filter((exercise) => (
      exercise.name.toLowerCase().includes(query)
      || exercise.muscleGroups.some((muscle) => muscle.toLowerCase().includes(query))
      || exercise.trackingLabel.toLowerCase().includes(query)
    ));
  }, [exercises, search]);

  const { points, summary, loading: progressLoading } = useProgress(
    selectedExercise?.exerciseIds ?? null,
    range,
  );
  const records = usePersonalRecords(selectedExercise?.exerciseIds ?? null);
  const {
    summary: weeklySummary,
    loading: weeklyLoading,
    error: weeklyError,
    generated,
    generate,
  } = useWeeklySummary();

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm">
        <h1 className="text-lg font-bold">Progress</h1>
      </header>

      <div className="space-y-6 px-4 pt-4">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Search className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Pick an exercise</h2>
              <p className="text-xs text-muted-foreground">Duplicate names are grouped together so the list stays clean.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your exercises"
              className="h-10"
            />

            {exercises.length === 0 ? (
              <Skeleton className="h-10 w-full rounded-xl" />
            ) : (
              <select
                value={exerciseId}
                onChange={(event) => setExerciseId(event.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Choose an exercise...</option>
                {filteredExercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                    {exercise.duplicateCount > 1 ? ` (${exercise.duplicateCount} copies)` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {selectedExercise && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{selectedExercise.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedExercise.trackingLabel}</p>
                  {selectedExercise.duplicateCount > 1 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      This view combines {selectedExercise.duplicateCount} saved exercises with the same name.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="inline-flex h-10 items-center gap-1 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  <BarChart3 className="h-4 w-4" />
                  Advanced
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>

              {progressLoading ? (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <Skeleton className="h-20 rounded-xl" />
                  <Skeleton className="h-20 rounded-xl" />
                  <Skeleton className="h-20 rounded-xl" />
                </div>
              ) : summary ? (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <StatCard label="Latest Result" value={summary.latestResult ?? 'No data'} />
                    <StatCard label="Current Best" value={summary.currentBest ?? 'No data'} />
                    <StatCard label="Workout Days" value={String(summary.trainingDays)} />
                  </div>

                  <div className="mt-3 rounded-xl bg-muted/40 px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Trend</p>
                    <p className="mt-1 text-sm text-foreground">{summary.trendNote}</p>
                  </div>
                </>
              ) : (
                <ChartEmptyState message="No completed sessions yet for this exercise." />
              )}
            </div>

            {records.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                  Personal Records
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {records.map((record) => (
                    <div key={record.record_type} className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2">
                      <Award className="h-4 w-4 shrink-0 text-yellow-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">{PR_LABEL[record.record_type] ?? record.record_type}</p>
                        <p className="text-sm font-bold">{record.record_value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {showAdvanced && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap gap-1.5">
                  {TIME_RANGES.map((timeRange) => (
                    <button
                      key={timeRange.value}
                      onClick={() => setRange(timeRange.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        range === timeRange.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {timeRange.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  {!summary?.chartReady ? (
                    <ChartEmptyState message="Advanced charts are shown for weighted lifts with reps." />
                  ) : progressLoading ? (
                    <Skeleton className="h-44 w-full rounded-xl" />
                  ) : points.length === 0 ? (
                    <ChartEmptyState message="No chart data yet for this exercise." />
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Set</p>
                        <TopSetChart points={points} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estimated 1RM</p>
                        <E1rmChart points={points} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Weight Lifted</p>
                        <VolumeChart points={points} />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Weekly Summary</h2>
            <button
              onClick={() => void generate()}
              disabled={weeklyLoading}
              className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 disabled:opacity-50"
            >
              {weeklyLoading
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />
              }
              {generated ? 'Refresh' : 'Generate'}
            </button>
          </div>

          {weeklyError && (
            <p className="text-xs text-destructive">{weeklyError}</p>
          )}

          {!generated && !weeklyLoading && (
            <p className="text-sm text-muted-foreground">
              Generate a plain-English summary of your week when you want it.
            </p>
          )}

          {weeklyLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}

          {weeklySummary && !weeklyLoading && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted py-2">
                  <p className="font-bold">{weeklySummary.workouts_completed}</p>
                  <p className="text-[10px] text-muted-foreground">Workouts</p>
                </div>
                <div className="rounded-lg bg-muted py-2">
                  <p className="font-bold">{weeklySummary.total_sets}</p>
                  <p className="text-[10px] text-muted-foreground">Sets</p>
                </div>
                <div className="rounded-lg bg-muted py-2">
                  <p className="font-bold">{Math.round(weeklySummary.total_volume_kg)}kg</p>
                  <p className="text-[10px] text-muted-foreground">Total Weight</p>
                </div>
              </div>
              {weeklySummary.strongest_lift && (
                <p className="text-muted-foreground">
                  Best lift: <strong>{weeklySummary.strongest_lift.exercise}</strong> - {weeklySummary.strongest_lift.value}
                </p>
              )}
              {weeklySummary.most_improved_group && (
                <p className="text-muted-foreground">
                  Most improved: <strong>{weeklySummary.most_improved_group}</strong>
                </p>
              )}
              {weeklySummary.insight && (
                <p className="leading-relaxed text-muted-foreground">{weeklySummary.insight}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-bold">{value}</p>
    </div>
  );
}
