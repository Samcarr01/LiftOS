/**
 * useHomeData — aggregates all dashboard data in a single hook.
 *
 * - Fetches templates + last 5 sessions in parallel.
 * - Computes: suggested workout, pinned templates, recent sessions, last-session highlights.
 * - Soft-refreshes in the background when the app returns to foreground.
 * - Pull-to-refresh via explicit `refresh()` call.
 *
 * Target: initial render < 300 ms (first paint from cache, network fills in the background).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth-store';
import type { TemplateWithCount } from './use-templates';
import type { WorkoutTemplateRow } from '@/types/database';

// ── Public types ──────────────────────────────────────────────────────────────

export interface HomeRecentSession {
  id:               string;
  started_at:       string;
  completed_at:     string;
  duration_seconds: number | null;
  template_name:    string | null;
  exercise_count:   number;
  total_sets:       number;
  volume_kg:        number;
}

export interface HomeData {
  suggestedTemplate:      TemplateWithCount | null;  // longest-since-last-use
  pinnedTemplates:        TemplateWithCount[];
  allTemplates:           TemplateWithCount[];        // for FAB picker
  recentSessions:         HomeRecentSession[];        // last 5
  lastSessionHighlights:  string[];                   // ["Bench: 80kg × 5"]
  hasAnyData:             boolean;                    // false = new user
}

// ── Raw shapes ─────────────────────────────────────────────────────────────────

interface RawSetEntry {
  values:       Record<string, number | null>;
  set_type:     string;
  is_completed: boolean;
}

interface RawSE {
  exercise_id: string;
  exercises:   { name: string } | null;
  set_entries: RawSetEntry[];
}

interface RawSession {
  id:               string;
  started_at:       string;
  completed_at:     string | null;
  duration_seconds: number | null;
  workout_templates:{ name: string } | null;
  session_exercises: Array<{
    set_entries: Array<{ is_completed: boolean; values: Record<string, number> }>;
  }> | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeSuggested(templates: TemplateWithCount[]): TemplateWithCount | null {
  if (templates.length === 0) return null;
  // Prefer templates never used, then the one with the oldest last_used_at
  const sorted = [...templates].sort((a, b) => {
    if (!a.last_used_at && !b.last_used_at) return 0;
    if (!a.last_used_at) return -1;
    if (!b.last_used_at) return 1;
    return a.last_used_at.localeCompare(b.last_used_at);
  });
  return sorted[0] ?? null;
}

function buildHighlights(seRows: RawSE[]): string[] {
  const highlights: string[] = [];
  for (const se of seRows) {
    const workingSets = (se.set_entries ?? []).filter(
      (s) => s.is_completed && (s.set_type === 'working' || s.set_type === 'top'),
    );
    if (workingSets.length === 0) continue;

    let bestWeight = 0;
    let bestReps   = 0;
    for (const s of workingSets) {
      const w = Number(s.values.weight ?? 0);
      const r = Number(s.values.reps   ?? 0);
      if (w > bestWeight || (w === bestWeight && r > bestReps)) {
        bestWeight = w;
        bestReps   = r;
      }
    }
    const name = se.exercises?.name;
    if (name && bestWeight > 0 && bestReps > 0) {
      highlights.push(`${name}: ${bestWeight}kg × ${bestReps}`);
    } else if (name && bestReps > 0) {
      highlights.push(`${name}: ${bestReps} reps`);
    }
    if (highlights.length >= 3) break;
  }
  return highlights;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const EMPTY: HomeData = {
  suggestedTemplate:     null,
  pinnedTemplates:       [],
  allTemplates:          [],
  recentSessions:        [],
  lastSessionHighlights: [],
  hasAnyData:            false,
};

export function useHomeData() {
  const user              = useAuthStore((s) => s.user);
  const [data, setData]   = useState<HomeData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchingRef = useRef(false);

  const load = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      // ── Parallel: templates + recent sessions ──────────────────────────────
      const [tmplRes, sessionRes] = await Promise.all([
        supabase
          .from('workout_templates')
          .select('*')
          .eq('user_id', user.id)
          .order('is_pinned',   { ascending: false })
          .order('last_used_at',{ ascending: false, nullsFirst: false })
          .order('created_at',  { ascending: false }) as unknown as Promise<{ data: WorkoutTemplateRow[] | null; error: unknown }>,

        supabase
          .from('workout_sessions')
          .select(`
            id, started_at, completed_at, duration_seconds,
            workout_templates ( name ),
            session_exercises ( set_entries ( is_completed, values ) )
          `)
          .eq('user_id', user.id)
          .not('completed_at', 'is', null)
          .order('started_at', { ascending: false })
          .limit(5) as unknown as Promise<{ data: RawSession[] | null; error: unknown }>,
      ]);

      const templates = (tmplRes.data ?? []);

      // Fetch exercise counts
      let countMap: Record<string, number> = {};
      if (templates.length > 0) {
        const { data: exData } = await supabase
          .from('template_exercises')
          .select('template_id')
          .in('template_id', templates.map((t) => t.id)) as { data: { template_id: string }[] | null; error: unknown };

        countMap = (exData ?? []).reduce<Record<string, number>>((acc, row) => {
          acc[row.template_id] = (acc[row.template_id] ?? 0) + 1;
          return acc;
        }, {});
      }

      const enriched: TemplateWithCount[] = templates.map((t) => ({
        ...t,
        exercise_count: countMap[t.id] ?? 0,
      }));

      // ── Build recent sessions ──────────────────────────────────────────────
      const recentSessions: HomeRecentSession[] = (sessionRes.data ?? [])
        .filter((s) => s.completed_at != null)
        .map((s) => {
          let totalSets = 0;
          let volumeKg  = 0;
          for (const se of s.session_exercises ?? []) {
            for (const entry of se.set_entries ?? []) {
              if (!entry.is_completed) continue;
              totalSets++;
              const v = entry.values as Record<string, number>;
              volumeKg += (v.weight ?? 0) * (v.reps ?? 0);
            }
          }
          return {
            id:               s.id,
            started_at:       s.started_at,
            completed_at:     s.completed_at!,
            duration_seconds: s.duration_seconds,
            template_name:    (s.workout_templates as { name: string } | null)?.name ?? null,
            exercise_count:   s.session_exercises?.length ?? 0,
            total_sets:       totalSets,
            volume_kg:        Math.round(volumeKg * 10) / 10,
          };
        });

      // ── Last-session highlights ────────────────────────────────────────────
      let lastSessionHighlights: string[] = [];
      if (recentSessions.length > 0) {
        const latestId = recentSessions[0].id;
        type HlResult = { data: RawSE[] | null; error: unknown };
        const hlRes = (await supabase
          .from('session_exercises')
          .select('exercise_id, exercises ( name ), set_entries ( values, set_type, is_completed )')
          .eq('session_id', latestId)
        ) as unknown as HlResult;

        lastSessionHighlights = buildHighlights(hlRes.data ?? []);
      }

      setData({
        suggestedTemplate:     computeSuggested(enriched),
        pinnedTemplates:       enriched.filter((t) => t.is_pinned),
        allTemplates:          enriched,
        recentSessions,
        lastSessionHighlights,
        hasAnyData:            enriched.length > 0 || recentSessions.length > 0,
      });
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to load dashboard.');
    } finally {
      fetchingRef.current = false;
      setIsLoading(false);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    void load(true);
  }, [load]);

  // Soft refresh when app returns to foreground
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active') void load(false); // background refresh, no spinner
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { data, isLoading, error, refresh };
}
