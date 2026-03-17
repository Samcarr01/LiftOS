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

interface IncomingMutation {
  client_id: string;
  table: 'set_entries' | 'workout_sessions' | 'session_exercises';
  operation: 'insert' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: string;
}

interface MutationResult {
  client_id: string;
  status: 'success' | 'duplicate' | 'error';
  message?: string;
}

// ── Table handlers ─────────────────────────────────────────────────────────────

async function applySetEntry(
  supabase: ReturnType<typeof createClient>,
  mutation: IncomingMutation,
): Promise<MutationResult> {
  const { data: d } = mutation;

  if (mutation.operation === 'delete') {
    const { error } = await supabase
      .from('set_entries')
      .delete()
      .eq('session_exercise_id', d.session_exercise_id)
      .eq('set_index', d.set_index);
    if (error) return { client_id: mutation.client_id, status: 'error', message: error.message };
    return { client_id: mutation.client_id, status: 'success' };
  }

  // insert or update: use upsert on (session_exercise_id, set_index)
  const row = {
    session_exercise_id: d.session_exercise_id,
    set_index: d.set_index,
    values: d.values,
    set_type: d.set_type ?? 'working',
    is_completed: d.is_completed ?? false,
    notes: d.notes ?? null,
    logged_at: d.logged_at ?? new Date().toISOString(),
  };

  const { error } = await supabase
    .from('set_entries')
    .upsert(row, { onConflict: 'session_exercise_id,set_index', ignoreDuplicates: false });

  if (error) return { client_id: mutation.client_id, status: 'error', message: error.message };
  return { client_id: mutation.client_id, status: 'success' };
}

async function applyWorkoutSession(
  supabase: ReturnType<typeof createClient>,
  mutation: IncomingMutation,
): Promise<MutationResult> {
  const { data: d } = mutation;

  if (mutation.operation === 'update') {
    const patch: Record<string, unknown> = {};
    if (d.completed_at !== undefined) patch.completed_at = d.completed_at;
    if (d.duration_seconds !== undefined) patch.duration_seconds = d.duration_seconds;
    if (d.notes !== undefined) patch.notes = d.notes;

    const { error } = await supabase
      .from('workout_sessions')
      .update(patch)
      .eq('id', d.id);
    if (error) return { client_id: mutation.client_id, status: 'error', message: error.message };
  }

  return { client_id: mutation.client_id, status: 'success' };
}

async function applySessionExercise(
  supabase: ReturnType<typeof createClient>,
  mutation: IncomingMutation,
): Promise<MutationResult> {
  const { data: d } = mutation;

  const row = {
    session_id: d.session_id,
    exercise_id: d.exercise_id,
    order_index: d.order_index,
    rest_seconds: d.rest_seconds ?? null,
    superset_group_id: d.superset_group_id ?? null,
    notes: d.notes ?? null,
  };

  const { error } = await supabase
    .from('session_exercises')
    .upsert(row, { onConflict: 'session_id,exercise_id,order_index', ignoreDuplicates: true });

  if (error) return { client_id: mutation.client_id, status: 'error', message: error.message };
  return { client_id: mutation.client_id, status: 'success' };
}

// ── Main handler ───────────────────────────────────────────────────────────────

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
    const mutations: IncomingMutation[] = body.mutations ?? [];

    if (!Array.isArray(mutations) || mutations.length === 0) {
      return json({ results: [] }, 200);
    }
    if (mutations.length > 100) {
      return json({ error: 'Max batch size is 100 mutations' }, 422);
    }

    // Sort by timestamp (oldest first) — last-write-wins at the row level
    const sorted = [...mutations].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    // Deduplicate by client_id (keep latest timestamp)
    const seen = new Map<string, IncomingMutation>();
    for (const m of sorted) {
      const prev = seen.get(m.client_id);
      if (!prev || new Date(m.timestamp) >= new Date(prev.timestamp)) {
        seen.set(m.client_id, m);
      }
    }

    const deduplicated = Array.from(seen.values());

    const results: MutationResult[] = await Promise.all(
      deduplicated.map(async (mutation) => {
        try {
          switch (mutation.table) {
            case 'set_entries':
              return await applySetEntry(supabase, mutation);
            case 'workout_sessions':
              return await applyWorkoutSession(supabase, mutation);
            case 'session_exercises':
              return await applySessionExercise(supabase, mutation);
            default:
              return {
                client_id: mutation.client_id,
                status: 'error' as const,
                message: `Unknown table: ${mutation.table}`,
              };
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error('[sync-offline-queue] mutation error:', mutation.client_id, message);
          return { client_id: mutation.client_id, status: 'error' as const, message };
        }
      }),
    );

    return json({ results }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[sync-offline-queue]', err);
    return json({ error: message }, 500);
  }
});
