-- ── H6: Rate limit tracking table for AI Edge Functions ──────────────────────
-- Tracks per-user, per-hour token consumption for paid AI routes.
-- Used by generate-ai-suggestion and generate-weekly-summary to enforce
-- rate caps and prevent runaway AI spend.

CREATE TABLE public.ai_rate_limits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,  -- start of the rate-limit window (hourly)
  call_count   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Enforce one row per user per hour window
CREATE UNIQUE INDEX idx_ai_rate_limits_user_window
  ON public.ai_rate_limits (user_id, window_start);

CREATE INDEX idx_ai_rate_limits_user
  ON public.ai_rate_limits (user_id);

-- ── RLS: users can only see their own rate limit rows ─────────────────────────
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_rate_limits" ON public.ai_rate_limits
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER trg_ai_rate_limits_updated_at
  BEFORE UPDATE ON public.ai_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Helper: atomically increment rate limit counter ───────────────────────────
-- Returns (within_window, call_count_after_increment).
-- If the returned call_count exceeds the daily cap, the caller should reject.
CREATE OR REPLACE FUNCTION public.increment_ai_rate_limit(
  p_user_id       uuid,
  p_window_start  timestamptz DEFAULT date_trunc('hour', now())
)
RETURNS TABLE (within_window boolean, call_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ai_rate_limits (user_id, window_start, call_count)
  VALUES (p_user_id, p_window_start, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET call_count = public.ai_rate_limits.call_count + 1;

  RETURN QUERY
  SELECT
    true AS within_window,
    rl.call_count
  FROM public.ai_rate_limits rl
  WHERE rl.user_id = p_user_id AND rl.window_start = p_window_start;
END;
$$;

-- ── Helper: get current rate limit count for a user in the current hour ───────
CREATE OR REPLACE FUNCTION public.get_ai_rate_limit(
  p_user_id       uuid,
  p_window_start  timestamptz DEFAULT date_trunc('hour', now())
)
RETURNS TABLE (within_window boolean, call_count integer)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    true AS within_window,
    rl.call_count
  FROM public.ai_rate_limits rl
  WHERE rl.user_id = p_user_id AND rl.window_start = p_window_start;
END;
$$;