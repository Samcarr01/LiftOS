'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import type { HistorySessionSummary } from '@/types/app';
import { fetchSessionPreviews } from '@/lib/workout/session-previews';

const PAGE_SIZE = 20;

export interface HistoryPage {
  sessions: HistorySessionSummary[];
  hasMore:  boolean;
}

const cachedHistoryByUser = new Map<string, { page: HistoryPage; nextPage: number }>();

export function useHistory() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const cached = userId ? cachedHistoryByUser.get(userId) : undefined;
  const [state, setState] = useState(() => ({
    userId,
    sessions: cached?.page.sessions ?? [],
    hasMore: cached?.page.hasMore ?? true,
    loading: cached === undefined && userId !== null,
  }));
  const [error, setError]         = useState<string | null>(null);
  const pageRef                   = useRef(cached?.nextPage ?? 0);
  const activeUserId              = useRef(userId);
  useEffect(() => { activeUserId.current = userId; }, [userId]);

  const load = useCallback(async (reset = false, options?: { silent?: boolean }) => {
    if (!userId) {
      setState({ userId: null, sessions: [], hasMore: true, loading: false });
      return;
    }
    const userCache = cachedHistoryByUser.get(userId);
    if (!options?.silent || userCache === undefined) {
      setState((previous) => previous.userId === userId
        ? { ...previous, loading: true }
        : { userId, sessions: userCache?.page.sessions ?? [], hasMore: userCache?.page.hasMore ?? true, loading: true });
    }
    setError(null);
    const supabase = createClient();
    const currentPage = reset ? 0 : pageRef.current;
    const offset   = currentPage * PAGE_SIZE;

    const { data, error: queryError } = await supabase
      .from('workout_sessions')
      .select(`
        id,
        started_at,
        completed_at,
        duration_seconds,
        template_id,
        template_name,
        is_light_session,
        workout_templates ( name ),
        session_exercises ( id, set_entries ( count ) )
      `)
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (queryError || !data) {
      if (activeUserId.current !== userId) return;
      setError(queryError?.message ?? 'Failed to load history');
      setState((previous) => previous.userId === userId ? { ...previous, loading: false } : previous);
      return;
    }

    const rows = data as unknown as Array<{
      id: string;
      started_at: string;
      completed_at: string | null;
      duration_seconds: number | null;
      template_name: string | null;
      is_light_session: boolean;
      workout_templates: { name: string } | null;
      session_exercises: { id: string; set_entries: { count: number }[] }[];
    }>;

    const mapped: HistorySessionSummary[] = rows.map((row) => ({
      id:               row.id,
      started_at:       row.started_at,
      completed_at:     row.completed_at,
      duration_seconds: row.duration_seconds,
      template_name:    row.template_name ?? row.workout_templates?.name ?? null,
      exercise_count:   row.session_exercises?.length ?? 0,
      total_sets:       row.session_exercises?.reduce((sum, se) => sum + (se.set_entries?.[0]?.count ?? 0), 0) ?? 0,
      volume_kg:        0,
      primary_exercise_name: null,
      primary_result: null,
      is_light_session: row.is_light_session,
    }));

    const previews = await fetchSessionPreviews(
      supabase,
      mapped.map((session) => session.id),
    );

    for (const session of mapped) {
      const preview = previews.get(session.id);
      session.primary_exercise_name = preview?.primaryExerciseName ?? null;
      session.primary_result = preview?.primaryResult ?? null;
    }

    if (activeUserId.current !== userId) return;
    const nextSessions = reset ? mapped : [...(cachedHistoryByUser.get(userId)?.page.sessions ?? []), ...mapped];
    const nextHasMore = rows.length === PAGE_SIZE;
    const nextPage = currentPage + 1;
    cachedHistoryByUser.set(userId, { page: { sessions: nextSessions, hasMore: nextHasMore }, nextPage });
    pageRef.current = nextPage;
    setState({ userId, sessions: nextSessions, hasMore: nextHasMore, loading: false });
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load(true, { silent: cachedHistoryByUser.has(userId ?? '') });
    });
    return () => { cancelled = true; };
  }, [load, userId]);

  const refresh = useCallback(() => load(true, { silent: true }), [load]);
  const sessions = state.userId === userId ? state.sessions : cached?.page.sessions ?? [];
  const loading = state.userId === userId ? state.loading : cached === undefined && userId !== null;
  const hasMore = state.userId === userId ? state.hasMore : cached?.page.hasMore ?? true;
  const visibleError = state.userId === userId ? error : null;
  const loadMore = useCallback(() => { if (!loading && hasMore) load(false); }, [load, loading, hasMore]);

  return { sessions, loading, error: visibleError, hasMore, refresh, loadMore };
}
