'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Award, Trophy } from 'lucide-react';
import { useSessionDetail } from '@/hooks/use-session-detail';
import { Skeleton } from '@/components/ui/skeleton';
import { MuscleGroupBadge } from '@/components/muscle-group-badge';
import { formatLongDate } from '@/lib/format-date';
import { formatSetValues } from '@/lib/workout/formatting';
import type { SessionDetailExercise, SessionDetailSet } from '@/types/app';
import type { TrackingSchema } from '@/types/tracking';

const SET_TYPE_LABELS: Record<string, string> = {
  working: 'Working',
  warmup: 'Warm Up',
  top: 'Top',
  drop: 'Drop',
  failure: 'Failure',
};

const PR_LABEL: Record<string, string> = {
  best_weight: 'Weight PR',
  best_reps_at_weight: 'Reps PR',
  best_e1rm: 'Est. 1RM PR',
  best_volume: 'Volume PR',
};

function formatPrValue(recordType: string, recordValue: number): string {
  if (recordType === 'best_weight') return `${recordValue}kg`;
  if (recordType === 'best_reps_at_weight') return `${recordValue} reps`;
  if (recordType === 'best_e1rm') return `${recordValue}kg e1RM`;
  if (recordType === 'best_volume') return `${recordValue}kg total`;
  return String(recordValue);
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="premium-card px-4 py-4 text-center">
      <p className="font-display text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
    </div>
  );
}

function SetLine({
  set,
  trackingSchema,
}: {
  set: SessionDetailSet;
  trackingSchema: TrackingSchema;
}) {
  return (
    <div className={`glass-panel flex items-center gap-3 px-4 py-3 ${!set.is_completed ? 'opacity-50' : ''}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-sm font-semibold text-primary">
        {set.set_index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {SET_TYPE_LABELS[set.set_type] ?? set.set_type}
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {formatSetValues(set.values, trackingSchema)}
        </p>
      </div>
      {!set.is_completed && (
        <span className="status-pill">Open</span>
      )}
    </div>
  );
}

function ExerciseBlock({ exercise }: { exercise: SessionDetailExercise }) {
  const hasPrs = exercise.prs.length > 0;

  return (
    <div className="premium-card page-reveal px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-2xl font-semibold">{exercise.exercise_name}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {exercise.muscle_groups.slice(0, 3).map((muscle) => (
              <MuscleGroupBadge key={muscle} muscle={muscle} />
            ))}
          </div>
        </div>
        {hasPrs && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-500/12 text-yellow-300">
            <Trophy className="h-5 w-5" />
          </div>
        )}
      </div>

      {hasPrs && (
        <div className="mt-4 flex flex-wrap gap-2">
          {exercise.prs.map((pr, index) => (
            <span
              key={`${pr.record_type}-${index}`}
              className="status-pill border-yellow-500/25 bg-yellow-500/10 text-yellow-300"
            >
              <Award className="h-3.5 w-3.5" />
              {PR_LABEL[pr.record_type]} · {formatPrValue(pr.record_type, pr.record_value)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {exercise.sets.map((set) => (
          <SetLine key={set.id} set={set} trackingSchema={exercise.tracking_schema} />
        ))}
      </div>
    </div>
  );
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { detail, loading, error } = useSessionDetail(id);
  const router = useRouter();

  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7">
        <section className="page-hero">
          <div className="flex items-start gap-4">
            <button
              onClick={() => router.back()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <span className="hero-kicker">Workout Detail</span>
              <h1 className="page-title mt-4">
                {loading ? 'Loading session' : (detail?.template_name ?? 'Workout')}
              </h1>
              <p className="page-subtitle mt-3">
                Review the session the way you remember it: when you trained, what exercises you did, and exactly what you logged for each set.
              </p>
            </div>
          </div>
        </section>

        {error && (
          <p className="mt-6 text-sm text-destructive">{error}</p>
        )}

        {loading && (
          <div className="mt-8 space-y-4">
            <Skeleton className="h-40 w-full rounded-[28px]" />
            <Skeleton className="h-64 w-full rounded-[28px]" />
            <Skeleton className="h-64 w-full rounded-[28px]" />
          </div>
        )}

        {detail && (
          <div className="mt-8 space-y-8">
            <section className="section-shell">
              <div className="grid gap-3 md:grid-cols-3">
                <StatCard label="Date" value={formatLongDate(detail.started_at)} />
                <StatCard label="Exercises" value={String(detail.exercises.length)} />
                <StatCard label="Saved Sets" value={String(detail.total_sets)} />
              </div>
            </section>

            <section className="section-shell">
              <div className="section-heading">
                <div>
                  <h2 className="section-title">Logged Exercises</h2>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/75">
                    {detail.exercises.length} movement{detail.exercises.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {detail.exercises.map((exercise) => (
                  <ExerciseBlock key={exercise.session_exercise_id} exercise={exercise} />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
