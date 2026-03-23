'use client';

import { useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { HistorySessionSummary } from '@/types/app';
import { fetchSessionPreviews } from '@/lib/workout/session-previews';

const PAGE_SIZE = 20;

export interface HistoryPage {
  sessions: HistorySessionSummary[];
  hasMore:  boolean;
}

export function useHistory() {
  const [sessions, setSessions]   = useState<HistorySessionSummary[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [hasMore, setHasMore]     = useState(true);
  const pageRef                   = useRef(0);

  const load = useCallback(async (reset = false) => {
    setLoading(true);
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
        workout_templates ( name ),
        session_exercises ( id, set_entries ( count ) )
      `)
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (queryError || !data) {
      setError(queryError?.message ?? 'Failed to load history');
      setLoading(false);
      return;
    }

    const mapped: HistorySessionSummary[] = data.map((row: {
      id: string;
      started_at: string;
      completed_at: string | null;
      duration_seconds: number | null;
      template_name: string | null;
      workout_templates: { name: string } | null;
      session_exercises: { id: string; set_entries: { count: number }[] }[];
    }) => ({
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

    if (reset) {
      setSessions(mapped);
      pageRef.current = 1;
    } else {
      setSessions((prev) => [...prev, ...mapped]);
      pageRef.current = currentPage + 1;
    }

    setHasMore(data.length === PAGE_SIZE);
    setLoading(false);
  }, []);

  const refresh = useCallback(() => load(true), [load]);
  const loadMore = useCallback(() => { if (!loading && hasMore) load(false); }, [load, loading, hasMore]);

  return { sessions, loading, error, hasMore, refresh, loadMore };
}
