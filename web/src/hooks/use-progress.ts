'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TrackingSchemaValidator } from '@/lib/validation';
import {
  computeVolumeKg,
  describeTrackingSchema,
  formatSetValues,
  groupExercisesByName,
  pickRepresentativeSet,
  summarizeSetResult,
  type TrackingSetLike,
} from '@/lib/workout/formatting';
import type { SetValues } from '@/types/app';
import type { Json } from '@/types/database';
import type { TrackingSchema } from '@/types/tracking';

export interface ProgressPoint {
  date: string;
  weight?: number;
  reps?: number;
  e1rm?: number;
  volume?: number;
  displayValue: string;
  values: SetValues;
}

export interface ExerciseOption {
  id: string;
  name: string;
  exerciseIds: string[];
  duplicateCount: number;
  muscleGroups: string[];
  trackingLabel: string;
}

export interface ProgressSummary {
  trackingLabel: string;
  latestResult: string | null;
  currentBest: string | null;
  trainingDays: number;
  totalWeightLifted: number;
  trendNote: string;
  chartReady: boolean;
}

export type TimeRange = '1m' | '3m' | '6m' | '1y' | 'all';

function epley(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

function cutoffDate(range: TimeRange): string | null {
  const now = new Date();
  switch (range) {
    case '1m':
      now.setMonth(now.getMonth() - 1);
      break;
    case '3m':
      now.setMonth(now.getMonth() - 3);
      break;
    case '6m':
      now.setMonth(now.getMonth() - 6);
      break;
    case '1y':
      now.setFullYear(now.getFullYear() - 1);
      break;
    case 'all':
      return null;
  }

  return now.toISOString();
}

function getMetricValue(values: SetValues, key: string): number {
  const raw = values[key];
  return typeof raw === 'number' ? raw : 0;
}

function buildTrendNote(points: ProgressPoint[], schema: TrackingSchema): string {
  if (points.length === 0) return 'No completed workout days yet.';
  if (points.length === 1) return 'Log one more workout day to unlock a clearer trend.';

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const keys = new Set(schema.fields.map((field) => field.key));

  if (keys.has('weight') && keys.has('reps')) {
    const latestWeight = getMetricValue(latest.values, 'weight');
    const previousWeight = getMetricValue(previous.values, 'weight');
    const latestReps = getMetricValue(latest.values, 'reps');
    const previousReps = getMetricValue(previous.values, 'reps');

    if (latestWeight > previousWeight) {
      return `Top load is up from ${previousWeight} to ${latestWeight}.`;
    }

    if (latestWeight === previousWeight && latestReps > previousReps) {
      return `You matched the same load and added reps.`;
    }

    return 'Holding steady. Keep logging clean sets to see the next change.';
  }

  if (keys.has('weight') && keys.has('laps')) {
    const latestWeight = getMetricValue(latest.values, 'weight');
    const previousWeight = getMetricValue(previous.values, 'weight');
    const latestLaps = getMetricValue(latest.values, 'laps');
    const previousLaps = getMetricValue(previous.values, 'laps');

    if (latestWeight > previousWeight) {
      return `Loaded work is up from ${previousWeight} to ${latestWeight}.`;
    }

    if (latestWeight === previousWeight && latestLaps > previousLaps) {
      return 'You matched the load and added laps.';
    }

    return 'Holding steady. Keep logging clean laps to see the trend.';
  }

  if (keys.has('distance')) {
    const latestDistance = getMetricValue(latest.values, 'distance');
    const previousDistance = getMetricValue(previous.values, 'distance');
    if (latestDistance > previousDistance) {
      return `Distance is up from ${previousDistance}m to ${latestDistance}m.`;
    }
    return 'Distance is holding steady right now.';
  }

  if (keys.has('duration')) {
    const latestDuration = getMetricValue(latest.values, 'duration');
    const previousDuration = getMetricValue(previous.values, 'duration');
    if (latestDuration > previousDuration) {
      return `Time is up from ${previousDuration}s to ${latestDuration}s.`;
    }
    return 'Time is holding steady right now.';
  }

  if (keys.has('laps')) {
    const latestLaps = getMetricValue(latest.values, 'laps');
    const previousLaps = getMetricValue(previous.values, 'laps');
    if (latestLaps > previousLaps) {
      return `Laps are up from ${previousLaps} to ${latestLaps}.`;
    }
    return 'Lap count is holding steady right now.';
  }

  const latestReps = getMetricValue(latest.values, 'reps');
  const previousReps = getMetricValue(previous.values, 'reps');
  if (latestReps > previousReps) {
    return `Reps are up from ${previousReps} to ${latestReps}.`;
  }
  return 'Reps are holding steady right now.';
}

export function useExerciseList() {
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from('exercises')
      .select('id, name, muscle_groups, tracking_schema')
      .eq('is_archived', false)
      .order('name')
      .then(({ data }) => {
        const parsed = (data ?? []).flatMap((row) => {
          const trackingSchema = TrackingSchemaValidator.safeParse(row.tracking_schema);
          if (!trackingSchema.success) return [];

          return [{
            id: row.id,
            name: row.name,
            muscle_groups: row.muscle_groups as string[],
            tracking_schema: trackingSchema.data,
          }];
        });

        setExercises(groupExercisesByName(parsed));
      });
  }, []);

  return exercises;
}

