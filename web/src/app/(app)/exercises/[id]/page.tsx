'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Award,
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronUp,
  Minus,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { ChartEmptyState } from '@/components/progress/chart-empty-state';
import { useExerciseInsights } from '@/hooks/use-exercise-insights';
import { useProgress, usePersonalRecords } from '@/hooks/use-progress';
import { formatShortDate } from '@/lib/format-date';
import type { TimeRange } from '@/hooks/use-progress';

const TopSetChart = dynamic(
  () => import('@/components/progress/top-set-chart').then((m) => m.TopSetChart),
  { ssr: false, loading: () => <Skeleton className="h-52 w-full rounded-[28px]" /> },
);
const E1rmChart = dynamic(
  () => import('@/components/progress/e1rm-chart').then((m) => m.E1rmChart),
  { ssr: false, loading: () => <Skeleton className="h-52 w-full rounded-[28px]" /> },
);
const VolumeChart = dynamic(
  () => import('@/components/progress/volume-chart').then((m) => m.VolumeChart),
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
  best_reps_at_weight: 'Reps at Weight',
  best_e1rm: 'Est. 1RM',
  best_volume: 'Total Volume',
};

const PR_FORMAT: Record<string, (v: number) => string> = {
  best_weight: (v) => `${v}kg`,
  best_reps_at_weight: (v) => `${v} reps`,
  best_e1rm: (v) => `${v}kg`,
  best_volume: (v) => `${v}kg`,
};

