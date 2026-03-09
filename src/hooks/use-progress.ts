/**
 * useExerciseProgress — fetches per-session top-set, e1RM, and volume
 * data for a single exercise, plus that exercise's personal records.
 *
 * All time-range filtering is done client-side on the already-fetched data.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcE1RM } from '@/lib/utils';
import type { Json } from '@/types/database';
import type { AISuggestionData } from '@/types/app';

// ── Public types ──────────────────────────────────────────────────────────────

export type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'All';

export const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'All': Infinity,
};

/** One data point per completed workout session */
export interface ProgressPoint {
  date:       string;  // ISO — workout session started_at
  sessionId:  string;
  topWeight:  number;  // heaviest working/top set (0 if no weight field)
  topReps:    number;  // reps at that heaviest set
  e1rm:       number;  // max Epley e1RM across working/top sets (0 if n/a)
  volumeKg:   number;  // sum of weight × reps for all completed working/top sets
}

export interface PRData {
  record_type:    'best_weight' | 'best_reps_at_weight' | 'best_e1rm' | 'best_volume';
  record_value:   number;
  achieved_at:    string;
  record_context: Json | null;
}

// ── Internal raw types ────────────────────────────────────────────────────────

interface RawSet {
  values:       Json;
  set_type:     string;
  is_completed: boolean;
}

interface RawSE {
  workout_sessions: {
    id:           string;
    started_at:   string;
    completed_at: string | null;
  };
  set_entries: RawSet[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computePoint(se: RawSE): ProgressPoint | null {
  const { started_at, id, completed_at } = se.workout_sessions;
  if (!completed_at) return null;

  const working = se.set_entries.filter(
    (s) => s.is_completed && (s.set_type === 'working' || s.set_type === 'top'),
  );
  if (working.length === 0) return null;

  let topWeight = 0;
  let topReps   = 0;
  let maxE1RM   = 0;
  let totalVol  = 0;

  for (const s of working) {
    const v = s.values as Record<string, number>;
    const w = v.weight ?? 0;
    const r = v.reps ?? 0;
    if (w > topWeight || (w === topWeight && r > topReps)) {
      topWeight = w;
      topReps   = r;
    }
    const e1rm = calcE1RM(w, r);
    if (e1rm > maxE1RM) maxE1RM = e1rm;
    totalVol += w * r;
  }

  return {
    date:      started_at,
    sessionId: id,
    topWeight,
    topReps,
    e1rm:      maxE1RM,
    volumeKg:  Math.round(totalVol * 10) / 10,
  };
}

export function filterByTimeRange(points: ProgressPoint[], range: TimeRange): ProgressPoint[] {
  const days = TIME_RANGE_DAYS[range];
  if (days === Infinity) return points;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return points.filter((p) => new Date(p.date) >= cutoff);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface PlateauStatus {
  isPlateau:       boolean;
  sessionsStalled: number;
  intervention:    string;
}

export function useExerciseProgress(exerciseId: string | null) {
  const [allPoints, setAllPoints] = useState<ProgressPoint[]>([]);
  const [prs,       setPRs]       = useState<PRData[]>([]);
  const [plateau,   setPlateau]   = useState<PlateauStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const fetch = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    // Cast needed: Relationships:[] prevents nested select type resolution
    type SEResult = { data: RawSE[] | null; error: { message: string } | null };
    const seRes = (await supabase
      .from('session_exercises')
      .select(`
        workout_sessions!inner ( id, started_at, completed_at ),
        set_entries ( values, set_type, is_completed )
      `)
      .eq('exercise_id', id)
    ) as unknown as SEResult;

    const [prRes, suggRes] = await Promise.all([
      supabase
        .from('personal_records')
        .select('record_type, record_value, achieved_at, record_context')
        .eq('exercise_id', id)
        .order('record_type'),
      supabase
        .from('ai_suggestions')
        .select('suggestion_data')
        .eq('exercise_id', id)
        .gt('expires_at', new Date().toISOString())
        .limit(1),
    ]);

    setIsLoading(false);

    if (seRes.error || !seRes.data) {
      setError('Could not load progress data.');
      return;
    }

    const points = seRes.data
      .map(computePoint)
      .filter((p): p is ProgressPoint => p !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    setAllPoints(points);
    setPRs((prRes.data ?? []) as PRData[]);

    // Extract plateau status from cached AI suggestion
    const rawSugg = suggRes.data?.[0]?.suggestion_data as AISuggestionData | null | undefined;
    if (rawSugg?.plateau_flag && rawSugg.plateau_intervention) {
      setPlateau({
        isPlateau:       true,
        sessionsStalled: rawSugg.plateau_sessions_stalled ?? 0,
        intervention:    rawSugg.plateau_intervention,
      });
    } else {
      setPlateau(null);
    }
  }, []);

  useEffect(() => {
    if (!exerciseId) {
      setAllPoints([]);
      setPRs([]);
      setPlateau(null);
      return;
    }
    void fetch(exerciseId);
  }, [exerciseId, fetch]);

  return { allPoints, prs, plateau, isLoading, error };
}
