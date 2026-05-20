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
import type { XpInputSession, XpInputPR } from '@/lib/leveling/xp';

export interface HomeData {
  displayName:        string | null;
  avatarUrl:          string | null;
  weeklyTarget:       number;
  suggested:          TemplateWithCount[];
  pinned:             TemplateWithCount[];
  recentSessions:     HistorySessionSummary[];
  /** Last ~90 days of completed-session start dates, used by the streak heatmap. */
  activityDates:      { started_at: string }[];
  /** All-time completed sessions, used by the level/XP computation. */
  xpSessions:         XpInputSession[];
  /** All-time PRs, used by the level/XP computation. */
  xpPRs:              XpInputPR[];
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
    xpSessionsResult,
    xpPRsResult,
  ] = await Promise.all([
    supabase.from('users').select('display_name, avatar_url, weekly_workout_target').single(),

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
        session_exercises ( id, order_index, set_entries ( count ), exercises ( name, tracking_schema ) )
      `)
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(10),

    // Lightweight: just dates of completed sessions in the last 90 days, for
    // the heatmap. Separate query so we don't bloat the joined preview above.
    supabase
      .from('workout_sessions')
      .select('started_at')
      .not('completed_at', 'is', null)
      .gte('started_at', ninetyDaysAgo.toISOString())
      .order('started_at', { ascending: false }),

    // All-time XP inputs: every completed session + every PR's session link.
    // Tiny rows; RLS scopes to the current user automatically so this works
    // for every user without any per-user logic.
    supabase
      .from('workout_sessions')
      .select('id, started_at, is_light_session')
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: true }),

    supabase
      .from('personal_records')
      .select('session_id'),
  ]);

  const profileRow = profileResult.data as {
    display_name: string | null;
    avatar_url: string | null;
    weekly_workout_target: number | null;
  } | null;
  const displayName  = profileRow?.display_name ?? null;
  const avatarUrl    = profileRow?.avatar_url   ?? null;
  const weeklyTarget = profileRow?.weekly_workout_target ?? 4;
  const activityDates = (activityResult.data ?? []) as { started_at: string }[];
  const xpSessions    = (xpSessionsResult.data ?? []) as XpInputSession[];
  const xpPRs         = (xpPRsResult.data ?? []) as XpInputPR[];

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
      is_light_session: s.is_light_session,
    };
  });

  return { displayName, avatarUrl, weeklyTarget, suggested, pinned, recentSessions, activityDates, xpSessions, xpPRs };
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
