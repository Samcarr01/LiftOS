'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
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

    const { data, error: err } = await supabase.functions.invoke('generate-weekly-summary', {
      body: {},
    });

    if (err) {
      setError(err.message);
    } else {
      setSummary(data as WeeklySummaryData);
      setGenerated(true);
    }
    setLoading(false);
  }, []);

  return { summary, loading, error, generated, generate };
}
