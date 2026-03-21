/**
 * useTemplateExercises — CRUD + reorder hook for template_exercises.
 * Reorder is optimistic. Two-phase DB update avoids UNIQUE constraint violations.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TrackingSchemaValidator } from '@/lib/validation';
import type { TemplateExerciseRow, ExerciseRow, Json } from '@/types/database';
import type { ExerciseWithSchema } from '@/types/app';

export interface TemplateExerciseWithDetails {
  id: string;
  template_id: string;
  exercise_id: string;
  order_index: number;
  default_set_count: number;
  rest_seconds: number | null;
  superset_group_id: string | null;
  target_ranges: Json | null;
  notes: string | null;
  exercise: ExerciseWithSchema;
}

type RawJoinRow = TemplateExerciseRow & { exercise: ExerciseRow };

function parseJoinRow(row: RawJoinRow): TemplateExerciseWithDetails | null {
  const result = TrackingSchemaValidator.safeParse(row.exercise.tracking_schema);
  if (!result.success) return null;
  return { ...row, exercise: { ...row.exercise, tracking_schema: result.data } };
}

export interface UpdateTemplateExercisePatch {
  default_set_count?: number;
  rest_seconds?: number | null;
  superset_group_id?: string | null;
  notes?: string | null;
}

export interface UseTemplateExercisesReturn {
  exercises: TemplateExerciseWithDetails[];
  isLoading: boolean;
  error: string | null;
  fetchTemplateExercises: (templateId: string) => Promise<void>;
  addExercise: (templateId: string, exercise: ExerciseWithSchema, opts?: { default_set_count?: number; rest_seconds?: number }) => Promise<void>;
  removeExercise: (id: string) => Promise<void>;
  updateExercise: (id: string, patch: UpdateTemplateExercisePatch) => Promise<void>;
  reorderExercises: (templateId: string, orderedIds: string[]) => Promise<void>;
}

export function useTemplateExercises(templateId?: string): UseTemplateExercisesReturn {
  const supabase = createClient();
  const [exercises, setExercises] = useState<TemplateExerciseWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplateExercises = useCallback(async (tmplId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbErr } = await supabase
        .from('template_exercises')
        .select('*, exercise:exercises(*)')
        .eq('template_id', tmplId)
        .order('order_index', { ascending: true }) as { data: RawJoinRow[] | null; error: unknown };

      if (dbErr) throw dbErr;
      const parsed = (data ?? []).map(parseJoinRow).filter((r): r is TemplateExerciseWithDetails => r !== null);
      setExercises(parsed);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to load exercises.');
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const addExercise = useCallback(async (
    tmplId: string,
    exercise: ExerciseWithSchema,
    opts?: { default_set_count?: number; rest_seconds?: number },
  ): Promise<void> => {
    const nextIndex = exercises.length > 0
      ? Math.max(...exercises.map((e) => e.order_index)) + 1
      : 0;
    const { data: row, error: dbErr } = await supabase
      .from('template_exercises')
      .insert({
        template_id: tmplId,
        exercise_id: exercise.id,
        order_index: nextIndex,
        default_set_count: opts?.default_set_count ?? 3,
        rest_seconds: opts?.rest_seconds ?? exercise.default_rest_seconds,
      })
      .select('*, exercise:exercises(*)')
      .single() as { data: RawJoinRow | null; error: unknown };

    if (dbErr) throw dbErr;
    if (!row) throw new Error('No row returned from insert.');
    const parsed = parseJoinRow(row);
    if (parsed) setExercises((prev) => [...prev, parsed]);
  }, [supabase, exercises]);

  const removeExercise = useCallback(async (id: string): Promise<void> => {
    const item = exercises.find((e) => e.id === id);
    setExercises((prev) => {
      const without = prev.filter((e) => e.id !== id);
      return without.map((e, i) => ({ ...e, order_index: i }));
    });
    const { error: dbErr } = await supabase
      .from('template_exercises')
      .delete()
      .eq('id', id) as { error: unknown };
    if (dbErr) throw dbErr;

    // Re-index remaining exercises in DB to avoid gaps
    if (item) {
      const remaining = exercises
        .filter((e) => e.id !== id)
        .sort((a, b) => a.order_index - b.order_index);
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].order_index !== i) {
          await supabase
            .from('template_exercises')
            .update({ order_index: remaining.length + i })
            .eq('id', remaining[i].id);
        }
      }
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].order_index !== i) {
          await supabase
            .from('template_exercises')
            .update({ order_index: i })
            .eq('id', remaining[i].id);
        }
      }
    }
  }, [supabase, exercises]);

  const updateExercise = useCallback(async (id: string, patch: UpdateTemplateExercisePatch): Promise<void> => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const dbPatch: {
      default_set_count?: number; rest_seconds?: number | null;
      superset_group_id?: string | null; notes?: string | null;
    } = {};
    if (patch.default_set_count !== undefined) dbPatch.default_set_count = patch.default_set_count;
    if (patch.rest_seconds !== undefined)       dbPatch.rest_seconds = patch.rest_seconds;
    if (patch.superset_group_id !== undefined)  dbPatch.superset_group_id = patch.superset_group_id;
    if (patch.notes !== undefined)              dbPatch.notes = patch.notes;

    const { error: dbErr } = await supabase
      .from('template_exercises')
      .update(dbPatch)
      .eq('id', id) as { error: unknown };
    if (dbErr) throw dbErr;
  }, [supabase]);

  const reorderExercises = useCallback(async (tmplId: string, orderedIds: string[]): Promise<void> => {
    // Optimistic update
    setExercises((prev) => {
      const byId = Object.fromEntries(prev.map((e) => [e.id, e]));
      return orderedIds
        .map((id, index) => { const ex = byId[id]; return ex ? { ...ex, order_index: index } : null; })
        .filter((e): e is TemplateExerciseWithDetails => e !== null);
    });

    const n = orderedIds.length;
    // Phase 1: shift to high temp values to avoid UNIQUE(template_id, order_index) violations
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from('template_exercises').update({ order_index: n * 100 + i }).eq('id', id).eq('template_id', tmplId),
    ));
    // Phase 2: set final values
    await Promise.all(orderedIds.map((id, index) =>
      supabase.from('template_exercises').update({ order_index: index }).eq('id', id).eq('template_id', tmplId),
    ));
  }, [supabase]);

  useEffect(() => {
    if (templateId) void fetchTemplateExercises(templateId);
  }, [templateId, fetchTemplateExercises]);

  return { exercises, isLoading, error, fetchTemplateExercises, addExercise, removeExercise, updateExercise, reorderExercises };
}
