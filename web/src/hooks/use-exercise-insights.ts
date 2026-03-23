'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AISuggestionDataSchema, TrackingSchemaValidator } from '@/lib/validation';
import type { AISuggestionData, SetValues } from '@/types/app';
import type { TrackingSchema } from '@/types/tracking';
import { formatSetValues } from '@/lib/workout/formatting';

export interface ExerciseMetadata {
  id: string;
  name: string;
  muscle_groups: string[];
  tracking_schema: TrackingSchema;
}

export interface ExercisePR {
  record_type: string;
  record_value: number;
  achieved_at: string;
}

export interface RecentSession {
  session_id: string;
  started_at: string;
  top_set_display: string;
  set_count: number;
}

export interface ExerciseInsights {
  exercise: ExerciseMetadata;
  prs: ExercisePR[];
  aiSuggestion: AISuggestionData | null;
  suggestionAge: string | null;
  recentSessions: RecentSession[];
  totalSessions: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function useExerciseInsights(exerciseId: string) {
  const [data, setData] = useState<ExerciseInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetch() {
      const supabase = createClient();

      // Wait for auth to be ready (RLS requires authenticated user)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) { setError('Not authenticated'); setLoading(false); }
        return;
      }

      // 1. Exercise metadata
      const { data: exerciseRow, error: exErr } = await supabase
        .from('exercises')
        .select('id, name, muscle_groups, tracking_schema')
        .eq('id', exerciseId)
        .single();

      if (exErr || !exerciseRow) {
        if (!cancelled) { setError('Exercise not found'); setLoading(false); }
        return;
      }

      const schemaParsed = TrackingSchemaValidator.safeParse(exerciseRow.tracking_schema);
      if (!schemaParsed.success) {
        if (!cancelled) { setError('Invalid tracking schema'); setLoading(false); }
        return;
      }

      const exercise: ExerciseMetadata = {
        id: exerciseRow.id,
        name: exerciseRow.name,
        muscle_groups: exerciseRow.muscle_groups as string[],
        tracking_schema: schemaParsed.data,
      };

      // 2-5. Fetch remaining data in parallel (no dependency on each other)
      const [prResult, aiResult, sessionResult, countResult] = await Promise.all([
        // 2. Personal records
        supabase
          .from('personal_records')
          .select('record_type, record_value, achieved_at')
          .eq('exercise_id', exerciseId)
          .order('achieved_at', { ascending: false }),
        // 3. Latest AI suggestion
        supabase
          .from('ai_suggestions')
          .select('suggestion_data, created_at')
          .eq('exercise_id', exerciseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // 4. Recent sessions with this exercise
        supabase
          .from('session_exercises')
          .select(`
            id,
            workout_sessions!inner ( id, started_at, completed_at ),
            set_entries ( values, is_completed, set_type )
          `)
          .eq('exercise_id', exerciseId)
          .not('workout_sessions.completed_at', 'is', null)
          .order('workout_sessions(started_at)', { ascending: false })
          .limit(10),
        // 5. Total session count
        supabase
          .from('session_exercises')
          .select('id', { count: 'exact', head: true })
          .eq('exercise_id', exerciseId),
      ]);

      // Process PRs
      const bestByType = new Map<string, ExercisePR>();
      for (const row of ((prResult.data ?? []) as ExercisePR[])) {
        const existing = bestByType.get(row.record_type);
        if (!existing || row.record_value > existing.record_value) {
          bestByType.set(row.record_type, row);
        }
      }
      const prs = Array.from(bestByType.values());

      // Process AI suggestion
      let aiSuggestion: AISuggestionData | null = null;
      let suggestionAge: string | null = null;
      const aiRow = aiResult.data;
      if (aiRow?.suggestion_data) {
        const parsed = AISuggestionDataSchema.safeParse(aiRow.suggestion_data);
        if (parsed.success) {
          aiSuggestion = parsed.data;
          suggestionAge = timeAgo(aiRow.created_at);
        }
      }

      // Process recent sessions
      type SessionRow = {
        id: string;
        workout_sessions: { id: string; started_at: string; completed_at: string };
        set_entries: Array<{ values: SetValues; is_completed: boolean; set_type: string }>;
      };

      const recentSessions: RecentSession[] = ((sessionResult.data ?? []) as SessionRow[]).map((row) => {
        const completedSets = row.set_entries.filter((s) => s.is_completed);
        const topSet = completedSets.reduce<{ values: SetValues } | null>((best, s) => {
          const w = typeof s.values.weight === 'number' ? s.values.weight : 0;
          const bestW = best ? (typeof best.values.weight === 'number' ? best.values.weight : 0) : 0;
          return w > bestW ? s : best;
        }, null);

        return {
          session_id: row.workout_sessions.id,
          started_at: row.workout_sessions.started_at,
          top_set_display: topSet
            ? formatSetValues(topSet.values, exercise.tracking_schema)
            : '—',
          set_count: completedSets.length,
        };
      });

      const { count } = countResult;

      if (!cancelled) {
        setData({
          exercise,
          prs,
          aiSuggestion,
          suggestionAge,
          recentSessions,
          totalSessions: count ?? recentSessions.length,
        });
        setLoading(false);
      }
    }

    void fetch();
    return () => { cancelled = true; };
  }, [exerciseId]);

  return { data, loading, error };
}
