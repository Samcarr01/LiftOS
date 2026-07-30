-- ── H5: Lock subscription_tier so users cannot self-escalate to Pro ──────────
-- This migration:
--   1. Replaces the broad "FOR ALL" RLS policy on `users` with granular
--      SELECT, INSERT, and UPDATE policies.
--   2. Adds a BEFORE UPDATE trigger that blocks subscription_tier changes
--      unless the caller is the service_role (admin / billing webhook).
--
-- Rationale: previously the single `own_data` policy with `FOR ALL` allowed
-- authenticated users to PATCH their own row, including `subscription_tier`.
-- A free user could set `subscription_tier='pro'` via the public API.
--
-- The trigger is additive and reversible — drop it to restore the old behaviour.
-- Service-role contexts (billing webhooks, admin functions) bypass RLS entirely
-- and can still update subscription_tier freely.

-- ── 1. Trigger function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_subscription_tier_escalation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Allow service_role (admin / billing webhook) to change subscription_tier.
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- For regular users (authenticated / anon), block any change to subscription_tier.
  IF OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier THEN
    RAISE EXCEPTION
      'subscription_tier cannot be changed directly. Only admin / billing operations can modify it.'
      USING HINT = 'Contact support or use the billing portal.';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Apply trigger ──────────────────────────────────────────────────────────
CREATE TRIGGER trg_prevent_subscription_tier_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  WHEN (OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier)
  EXECUTE FUNCTION public.prevent_subscription_tier_escalation();

-- ── 3. Replace catch-all policy with granular policies ────────────────────────
DROP POLICY IF EXISTS "own_data" ON public.users;

-- SELECT: users can read their own row
CREATE POLICY "own_select" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- INSERT: users can insert their own row (auth trigger pathway)
CREATE POLICY "own_insert" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- UPDATE: users can update their own row (subscription_tier is blocked by trigger)
CREATE POLICY "own_update" ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);