export function useProgress(exerciseIds: string[] | null, range: TimeRange) {
  const [points, setPoints] = useState<ProgressPoint[]>([]);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!exerciseIds || exerciseIds.length === 0) {
      setPoints([]);
      setSummary(null);
      return;
    }

    const selectedExerciseIds = exerciseIds;
    let cancelled = false;
    setLoading(true);

    async function fetch() {
      const supabase = createClient();
      const cutoff = cutoffDate(range);

      let query = supabase
        .from('set_entries')
        .select(`
          values,
          set_type,
          is_completed,
          logged_at,
          session_exercises!inner (
            exercise_id,
            exercises!inner (
              name,
              tracking_schema
            ),
            workout_sessions!inner (
              started_at,
              completed_at
            )
          )
        `)
        .in('session_exercises.exercise_id', selectedExerciseIds)
        .eq('is_completed', true)
        .not('session_exercises.workout_sessions.completed_at', 'is', null)
        .order('logged_at', { ascending: true });

      if (cutoff) {
        query = query.gte('logged_at', cutoff);
      }

      const { data } = await query;
      if (cancelled || !data) {
        setLoading(false);
        return;
      }

      const firstWithSchema = (data as Array<{
        session_exercises: { exercises: { tracking_schema: Json } | null };
      }>).find((row) => row.session_exercises?.exercises?.tracking_schema);

      const parsedSchema = firstWithSchema
        ? TrackingSchemaValidator.safeParse(firstWithSchema.session_exercises.exercises?.tracking_schema)
        : null;

      if (!parsedSchema?.success) {
        setPoints([]);
        setSummary(null);
        setLoading(false);
        return;
      }

      const schema = parsedSchema.data;
      const byDay = new Map<string, TrackingSetLike[]>();
      let totalWeightLifted = 0;

      for (const row of data as Array<{
        values: Record<string, number>;
        set_type: string;
        is_completed: boolean;
        logged_at: string | null;
        session_exercises: {
          workout_sessions: { started_at: string; completed_at: string };
        };
      }>) {
        const date = (row.logged_at ?? row.session_exercises.workout_sessions.completed_at ?? row.session_exercises.workout_sessions.started_at).slice(0, 10);
        const existing = byDay.get(date) ?? [];
        const values = row.values ?? {};
        existing.push({
          values,
          set_type: row.set_type,
          is_completed: row.is_completed,
          logged_at: row.logged_at,
        });
        byDay.set(date, existing);
        totalWeightLifted += computeVolumeKg(values);
      }

      const nextPoints = Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .flatMap(([date, sets]) => {
          const representative = pickRepresentativeSet(sets, schema, 'best');
          if (!representative) return [];

          const weight = getMetricValue(representative.values, 'weight');
          const reps = getMetricValue(representative.values, 'reps');

          return [{
            date,
            weight: weight || undefined,
            reps: reps || undefined,
            e1rm: weight > 0 && reps > 0 ? epley(weight, reps) : undefined,
            volume: sets.reduce((total, set) => total + computeVolumeKg(set.values), 0),
            displayValue: formatSetValues(representative.values, schema),
            values: representative.values,
          }];
        });

      const latestResult = nextPoints[nextPoints.length - 1]?.displayValue ?? null;
      const currentBest = summarizeSetResult(
        Array.from(byDay.values()).flat(),
        schema,
        'best',
      );
      const trackingLabel = describeTrackingSchema(schema);

      if (!cancelled) {
        setPoints(nextPoints);
        setSummary({
          trackingLabel,
          latestResult,
          currentBest,
          trainingDays: nextPoints.length,
          totalWeightLifted: +totalWeightLifted.toFixed(1),
          trendNote: buildTrendNote(nextPoints, schema),
          chartReady: schema.fields.some((field) => field.key === 'weight')
            && schema.fields.some((field) => field.key === 'reps'),
        });
        setLoading(false);
      }
    }

    void fetch();

    return () => {
      cancelled = true;
    };
  }, [exerciseIds, range]);

  return { points, summary, loading };
}

export function usePersonalRecords(exerciseIds: string[] | null) {
  const [records, setRecords] = useState<Array<{
    record_type: string;
    record_value: number;
    achieved_at: string;
  }>>([]);

  useEffect(() => {
    if (!exerciseIds || exerciseIds.length === 0) {
      setRecords([]);
      return;
    }

    const supabase = createClient();
    supabase
      .from('personal_records')
      .select('record_type, record_value, achieved_at')
      .in('exercise_id', exerciseIds)
      .order('achieved_at', { ascending: false })
      .then(({ data }) => {
        const bestByType = new Map<string, { record_type: string; record_value: number; achieved_at: string }>();

        for (const row of (data ?? []) as Array<{
          record_type: string;
          record_value: number;
          achieved_at: string;
        }>) {
          const existing = bestByType.get(row.record_type);
          if (!existing || row.record_value > existing.record_value) {
            bestByType.set(row.record_type, row);
          }
        }

        setRecords(Array.from(bestByType.values()));
      });
  }, [exerciseIds]);

  return records;
}
