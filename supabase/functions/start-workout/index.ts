// @ts-nocheck — Deno runtime; no tsconfig, imports via esm.sh
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface LastPerfSet {
  set_index: number;
  values: Record<string, unknown>;
  set_type?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    // Forward the user's JWT so RLS is enforced automatically
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // ── Parse input ───────────────────────────────────────────────────────────
    const body = await req.json();
    const templateId: string | null = body.template_id ?? null;

    // ── User profile (subscription tier) ─────────────────────────────────────
    const { data: profile } = await supabase
      .from('users')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();
    const isPro = profile?.subscription_tier === 'pro';

    // ── Step 1: Fetch template exercises + exercise definitions ───────────────
    let templateExercises: any[] = [];
    if (templateId) {
      const { data, error } = await supabase
        .from('template_exercises')
        .select('*, exercise:exercises(*)')
        .eq('template_id', templateId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      templateExercises = data ?? [];
    }

    const exerciseIds: string[] = templateExercises.map((te) => te.exercise_id);

    // ── Step 2: Fetch last_performance_snapshots ──────────────────────────────
    const lastPerfMap = new Map<string, LastPerfSet[]>();
    if (exerciseIds.length > 0) {
      const { data: lastPerfs } = await supabase
        .from('last_performance_snapshots')
        .select('exercise_id, sets_data')
        .eq('user_id', user.id)
        .in('exercise_id', exerciseIds);
      for (const lp of lastPerfs ?? []) {
        lastPerfMap.set(lp.exercise_id, lp.sets_data as LastPerfSet[]);
      }
    }

    // ── Step 3: Fetch cached ai_suggestions (Pro only, non-expired) ───────────
    const aiMap = new Map<string, unknown>();
    if (isPro && exerciseIds.length > 0) {
      const { data: suggestions } = await supabase
        .from('ai_suggestions')
        .select('exercise_id, suggestion_data')
        .eq('user_id', user.id)
        .in('exercise_id', exerciseIds)
        .gt('expires_at', new Date().toISOString());
      for (const s of suggestions ?? []) {
        aiMap.set(s.exercise_id, s.suggestion_data);
      }
    }

    // ── Step 4: Create workout_session ────────────────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('workout_sessions')
      .insert({ user_id: user.id, template_id: templateId, started_at: new Date().toISOString() })
      .select()
      .single();
    if (sessionError || !session) throw sessionError ?? new Error('Failed to create session');

    // ── Step 5: Create session_exercises (snapshot of template at start) ──────
    const seByOrderIndex = new Map<number, any>();
    if (templateExercises.length > 0) {
      const inserts = templateExercises.map((te) => ({
        session_id: session.id,
        exercise_id: te.exercise_id,
        order_index: te.order_index,
        rest_seconds: te.rest_seconds,
        superset_group_id: te.superset_group_id,
        notes: te.notes,
      }));
      const { data: seRows, error: seError } = await supabase
        .from('session_exercises')
        .insert(inserts)
        .select();
      if (seError) throw seError;
      for (const row of seRows ?? []) {
        seByOrderIndex.set(row.order_index, row);
      }
    }

    // ── Step 6: Build prefilled_sets + assemble response ──────────────────────
    const exercises = templateExercises.map((te) => {
      const sessionExercise = seByOrderIndex.get(te.order_index) ?? null;
      const lastPerfSets = lastPerfMap.get(te.exercise_id) ?? null;
      const count: number = te.default_set_count ?? 3;

      // Prefilled = clone of last performance up to default_set_count.
      // If last session had fewer sets, the last set's values are repeated.
      // If no last performance, return empty value objects.
      let prefilledSets: Array<{ set_index: number; values: Record<string, unknown>; set_type: string }>;
      if (lastPerfSets && lastPerfSets.length > 0) {
        prefilledSets = Array.from({ length: count }, (_, i) => {
          const src = lastPerfSets[i] ?? lastPerfSets[lastPerfSets.length - 1];
          return {
            set_index: i + 1,
            values: { ...src.values },
            set_type: src.set_type ?? 'working',
          };
        });
      } else {
        prefilledSets = Array.from({ length: count }, (_, i) => ({
          set_index: i + 1,
          values: {},
          set_type: 'working',
        }));
      }

      return {
        session_exercise: sessionExercise,
        exercise: te.exercise,
        last_performance: lastPerfSets,       // raw sets_data — null if first time
        ai_suggestion: aiMap.get(te.exercise_id) ?? null,
        prefilled_sets: prefilledSets,
      };
    });

    return json({ data: { session, exercises } }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[start-workout]', err);
    return json({ error: message }, 500);
  }
});
