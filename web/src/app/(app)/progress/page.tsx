'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Brain,
  ChevronRight,
  Search,
  Trophy,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ChartEmptyState } from '@/components/progress/chart-empty-state';
import { useExerciseList, usePersonalRecords, useProgress } from '@/hooks/use-progress';
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

  const hasWeightReps = selectedExercise?.trackingLabel.toLowerCase().includes('weight')
    && selectedExercise?.trackingLabel.toLowerCase().includes('reps');

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
            <section className="space-y-3">
              {/* Exercise header */}
              <div className="content-card">
                <h2 className="font-display text-base font-bold">{selectedExercise.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedExercise.trackingLabel}</p>
              </div>

              {/* Time range + Charts — always visible */}
              {hasWeightReps && (
                <div className="content-card">
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
                    {progressLoading ? (
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

              {/* Stat cards */}
              {progressLoading ? (
                <div className="grid gap-2 grid-cols-3">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              ) : summary ? (
                <>
                  <div className="grid gap-2 grid-cols-3">
                    <StatCard label="Latest" value={summary.latestResult ?? 'No data'} />
                    <StatCard label="Best" value={summary.currentBest ?? 'No data'} />
                    <StatCard label="Sessions" value={String(summary.trainingDays)} />
                  </div>

                  <div className="rounded-2xl border border-white/8 px-3 py-2.5">
                    <p className="text-sm text-muted-foreground">Trend</p>
                    <p className="mt-1 text-sm text-foreground">{summary.trendNote}</p>
                  </div>
                </>
              ) : records.length > 0 ? null : (
                <div className="content-card">
                  <ChartEmptyState message="No completed sessions yet for this exercise." />
                </div>
              )}

              {/* PR cards — glassmorphic style */}
              {records.length > 0 && (
                <div className="grid gap-2 grid-cols-2">
                  {records.map((record) => (
                    <div
                      key={record.record_type}
                      className="flex items-center gap-2 rounded-2xl border border-white/[0.10] bg-white/[0.04] px-3 py-2.5"
                    >
                      <Award className="h-4 w-4 shrink-0 text-primary" />
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
            </section>
          )}

          {/* Training Summary link */}
          <section>
            <Link
              href="/progress/weekly"
              className="action-card group flex items-center gap-3.5 rounded-2xl px-4 py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Brain className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-card-title">Training Summary</p>
                <p className="mt-0.5 text-caption">30-day AI coaching report</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
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
