/**
 * useTemplates — CRUD hook for workout_templates.
 * Each template is enriched with exercise_count from a bounded aggregate join.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import type { WorkoutTemplateRow, TemplateExerciseRow } from '@/types/database';

export interface TemplateWithCount extends WorkoutTemplateRow {
  exercise_count: number;
}

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

const cachedTemplatesByUser = new Map<string, TemplateWithCount[]>();

type TemplateAggregateRow = WorkoutTemplateRow & {
  template_exercises: { count: number }[] | null;
};

export function useTemplates(): UseTemplatesReturn {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;
  const supabase = createClient();
  const cachedTemplates = userId ? cachedTemplatesByUser.get(userId) : undefined;

  const [templates, setTemplates] = useState<TemplateWithCount[]>(cachedTemplates ?? []);
  const [isLoading, setIsLoading] = useState(cachedTemplates === undefined);
  const [error, setError] = useState<string | null>(null);
  const [templatesUserId, setTemplatesUserId] = useState<string | null>(userId);
  const activeUserId = useRef(userId);
  const supabaseRef = useRef(supabase);
  activeUserId.current = userId;

  const fetchTemplates = useCallback(async (options?: { silent?: boolean }): Promise<void> => {
    // Do not wait for the auth store's getSession() round-trip: Supabase applies
    // RLS using its already-restored browser session. Capture the identity for
    // this request so a late response can never populate another user's state.
    const requestUserId = activeUserId.current;
    if (!options?.silent || !requestUserId || !cachedTemplatesByUser.has(requestUserId)) setIsLoading(true);
    setError(null);
    try {
      const { data, error: tmplErr } = await supabaseRef.current
        .from('workout_templates')
        .select('*, template_exercises(count)')
        .order('is_pinned', { ascending: false })
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50) as unknown as { data: TemplateAggregateRow[] | null; error: unknown };

      if (tmplErr) throw tmplErr;
      const enriched = (data ?? []).map(({ template_exercises, ...template }) => ({
        ...template,
        exercise_count: template_exercises?.[0]?.count ?? 0,
      }));
      if (activeUserId.current !== requestUserId) return;
      if (requestUserId) cachedTemplatesByUser.set(requestUserId, enriched);
      setTemplatesUserId(requestUserId);
      setTemplates(enriched);
    } catch (err: unknown) {
      if (activeUserId.current !== requestUserId) return;
      setError((err as { message?: string }).message ?? 'Failed to load templates.');
    } finally {
      if (activeUserId.current === requestUserId) setIsLoading(false);
    }
  }, []);

  const createTemplate = useCallback(async (name: string): Promise<TemplateWithCount> => {
    if (!user) throw new Error('Not authenticated');
    const { data: row, error: dbErr } = await supabase
      .from('workout_templates')
      .insert({ user_id: user.id, name: name.trim(), is_pinned: false })
      .select('*')
      .single() as { data: WorkoutTemplateRow | null; error: unknown };

    if (dbErr) throw dbErr;
    if (!row) throw new Error('No row returned from insert.');
    const enriched: TemplateWithCount = { ...row, exercise_count: 0 };
    setTemplates((prev) => {
      if (activeUserId.current !== user.id) return prev;
      const next = [enriched, ...prev];
      cachedTemplatesByUser.set(user.id, next);
      return next;
    });
    return enriched;
  }, [user, supabase]);

  const deleteTemplate = useCallback(async (id: string): Promise<void> => {
    if (!user) throw new Error('Not authenticated');
    const { error: dbErr } = await supabase
      .from('workout_templates')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id) as { error: unknown };

    if (dbErr) throw dbErr;
    setTemplates((prev) => {
      if (activeUserId.current !== user.id) return prev;
      const next = prev.filter((t) => t.id !== id);
      cachedTemplatesByUser.set(user.id, next);
      return next;
    });
  }, [user, supabase]);

  const duplicateTemplate = useCallback(async (id: string): Promise<void> => {
    if (!user) throw new Error('Not authenticated');
    const original = templates.find((t) => t.id === id);
    if (!original) throw new Error('Template not found.');

    const { data: exData, error: exErr } = await supabase
      .from('template_exercises')
      .select('*')
      .eq('template_id', id)
      .order('order_index', { ascending: true }) as {
      data: TemplateExerciseRow[] | null; error: unknown;
    };
    if (exErr) throw exErr;

    const { data: newTmpl, error: tmplErr } = await supabase
      .from('workout_templates')
      .insert({ user_id: user.id, name: `${original.name} (Copy)`, is_pinned: false, last_used_at: null })
      .select('*')
      .single() as { data: WorkoutTemplateRow | null; error: unknown };

    if (tmplErr) throw tmplErr;
    if (!newTmpl) throw new Error('No template returned from insert.');

    const exercises = exData ?? [];
    if (exercises.length > 0) {
      const { error: copyErr } = await supabase
        .from('template_exercises')
        .insert(exercises.map((ex) => ({
          template_id: newTmpl.id,
          exercise_id: ex.exercise_id,
          order_index: ex.order_index,
          default_set_count: ex.default_set_count,
          rest_seconds: ex.rest_seconds,
          superset_group_id: ex.superset_group_id,
          target_ranges: ex.target_ranges,
          notes: ex.notes,
        }))) as { error: unknown };
      if (copyErr) throw copyErr;
    }

    setTemplates((prev) => {
      if (activeUserId.current !== user.id) return prev;
      const next = [{ ...newTmpl, exercise_count: exercises.length }, ...prev];
      cachedTemplatesByUser.set(user.id, next);
      return next;
    });
  }, [user, supabase, templates]);

  const togglePin = useCallback(async (id: string): Promise<void> => {
    if (!user) throw new Error('Not authenticated');
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const newPinned = !template.is_pinned;

    // Optimistic update
    setTemplates((prev) => {
      if (activeUserId.current !== user.id) return prev;
      const next = prev.map((t) => (t.id === id ? { ...t, is_pinned: newPinned } : t));
      cachedTemplatesByUser.set(user.id, next);
      return next;
    });

    const { error: dbErr } = await supabase
      .from('workout_templates')
      .update({ is_pinned: newPinned })
      .eq('id', id)
      .eq('user_id', user.id) as { error: unknown };

    if (dbErr) {
      setTemplates((prev) => {
        if (activeUserId.current !== user.id) return prev;
        const next = prev.map((t) => (t.id === id ? { ...t, is_pinned: !newPinned } : t));
        cachedTemplatesByUser.set(user.id, next);
        return next;
      });
      throw dbErr;
    }
  }, [user, supabase, templates]);

  const updateTemplateName = useCallback(async (id: string, name: string): Promise<void> => {
    if (!user || !name.trim()) return;
    setTemplates((prev) => {
      if (activeUserId.current !== user.id) return prev;
      const next = prev.map((t) => (t.id === id ? { ...t, name: name.trim() } : t));
      cachedTemplatesByUser.set(user.id, next);
      return next;
    });
    const { error: dbErr } = await supabase
      .from('workout_templates')
      .update({ name: name.trim() })
      .eq('id', id)
      .eq('user_id', user.id) as { error: unknown };
    if (dbErr) throw dbErr;
  }, [user, supabase]);

  useEffect(() => {
    const cached = userId ? cachedTemplatesByUser.get(userId) : undefined;
    setTemplatesUserId(userId);
    setTemplates(cached ?? []);
    setIsLoading(cached === undefined && userId !== null);
    setError(null);
    void fetchTemplates({ silent: cached !== undefined });
  }, [fetchTemplates, userId]);

  const visibleTemplates = templatesUserId === userId ? templates : cachedTemplates ?? [];
  const visibleLoading = templatesUserId === userId ? isLoading : cachedTemplates === undefined && userId !== null;
  const visibleError = templatesUserId === userId ? error : null;
  return { templates: visibleTemplates, isLoading: visibleLoading, error: visibleError, fetchTemplates, createTemplate, deleteTemplate, duplicateTemplate, togglePin, updateTemplateName };
}
