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

function SetLine({
  set,
  trackingSchema,
}: {
  set: SessionDetailSet;
  trackingSchema: TrackingSchema;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-white/8 px-3 py-2 ${!set.is_completed ? 'opacity-50' : ''}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.75_0.18_55/0.12)] text-xs font-semibold text-[oklch(0.80_0.16_55)]">
        {set.set_index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">
          {SET_TYPE_LABELS[set.set_type] ?? set.set_type}
        </p>
        <p className="text-sm font-medium text-foreground">
          {formatSetValues(set.values, trackingSchema)}
        </p>
      </div>
      {!set.is_completed && (
        <span className="rounded-full border border-[oklch(0.75_0.16_60/0.25)] bg-[oklch(0.75_0.16_60/0.12)] px-2 py-0.5 text-xs font-medium text-[oklch(0.82_0.15_60)]">Open</span>
      )}
    </div>
  );
}

function ExerciseBlock({ exercise }: { exercise: SessionDetailExercise }) {
  const hasPrs = exercise.prs.length > 0;

  return (
    <div className="content-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-card-title">{exercise.exercise_name}</h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {exercise.muscle_groups.slice(0, 3).map((muscle) => (
              <MuscleGroupBadge key={muscle} muscle={muscle} />
            ))}
          </div>
        </div>
        {hasPrs && (
          <Trophy className="h-4 w-4 shrink-0 text-yellow-400" />
        )}
      </div>

      {hasPrs && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {exercise.prs.map((pr, index) => (
            <span
              key={`${pr.record_type}-${index}`}
              className="inline-flex items-center gap-1 rounded-md border border-[oklch(0.80_0.16_85/0.25)] bg-[oklch(0.80_0.16_85/0.12)] px-2 py-0.5 text-xs font-semibold text-[oklch(0.85_0.15_85)]"
            >
              <Award className="h-3 w-3" />
              {PR_LABEL[pr.record_type]} · {formatPrValue(pr.record_type, pr.record_value)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
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
      <div className="page-content py-5 md:py-7 space-y-5">
        {/* Compact header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-bold">
              {loading ? 'Loading...' : (detail?.template_name ?? 'Workout')}
            </h1>
            {detail && (
              <p className="text-sm text-muted-foreground">{formatLongDate(detail.started_at)}</p>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        )}

        {detail && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="stat-card">
                <p className="text-stat">{detail.exercises.length}</p>
                <p className="text-caption">Exercises</p>
              </div>
              <div className="stat-card">
                <p className="text-stat">{detail.total_sets}</p>
                <p className="text-caption">Sets</p>
              </div>
              <div className="stat-card">
                <p className="text-stat">{formatLongDate(detail.started_at).split(',')[0]}</p>
                <p className="text-caption">Date</p>
              </div>
            </div>

            {/* Exercise blocks */}
            <div className="space-y-3">
              {detail.exercises.map((exercise) => (
                <ExerciseBlock key={exercise.session_exercise_id} exercise={exercise} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
