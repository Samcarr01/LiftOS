'use client';

/**
 * Detect a tier crossing on the workout-complete page.
 *
 * Strategy: fetch all sessions + PRs (RLS-scoped), then compute XP twice —
 * once with the just-completed session excluded ("pre"), once including
 * everything ("post"). If the tier differs, return the new tier for the
 * promotion overlay to render.
 *
 * Read-only — does not write any state to the DB.
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  computeXp, levelFromXp, tierForLevel,
  type Tier, type XpInputSession, type XpInputPR,
} from '@/lib/leveling/xp';

export interface TierPromotion {
  fromTier: Tier;
  toTier:   Tier;
  newLevel: number;
}

export function useTierPromotion(justCompletedSessionId: string | null): TierPromotion | null {
  const [promotion, setPromotion] = useState<TierPromotion | null>(null);

  useEffect(() => {
    if (!justCompletedSessionId) return;
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const [usersRes, sessionsRes, prsRes] = await Promise.all([
        supabase.from('users').select('weekly_workout_target').single(),
        supabase
          .from('workout_sessions')
          .select('id, started_at, is_light_session')
          .not('completed_at', 'is', null),
        supabase.from('personal_records').select('session_id'),
      ]);

      if (cancelled) return;

      const weeklyTarget =
        (usersRes.data as { weekly_workout_target: number | null } | null)?.weekly_workout_target ?? 4;
      const allSessions = (sessionsRes.data ?? []) as XpInputSession[];
      const allPRs      = (prsRes.data ?? []) as XpInputPR[];

      const preSessions = allSessions.filter((s) => s.id !== justCompletedSessionId);
      const prePRs      = allPRs.filter((p) => p.session_id !== justCompletedSessionId);

      const pre  = computeXp(preSessions, prePRs, weeklyTarget);
      const post = computeXp(allSessions,  allPRs,  weeklyTarget);

      const preTier  = tierForLevel(levelFromXp(pre.total).level);
      const postLs   = levelFromXp(post.total);
      const postTier = tierForLevel(postLs.level);

      if (preTier.id !== postTier.id) {
        setPromotion({ fromTier: preTier, toTier: postTier, newLevel: postLs.level });
      }
    })();

    return () => { cancelled = true; };
  }, [justCompletedSessionId]);

  return promotion;
}
