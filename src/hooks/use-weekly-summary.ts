/**
 * useWeeklySummary — fetches or generates the weekly summary for a given
 * week, plus the previous week's data for delta comparison.
 *
 * On mount: loads from weekly_summaries cache. If no cached row exists,
 * calls generate-weekly-summary Edge Function to produce one.
 *
 * Navigation: goToPrevWeek / goToNextWeek shift the week by 7 days.
 * Future weeks (after today's Monday) cannot be navigated to.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { WeeklySummaryData } from '@/types/app';

// ── Week helpers ───────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for the Monday of the current week (UTC). */
export function currentMonday(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon…
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().split('T')[0];
}

/** Returns YYYY-MM-DD 7 days before the given Monday. */
export function prevMonday(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().split('T')[0];
}

/** Returns YYYY-MM-DD 7 days after the given Monday. */
export function nextMonday(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().split('T')[0];
}

/** Format a YYYY-MM-DD week start as "Week of Mar 3, 2026". */
export function formatWeekStart(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return `Week of ${d.toLocaleDateString('en-GB', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
    timeZone: 'UTC',
  })}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWeeklySummary() {
  const thisMonday = currentMonday();
  const [weekStart,    setWeekStart]    = useState(thisMonday);
  const [summary,      setSummary]      = useState<WeeklySummaryData | null>(null);
  const [prevSummary,  setPrevSummary]  = useState<WeeklySummaryData | null>(null);
  const [isLoading,    setIsLoading]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const canGoNext = weekStart < thisMonday; // can't navigate past current week

  /** Fetch cached summary from DB; if absent, trigger server generation. */
  const loadWeek = useCallback(async (wStart: string) => {
    setIsLoading(true);
    setError(null);
    setSummary(null);
    setPrevSummary(null);

    // 1. Try cache first
    const { data: cached } = await supabase
      .from('weekly_summaries')
      .select('summary_data')
      .eq('week_start', wStart)
      .maybeSingle();

    if (cached?.summary_data) {
      setSummary(cached.summary_data as WeeklySummaryData);
    } else {
      // 2. Generate via Edge Function
      const { data: res, error: fnErr } = await supabase.functions.invoke(
        'generate-weekly-summary',
        { body: { week_start: wStart } },
      );
      if (fnErr || !res?.data) {
        setError('Could not generate weekly summary. Try again later.');
        setIsLoading(false);
        return;
      }
      setSummary(res.data as WeeklySummaryData);
    }

    // 3. Fetch previous week for deltas (from cache only — don't auto-generate old weeks)
    const pStart = prevMonday(wStart);
    const { data: prev } = await supabase
      .from('weekly_summaries')
      .select('summary_data')
      .eq('week_start', pStart)
      .maybeSingle();

    setPrevSummary((prev?.summary_data as WeeklySummaryData) ?? null);
    setIsLoading(false);
  }, []);

  /** Force-regenerate the current week (ignore cache). */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data: res, error: fnErr } = await supabase.functions.invoke(
      'generate-weekly-summary',
      { body: { week_start: weekStart, force: true } },
    );
    if (fnErr || !res?.data) {
      setError('Could not refresh. Try again later.');
    } else {
      setSummary(res.data as WeeklySummaryData);
    }
    setIsLoading(false);
  }, [weekStart]);

  const goToPrevWeek = useCallback(() => {
    setWeekStart((w) => prevMonday(w));
  }, []);

  const goToNextWeek = useCallback(() => {
    if (canGoNext) setWeekStart((w) => nextMonday(w));
  }, [canGoNext]);

  useEffect(() => {
    void loadWeek(weekStart);
  }, [weekStart, loadWeek]);

  return {
    weekStart,
    summary,
    prevSummary,
    isLoading,
    error,
    canGoNext,
    goToPrevWeek,
    goToNextWeek,
    refresh,
  };
}
