// ── Billing Webhook — Sole authoritative path for subscription_tier changes ──
//
// This edge function is the ONLY path that should modify a user's
// subscription_tier. It is designed to be called by:
//   1. A billing provider webhook (Stripe, Paddle, etc.) after payment
//   2. An admin function (service-role context)
//
// It uses the service-role key to bypass RLS, so it can update
// subscription_tier without hitting the trigger-based guard.
//
// 🔒 Security: This function must be invoked with a valid secret
// (BILLING_WEBHOOK_SECRET) to prevent unauthorized calls from the
// public internet. In production, restrict this to a static IP or
// VPC peering with the billing provider.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lift-os.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Verify caller is authorised (billing provider or admin) ────────────────
    const authHeader = req.headers.get('Authorization');
    const expectedSecret = Deno.env.get('BILLING_WEBHOOK_SECRET');

    if (!expectedSecret) {
      console.error('[billing-webhook] BILLING_WEBHOOK_SECRET not configured');
      return json({ error: 'Server configuration error' }, 500);
    }

    // Accept either a Bearer token or a raw secret in the Authorization header
    const token = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
    if (token !== expectedSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { user_id: userId, subscription_tier: newTier } = body as Record<string, unknown>;

    if (typeof userId !== 'string' || !userId) {
      return json({ error: 'user_id (string) required' }, 400);
    }

    const validTiers = ['free', 'pro'];
    if (typeof newTier !== 'string' || !validTiers.includes(newTier)) {
      return json({ error: `subscription_tier must be one of: ${validTiers.join(', ')}` }, 400);
    }

    // ── Update the user's subscription_tier ───────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: existing, error: fetchErr } = await supabase
      .from('users')
      .select('id, subscription_tier')
      .eq('id', userId)
      .single();

    if (fetchErr || !existing) {
      return json({ error: 'User not found' }, 404);
    }

    const oldTier = existing.subscription_tier;

    const { error: updateErr } = await supabase
      .from('users')
      .update({ subscription_tier: newTier })
      .eq('id', userId);

    if (updateErr) {
      console.error('[billing-webhook] Update failed:', updateErr);
      return json({ error: 'Failed to update subscription tier' }, 500);
    }

    console.log(`[billing-webhook] User ${userId}: ${oldTier} → ${newTier}`);

    return json({
      data: {
        user_id: userId,
        old_tier: oldTier,
        new_tier: newTier,
        updated_at: new Date().toISOString(),
      },
    }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[billing-webhook] Fatal:', message);
    return json({ error: message }, 500);
  }
});