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

export interface LastHighlight {
  exerciseName: string;
  displayValue: string; // e.g. "80kg × 5"
}

export interface HomeData {
  displayName:      string | null;
  suggested:        TemplateWithCount | null;
  pinned:           TemplateWithCount[];
  recentSessions:   HistorySessionSummary[];
  lastHighlights:   LastHighlight[];
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
        workout_templates ( name ),
        session_exercises ( count ),
        set_entries ( count )
      `)
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(5),
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
  // Suggested = non-pinned with oldest (or null) last_used_at
  const suggested = templates.find((t) => !t.is_pinned) ?? null;

  // Map recent sessions
  const rawSessions = (sessionsResult.data ?? []) as Array<{
    id: string;
    started_at: string;
    completed_at: string | null;
    duration_seconds: number | null;
    workout_templates: { name: string } | null;
    session_exercises: { count: number }[];
    set_entries: { count: number }[];
  }>;

  const recentSessions: HistorySessionSummary[] = rawSessions.map((s) => ({
    id:               s.id,
    started_at:       s.started_at,
    completed_at:     s.completed_at,
    duration_seconds: s.duration_seconds,
    template_name:    s.workout_templates?.name ?? null,
    exercise_count:   s.session_exercises?.[0]?.count ?? 0,
    total_sets:       s.set_entries?.[0]?.count ?? 0,
    volume_kg:        0,
  }));

  // Last session highlights — top sets from most recent session
  let lastHighlights: LastHighlight[] = [];
  if (recentSessions.length > 0) {
    const lastId = recentSessions[0].id;
    const { data: highlightData } = await supabase
      .from('set_entries')
      .select(`
        values,
        session_exercises!inner (
          exercises ( name )
        )
      `)
      .eq('session_exercises.session_id', lastId)
      .eq('is_completed', true)
      .order('logged_at', { ascending: false })
      .limit(20);

    // Deduplicate to best set per exercise
    const bestByExercise = new Map<string, { name: string; weight: number; reps: number }>();
    for (const row of (highlightData ?? []) as Array<{
      values: Record<string, number>;
      session_exercises: { exercises: { name: string } | null };
    }>) {
      const name   = row.session_exercises?.exercises?.name;
      if (!name) continue;
      const w      = row.values?.weight ?? 0;
      const r      = row.values?.reps   ?? 0;
      const e1rm   = w * (1 + r / 30);
      const stored = bestByExercise.get(name);
      if (!stored || e1rm > stored.weight * (1 + stored.reps / 30)) {
        bestByExercise.set(name, { name, weight: w, reps: r });
      }
    }

    lastHighlights = Array.from(bestByExercise.values())
      .slice(0, 3)
      .map((h) => ({
        exerciseName: h.name,
        displayValue: h.weight > 0
          ? `${h.weight}kg × ${h.reps}`
          : h.reps > 0 ? `${h.reps} reps` : '—',
      }));
  }

  return { displayName, suggested, pinned, recentSessions, lastHighlights };
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
