'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { invokeAuthedFunction } from '@/lib/supabase/invoke-authed-function';
import { WeeklySummaryDataSchema } from '@/lib/validation';
import type { WeeklySummaryData } from '@/types/app';

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = monday.toLocaleDateString('en-US', opts);
  const end = sunday.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${start} – ${end}`;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function useWeeklySummaries() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [summary, setSummary] = useState<WeeklySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCurrentWeek = toISODate(weekStart) === toISODate(getMonday(new Date()));
  const weekLabel = formatWeekLabel(weekStart);

  // Fetch cached summary from DB for selected week
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetch() {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from('weekly_summaries')
        .select('summary_data')
        .eq('week_start', toISODate(weekStart))
        .maybeSingle();

      if (cancelled) return;

      if (err) {
        setError('Failed to load summary');
        setSummary(null);
      } else if (data?.summary_data) {
        const parsed = WeeklySummaryDataSchema.safeParse(data.summary_data);
        setSummary(parsed.success ? parsed.data : null);
      } else {
        setSummary(null);
      }
      setLoading(false);
    }

    void fetch();
    return () => { cancelled = true; };
  }, [weekStart]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    const supabase = createClient();

    const { data, error: err } = await invokeAuthedFunction<WeeklySummaryData>(
      supabase,
      'generate-weekly-summary',
      { week_start: toISODate(weekStart), force: true },
    );

    if (err) {
      setError(err.message);
    } else {
      const payload =
        ((data as { data?: WeeklySummaryData } | null)?.data) ??
        (data as WeeklySummaryData);
      setSummary(payload);
    }
    setGenerating(false);
  }, [weekStart]);

  const goToPreviousWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, []);

  const goToNextWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      // Don't go past current week
      const currentMonday = getMonday(new Date());
      return d > currentMonday ? prev : d;
    });
  }, []);

  return {
    summary,
    loading,
    generating,
    error,
    weekLabel,
    isCurrentWeek,
    generate,
    goToPreviousWeek,
    goToNextWeek,
  };
}
