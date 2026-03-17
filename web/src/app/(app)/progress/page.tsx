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
  Sparkles,
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
    <div className="premium-card px-4 py-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
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
        <section className="page-hero">
          <span className="hero-kicker">Progress</span>
          <h1 className="page-title mt-4">Make your training trend easy to read</h1>
          <p className="page-subtitle mt-3">
            Pick an exercise, see the latest result, current best, and a plain-language trend first. Charts and heavier analytics stay there when you want them, but they no longer run the page.
          </p>
        </section>

        <div className="mt-8 space-y-8">
          <section className="section-shell">
            <div className="premium-card page-reveal delay-2 px-5 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                  <Search className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl font-semibold">Pick an exercise</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Duplicate names are grouped together so the list stays clean. Search by exercise name, muscle group, or the way you track it.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search your exercises"
                  className="h-12 rounded-2xl border-white/10 bg-black/15"
                />

                {exercises.length === 0 ? (
                  <Skeleton className="h-12 w-full rounded-2xl" />
                ) : (
                  <select
                    value={exerciseId}
                    onChange={(event) => setExerciseId(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-black/15 px-4 text-sm text-foreground outline-none focus:border-primary/50"
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
            </div>
          </section>

          {selectedExercise && (
            <section className="section-shell">
              <div className="premium-card page-reveal delay-3 px-5 py-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <span className="hero-kicker">Selected Exercise</span>
                    <h2 className="mt-4 font-display text-3xl font-semibold">{selectedExercise.name}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{selectedExercise.trackingLabel}</p>
                    {selectedExercise.duplicateCount > 1 && (
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground/75">
                        This view combines {selectedExercise.duplicateCount} saved exercises with the same name.
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => setShowAdvanced((value) => !value)}
                    className="premium-button-secondary shrink-0 px-4"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Advanced
                    {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>

                {progressLoading ? (
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <Skeleton className="h-28 rounded-[28px]" />
                    <Skeleton className="h-28 rounded-[28px]" />
                    <Skeleton className="h-28 rounded-[28px]" />
                  </div>
                ) : summary ? (
                  <>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <StatCard label="Latest Result" value={summary.latestResult ?? 'No data'} />
                      <StatCard label="Current Best" value={summary.currentBest ?? 'No data'} />
                      <StatCard label="Workout Days" value={String(summary.trainingDays)} />
                    </div>

                    <div className="glass-panel mt-4 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Trend</p>
                      <p className="mt-2 text-sm leading-relaxed text-foreground">{summary.trendNote}</p>
                    </div>
                  </>
                ) : (
                  <div className="mt-5">
                    <ChartEmptyState message="No completed sessions yet for this exercise." />
                  </div>
                )}
              </div>

              {records.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {records.map((record, index) => (
                    <div
                      key={record.record_type}
                      className={`premium-card page-reveal delay-${Math.min(index + 1, 4)} flex items-center gap-3 px-4 py-4`}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-500/12 text-yellow-300">
                        <Award className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {PR_LABEL[record.record_type] ?? record.record_type}
                        </p>
                        <p className="mt-1 font-display text-xl font-semibold">{record.record_value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showAdvanced && (
                <div className="premium-card page-reveal delay-4 px-5 py-5">
                  <div className="flex flex-wrap gap-2">
                    {TIME_RANGES.map((timeRange) => (
                      <button
                        key={timeRange.value}
                        onClick={() => setRange(timeRange.value)}
                        className={`rounded-2xl px-4 py-2 text-xs font-semibold transition-colors ${
                          range === timeRange.value
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-white/10 bg-black/10 text-muted-foreground hover:bg-white/5'
                        }`}
                      >
                        {timeRange.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5">
                    {!summary?.chartReady ? (
                      <ChartEmptyState message="Advanced charts are shown for weighted lifts with reps." />
                    ) : progressLoading ? (
                      <Skeleton className="h-52 w-full rounded-[28px]" />
                    ) : points.length === 0 ? (
                      <ChartEmptyState message="No chart data yet for this exercise." />
                    ) : (
                      <div className="space-y-5">
                        <div>
                          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">Top Set</p>
                          <TopSetChart points={points} />
                        </div>
                        <div>
                          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">Estimated 1RM</p>
                          <E1rmChart points={points} />
                        </div>
                        <div>
                          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Weight Lifted</p>
                          <VolumeChart points={points} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="section-shell">
            <div className="premium-card page-reveal delay-2 px-5 py-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <span className="hero-kicker">Weekly Summary</span>
                  <h2 className="mt-4 font-display text-2xl font-semibold">Plain-language recap</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Let LiftOS describe the week in normal training language instead of making you reverse-engineer every metric yourself.
                  </p>
                </div>
                <button
                  onClick={() => void generate()}
                  disabled={weeklyLoading}
                  className="premium-button shrink-0 disabled:opacity-60"
                >
                  {weeklyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {generated ? 'Refresh' : 'Generate'}
                </button>
              </div>

              {weeklyError && (
                <p className="mt-4 text-sm text-destructive">{weeklyError}</p>
              )}

              {weeklyLoading ? (
                <div className="mt-5 space-y-3">
                  <Skeleton className="h-20 w-full rounded-[28px]" />
                  <Skeleton className="h-20 w-full rounded-[28px]" />
                </div>
              ) : weeklySummary ? (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <StatCard label="Workouts" value={String(weeklySummary.workouts_completed)} />
                    <StatCard label="Sets Logged" value={String(weeklySummary.total_sets)} />
                    <StatCard label="Total Weight" value={`${Math.round(weeklySummary.total_volume_kg)}kg`} />
                  </div>

                  <div className="glass-panel px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="space-y-2">
                        {weeklySummary.strongest_lift && (
                          <p className="text-sm text-foreground">
                            <span className="font-medium">Strongest lift:</span> {weeklySummary.strongest_lift.exercise} · {weeklySummary.strongest_lift.value}
                          </p>
                        )}
                        {weeklySummary.most_improved_group && (
                          <p className="text-sm text-foreground">
                            <span className="font-medium">Most improved area:</span> {weeklySummary.most_improved_group}
                          </p>
                        )}
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {weeklySummary.insight ?? 'Keep logging consistently and LiftOS will build a clearer weekly picture.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-panel mt-5 px-4 py-4 text-sm text-muted-foreground">
                  Generate a summary after you have logged a few sessions to get a clearer weekly snapshot.
                </div>
              )}
            </div>
          </section>

          {!selectedExercise && exercises.length > 0 && (
            <section className="section-shell">
              <div className="premium-card page-reveal delay-3 flex flex-col items-center gap-3 px-5 py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/14 text-primary">
                  <Trophy className="h-7 w-7" />
                </div>
                <h2 className="font-display text-2xl font-semibold">Choose an exercise to begin</h2>
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  Once you pick one, this page will show your latest result, current best, and the trend that matters most.
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
