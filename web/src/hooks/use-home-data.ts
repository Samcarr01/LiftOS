'use client';

/**
 * Aggregates all data for the Home dashboard.
 *
 * Strategy: fetch in parallel (single round-trip per category), show
 * immediately from state (no artificial delay). Stale-while-revalidate
 * via `refresh()` on pull-to-refresh.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import type { TemplateWithCount } from './use-templates';
import type { HistorySessionSummary } from '@/types/app';

const cachedHomeDataByUser = new Map<string, HomeData>();

export interface HomeData {
  displayName:        string | null;
  avatarUrl:          string | null;
  weeklyTarget:       number;
  suggested:          TemplateWithCount[];
  pinned:             TemplateWithCount[];
  recentSessions:     HistorySessionSummary[];
  /** Last ~90 days of completed-session start dates, used by the streak heatmap. */
  activityDates:      { started_at: string }[];
  /** Materialised progress maintained by database completion/PR triggers. */
  xpTotal:            number;
  xpLevel:            number;
  sessionCount:       number;
}

async function fetchHomeData(): Promise<HomeData> {
  const supabase = createClient();

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [
    profileResult,
    templatesResult,
    sessionsResult,
    activityResult,
  ] = await Promise.all([
    supabase.from('users').select('display_name, avatar_url, weekly_workout_target, xp_total, xp_level, session_count').single(),

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
        is_light_session,
        workout_templates ( name ),
        session_exercises ( id, order_index, set_entries ( count ), exercises ( name ) )
      `)
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(3),

    // Lightweight: just dates of completed sessions in the last 90 days, for
    // the heatmap. Separate query so we don't bloat the joined preview above.
    supabase
      .from('workout_sessions')
      .select('started_at')
      .not('completed_at', 'is', null)
      .gte('started_at', ninetyDaysAgo.toISOString())
      .order('started_at', { ascending: false }),

  ]);

  const profileRow = profileResult.data as {
    display_name: string | null;
    avatar_url: string | null;
    weekly_workout_target: number | null;
    xp_total: number;
    xp_level: number;
    session_count: number;
  } | null;
  const displayName  = profileRow?.display_name ?? null;
  const avatarUrl    = profileRow?.avatar_url   ?? null;
  const weeklyTarget = profileRow?.weekly_workout_target ?? 4;
  const xpTotal = profileRow?.xp_total ?? 0;
  const xpLevel = profileRow?.xp_level ?? 1;
  const sessionCount = profileRow?.session_count ?? 0;
  const activityDates = (activityResult.data ?? []) as { started_at: string }[];

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
    is_light_session: boolean;
    workout_templates: { name: string } | null;
    session_exercises: {
      id: string;
      order_index: number;
      set_entries: { count: number }[];
      exercises: { name: string } | null;
    }[];
  }>;

  const recentSessions: HistorySessionSummary[] = rawSessions.map((s) => {
    // Find primary exercise (first by order_index)
    const sorted = [...(s.session_exercises ?? [])].sort((a, b) => a.order_index - b.order_index);
    let primaryName: string | null = null;
    const primaryExercise = sorted.find((se) => se.exercises?.name)?.exercises;
    if (primaryExercise?.name) primaryName = primaryExercise.name;

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
      primary_result: null,
      is_light_session: s.is_light_session,
    };
  });

  return { displayName, avatarUrl, weeklyTarget, suggested, pinned, recentSessions, activityDates, xpTotal, xpLevel, sessionCount };
}

export function useHomeData() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const cachedData = userId ? cachedHomeDataByUser.get(userId) : undefined;
  const [state, setState] = useState(() => ({ userId, data: cachedData ?? null, loading: cachedData === undefined && userId !== null }));
  const activeUserId = useRef(userId);
  activeUserId.current = userId;

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) {
      setState({ userId: null, data: null, loading: false });
      return;
    }
    const cached = cachedHomeDataByUser.get(userId);
    if (!options?.silent || cached === undefined) {
      setState((previous) => previous.userId === userId ? { ...previous, loading: true } : { userId, data: cached ?? null, loading: true });
    }
    try {
      const result = await fetchHomeData();
      if (activeUserId.current !== userId) return;
      cachedHomeDataByUser.set(userId, result);
      setState({ userId, data: result, loading: false });
    } finally {
      if (activeUserId.current === userId) {
        setState((previous) => previous.userId === userId ? { ...previous, loading: false } : previous);
      }
    }
  }, [userId]);

  useEffect(() => {
    const cached = userId ? cachedHomeDataByUser.get(userId) : undefined;
    setState({ userId, data: cached ?? null, loading: cached === undefined && userId !== null });
    void load({ silent: cached !== undefined });
  }, [load, userId]);

  const data = state.userId === userId ? state.data : cachedData ?? null;
  const loading = state.userId === userId ? state.loading : cachedData === undefined && userId !== null;
  return { data, loading: loading && data === null, refresh: () => load({ silent: true }) };
}
