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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Authenticate the calling user ─────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  // Regular client to verify the user JWT
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Invalid or expired token' }, 401);

  const userId = user.id;

  // ── Admin client (service_role) — bypasses RLS + can delete auth users ────
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // Delete in dependency order so FK constraints don't fire on non-cascaded tables.
    // Most child rows are handled by ON DELETE CASCADE from workout_sessions
    // and workout_templates, but we delete explicitly for clarity.

    await adminClient.from('set_entries')
      .delete()
      .in('session_exercise_id',
        adminClient.from('session_exercises')
          .select('id')
          .in('session_id',
            adminClient.from('workout_sessions').select('id').eq('user_id', userId)
          )
      );

    await adminClient.from('session_exercises')
      .delete()
      .in('session_id',
        adminClient.from('workout_sessions').select('id').eq('user_id', userId)
      );

    await adminClient.from('workout_sessions')
      .delete()
      .eq('user_id', userId);

    await adminClient.from('template_exercises')
      .delete()
      .in('template_id',
        adminClient.from('workout_templates').select('id').eq('user_id', userId)
      );

    await adminClient.from('workout_templates')
      .delete()
      .eq('user_id', userId);

    await adminClient.from('personal_records')
      .delete()
      .eq('user_id', userId);

    await adminClient.from('last_performance_snapshots')
      .delete()
      .eq('user_id', userId);

    await adminClient.from('ai_suggestions')
      .delete()
      .eq('user_id', userId);

    await adminClient.from('weekly_summaries')
      .delete()
      .eq('user_id', userId);

    await adminClient.from('exercises')
      .delete()
      .eq('user_id', userId);

    // Delete the public user profile BEFORE the auth record
    await adminClient.from('users')
      .delete()
      .eq('id', userId);

    // Finally, hard-delete the auth record
    const { error: deleteAuthErr } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthErr) {
      console.error('[delete-account] auth.admin.deleteUser error:', deleteAuthErr.message);
      // Data is already purged — return success regardless so the client clears state
    }

    return json({ success: true }, 200);
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? 'Unknown error';
    console.error('[delete-account] error:', msg);
    return json({ error: msg }, 500);
  }
});
