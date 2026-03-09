/**
 * useTemplates — CRUD hook for workout_templates.
 *
 * Provides: fetchTemplates, createTemplate, deleteTemplate,
 *           duplicateTemplate, togglePin, updateTemplateName.
 * Each template is enriched with an exercise_count (derived from a
 * second query so we avoid N+1 calls).
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth-store';
import { Analytics } from '@/lib/analytics';
import type { WorkoutTemplateRow, TemplateExerciseRow } from '@/types/database';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TemplateWithCount extends WorkoutTemplateRow {
  exercise_count: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseTemplatesReturn {
  templates: TemplateWithCount[];
  isLoading: boolean;
  error: string | null;
  fetchTemplates: () => Promise<void>;
  createTemplate: (name: string) => Promise<TemplateWithCount>;
  deleteTemplate: (id: string) => Promise<void>;
  duplicateTemplate: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  updateTemplateName: (id: string, name: string) => Promise<void>;
}

export function useTemplates(): UseTemplatesReturn {
  const user = useAuthStore((s) => s.user);

  const [templates, setTemplates] = useState<TemplateWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async (): Promise<void> => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      // Fetch all templates for the user
      const { data: tmplData, error: tmplErr } = (await supabase
        .from('workout_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('is_pinned', { ascending: false })
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })) as {
        data: WorkoutTemplateRow[] | null;
        error: unknown;
      };

      if (tmplErr) throw tmplErr;
      const rows = tmplData ?? [];

      // Fetch exercise counts in a single query
      let countMap: Record<string, number> = {};
      if (rows.length > 0) {
        const { data: exData } = (await supabase
          .from('template_exercises')
          .select('template_id')
          .in(
            'template_id',
            rows.map((t) => t.id),
          )) as { data: { template_id: string }[] | null; error: unknown };

        countMap = (exData ?? []).reduce<Record<string, number>>((acc, row) => {
          acc[row.template_id] = (acc[row.template_id] ?? 0) + 1;
          return acc;
        }, {});
      }

      setTemplates(
        rows.map((t) => ({ ...t, exercise_count: countMap[t.id] ?? 0 })),
      );
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to load templates.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // ── Create ─────────────────────────────────────────────────────────────────

  const createTemplate = useCallback(
    async (name: string): Promise<TemplateWithCount> => {
      if (!user) throw new Error('Not authenticated');

      const { data: row, error: dbErr } = (await supabase
        .from('workout_templates')
        .insert({ user_id: user.id, name: name.trim(), is_pinned: false })
        .select('*')
        .single()) as { data: WorkoutTemplateRow | null; error: unknown };

      if (dbErr) throw dbErr;
      if (!row) throw new Error('No row returned from insert.');

      const enriched: TemplateWithCount = { ...row, exercise_count: 0 };
      setTemplates((prev) => [enriched, ...prev]);
      Analytics.templateCreated({ template_id: row.id });
      return enriched;
    },
    [user],
  );

  // ── Delete ─────────────────────────────────────────────────────────────────

  const deleteTemplate = useCallback(
    async (id: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      // template_exercises cascade-delete via FK ON DELETE CASCADE
      const { error: dbErr } = (await supabase
        .from('workout_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)) as { error: unknown };

      if (dbErr) throw dbErr;
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    },
    [user],
  );

  // ── Duplicate ──────────────────────────────────────────────────────────────

  const duplicateTemplate = useCallback(
    async (id: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      const original = templates.find((t) => t.id === id);
      if (!original) throw new Error('Template not found.');

      // Fetch original exercises
      const { data: exData, error: exErr } = (await supabase
        .from('template_exercises')
        .select('*')
        .eq('template_id', id)
        .order('order_index', { ascending: true })) as {
        data: TemplateExerciseRow[] | null;
        error: unknown;
      };

      if (exErr) throw exErr;

      // Create copy template
      const { data: newTmpl, error: tmplErr } = (await supabase
        .from('workout_templates')
        .insert({
          user_id: user.id,
          name: `${original.name} (Copy)`,
          is_pinned: false,
          last_used_at: null,
        })
        .select('*')
        .single()) as { data: WorkoutTemplateRow | null; error: unknown };

      if (tmplErr) throw tmplErr;
      if (!newTmpl) throw new Error('No template returned from insert.');

      // Copy exercises to new template
      const exercises = exData ?? [];
      if (exercises.length > 0) {
        const { error: copyErr } = (await supabase
          .from('template_exercises')
          .insert(
            exercises.map((ex) => ({
              template_id: newTmpl.id,
              exercise_id: ex.exercise_id,
              order_index: ex.order_index,
              default_set_count: ex.default_set_count,
              rest_seconds: ex.rest_seconds,
              superset_group_id: ex.superset_group_id,
              target_ranges: ex.target_ranges,
              notes: ex.notes,
            })),
          )) as { error: unknown };
        if (copyErr) throw copyErr;
      }

      const enriched: TemplateWithCount = {
        ...newTmpl,
        exercise_count: exercises.length,
      };
      setTemplates((prev) => [enriched, ...prev]);
    },
    [user, templates],
  );

  // ── Toggle pin ─────────────────────────────────────────────────────────────

  const togglePin = useCallback(
    async (id: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      const template = templates.find((t) => t.id === id);
      if (!template) return;
      const newPinned = !template.is_pinned;

      // Optimistic update
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_pinned: newPinned } : t)),
      );

      const { error: dbErr } = (await supabase
        .from('workout_templates')
        .update({ is_pinned: newPinned })
        .eq('id', id)
        .eq('user_id', user.id)) as { error: unknown };

      if (dbErr) {
        // Revert on error
        setTemplates((prev) =>
          prev.map((t) => (t.id === id ? { ...t, is_pinned: !newPinned } : t)),
        );
        throw dbErr;
      }
    },
    [user, templates],
  );

  // ── Update name ────────────────────────────────────────────────────────────

  const updateTemplateName = useCallback(
    async (id: string, name: string): Promise<void> => {
      if (!user || !name.trim()) return;

      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)),
      );

      const { error: dbErr } = (await supabase
        .from('workout_templates')
        .update({ name: name.trim() })
        .eq('id', id)
        .eq('user_id', user.id)) as { error: unknown };

      if (dbErr) throw dbErr;
    },
    [user],
  );

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    isLoading,
    error,
    fetchTemplates,
    createTemplate,
    deleteTemplate,
    duplicateTemplate,
    togglePin,
    updateTemplateName,
  };
}
