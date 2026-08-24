-- The materialised XP total was missing the full-session bonus that the client
-- leveling rules (XP_FULL_SESSION) already award, so Home rendered a lower tier
-- than the Levels screen for the same history.  Redefine the recomputation with
-- the bonus included and re-materialise every existing user.

CREATE OR REPLACE FUNCTION public.recompute_user_progress(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekly_target integer;
  v_session_count integer;
  v_xp_total integer;
  v_xp_level integer := 1;
BEGIN
  -- A deleted user needs no recalculation (and avoiding an update makes the
  -- function safe for cascading deletes).
  SELECT weekly_workout_target
    INTO v_weekly_target
    FROM public.users
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  WITH completed_sessions AS (
    SELECT id, started_at, is_light_session
      FROM public.workout_sessions
     WHERE user_id = p_user_id
       AND completed_at IS NOT NULL
  ),
  session_base AS (
    -- Non-light sessions earn the 50 XP base plus the 30 XP full-session
    -- bonus, matching XP_PER_SESSION + XP_FULL_SESSION on the client.
    SELECT
      count(*)::integer AS session_count,
      coalesce(sum(CASE WHEN is_light_session THEN 25 ELSE 50 + 30 END), 0)::integer AS xp
    FROM completed_sessions
  ),
  pr_bonus AS (
    -- A PR earns one bonus per completed session, not one per PR row.
    SELECT (count(DISTINCT pr.session_id) * 75)::integer AS xp
      FROM public.personal_records pr
      JOIN completed_sessions s ON s.id = pr.session_id
     WHERE pr.user_id = p_user_id
  ),
  weekly_counts AS (
    -- date_trunc uses the database's canonical timezone.  This deliberately
    -- gives every client the same week boundary instead of browser-local XP.
    SELECT date_trunc('week', started_at) AS week_start, count(*)::integer AS count
      FROM completed_sessions
     WHERE NOT is_light_session
     GROUP BY 1
  ),
  target_hits AS (
    SELECT (count(*) * 75)::integer AS xp
      FROM weekly_counts
     WHERE count >= v_weekly_target
  ),
  ordered_non_light AS (
    SELECT started_at, lag(started_at) OVER (ORDER BY started_at, id) AS previous_started_at
      FROM completed_sessions
     WHERE NOT is_light_session
  ),
  comebacks AS (
    SELECT (count(*) * 200)::integer AS xp
      FROM ordered_non_light
     WHERE started_at - previous_started_at >= interval '14 days'
  ),
  ordered_weeks AS (
    SELECT week_start, lag(week_start) OVER (ORDER BY week_start) AS previous_week_start
      FROM weekly_counts
  ),
  week_groups AS (
    SELECT week_start,
      count(*) FILTER (
        WHERE previous_week_start IS NULL
           OR week_start - previous_week_start > interval '10 days'
      ) OVER (ORDER BY week_start) AS group_id
    FROM ordered_weeks
  ),
  current_streak AS (
    -- Matches the current client computation: only the final consecutive run
    -- contributes, capped at four weeks.
    SELECT least(count(*), 4)::integer * 50 AS xp
      FROM week_groups
     WHERE group_id = (SELECT max(group_id) FROM week_groups)
  )
  SELECT session_base.xp + pr_bonus.xp + target_hits.xp + comebacks.xp
         + coalesce(current_streak.xp, 0),
         session_base.session_count
    INTO v_xp_total, v_session_count
    FROM session_base, pr_bonus, target_hits, comebacks, current_streak;

  WHILE 50 * v_xp_level * (v_xp_level + 1) <= v_xp_total LOOP
    v_xp_level := v_xp_level + 1;
  END LOOP;

  -- Mark the following write as internal so the guard trigger can reject
  -- attempts to forge materialised progress through the public users API.
  PERFORM set_config('liftos.progress_sync', 'on', true);

  UPDATE public.users
     SET xp_total = v_xp_total,
         xp_level = v_xp_level,
         session_count = v_session_count
   WHERE id = p_user_id;
END;
$$;

-- The recomputation function stays an internal trigger helper, not a public RPC.
REVOKE ALL ON FUNCTION public.recompute_user_progress(uuid) FROM PUBLIC;

-- Re-materialise every user under the corrected formula.  Recomputation is
-- derived purely from session/PR history, so re-running this is idempotent.
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  FOR v_user_id IN SELECT id FROM public.users LOOP
    PERFORM public.recompute_user_progress(v_user_id);
  END LOOP;
END;
$$;