export default function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, loading, error } = useExerciseInsights(id);
  const [range, setRange] = useState<TimeRange>('3m');
  const [showCharts, setShowCharts] = useState(false);

  const { points, summary, loading: progressLoading } = useProgress(
    data ? [data.exercise.id] : null,
    range,
  );

  const records = usePersonalRecords(data ? [data.exercise.id] : null);

  if (loading) {
    return (
      <div className="page-shell">
        <div className="page-content space-y-5 py-5 md:py-7">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-2xl" />
            <Skeleton className="h-6 w-48 rounded-lg" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-shell">
        <div className="page-content space-y-5 py-5 md:py-7">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="font-display text-lg font-bold">Exercise</h1>
          </div>
          <p className="text-sm text-destructive">{error ?? 'Not found'}</p>
        </div>
      </div>
    );
  }

  const { exercise, aiSuggestion, suggestionAge, recentSessions, totalSessions } = data;
  const isHolding = aiSuggestion?.decision === 'hold';

  return (
    <div className="page-shell">
      <div className="page-content space-y-5 py-5 md:py-7">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-bold">{exercise.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1">
              {exercise.muscle_groups.map((muscle) => (
                <MuscleGroupBadge key={muscle} muscle={muscle} />
              ))}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        {summary && (
          <div className="grid grid-cols-3 gap-2">
            <div className="stat-card">
              <p className="text-stat">{summary.latestResult ?? '—'}</p>
              <p className="text-caption">Latest</p>
            </div>
            <div className="stat-card">
              <p className="text-stat">{summary.currentBest ?? '—'}</p>
              <p className="text-caption">Best</p>
            </div>
            <div className="stat-card">
              <p className="text-stat">{totalSessions}</p>
              <p className="text-caption">Sessions</p>
            </div>
          </div>
        )}

        {/* Trend */}
        {summary && (
          <div className="content-card flex items-start gap-3">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Trend</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{summary.trendNote}</p>
            </div>
          </div>
        )}

        {/* PR Wall */}
        {records.length > 0 && (
          <div>
            <h3 className="section-title mb-3">Personal Records</h3>
            <div className="grid grid-cols-2 gap-2">
              {records.map((record) => (
                <div
                  key={record.record_type}
                  className="flex items-center gap-2.5 rounded-2xl border border-[oklch(0.80_0.16_85/0.25)] bg-[oklch(0.80_0.16_85/0.12)] px-3 py-3"
                >
                  <Award className="h-4 w-4 shrink-0 text-[oklch(0.85_0.15_85)]" />
                  <div className="min-w-0">
                    <p className="text-caption">{PR_LABEL[record.record_type] ?? record.record_type}</p>
                    <p className="font-display text-base font-bold">
                      {(PR_FORMAT[record.record_type] ?? String)(record.record_value)}
                    </p>
                    <p className="text-caption">{formatShortDate(record.achieved_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        {aiSuggestion && (
          <div className={`content-card ${isHolding ? 'border-[oklch(0.75_0.16_60/0.25)] bg-[oklch(0.75_0.16_60/0.08)]' : 'border-[oklch(0.72_0.19_155/0.20)] bg-[oklch(0.72_0.19_155/0.06)]'}`}>
            <div className="flex items-center gap-2.5">
              {isHolding ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-[oklch(0.82_0.15_60)]" />
              ) : (
                <TrendingUp className="h-4 w-4 shrink-0 text-[oklch(0.78_0.17_155)]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {isHolding ? 'Hold Steady' : 'Progressing Well'}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{aiSuggestion.reason}</p>
              </div>
            </div>
          </div>
        )}

        {/* AI Suggestion */}
        {aiSuggestion && (
          <div className="content-card">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <h3 className="font-display text-base font-bold">AI Coach</h3>
              {suggestionAge && (
                <span className="text-caption">· {suggestionAge}</span>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className={`rounded-lg px-2 py-1 text-sm font-semibold ${
                aiSuggestion.decision === 'progress'
                  ? 'bg-[oklch(0.75_0.18_55/0.15)] text-[oklch(0.80_0.16_55)]'
                  : 'bg-white/[0.08] text-muted-foreground'
              }`}>
                {aiSuggestion.decision === 'progress' ? (
                  <span className="flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> Progress</span>
                ) : (
                  <span className="flex items-center gap-1"><Minus className="h-3 w-3" /> Hold</span>
                )}
              </span>
              {aiSuggestion.next_target && (
                <span className="text-sm font-semibold text-foreground">
                  {aiSuggestion.next_target.display}
                </span>
              )}
            </div>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{aiSuggestion.reason}</p>

            {/* Progression tracker */}
            {aiSuggestion.progression && (
              <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-caption">Progression</span>
                  <span className="text-sm font-semibold">
                    {aiSuggestion.progression.separate_win_count}/{aiSuggestion.progression.wins_required} wins
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${Math.min((aiSuggestion.progression.separate_win_count / aiSuggestion.progression.wins_required) * 100, 100)}%`,
                    }}
                  />
                </div>
                {aiSuggestion.progression.last_progression_date && (
                  <p className="mt-1 text-caption">
                    Last progressed: {formatShortDate(aiSuggestion.progression.last_progression_date)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Charts */}
        <div className="content-card">
          <button
            onClick={() => setShowCharts((v) => !v)}
            aria-expanded={showCharts}
            className="flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-display text-base font-bold">Charts</h3>
            </div>
            {showCharts ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {showCharts && (
            <div className="mt-4">
              <div className="flex flex-wrap gap-1.5">
                {TIME_RANGES.map((tr) => (
                  <button
                    key={tr.value}
                    onClick={() => setRange(tr.value)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      range === tr.value
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-white/[0.14] bg-white/[0.04] text-muted-foreground hover:bg-white/8'
                    }`}
                  >
                    {tr.label}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                {!(exercise.tracking_schema.fields.some((f) => f.key === 'weight') && exercise.tracking_schema.fields.some((f) => f.key === 'reps')) ? (
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
        </div>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div>
            <h3 className="section-title mb-3">Recent Sessions</h3>
            <div className="space-y-2">
              {recentSessions.map((session) => (
                <button
                  key={session.session_id}
                  onClick={() => router.push(`/history/${session.session_id}`)}
                  className="action-card group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.75_0.18_55/0.15)] text-primary/70">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{formatShortDate(session.started_at)}</p>
                    <p className="text-caption">
                      {session.set_count} set{session.set_count !== 1 ? 's' : ''} · Best: {session.top_set_display}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
