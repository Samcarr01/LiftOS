-- ── Cut-Aware Progression v1 — body weight history ───────────────────────────
--
-- DEPLOYMENT GATE — APPLY AND VERIFY THIS MIGRATION BEFORE DEPLOYING ANY
-- APPLICATION CODE THAT WRITES OR READS public.body_weight_logs.
-- The Profile → Training autosave upserts into this table as a second,
-- non-authoritative write. Shipping that code against a database where this
-- file has not yet run makes every weigh-in raise
-- `relation "body_weight_logs" does not exist` — non-fatal by design, but it
-- silently loses the whole trend. Apply the file, confirm the table, the
-- (user_id, logged_on) unique key, the index and the own_data policy all
-- exist, and only then deploy.
--
-- One optional reading per user per calendar day, in canonical kilograms
-- (Global Constraint 7). The users table keeps the authoritative current
-- weight; this table is a strictly additive second write, so nothing here
-- reads, copies or backfills from it.
--
-- Idempotent throughout: CREATE TABLE / CREATE INDEX IF NOT EXISTS, and the
-- policy is dropped by name before it is created.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.body_weight_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  logged_on  date        NOT NULL,
  weight_kg  numeric     NOT NULL CHECK (weight_kg > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, logged_on)
);

-- The trend query is always "this user, most recent days first".
CREATE INDEX IF NOT EXISTS idx_body_weight_logs_user_date
  ON public.body_weight_logs (user_id, logged_on DESC);

-- ── RLS: own data only, on every read and every write ────────────────────────
ALTER TABLE public.body_weight_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_data" ON public.body_weight_logs;

CREATE POLICY "own_data" ON public.body_weight_logs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
