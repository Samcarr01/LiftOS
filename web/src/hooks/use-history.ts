'use client';

import { useState, useCallback } from 'react';
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
  const [hasMore, setHasMore]     = useState(true);
  const [page, setPage]           = useState(0);

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    const supabase = createClient();
    const offset   = reset ? 0 : page * PAGE_SIZE;

    const { data, error } = await supabase
      .from('workout_sessions')
      .select(`
        id,
        started_at,
        completed_at,
        duration_seconds,
        template_id,
        workout_templates ( name ),
        session_exercises ( count ),
        set_entries ( count )
      `)
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data) {
      setLoading(false);
      return;
    }

    const mapped: HistorySessionSummary[] = data.map((row: {
      id: string;
      started_at: string;
      completed_at: string | null;
      duration_seconds: number | null;
      workout_templates: { name: string } | null;
      session_exercises: { count: number }[];
      set_entries: { count: number }[];
      // volume_kg not in this query — computed separately or omitted
    }) => ({
      id:               row.id,
      started_at:       row.started_at,
      completed_at:     row.completed_at,
      duration_seconds: row.duration_seconds,
      template_name:    row.workout_templates?.name ?? null,
      exercise_count:   row.session_exercises?.[0]?.count ?? 0,
      total_sets:       row.set_entries?.[0]?.count ?? 0,
      volume_kg:        0, // will be enriched below
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
      setPage(1);
    } else {
      setSessions((prev) => [...prev, ...mapped]);
      setPage((p) => p + 1);
    }

    setHasMore(data.length === PAGE_SIZE);
    setLoading(false);
  }, [page]);

  const refresh = useCallback(() => load(true), [load]);
  const loadMore = useCallback(() => { if (!loading && hasMore) load(false); }, [load, loading, hasMore]);

  return { sessions, loading, hasMore, refresh, loadMore };
}
