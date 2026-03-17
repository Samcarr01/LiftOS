/**
 * Export all user data as a single JSON file — no server round-trip.
 * Queries every user-owned table, bundles into one blob, triggers download.
 */

import { createClient } from '@/lib/supabase/client';

export async function exportUserData(): Promise<void> {
  const supabase = createClient();

  const [
    { data: templates },
    { data: templateExercises },
    { data: exercises },
    { data: sessions },
    { data: sessionExercises },
    { data: setEntries },
    { data: personalRecords },
    { data: aiSuggestions },
    { data: weeklySummaries },
    { data: profile },
  ] = await Promise.all([
    supabase.from('workout_templates').select('*'),
    supabase.from('template_exercises').select('*'),
    supabase.from('exercises').select('*'),
    supabase.from('workout_sessions').select('*'),
    supabase.from('session_exercises').select('*'),
    supabase.from('set_entries').select('*'),
    supabase.from('personal_records').select('*'),
    supabase.from('ai_suggestions').select('*'),
    supabase.from('weekly_summaries').select('*'),
    supabase.from('users').select('*').single(),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    profile,
    templates,
    templateExercises,
    exercises,
    sessions,
    sessionExercises,
    setEntries,
    personalRecords,
    aiSuggestions,
    weeklySummaries,
  };

  const json  = JSON.stringify(payload, null, 2);
  const blob  = new Blob([json], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `liftos-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
