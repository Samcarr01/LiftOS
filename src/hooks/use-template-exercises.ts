/**
 * useTemplateExercises — CRUD + reorder hook for template_exercises.
 *
 * Each item is a TemplateExerciseRow joined with the parent exercise
 * (including its parsed TrackingSchema).
 *
 * Reorder is optimistic: local state updates immediately, then syncs
 * order_index values to the DB in the background via Promise.all.
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { TrackingSchemaValidator } from '@/lib/validation';
import type { TemplateExerciseRow, ExerciseRow, Json } from '@/types/database';
import type { ExerciseWithSchema } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

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
  return {
    ...row,
    exercise: { ...row.exercise, tracking_schema: result.data },
  };
}

export interface UpdateTemplateExercisePatch {
  default_set_count?: number;
  rest_seconds?: number | null;
  superset_group_id?: string | null;
  notes?: string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

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
  const [exercises, setExercises] = useState<TemplateExerciseWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTemplateExercises = useCallback(async (tmplId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbErr } = (await supabase
        .from('template_exercises')
        .select('*, exercise:exercises(*)')
        .eq('template_id', tmplId)
        .order('order_index', { ascending: true })) as {
        data: RawJoinRow[] | null;
        error: unknown;
      };

      if (dbErr) throw dbErr;
      const parsed = (data ?? [])
        .map(parseJoinRow)
        .filter((r): r is TemplateExerciseWithDetails => r !== null);
      setExercises(parsed);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to load exercises.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Add exercise ───────────────────────────────────────────────────────────

  const addExercise = useCallback(
    async (
      tmplId: string,
      exercise: ExerciseWithSchema,
      opts?: { default_set_count?: number; rest_seconds?: number },
    ): Promise<void> => {
      const nextIndex = exercises.length; // append at end

      const { data: row, error: dbErr } = (await supabase
        .from('template_exercises')
        .insert({
          template_id: tmplId,
          exercise_id: exercise.id,
          order_index: nextIndex,
          default_set_count: opts?.default_set_count ?? 3,
          rest_seconds: opts?.rest_seconds ?? exercise.default_rest_seconds,
        })
        .select('*, exercise:exercises(*)')
        .single()) as { data: RawJoinRow | null; error: unknown };

      if (dbErr) throw dbErr;
      if (!row) throw new Error('No row returned from insert.');

      const parsed = parseJoinRow(row);
      if (parsed) {
        setExercises((prev) => [...prev, parsed]);
      }
    },
    [exercises],
  );

  // ── Remove exercise ────────────────────────────────────────────────────────

  const removeExercise = useCallback(async (id: string): Promise<void> => {
    // Optimistic removal
    setExercises((prev) => {
      const without = prev.filter((e) => e.id !== id);
      // Re-index order_index values in local state
      return without.map((e, i) => ({ ...e, order_index: i }));
    });

    const { error: dbErr } = (await supabase
      .from('template_exercises')
      .delete()
      .eq('id', id)) as { error: unknown };

    if (dbErr) throw dbErr;
  }, []);

  // ── Update exercise ────────────────────────────────────────────────────────

  const updateExercise = useCallback(
    async (id: string, patch: UpdateTemplateExercisePatch): Promise<void> => {
      // Optimistic update
      setExercises((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      );

      const dbPatch: {
        default_set_count?: number;
        rest_seconds?: number | null;
        superset_group_id?: string | null;
        notes?: string | null;
      } = {};
      if (patch.default_set_count !== undefined) dbPatch.default_set_count = patch.default_set_count;
      if (patch.rest_seconds !== undefined)       dbPatch.rest_seconds = patch.rest_seconds;
      if (patch.superset_group_id !== undefined)  dbPatch.superset_group_id = patch.superset_group_id;
      if (patch.notes !== undefined)              dbPatch.notes = patch.notes;

      const { error: dbErr } = (await supabase
        .from('template_exercises')
        .update(dbPatch)
        .eq('id', id)) as { error: unknown };

      if (dbErr) throw dbErr;
    },
    [],
  );

  // ── Reorder (optimistic + background sync) ─────────────────────────────────

  const reorderExercises = useCallback(
    async (tmplId: string, orderedIds: string[]): Promise<void> => {
      // Optimistic: update order_index in local state immediately
      setExercises((prev) => {
        const byId = Object.fromEntries(prev.map((e) => [e.id, e]));
        return orderedIds
          .map((id, index) => {
            const ex = byId[id];
            if (!ex) return null;
            return { ...ex, order_index: index };
          })
          .filter((e): e is TemplateExerciseWithDetails => e !== null);
      });

      // Background sync — two-phase update avoids UNIQUE(template_id, order_index) violations.
      // Phase 1: shift to high temp values (n*100 + i) to avoid clashes with existing rows.
      // Phase 2: set correct final values.
      const n = orderedIds.length;
      await Promise.all(
        orderedIds.map((id, i) =>
          supabase
            .from('template_exercises')
            .update({ order_index: n * 100 + i })
            .eq('id', id)
            .eq('template_id', tmplId),
        ),
      );
      await Promise.all(
        orderedIds.map((id, index) =>
          supabase
            .from('template_exercises')
            .update({ order_index: index })
            .eq('id', id)
            .eq('template_id', tmplId),
        ),
      );
    },
    [],
  );

  // ── Auto-fetch when templateId prop changes ────────────────────────────────

  useEffect(() => {
    if (templateId) {
      void fetchTemplateExercises(templateId);
    }
  }, [templateId, fetchTemplateExercises]);

  return {
    exercises,
    isLoading,
    error,
    fetchTemplateExercises,
    addExercise,
    removeExercise,
    updateExercise,
    reorderExercises,
  };
}
