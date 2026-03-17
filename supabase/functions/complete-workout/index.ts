// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lift-os.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── PR helpers ─────────────────────────────────────────────────────────────────

function epleyE1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

type SetValues = Record<string, number | string | null>;

function detectPRs(
  sets: Array<{ values: SetValues; set_type: string }>,
  existingMap: Map<string, number>,
): Array<{ record_type: string; record_value: number; previous_value: number | null }> {
  // Only count working and top sets
  const eligible = sets.filter((s) =>
    ['working', 'top'].includes(s.set_type),
  );

  if (!eligible.length) return [];

  const results: Array<{ record_type: string; record_value: number; previous_value: number | null }> = [];

  const weightedSets = eligible.filter(
    (s) => typeof s.values.weight === 'number' && typeof s.values.reps === 'number',
  );

  if (weightedSets.length === 0) return results;

  // best_weight
  const maxWeight = Math.max(...weightedSets.map((s) => s.values.weight as number));
  const existing_weight = existingMap.get('best_weight') ?? 0;
  if (maxWeight > existing_weight) {
    results.push({ record_type: 'best_weight', record_value: maxWeight, previous_value: existing_weight || null });
  }

  // best_e1rm (Epley: weight × (1 + reps/30))
  const maxE1RM = Math.max(
    ...weightedSets.map((s) => epleyE1RM(s.values.weight as number, s.values.reps as number)),
  );
  const existing_e1rm = existingMap.get('best_e1rm') ?? 0;
  if (maxE1RM > existing_e1rm) {
    results.push({ record_type: 'best_e1rm', record_value: +maxE1RM.toFixed(2), previous_value: existing_e1rm || null });
  }

  // best_reps_at_weight (max reps at the heaviest weight used)
  const heaviestSets = weightedSets.filter((s) => (s.values.weight as number) === maxWeight);
  const maxRepsAtWeight = Math.max(...heaviestSets.map((s) => s.values.reps as number));
  const existing_reps = existingMap.get('best_reps_at_weight') ?? 0;
  if (maxRepsAtWeight > existing_reps) {
    results.push({ record_type: 'best_reps_at_weight', record_value: maxRepsAtWeight, previous_value: existing_reps || null });
  }

  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const sessionId: string = body.session_id;
    if (!sessionId) return json({ error: 'session_id required' }, 422);

    // ── Fetch session ─────────────────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from('workout_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionErr || !session) return json({ error: 'Session not found' }, 404);

    const now = new Date().toISOString();

    // ── Idempotency guard ─────────────────────────────────────────────────────
    // If already completed, return the existing session data without re-running.
    // This makes it safe to call twice (e.g., on retry after network failure).
    if (session.completed_at) {
      return json({
        data: {
          session,
          new_prs: [],
          summary: {
            exercise_count: 0,
            total_sets: 0,
            total_volume_kg: 0,
            duration_seconds: session.duration_seconds ?? 0,
            already_completed: true,
          },
        },
      }, 200);
    }

    const durationSeconds = Math.floor(
      (new Date(now).getTime() - new Date(session.started_at).getTime()) / 1000,
    );

    // ── Mark session complete ─────────────────────────────────────────────────
    await supabase
      .from('workout_sessions')
      .update({ completed_at: now, duration_seconds: durationSeconds })
      .eq('id', sessionId);

    // ── Update template last_used_at ──────────────────────────────────────────
    if (session.template_id) {
      await supabase
        .from('workout_templates')
        .update({ last_used_at: now })
        .eq('id', session.template_id);
    }

    // ── Fetch session_exercises + set_entries (completed only) ────────────────
    const { data: sessionExercises } = await supabase
      .from('session_exercises')
      .select('*, set_entries(*)')
      .eq('session_id', sessionId);

    // ── Fetch exercise names for PR reporting ─────────────────────────────────
    const exerciseIds = (sessionExercises ?? []).map((se: any) => se.exercise_id);
    const { data: exerciseRows } = exerciseIds.length
      ? await supabase.from('exercises').select('id, name').in('id', exerciseIds)
      : { data: [] };

    const exerciseNameMap = new Map<string, string>(
      (exerciseRows ?? []).map((e: any) => [e.id, e.name]),
    );

    // ── Fetch existing PRs for all exercises ──────────────────────────────────
    const { data: existingPRs } = exerciseIds.length
      ? await supabase
          .from('personal_records')
          .select('exercise_id, record_type, record_value')
          .eq('user_id', user.id)
          .in('exercise_id', exerciseIds)
      : { data: [] };

    // Group existing PRs by exercise_id
    const existingPRsByExercise = new Map<string, Map<string, number>>();
    for (const pr of existingPRs ?? []) {
      if (!existingPRsByExercise.has(pr.exercise_id)) {
        existingPRsByExercise.set(pr.exercise_id, new Map());
      }
      existingPRsByExercise.get(pr.exercise_id)!.set(pr.record_type, Number(pr.record_value));
    }

    // ── Process each exercise ─────────────────────────────────────────────────
    const newPRs: any[] = [];
    let totalSets = 0;
    let totalVolumeKg = 0;

    for (const se of sessionExercises ?? []) {
      const allSets: any[] = se.set_entries ?? [];
      const completedSets = allSets.filter((s: any) => s.is_completed);
      if (!completedSets.length) continue;

      totalSets += completedSets.length;

      // Accumulate volume (weight × reps) across all completed sets
      for (const s of completedSets) {
        const v = s.values as SetValues;
        if (typeof v.weight === 'number' && typeof v.reps === 'number') {
          totalVolumeKg += v.weight * v.reps;
        }
      }

      // ── Upsert last_performance_snapshot ─────────────────────────────────
      const setsData = completedSets.map((s: any) => ({
        set_index: s.set_index,
        values: s.values,
        set_type: s.set_type,
      }));

      await supabase.from('last_performance_snapshots').upsert(
        {
          user_id: user.id,
          exercise_id: se.exercise_id,
          session_id: sessionId,
          sets_data: setsData,
          performed_at: now,
        },
        { onConflict: 'user_id,exercise_id' },
      );

      // ── Detect PRs ────────────────────────────────────────────────────────
      const existingMap = existingPRsByExercise.get(se.exercise_id) ?? new Map<string, number>();
      const detected = detectPRs(completedSets.map((s: any) => ({
        values: s.values as SetValues,
        set_type: s.set_type,
      })), existingMap);

      if (detected.length === 0) continue;

      // ── Upsert personal_records ───────────────────────────────────────────
      const prRows = detected.map((d) => ({
        user_id: user.id,
        exercise_id: se.exercise_id,
        record_type: d.record_type,
        record_value: d.record_value,
        achieved_at: now,
        session_id: sessionId,
      }));

      await supabase
        .from('personal_records')
        .upsert(prRows, { onConflict: 'user_id,exercise_id,record_type' });

      newPRs.push(
        ...detected.map((d) => ({
          exercise_id: se.exercise_id,
          exercise_name: exerciseNameMap.get(se.exercise_id) ?? 'Unknown',
          record_type: d.record_type,
          record_value: d.record_value,
          previous_value: d.previous_value,
        })),
      );
    }

    // ── Fire-and-forget: AI suggestion regeneration ────────────────────────
    // Invokes generate-ai-suggestion for each exercise asynchronously.
    // We intentionally do NOT await this — it runs after response is sent.
    if (exerciseIds.length > 0) {
      EdgeRuntime.waitUntil(
        Promise.allSettled(
          exerciseIds.map((eid: string) =>
            supabase.functions.invoke('generate-ai-suggestion', {
              body: { exercise_id: eid },
            }).catch(() => { /* ignore */ }),
          ),
        ),
      );
    }

    return json({
      data: {
        session: { ...session, completed_at: now, duration_seconds: durationSeconds },
        new_prs: newPRs,
        summary: {
          exercise_count: (sessionExercises ?? []).length,
          total_sets: totalSets,
          total_volume_kg: +totalVolumeKg.toFixed(1),
          duration_seconds: durationSeconds,
        },
      },
    }, 200);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[complete-workout]', err);
    return json({ error: message }, 500);
  }
});
