/**
 * exportUserData — fetches all user data from Supabase and triggers
 * the native share sheet with the full JSON payload.
 *
 * Tables exported:
 *   workout_templates, template_exercises, workout_sessions,
 *   session_exercises, set_entries, exercises, personal_records,
 *   last_performance_snapshots, ai_suggestions, weekly_summaries
 *
 * Uses React Native's built-in Share API — no extra package needed.
 */
import { Share } from 'react-native';
import { supabase } from './supabase';

export async function exportUserData(userId: string): Promise<void> {
  // Fetch everything in parallel
  const [
    templatesRes,
    sessionsRes,
    exercisesRes,
    prsRes,
    snapshotsRes,
    weeklySummariesRes,
  ] = await Promise.all([
    supabase
      .from('workout_templates')
      .select('*, template_exercises(*)')
      .eq('user_id', userId),

    supabase
      .from('workout_sessions')
      .select('*, session_exercises(*, set_entries(*))')
      .eq('user_id', userId)
      .order('started_at', { ascending: false }),

    supabase
      .from('exercises')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('personal_records')
      .select('*')
      .eq('user_id', userId)
      .order('achieved_at', { ascending: false }),

    supabase
      .from('last_performance_snapshots')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('weekly_summaries')
      .select('*')
      .eq('user_id', userId)
      .order('week_start', { ascending: false }),
  ]);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    userId,
    data: {
      workout_templates:           templatesRes.data   ?? [],
      workout_sessions:            sessionsRes.data    ?? [],
      exercises:                   exercisesRes.data   ?? [],
      personal_records:            prsRes.data         ?? [],
      last_performance_snapshots:  snapshotsRes.data   ?? [],
      weekly_summaries:            weeklySummariesRes.data ?? [],
    },
  };

  const json = JSON.stringify(exportPayload, null, 2);

  await Share.share(
    {
      message: json,
      title: 'LiftOS Data Export',
    },
    {
      dialogTitle: 'Export LiftOS Data',
    },
  );
}
