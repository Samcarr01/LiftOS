'use client';

/**
 * Aggregates all data for the Home dashboard.
 *
 * Strategy: fetch in parallel (single round-trip per category), show
 * immediately from state (no artificial delay). Stale-while-revalidate
 * via `refresh()` on pull-to-refresh.
 */

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TemplateWithCount } from './use-templates';
import type { HistorySessionSummary } from '@/types/app';
import { TrackingSchemaValidator } from '@/lib/validation';
import { summarizeSetResult, type TrackingSetLike } from '@/lib/workout/formatting';
import type { Json } from '@/types/database';

export interface HomeData {
  displayName:      string | null;
  suggested:        TemplateWithCount[];
  pinned:           TemplateWithCount[];
  recentSessions:   HistorySessionSummary[];
}

async function fetchHomeData(): Promise<HomeData> {
  const supabase = createClient();

  const [
    profileResult,
    templatesResult,
    sessionsResult,
  ] = await Promise.all([
    supabase.from('users').select('display_name').single(),

    supabase
      .from('workout_templates')
      .select('*, template_exercises(count)')
      .order('is_pinned', { ascending: false })
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .limit(20),

    supabase
      .from('workout_sessions')
      .select(`
        id,
        started_at,
        completed_at,
        duration_seconds,
        template_name,
        workout_templates ( name ),
        session_exercises ( id, order_index, set_entries ( count ), exercises ( name, tracking_schema ) )
      `)
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(10),
  ]);

  const displayName = (profileResult.data as { display_name: string | null } | null)?.display_name ?? null;

  // Map templates
  const rawTemplates = (templatesResult.data ?? []) as Array<{
    id: string;
    user_id: string;
    name: string;
    is_pinned: boolean;
    last_used_at: string | null;
    created_at: string;
    updated_at: string;
    notes: string | null;
    template_exercises: { count: number }[];
  }>;

  const templates: TemplateWithCount[] = rawTemplates.map((t) => ({
    id: t.id,
    user_id: t.user_id,
    name: t.name,
    is_pinned: t.is_pinned,
    last_used_at: t.last_used_at,
    created_at: t.created_at,
    updated_at: t.updated_at,
    notes: t.notes ?? null,
    exercise_count: t.template_exercises?.[0]?.count ?? 0,
  }));

  const pinned    = templates.filter((t) => t.is_pinned);
  // Suggested = non-pinned templates (up to 3), oldest last_used_at first
  const suggested = templates.filter((t) => !t.is_pinned).slice(0, 3);

  // Map recent sessions — preview data is already in the joined query
  const rawSessions = (sessionsResult.data ?? []) as Array<{
    id: string;
    started_at: string;
    completed_at: string | null;
    duration_seconds: number | null;
    template_name: string | null;
    workout_templates: { name: string } | null;
    session_exercises: {
      id: string;
      order_index: number;
      set_entries: { count: number }[];
      exercises: { name: string; tracking_schema: Json } | null;
    }[];
  }>;

  const recentSessions: HistorySessionSummary[] = rawSessions.map((s) => {
    // Find primary exercise (first by order_index)
    const sorted = [...(s.session_exercises ?? [])].sort((a, b) => a.order_index - b.order_index);
    let primaryName: string | null = null;
    let primaryResult: string | null = null;

    for (const se of sorted) {
      if (!se.exercises?.name || !se.exercises?.tracking_schema) continue;
      const parsed = TrackingSchemaValidator.safeParse(se.exercises.tracking_schema);
      if (!parsed.success) continue;
      primaryName = se.exercises.name;
      // We don't have individual set values in the count query, so just show the exercise name
      break;
    }

    return {
      id:               s.id,
      started_at:       s.started_at,
      completed_at:     s.completed_at,
      duration_seconds: s.duration_seconds,
      template_name:    s.template_name ?? s.workout_templates?.name ?? null,
      exercise_count:   s.session_exercises?.length ?? 0,
      total_sets:       s.session_exercises?.reduce((sum, se) => sum + (se.set_entries?.[0]?.count ?? 0), 0) ?? 0,
      volume_kg:        0,
      primary_exercise_name: primaryName,
      primary_result: primaryResult,
    };
  });

  return { displayName, suggested, pinned, recentSessions };
}

export function useHomeData() {
  const [data, setData]       = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchHomeData();
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, refresh: load };
}
