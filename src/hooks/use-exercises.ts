/**
 * useExercises — CRUD hook for the exercises table.
 *
 * All operations validate with Zod before touching the network.
 * Mutations optimistically update local state so the UI stays snappy.
 * Uses soft deletes (is_archived = true) — never hard deletes.
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  TrackingSchemaValidator,
  ExerciseCreateSchema,
  ExerciseUpdateSchema,
} from '@/lib/validation';
import type { ExerciseWithSchema, ExerciseCreate, ExerciseUpdate } from '@/types';
import type { ExerciseRow, Json } from '@/types/database';
import { useAuthStore } from '@/store/auth-store';

// ── Helper ────────────────────────────────────────────────────────────────────

function rowToExercise(row: ExerciseRow): ExerciseWithSchema | null {
  const result = TrackingSchemaValidator.safeParse(row.tracking_schema);
  if (!result.success) return null;
  return {
    ...row,
    tracking_schema: result.data,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseExercisesReturn {
  exercises: ExerciseWithSchema[];
  isLoading: boolean;
  error: string | null;
  fetchExercises: () => Promise<void>;
  createExercise: (data: ExerciseCreate) => Promise<ExerciseWithSchema>;
  updateExercise: (id: string, data: ExerciseUpdate) => Promise<void>;
  archiveExercise: (id: string) => Promise<void>;
}

export function useExercises(): UseExercisesReturn {
  const user = useAuthStore((s) => s.user);

  const [exercises, setExercises] = useState<ExerciseWithSchema[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchExercises = useCallback(async (): Promise<void> => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = (await supabase
        .from('exercises')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('name', { ascending: true })) as { data: ExerciseRow[] | null; error: unknown };

      if (dbError) throw dbError;
      const parsed = (data ?? [])
        .map(rowToExercise)
        .filter((e): e is ExerciseWithSchema => e !== null);
      setExercises(parsed);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to load exercises.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // ── Create ───────────────────────────────────────────────────────────────────

  const createExercise = useCallback(
    async (data: ExerciseCreate): Promise<ExerciseWithSchema> => {
      if (!user) throw new Error('Not authenticated');

      // Zod parse — throws ZodError on invalid input
      const validated = ExerciseCreateSchema.parse(data);

      const { data: row, error: dbError } = (await supabase
        .from('exercises')
        .insert({
          user_id: user.id,
          name: validated.name,
          muscle_groups: validated.muscle_groups ?? [],
          tracking_schema: validated.tracking_schema as unknown as Json,
          unit_config: (validated.unit_config ?? {}) as unknown as Json,
          default_rest_seconds: validated.default_rest_seconds ?? 90,
          notes: validated.notes ?? null,
        })
        .select('*')
        .single()) as { data: ExerciseRow | null; error: unknown };

      if (dbError) throw dbError;
      if (!row) throw new Error('Insert returned no row.');

      const exercise = rowToExercise(row);
      if (!exercise) throw new Error('DB returned an invalid tracking_schema.');

      setExercises((prev) =>
        [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return exercise;
    },
    [user],
  );

  // ── Update ───────────────────────────────────────────────────────────────────

  const updateExercise = useCallback(
    async (id: string, data: ExerciseUpdate): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      const validated = ExerciseUpdateSchema.parse(data);

      // Build a patch with only the provided fields
      const patch: {
        name?: string;
        muscle_groups?: string[];
        tracking_schema?: Json;
        unit_config?: Json;
        default_rest_seconds?: number;
        notes?: string | null;
        is_archived?: boolean;
      } = {};

      if (validated.name !== undefined)                patch.name = validated.name;
      if (validated.muscle_groups !== undefined)        patch.muscle_groups = validated.muscle_groups;
      if (validated.tracking_schema !== undefined)      patch.tracking_schema = validated.tracking_schema as unknown as Json;
      if (validated.unit_config !== undefined)          patch.unit_config = validated.unit_config as unknown as Json;
      if (validated.default_rest_seconds !== undefined) patch.default_rest_seconds = validated.default_rest_seconds;
      if (validated.notes !== undefined)                patch.notes = validated.notes;
      if (validated.is_archived !== undefined)          patch.is_archived = validated.is_archived;

      const { data: row, error: dbError } = (await supabase
        .from('exercises')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single()) as { data: ExerciseRow | null; error: unknown };

      if (dbError) throw dbError;
      if (!row) return;

      const exercise = rowToExercise(row);
      if (exercise) {
        setExercises((prev) =>
          prev
            .map((e) => (e.id === id ? exercise : e))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
    },
    [user],
  );

  // ── Archive (soft delete) ─────────────────────────────────────────────────────

  const archiveExercise = useCallback(
    async (id: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      const { error: dbError } = (await supabase
        .from('exercises')
        .update({ is_archived: true })
        .eq('id', id)
        .eq('user_id', user.id)) as { error: unknown };

      if (dbError) throw dbError;

      // Optimistic removal from list
      setExercises((prev) => prev.filter((e) => e.id !== id));
    },
    [user],
  );

  // ── Bootstrap ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    void fetchExercises();
  }, [fetchExercises]);

  return { exercises, isLoading, error, fetchExercises, createExercise, updateExercise, archiveExercise };
}
