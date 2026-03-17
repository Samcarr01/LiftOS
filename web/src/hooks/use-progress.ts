'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ProgressPoint {
  date:       string;  // ISO date string
  weight?:    number;
  reps?:      number;
  e1rm?:      number;
  volume?:    number;
}

export interface ExerciseOption {
  id:   string;
  name: string;
}

export type TimeRange = '1m' | '3m' | '6m' | '1y' | 'all';

/** Epley formula: e1RM = weight × (1 + reps / 30) */
function epley(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

function cutoffDate(range: TimeRange): string | null {
  const now = new Date();
  switch (range) {
    case '1m':  now.setMonth(now.getMonth() - 1);  break;
    case '3m':  now.setMonth(now.getMonth() - 3);  break;
    case '6m':  now.setMonth(now.getMonth() - 6);  break;
    case '1y':  now.setFullYear(now.getFullYear() - 1); break;
    case 'all': return null;
  }
  return now.toISOString();
}

export function useExerciseList() {
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('exercises')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        if (data) setExercises(data as ExerciseOption[]);
      });
  }, []);

  return exercises;
}

export function useProgress(exerciseId: string | null, range: TimeRange) {
  const [points, setPoints]   = useState<ProgressPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!exerciseId) { setPoints([]); return; }
    let cancelled = false;
    setLoading(true);

    async function fetch() {
      const supabase = createClient();
      const cutoff   = cutoffDate(range);

      // Pull completed sets for this exercise, ordered chronologically
      let query = supabase
        .from('set_entries')
        .select(`
          values,
          logged_at,
          session_exercises!inner (
            exercise_id,
            workout_sessions!inner ( started_at, completed_at )
          )
        `)
        .eq('session_exercises.exercise_id', exerciseId as string)
        .eq('is_completed', true)
        .not('session_exercises.workout_sessions.completed_at', 'is', null)
        .order('logged_at', { ascending: true });

      if (cutoff) {
        query = query.gte('logged_at', cutoff);
      }

      const { data } = await query;
      if (cancelled || !data) { setLoading(false); return; }

      // Group by day, take best top set per day
      const byDay = new Map<string, ProgressPoint>();

      for (const row of data as Array<{
        values: Record<string, number>;
        logged_at: string | null;
        session_exercises: { workout_sessions: { started_at: string } };
      }>) {
        const date  = (row.logged_at ?? row.session_exercises.workout_sessions.started_at).slice(0, 10);
        const w     = row.values?.weight ?? 0;
        const r     = row.values?.reps   ?? 0;
        const vol   = w * r;
        const e1rm  = epley(w, r);

        const existing = byDay.get(date);
        if (!existing || (e1rm > (existing.e1rm ?? 0))) {
          byDay.set(date, { date, weight: w, reps: r, e1rm, volume: vol });
        } else {
          // Accumulate volume for the day
          byDay.set(date, { ...existing, volume: (existing.volume ?? 0) + vol });
        }
      }

      setPoints(Array.from(byDay.values()));
      setLoading(false);
    }

    void fetch();
    return () => { cancelled = true; };
  }, [exerciseId, range]);

  return { points, loading };
}

export function usePersonalRecords(exerciseId: string | null) {
  const [records, setRecords] = useState<Array<{
    record_type:  string;
    record_value: number;
    achieved_at:  string;
  }>>([]);

  useEffect(() => {
    if (!exerciseId) { setRecords([]); return; }
    const supabase = createClient();
    supabase
      .from('personal_records')
      .select('record_type, record_value, achieved_at')
      .eq('exercise_id', exerciseId)
      .order('achieved_at', { ascending: false })
      .then(({ data }) => {
        if (data) setRecords(data as typeof records);
      });
  }, [exerciseId]);

  return records;
}
