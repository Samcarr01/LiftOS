'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Search,
  Trophy,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ChartEmptyState } from '@/components/progress/chart-empty-state';
import { useExerciseList, usePersonalRecords, useProgress } from '@/hooks/use-progress';
import { useWeeklySummary } from '@/hooks/use-weekly-summary';
import type { TimeRange } from '@/hooks/use-progress';

const TopSetChart = dynamic(
  () => import('@/components/progress/top-set-chart').then((module) => module.TopSetChart),
  { ssr: false, loading: () => <Skeleton className="h-52 w-full rounded-[28px]" /> },
);
const E1rmChart = dynamic(
  () => import('@/components/progress/e1rm-chart').then((module) => module.E1rmChart),
  { ssr: false, loading: () => <Skeleton className="h-52 w-full rounded-[28px]" /> },
);
const VolumeChart = dynamic(
  () => import('@/components/progress/volume-chart').then((module) => module.VolumeChart),
  { ssr: false, loading: () => <Skeleton className="h-52 w-full rounded-[28px]" /> },
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
  best_volume: 'Total Weight',
};

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="stat-card">
      <p className="text-stat">{value}</p>
      <p className="text-caption">{label}</p>
    </div>
  );
}

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
    <div className="page-shell">
      <div className="page-content py-5 md:py-7">
        <div className="page-header">
          <h1 className="page-header-title">Progress</h1>
        </div>

        <div className="mt-5 space-y-5">
          {/* Exercise picker */}
          <section className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search exercises"
                className="h-10 rounded-xl border-white/10 bg-black/15 pl-10 text-sm"
              />
            </div>

            {exercises.length === 0 ? (
              <Skeleton className="h-10 w-full rounded-xl" />
            ) : (
              <select
                value={exerciseId}
                onChange={(event) => setExerciseId(event.target.value)}
                className="h-10 w-full rounded-xl border border-white/10 bg-black/15 px-3 text-sm text-foreground outline-none focus:border-primary/50"
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
          </section>

          {selectedExercise && (
            <section>
              <div className="content-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-bold">{selectedExercise.name}</h2>
                    <p className="text-sm text-muted-foreground">{selectedExercise.trackingLabel}</p>
                  </div>

                  <button
                    onClick={() => setShowAdvanced((value) => !value)}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Charts
                    {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {progressLoading ? (
                  <div className="mt-4 grid gap-2 grid-cols-3">
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                  </div>
                ) : summary ? (
                  <>
                    <div className="mt-4 grid gap-2 grid-cols-3">
                      <StatCard label="Latest" value={summary.latestResult ?? 'No data'} />
                      <StatCard label="Best" value={summary.currentBest ?? 'No data'} />
                      <StatCard label="Sessions" value={String(summary.trainingDays)} />
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/8 px-3 py-2.5">
                      <p className="text-sm text-muted-foreground">Trend</p>
                      <p className="mt-1 text-sm text-foreground">{summary.trendNote}</p>
                    </div>
                  </>
                ) : (
                  <div className="mt-4">
                    <ChartEmptyState message="No completed sessions yet for this exercise." />
                  </div>
                )}
              </div>

              {records.length > 0 && (
                <div className="grid gap-2 grid-cols-2">
                  {records.map((record) => (
                    <div
                      key={record.record_type}
                      className="flex items-center gap-2 rounded-2xl border border-[oklch(0.80_0.16_85/0.25)] bg-[oklch(0.80_0.16_85/0.12)] px-3 py-2.5"
                    >
                      <Award className="h-4 w-4 shrink-0 text-[oklch(0.85_0.15_85)]" />
                      <div className="min-w-0">
                        <p className="text-caption">
                          {PR_LABEL[record.record_type] ?? record.record_type}
                        </p>
                        <p className="font-display text-sm font-semibold">{record.record_value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showAdvanced && (
                <div className="content-card mt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {TIME_RANGES.map((timeRange) => (
                      <button
                        key={timeRange.value}
                        onClick={() => setRange(timeRange.value)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                          range === timeRange.value
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-white/[0.14] bg-white/[0.04] text-muted-foreground hover:bg-white/8'
                        }`}
                      >
                        {timeRange.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4">
                    {!summary?.chartReady ? (
                      <ChartEmptyState message="Charts available for weighted lifts with reps." />
                    ) : progressLoading ? (
                      <Skeleton className="h-48 w-full rounded-xl" />
                    ) : points.length === 0 ? (
                      <ChartEmptyState message="No chart data yet." />
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <p className="mb-2 text-overline">Top Set</p>
                          <TopSetChart points={points} />
                        </div>
                        <div>
                          <p className="mb-2 text-overline">Est. 1RM</p>
                          <E1rmChart points={points} />
                        </div>
                        <div>
                          <p className="mb-2 text-overline">Volume</p>
                          <VolumeChart points={points} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          <section>
            <div className="content-card">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-bold">Weekly Summary</h2>
                <button
                  onClick={() => void generate()}
                  disabled={weeklyLoading}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs font-semibold text-muted-foreground disabled:opacity-60 hover:text-foreground"
                >
                  {weeklyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {generated ? 'Refresh' : 'Generate'}
                </button>
              </div>

              {weeklyError && (
                <p className="mt-3 text-sm text-destructive">{weeklyError}</p>
              )}

              {weeklyLoading ? (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : weeklySummary ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-2 grid-cols-3">
                    <StatCard label="Workouts" value={String(weeklySummary.workouts_completed)} />
                    <StatCard label="Sets" value={String(weeklySummary.total_sets)} />
                    <StatCard label="Volume" value={`${Math.round(weeklySummary.total_volume_kg)}kg`} />
                  </div>

                  <div className="rounded-2xl border border-white/8 px-3 py-2.5 space-y-1">
                    {weeklySummary.strongest_lift && (
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Strongest:</span> {weeklySummary.strongest_lift.exercise} · {weeklySummary.strongest_lift.value}
                      </p>
                    )}
                    {weeklySummary.most_improved_group && (
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Most improved:</span> {weeklySummary.most_improved_group}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {weeklySummary.insight ?? 'Keep logging for a clearer weekly picture.'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Log a few sessions, then generate your weekly recap.
                </p>
              )}
            </div>
          </section>

          {!selectedExercise && exercises.length > 0 && (
            <div className="content-card py-8 text-center">
              <Trophy className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">Choose an exercise above</p>
              <p className="mt-1 text-sm text-muted-foreground">
                See your latest result, best, and trend.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
