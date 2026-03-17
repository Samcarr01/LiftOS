import type { SupabaseClient } from '@supabase/supabase-js';
import { TrackingSchemaValidator } from '@/lib/validation';
import { summarizeSetResult, type TrackingSetLike } from '@/lib/workout/formatting';
import type { Database, Json } from '@/types/database';

export interface SessionPreview {
  primaryExerciseName: string | null;
  primaryResult: string | null;
}

export async function fetchSessionPreviews(
  supabase: SupabaseClient<Database>,
  sessionIds: string[],
): Promise<Map<string, SessionPreview>> {
  const previewMap = new Map<string, SessionPreview>();
  if (sessionIds.length === 0) return previewMap;

  const { data, error } = await supabase
    .from('session_exercises')
    .select(`
      session_id,
      order_index,
      exercises (
        name,
        tracking_schema
      ),
      set_entries (
        set_index,
        values,
        set_type,
        is_completed,
        logged_at
      )
    `)
    .in('session_id', sessionIds)
    .order('order_index', { ascending: true });

  if (error || !data) return previewMap;

  const grouped = new Map<string, Array<{
    order_index: number;
    exercise_name: string | null;
    tracking_schema: Json | null;
    sets: TrackingSetLike[];
  }>>();

  for (const row of data as Array<{
    session_id: string;
    order_index: number;
    exercises: { name: string; tracking_schema: Json } | null;
    set_entries: Array<{
      set_index: number;
      values: Json;
      set_type: string;
      is_completed: boolean;
      logged_at: string | null;
    }>;
  }>) {
    const sessionRows = grouped.get(row.session_id) ?? [];
    sessionRows.push({
      order_index: row.order_index,
      exercise_name: row.exercises?.name ?? null,
      tracking_schema: row.exercises?.tracking_schema ?? null,
      sets: (row.set_entries ?? []).map((set) => ({
        set_index: set.set_index,
        values: set.values as Record<string, number | string>,
        set_type: set.set_type,
        is_completed: set.is_completed,
        logged_at: set.logged_at,
      })),
    });
    grouped.set(row.session_id, sessionRows);
  }

  for (const sessionId of sessionIds) {
    const exerciseRows = (grouped.get(sessionId) ?? []).sort((a, b) => a.order_index - b.order_index);

    let preview: SessionPreview = {
      primaryExerciseName: null,
      primaryResult: null,
    };

    for (const exerciseRow of exerciseRows) {
      if (!exerciseRow.exercise_name || !exerciseRow.tracking_schema) continue;
      const parsedSchema = TrackingSchemaValidator.safeParse(exerciseRow.tracking_schema);
      if (!parsedSchema.success) continue;

      const primaryResult = summarizeSetResult(exerciseRow.sets, parsedSchema.data, 'best');
      if (!primaryResult) continue;

      preview = {
        primaryExerciseName: exerciseRow.exercise_name,
        primaryResult,
      };
      break;
    }

    previewMap.set(sessionId, preview);
  }

  return previewMap;
}
