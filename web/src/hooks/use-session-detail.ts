'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SessionDetail, SessionDetailExercise, SessionDetailSet } from '@/types/app';
import type { Json } from '@/types/database';
import { TrackingSchemaValidator } from '@/lib/validation';
import { WEIGHT_REPS } from '@/types/tracking';
import { computeVolumeKg } from '@/lib/workout/formatting';

export function useSessionDetail(sessionId: string) {
  const [detail, setDetail]   = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      setLoading(true);
      const supabase = createClient();

      const { data, error: err } = await supabase
        .from('workout_sessions')
        .select(`
          id,
          started_at,
          completed_at,
          duration_seconds,
          notes,
          workout_templates ( name ),
          session_exercises (
            id,
            order_index,
            notes,
            exercises (
              id,
              name,
              muscle_groups,
              tracking_schema
            ),
            set_entries (
              id,
              set_index,
              values,
              set_type,
              is_completed,
              notes,
              logged_at
            )
          )
        `)
        .eq('id', sessionId)
        .single();

      if (cancelled) return;
      if (err || !data) {
        setError(err?.message ?? 'Not found');
        setLoading(false);
        return;
      }

      // Fetch PRs set during this session
      const { data: prs } = await supabase
        .from('personal_records')
        .select('exercise_id, record_type, record_value')
        .eq('session_id', sessionId);

      const row = data as {
        id: string;
        started_at: string;
        completed_at: string | null;
        duration_seconds: number | null;
        notes: string | null;
        workout_templates: { name: string } | null;
        session_exercises: Array<{
          id: string;
          order_index: number;
          notes: string | null;
          exercises: {
            id: string;
            name: string;
            muscle_groups: string[];
            tracking_schema: Json;
          } | null;
          set_entries: Array<{
            id: string;
            set_index: number;
            values: Json;
            set_type: string;
            is_completed: boolean;
            notes: string | null;
            logged_at: string | null;
          }>;
        }>;
      };

      let totalVolume = 0;
      let totalSets   = 0;

      const exercises: SessionDetailExercise[] = (row.session_exercises ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map((se) => {
          const ex = se.exercises!;
          const schema = TrackingSchemaValidator.safeParse(ex.tracking_schema);
          const tracking_schema = schema.success ? schema.data : WEIGHT_REPS;

          const sets: SessionDetailSet[] = (se.set_entries ?? [])
            .sort((a, b) => a.set_index - b.set_index)
            .map((s) => {
              const vals = s.values as Record<string, number>;
              totalVolume += computeVolumeKg(vals);
              if (s.is_completed) totalSets += 1;
              return {
                id:           s.id,
                set_index:    s.set_index,
                values:       vals,
                set_type:     s.set_type as SessionDetailSet['set_type'],
                is_completed: s.is_completed,
                notes:        s.notes,
                logged_at:    s.logged_at ?? '',
              };
            });

          const exercisePrs = (prs ?? []).filter((p) => p.exercise_id === ex.id);

          return {
            session_exercise_id: se.id,
            exercise_id:         ex.id,
            exercise_name:       ex.name,
            muscle_groups:       ex.muscle_groups as string[],
            order_index:         se.order_index,
            tracking_schema,
            notes:               se.notes,
            sets,
            prs:                 exercisePrs.map((p) => ({
              exercise_id:  p.exercise_id,
              record_type:  p.record_type as SessionDetailExercise['prs'][0]['record_type'],
              record_value: p.record_value,
            })),
          };
        });

      setDetail({
        id:               row.id,
        started_at:       row.started_at,
        completed_at:     row.completed_at,
        duration_seconds: row.duration_seconds,
        template_name:    row.workout_templates?.name ?? null,
        notes:            row.notes,
        exercises,
        total_volume_kg:  totalVolume,
        total_sets:       totalSets,
      });
      setLoading(false);
    }
    void fetch();
    return () => { cancelled = true; };
  }, [sessionId]);

  return { detail, loading, error };
}
