'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { invokeAuthedFunction } from '@/lib/supabase/invoke-authed-function';
import type { WeeklySummaryData } from '@/types/app';

export function useWeeklySummary() {
  const [summary, setSummary]     = useState<WeeklySummaryData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: err } = await invokeAuthedFunction<WeeklySummaryData>(
      supabase,
      'generate-weekly-summary',
      {},
    );

    if (err) {
      setError(err.message);
    } else {
      const payload =
        ((data as { data?: WeeklySummaryData } | null)?.data) ??
        (data as WeeklySummaryData);
      setSummary(payload);
      setGenerated(true);
    }
    setLoading(false);
  }, []);

  return { summary, loading, error, generated, generate };
}
