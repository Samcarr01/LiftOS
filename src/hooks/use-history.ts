/**
 * useHistory — paginated list of completed workout sessions.
 * useSessionDetail — full data for a single session.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { TrackingSchemaValidator } from '@/lib/validation';
import type {
  HistorySessionSummary,
  SessionDetail,
  SessionDetailExercise,
  SessionDetailSet,
  PersonalRecordSummary,
  SetValues,
  SetType,
} from '@/types/app';
import type { Json } from '@/types/database';

// ── Shared helpers ────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

interface RawSetEntry {
  set_type:     string;
  is_completed: boolean;
  values:       Json;
}

interface RawSession {
  id:               string;
  started_at:       string;
  completed_at:     string | null;
  duration_seconds: number | null;
  workout_templates: { name: string } | null;
  session_exercises: Array<{
    id:         string;
    set_entries: RawSetEntry[];
  }> | null;
}

function computeListSummary(raw: RawSession): HistorySessionSummary {
  let totalSets = 0;
  let volumeKg  = 0;

  for (const se of raw.session_exercises ?? []) {
    for (const s of se.set_entries ?? []) {
      if (!s.is_completed) continue;
      totalSets++;
      const v = s.values as Record<string, number>;
      volumeKg += (v.weight ?? 0) * (v.reps ?? 0);
    }
  }

  return {
    id:               raw.id,
    started_at:       raw.started_at,
    completed_at:     raw.completed_at,
    duration_seconds: raw.duration_seconds,
    template_name:    raw.workout_templates?.name ?? null,
    exercise_count:   raw.session_exercises?.length ?? 0,
    total_sets:       totalSets,
    volume_kg:        Math.round(volumeKg * 10) / 10,
  };
}

// ── useHistory ────────────────────────────────────────────────────────────────

export function useHistory() {
  const [sessions,     setSessions]     = useState<HistorySessionSummary[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore,      setHasMore]      = useState(true);

  const pageRef      = useRef(0);
  const fetchingRef  = useRef(false);

  const load = useCallback(async (reset: boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const from = reset ? 0 : pageRef.current * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    if (reset) setIsRefreshing(true);
    else       setIsLoading(true);

    const { data, error } = await supabase
      .from('workout_sessions')
      .select(`
        id, started_at, completed_at, duration_seconds,
        workout_templates ( name ),
        session_exercises (
          id,
          set_entries ( set_type, is_completed, values )
        )
      `)
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false })
      .range(from, to);

    fetchingRef.current = false;
    if (reset) setIsRefreshing(false);
    else       setIsLoading(false);

    if (error || !data) return;

    const summaries = (data as unknown as RawSession[]).map(computeListSummary);
    setHasMore(summaries.length === PAGE_SIZE);

    if (reset) {
      setSessions(summaries);
      pageRef.current = 1;
    } else {
      setSessions((prev) => [...prev, ...summaries]);
      pageRef.current += 1;
    }
  }, []);

  const refresh  = useCallback(() => void load(true),  [load]);
  const loadMore = useCallback(() => { if (hasMore) void load(false); }, [hasMore, load]);
  const init     = useCallback(() => void load(true),  [load]);

  return { sessions, isLoading, isRefreshing, hasMore, refresh, loadMore, init };
}

// ── useSessionDetail ──────────────────────────────────────────────────────────

interface RawDetailSetEntry {
  id:           string;
  set_index:    number;
  values:       Json;
  set_type:     string;
  is_completed: boolean;
  notes:        string | null;
  logged_at:    string;
}

interface RawDetailExercise {
  id:          string;
  exercise_id: string;
  order_index: number;
  notes:       string | null;
  exercises:   {
    name:            string;
    muscle_groups:   string[];
    tracking_schema: Json;
  } | null;
  set_entries: RawDetailSetEntry[];
}

interface RawDetailSession {
  id:               string;
  started_at:       string;
  completed_at:     string | null;
  duration_seconds: number | null;
  notes:            string | null;
  workout_templates: { name: string } | null;
  session_exercises: RawDetailExercise[];
}

export function useSessionDetail(sessionId: string) {
  const [detail,    setDetail]    = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setDetail(null);

    const fetchData = async () => {
      // Cast needed: Relationships:[] on all tables means Supabase SDK can't
      // resolve nested selects and widens the result type to never.
      type SessionQueryResult = { data: RawDetailSession | null; error: { message: string } | null };
      const sessionRes = (await supabase
        .from('workout_sessions')
        .select(`
          id, started_at, completed_at, duration_seconds, notes,
          workout_templates ( name ),
          session_exercises (
            id, exercise_id, order_index, notes,
            exercises ( name, muscle_groups, tracking_schema ),
            set_entries ( id, set_index, values, set_type, is_completed, notes, logged_at )
          )
        `)
        .eq('id', sessionId)
        .single()) as unknown as SessionQueryResult;

      if (cancelled) return;

      if (sessionRes.error || !sessionRes.data) {
        setError('Could not load session.');
        setIsLoading(false);
        return;
      }

      const prRes = await supabase
        .from('personal_records')
        .select('exercise_id, record_type, record_value')
        .eq('session_id' as never, sessionId);

      if (cancelled) return;

      const raw = sessionRes.data as unknown as RawDetailSession;
      const prs = (prRes.data ?? []) as PersonalRecordSummary[];

      // Group PRs by exercise
      const prsByExercise: Record<string, PersonalRecordSummary[]> = {};
      for (const pr of prs) {
        (prsByExercise[pr.exercise_id] ??= []).push(pr);
      }

      let totalSets     = 0;
      let totalVolumeKg = 0;

      const sortedExercises = [...(raw.session_exercises ?? [])].sort(
        (a, b) => a.order_index - b.order_index,
      );

      const exercises: SessionDetailExercise[] = sortedExercises.map((se) => {
        const schemaResult = TrackingSchemaValidator.safeParse(
          se.exercises?.tracking_schema ?? { fields: [] },
        );
        const trackingSchema = schemaResult.success
          ? schemaResult.data
          : { fields: [] as never[] };

        const sets: SessionDetailSet[] = [...(se.set_entries ?? [])]
          .sort((a, b) => a.set_index - b.set_index)
          .map((s) => {
            if (s.is_completed) {
              totalSets++;
              const v = s.values as Record<string, number>;
              totalVolumeKg += (v.weight ?? 0) * (v.reps ?? 0);
            }
            return {
              id:           s.id,
              set_index:    s.set_index,
              values:       s.values as SetValues,
              set_type:     s.set_type as SetType,
              is_completed: s.is_completed,
              notes:        s.notes,
              logged_at:    s.logged_at,
            };
          });

        return {
          session_exercise_id: se.id,
          exercise_id:         se.exercise_id,
          exercise_name:       se.exercises?.name ?? 'Unknown Exercise',
          muscle_groups:       se.exercises?.muscle_groups ?? [],
          order_index:         se.order_index,
          tracking_schema:     trackingSchema,
          notes:               se.notes,
          sets,
          prs:                 prsByExercise[se.exercise_id] ?? [],
        };
      });

      setDetail({
        id:               raw.id,
        started_at:       raw.started_at,
        completed_at:     raw.completed_at,
        duration_seconds: raw.duration_seconds,
        template_name:    raw.workout_templates?.name ?? null,
        notes:            raw.notes,
        exercises,
        total_volume_kg:  Math.round(totalVolumeKg * 10) / 10,
        total_sets:       totalSets,
      });
      setIsLoading(false);
    };

    void fetchData();
    return () => { cancelled = true; };
  }, [sessionId]);

  return { detail, isLoading, error };
}
