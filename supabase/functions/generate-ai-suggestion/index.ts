// @ts-nocheck — Deno runtime; imports via esm.sh / npm: specifier
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'npm:openai';

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

// ── Internal types ─────────────────────────────────────────────────────────────

interface SetData {
  values:       Record<string, number | null>;
  set_type:     string;
  is_completed: boolean;
}

interface SessionData {
  started_at:       string;
  sets:             SetData[];
  allSetsCompleted: boolean;
}

interface SuggestionTarget {
  weight?:       number;
  added_weight?: number;
  reps?:         number;
  laps?:         number;
  duration?:     number;
  distance?:     number;
  rationale:     string;
}

interface AISuggestion {
  primary:                  SuggestionTarget;
  alternative:              SuggestionTarget | null;
  plateau_flag:             boolean;
  plateau_intervention:     string | undefined;
  plateau_sessions_stalled: number | undefined;
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validateTarget(obj: unknown): SuggestionTarget | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const t = obj as Record<string, unknown>;

  const weight = typeof t.weight === 'number' && t.weight > 0 ? t.weight : undefined;
  const addedWeight =
    typeof t.added_weight === 'number' && t.added_weight > 0 ? t.added_weight : undefined;
  const reps = typeof t.reps === 'number' && t.reps > 0 ? Math.round(t.reps) : undefined;
  const laps = typeof t.laps === 'number' && t.laps > 0 ? Math.round(t.laps) : undefined;
  const duration = typeof t.duration === 'number' && t.duration > 0 ? t.duration : undefined;
  const distance = typeof t.distance === 'number' && t.distance > 0 ? t.distance : undefined;

  const hasValue =
    weight !== undefined ||
    addedWeight !== undefined ||
    reps !== undefined ||
    laps !== undefined ||
    duration !== undefined ||
    distance !== undefined;
  if (!hasValue) return null;

  const rationale = typeof t.rationale === 'string'
    ? t.rationale.slice(0, 200)
    : 'Based on recent performance.';

  return {
    weight,
    added_weight: addedWeight,
    reps,
    laps,
    duration,
    distance,
    rationale,
  };
}

function validateSuggestion(raw: unknown): AISuggestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;

  const primary = validateTarget(s.primary);
  if (!primary) return null;

  return {
    primary,
    alternative:              s.alternative ? (validateTarget(s.alternative) ?? null) : null,
    plateau_flag:             typeof s.plateau_flag === 'boolean' ? s.plateau_flag : false,
    plateau_intervention:     undefined,
    plateau_sessions_stalled: undefined,
  };
}

// ── Bounds ─────────────────────────────────────────────────────────────────────

interface ProgressBaseline {
  weight: number;
  addedWeight: number;
  reps: number;
  laps: number;
  duration: number;
  distance: number;
}

function roundQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

function applyBounds(
  suggestion: AISuggestion,
  baseline: ProgressBaseline,
): AISuggestion {
  const bound = (t: SuggestionTarget | null): SuggestionTarget | null => {
    if (!t) return null;
    const result = { ...t };
    // Max +5% weight, rounded to nearest 0.25 kg
    if (result.weight !== undefined && baseline.weight > 0) {
      result.weight = roundQuarter(Math.min(result.weight, baseline.weight * 1.05));
    }
    if (result.added_weight !== undefined && baseline.addedWeight > 0) {
      result.added_weight = roundQuarter(
        Math.min(result.added_weight, baseline.addedWeight * 1.05),
      );
    }
    // Max +2 reps
    if (result.reps !== undefined && baseline.reps > 0) {
      result.reps = Math.min(result.reps, baseline.reps + 2);
    }
    if (result.laps !== undefined && baseline.laps > 0) {
      result.laps = Math.min(result.laps, baseline.laps + 2);
    }
    // Never regress below the latest completed target.
    if (result.weight !== undefined && baseline.weight > 0) {
      result.weight = Math.max(result.weight, baseline.weight);
    }
    if (result.added_weight !== undefined && baseline.addedWeight > 0) {
      result.added_weight = Math.max(result.added_weight, baseline.addedWeight);
    }
    if (result.reps !== undefined && baseline.reps > 0) {
      result.reps = Math.max(result.reps, baseline.reps);
    }
    if (result.laps !== undefined && baseline.laps > 0) {
      result.laps = Math.max(result.laps, baseline.laps);
    }
    if (result.duration !== undefined && baseline.duration > 0) {
      result.duration = Math.max(result.duration, baseline.duration);
    }
    if (result.distance !== undefined && baseline.distance > 0) {
      result.distance = Math.max(result.distance, baseline.distance);
    }
    return result;
  };

  return {
    ...suggestion,
    primary:     bound(suggestion.primary)!,
    alternative: bound(suggestion.alternative),
  };
}

// ── Rule-based fallback ────────────────────────────────────────────────────────

function getSchemaKeys(schema: unknown): string[] {
  return ((schema as { fields?: { key: string }[] })?.fields ?? []).map((field) => field.key);
}

function getWorkingSets(session: SessionData): SetData[] {
  return session.sets.filter(
    (s) => (s.set_type === 'working' || s.set_type === 'top') && s.is_completed,
  );
}

function incrementByPercent(value: number, percent: number, minimum: number): number {
  return roundQuarter(value + Math.max(value * percent, minimum));
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function buildProgressBaseline(workingSets: SetData[], schema: unknown): ProgressBaseline {
  const baseline: ProgressBaseline = {
    weight: 0,
    addedWeight: 0,
    reps: 0,
    laps: 0,
    duration: 0,
    distance: 0,
  };

  if (workingSets.length === 0) return baseline;

  const keys = getSchemaKeys(schema);

  if (keys.includes('weight') && keys.includes('reps')) {
    baseline.weight = Math.max(...workingSets.map((s) => Number(s.values.weight ?? 0)));
    const topSet = workingSets.find((s) => Number(s.values.weight ?? 0) === baseline.weight);
    baseline.reps = Number(topSet?.values.reps ?? 0);
    return baseline;
  }

  if (keys.includes('weight') && keys.includes('laps')) {
    baseline.weight = Math.max(...workingSets.map((s) => Number(s.values.weight ?? 0)));
    const topSet = workingSets.find((s) => Number(s.values.weight ?? 0) === baseline.weight);
    baseline.laps = Number(topSet?.values.laps ?? 0);
    return baseline;
  }

  if (keys.includes('added_weight') && keys.includes('reps')) {
    baseline.addedWeight = Math.max(...workingSets.map((s) => Number(s.values.added_weight ?? 0)));
    const topSet = workingSets.find(
      (s) => Number(s.values.added_weight ?? 0) === baseline.addedWeight,
    );
    baseline.reps = Number(topSet?.values.reps ?? 0);
    return baseline;
  }

  if (keys.includes('distance') && keys.includes('duration')) {
    baseline.distance = Math.max(...workingSets.map((s) => Number(s.values.distance ?? 0)));
    const topSet = workingSets.find((s) => Number(s.values.distance ?? 0) === baseline.distance);
    baseline.duration = Number(topSet?.values.duration ?? 0);
    return baseline;
  }

  if (keys.includes('distance')) {
    baseline.distance = Math.max(...workingSets.map((s) => Number(s.values.distance ?? 0)));
  }

  if (keys.includes('duration')) {
    baseline.duration = Math.max(...workingSets.map((s) => Number(s.values.duration ?? 0)));
  }

  if (keys.includes('reps')) {
    baseline.reps = Math.max(...workingSets.map((s) => Number(s.values.reps ?? 0)));
  }

  if (keys.includes('laps')) {
    baseline.laps = Math.max(...workingSets.map((s) => Number(s.values.laps ?? 0)));
  }

  return baseline;
}

function ruleBased(sessions: SessionData[], schema: unknown): AISuggestion {
  const keys = getSchemaKeys(schema);
  const hasWeight = keys.includes('weight');
  const hasAddedWeight = keys.includes('added_weight');
  const hasReps = keys.includes('reps');
  const hasLaps = keys.includes('laps');
  const hasDuration = keys.includes('duration');
  const hasDistance = keys.includes('distance');

  if (sessions.length === 0) {
    if (hasWeight && hasLaps) {
      return {
        primary:      { laps: 4, rationale: 'No history yet. Start with a manageable load for 4 laps.' },
        alternative:  null,
        plateau_flag: false,
      };
    }

    if (hasLaps) {
      return {
        primary:      { laps: 4, rationale: 'No history yet. Start with a lap target you can finish cleanly.' },
        alternative:  null,
        plateau_flag: false,
      };
    }

    if (hasDuration && !hasDistance) {
      return {
        primary:      { duration: 30, rationale: 'No history yet. Start with a clean 30-second effort.' },
        alternative:  null,
        plateau_flag: false,
      };
    }

    if (hasDistance) {
      return {
        primary:      { distance: 500, rationale: 'No history yet. Start with a moderate distance and log the result.' },
        alternative:  null,
        plateau_flag: false,
      };
    }

    return {
      primary:      { reps: 8, rationale: 'No history yet. Start with a comfortable target and log your first session.' },
      alternative:  null,
      plateau_flag: false,
    };
  }

  const latest       = sessions[0]; // newest first
  const workingSets  = getWorkingSets(latest);

  if (workingSets.length === 0) {
    return {
      primary:      { rationale: 'Complete some sets this session to unlock your next target.' },
      alternative:  null,
      plateau_flag: false,
    };
  }

  if (hasWeight && hasReps) {
    const bestWeight = Math.max(...workingSets.map((s) => Number(s.values.weight ?? 0)));
    const topSet = workingSets.find((s) => Number(s.values.weight) === bestWeight);
    const lastReps = Number(topSet?.values.reps ?? 0);

    if (latest.allSetsCompleted) {
      const nextWeight = incrementByPercent(bestWeight, 0.03, 1.25);
      return {
        primary: {
          weight:    nextWeight,
          reps:      lastReps,
          rationale: `All sets complete at ${bestWeight}kg. Progress to ${nextWeight}kg.`,
        },
        alternative: {
          weight:    bestWeight,
          reps:      lastReps + 1,
          rationale: `Or squeeze out 1 more rep at ${bestWeight}kg.`,
        },
        plateau_flag: false,
      };
    }

    return {
      primary: {
        weight:    bestWeight,
        reps:      lastReps,
        rationale: `Focus on completing all sets at ${bestWeight}kg x ${lastReps}.`,
      },
      alternative: null,
      plateau_flag: false,
    };
  }

  if (hasWeight && hasLaps) {
    const bestWeight = Math.max(...workingSets.map((s) => Number(s.values.weight ?? 0)));
    const topSet = workingSets.find((s) => Number(s.values.weight) === bestWeight);
    const lastLaps = Number(topSet?.values.laps ?? 0);

    if (latest.allSetsCompleted) {
      const nextWeight = incrementByPercent(bestWeight, 0.03, 1.25);
      return {
        primary: {
          weight:    nextWeight,
          laps:      lastLaps,
          rationale: `You completed all loaded laps at ${bestWeight}kg. Move to ${nextWeight}kg.`,
        },
        alternative: {
          weight:    bestWeight,
          laps:      lastLaps + 1,
          rationale: `Or keep ${bestWeight}kg and add 1 lap.`,
        },
        plateau_flag: false,
      };
    }

    return {
      primary: {
        weight:    bestWeight,
        laps:      lastLaps,
        rationale: `Repeat ${bestWeight}kg for ${lastLaps} laps until every set feels solid.`,
      },
      alternative: null,
      plateau_flag: false,
    };
  }

  if (hasAddedWeight && hasReps) {
    const bestAddedWeight = Math.max(...workingSets.map((s) => Number(s.values.added_weight ?? 0)));
    const topSet = workingSets.find((s) => Number(s.values.added_weight ?? 0) === bestAddedWeight);
    const lastReps = Number(topSet?.values.reps ?? 0);

    if (latest.allSetsCompleted) {
      if (bestAddedWeight > 0) {
        const nextAddedWeight = incrementByPercent(bestAddedWeight, 0.03, 1.25);
        return {
          primary: {
            added_weight: nextAddedWeight,
            reps:         lastReps,
            rationale:    `You finished all sets at +${bestAddedWeight}kg. Try +${nextAddedWeight}kg next.`,
          },
          alternative: {
            added_weight: bestAddedWeight,
            reps:         lastReps + 1,
            rationale:    `Or keep +${bestAddedWeight}kg and add 1 rep.`,
          },
          plateau_flag: false,
        };
      }

      const maxReps = Math.max(...workingSets.map((s) => Number(s.values.reps ?? 0)));
      return {
        primary:      { reps: maxReps + 1, rationale: `You hit ${maxReps} reps. Aim for ${maxReps + 1} next time.` },
        alternative:  { added_weight: 1.25, reps: maxReps, rationale: 'Or add a small external load and keep reps steady.' },
        plateau_flag: false,
      };
    }

    return {
      primary: {
        added_weight: bestAddedWeight > 0 ? bestAddedWeight : undefined,
        reps:         lastReps,
        rationale:    bestAddedWeight > 0
          ? `Repeat +${bestAddedWeight}kg for ${lastReps} reps until every set is complete.`
          : `Repeat ${lastReps} reps with bodyweight until every set is complete.`,
      },
      alternative: null,
      plateau_flag: false,
    };
  }

  if (hasLaps) {
    const maxLaps = Math.max(...workingSets.map((s) => Number(s.values.laps ?? 0)));
    if (latest.allSetsCompleted) {
      return {
        primary:      { laps: maxLaps + 1, rationale: `You completed ${maxLaps} laps. Aim for ${maxLaps + 1}.` },
        alternative:  { laps: maxLaps, rationale: 'Repeat the same lap count and make the effort cleaner.' },
        plateau_flag: false,
      };
    }
    return {
      primary:      { laps: maxLaps, rationale: `Repeat ${maxLaps} laps until every set is complete.` },
      alternative:  null,
      plateau_flag: false,
    };
  }

  if (hasDistance && hasDuration) {
    const bestDistance = Math.max(...workingSets.map((s) => Number(s.values.distance ?? 0)));
    const fastestSet = workingSets
      .filter((s) => Number(s.values.distance ?? 0) === bestDistance)
      .sort((a, b) => Number(a.values.duration ?? Infinity) - Number(b.values.duration ?? Infinity))[0];
    const lastDuration = Number(fastestSet?.values.duration ?? 0);

    if (latest.allSetsCompleted) {
      return {
        primary: {
          distance:  roundToStep(bestDistance * 1.05, 10),
          duration:  lastDuration || undefined,
          rationale: `You covered ${bestDistance}m. Add a small distance bump next time.`,
        },
        alternative: {
          distance:  bestDistance,
          duration:  lastDuration || undefined,
          rationale: 'Keep the same target and make the whole effort feel cleaner.',
        },
        plateau_flag: false,
      };
    }
    return {
      primary: {
        distance:  bestDistance,
        duration:  lastDuration || undefined,
        rationale: `Repeat ${bestDistance}m until you can complete every set consistently.`,
      },
      alternative:  null,
      plateau_flag: false,
    };
  }

  if (hasDistance) {
    const bestDistance = Math.max(...workingSets.map((s) => Number(s.values.distance ?? 0)));
    return latest.allSetsCompleted
      ? {
          primary:      { distance: roundToStep(bestDistance * 1.05, 10), rationale: `You hit ${bestDistance}m. Add a little more distance next time.` },
          alternative:  { distance: bestDistance, rationale: 'Repeat the same distance and make it feel easier.' },
          plateau_flag: false,
        }
      : {
          primary:      { distance: bestDistance, rationale: `Repeat ${bestDistance}m until every set is complete.` },
          alternative:  null,
          plateau_flag: false,
        };
  }

  if (hasDuration) {
    const bestDuration = Math.max(...workingSets.map((s) => Number(s.values.duration ?? 0)));
    return latest.allSetsCompleted
      ? {
          primary:      { duration: bestDuration + 5, rationale: `You held for ${bestDuration} seconds. Add 5 seconds next time.` },
          alternative:  { duration: bestDuration, rationale: 'Repeat the same duration with cleaner form.' },
          plateau_flag: false,
        }
      : {
          primary:      { duration: bestDuration, rationale: `Repeat ${bestDuration} seconds until every set is complete.` },
          alternative:  null,
          plateau_flag: false,
        };
  }

  if (hasReps) {
    const maxReps = Math.max(...workingSets.map((s) => Number(s.values.reps ?? 0)));
    return {
      primary:      { reps: maxReps + 1, rationale: `You hit ${maxReps} reps last session. Aim for ${maxReps + 1}.` },
      alternative:  { reps: maxReps, rationale: 'Maintain reps with sharper form.' },
      plateau_flag: false,
    };
  }
  return {
    primary:      { rationale: 'Log one full session for this exercise to unlock a better target.' },
    alternative:  null,
    plateau_flag: false,
  };
}

// ── Plateau detection (template-based, no AI call) ────────────────────────────

interface PlateauResult {
  is_plateau:   boolean;
  stalled:      number;
  intervention: string | undefined;
}

function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

function sessionE1RM(session: SessionData): number {
  const working = getWorkingSets(session);
  if (working.length === 0) return 0;
  const bestLoad = Math.max(...working.map((s) =>
    Number(s.values.weight ?? s.values.added_weight ?? 0),
  ));
  if (bestLoad <= 0) return 0;
  const topSet = working.find((s) =>
    Number(s.values.weight ?? s.values.added_weight ?? 0) === bestLoad,
  );
  const reps   = Number(topSet?.values.reps ?? 0);
  return reps > 0 ? epley(bestLoad, reps) : 0;
}

/**
 * Detect whether the user is plateauing.
 * Requires >= 4 sessions (newest-first). Compares max recent e1RM vs reference.
 */
function computePlateau(sessions: SessionData[]): PlateauResult {
  if (sessions.length < 4) {
    return { is_plateau: false, stalled: 0, intervention: undefined };
  }

  // sessions[0] = most recent; sessions[N-1] = oldest in window
  const e1RMs = sessions.map(sessionE1RM);

  // Reference: the oldest available session (up to index 3)
  const referenceIdx = Math.min(sessions.length - 1, 3);
  const reference    = e1RMs[referenceIdx];

  if (reference <= 0) {
    return { is_plateau: false, stalled: 0, intervention: undefined };
  }

  // Count consecutive stalled sessions from most recent outward
  let stalled = 0;
  for (let i = 0; i < referenceIdx; i++) {
    if (e1RMs[i] <= reference) stalled++;
    else break; // improvement found → streak broken
  }

  if (stalled < 2) {
    return { is_plateau: false, stalled, intervention: undefined };
  }

  let intervention: string;
  if (stalled <= 3) {
    intervention = 'Hold the same target next session and try to complete every set cleanly before you increase again.';
  } else if (stalled <= 5) {
    intervention = 'Keep the same load and push progression through one extra rep or one extra completed set before raising it.';
  } else {
    intervention = 'Stay at the same target for a week or two, lock in cleaner execution, then resume micro-progressing.';
  }

  return { is_plateau: true, stalled, intervention };
}

// ── Tracking-type label for AI prompt ─────────────────────────────────────────

function trackingTypeLabel(schema: unknown): string {
  const keys = getSchemaKeys(schema);
  if (keys.includes('weight') && keys.includes('reps')) return 'weight + reps';
  if (keys.includes('weight') && keys.includes('laps')) return 'weight + laps';
  if (keys.includes('added_weight') && keys.includes('reps')) return 'bodyweight reps with optional added load';
  if (keys.includes('reps')) return 'reps only';
  if (keys.includes('laps')) return 'laps';
  if (keys.includes('distance') && keys.includes('duration')) return 'distance + time';
  if (keys.includes('duration')) return 'time/duration';
  if (keys.includes('distance')) return 'distance';
  return 'custom fields';
}

// ── Upsert helper (delete-then-insert; no UNIQUE constraint on table) ──────────

async function storeSuggestion(
  supabase:   ReturnType<typeof createClient>,
  userId:     string,
  exerciseId: string,
  suggestion: AISuggestion,
  source:     string,
): Promise<void> {
  // Remove existing suggestions for this user+exercise before inserting fresh
  await supabase
    .from('ai_suggestions')
    .delete()
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7-day cache

  await supabase.from('ai_suggestions').insert({
    user_id:          userId,
    exercise_id:      exerciseId,
    suggestion_data:  suggestion,
    history_snapshot: { source, generated_at: new Date().toISOString() },
    model_version:    source === 'ai' ? 'gpt-5' : 'rule-based',
    expires_at:       expiresAt.toISOString(),
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Authenticate the calling user ───────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const { exercise_id: exerciseId } = body as Record<string, string>;

    if (!exerciseId) {
      return json({ error: 'exercise_id required' }, 400);
    }

    // Service-role client for data operations (writes to ai_suggestions etc.)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Fetch exercise ───────────────────────────────────────────────────────
    const { data: exercise, error: exErr } = await supabase
      .from('exercises')
      .select('id, name, tracking_schema')
      .eq('id', exerciseId)
      .single();

    if (exErr || !exercise) return json({ error: 'Exercise not found' }, 404);

    // ── Fetch session history (last 5 sessions for this user + exercise) ─────
    // Step 1: last 20 completed sessions for this user (newest first)
    const { data: userSessions } = await supabase
      .from('workout_sessions')
      .select('id, started_at')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(20);

    const sessionIds    = (userSessions ?? []).map((s: { id: string }) => s.id);
    const sessionDates  = new Map<string, string>(
      (userSessions ?? []).map((s: { id: string; started_at: string }) => [s.id, s.started_at]),
    );

    // Step 2: session_exercises for this exercise in those sessions
    const { data: seRows } = sessionIds.length
      ? await supabase
          .from('session_exercises')
          .select('session_id, set_entries ( values, set_type, is_completed )')
          .eq('exercise_id', exerciseId)
          .in('session_id', sessionIds)
      : { data: [] };

    // Build SessionData[] sorted newest-first, take up to 5
    const sessions: SessionData[] = (seRows ?? [])
      .filter((se: { session_id: string }) => sessionDates.has(se.session_id))
      .sort((a: { session_id: string }, b: { session_id: string }) =>
        (sessionDates.get(b.session_id) ?? '').localeCompare(sessionDates.get(a.session_id) ?? ''),
      )
      .slice(0, 5)
      .map((se: { session_id: string; set_entries: SetData[] }) => {
        const allSets: SetData[] = (se.set_entries ?? []).map((s) => ({
          values:       s.values as Record<string, number | null>,
          set_type:     s.set_type,
          is_completed: s.is_completed,
        }));
        const working        = allSets.filter((s) => s.set_type === 'working' || s.set_type === 'top');
        const completedCount = working.filter((s) => s.is_completed).length;
        return {
          started_at:       sessionDates.get(se.session_id) ?? '',
          sets:             allSets,
          allSetsCompleted: working.length > 0 && completedCount === working.length,
        };
      });

    const trackingType = trackingTypeLabel(exercise.tracking_schema);

    // Extract last session values for non-regression and progression bounds.
    const latestWorking = sessions.length > 0 ? getWorkingSets(sessions[0]) : [];
    const baseline = buildProgressBaseline(latestWorking, exercise.tracking_schema);

    // ── Compute plateau (always — uses same session data, no extra query) ────
    const plateau = computePlateau(sessions);

    // ── < 2 sessions: rule-based only ───────────────────────────────────────
    if (sessions.length < 2) {
      const suggestion = ruleBased(sessions, exercise.tracking_schema);
      await storeSuggestion(supabase, userId, exerciseId, suggestion, 'rule-based');
      return json({ data: suggestion, source: 'rule-based' });
    }

    // ── Build AI prompt ──────────────────────────────────────────────────────
    const sessionHistory = sessions.map((s, i) => ({
      session:           i + 1, // 1 = most recent
      date:              s.started_at.split('T')[0],
      all_sets_complete: s.allSetsCompleted,
      working_sets:      s.sets
        .filter((set) => (set.set_type === 'working' || set.set_type === 'top') && set.is_completed)
        .map((set) => set.values),
    }));

    const systemPrompt =
      'You are a strength training progression coach. Respond ONLY with valid JSON. No markdown, no prose.';

    const userPrompt = `EXERCISE: ${exercise.name}
TRACKING TYPE: ${trackingType}
RECENT SESSIONS (session 1 = most recent):
${JSON.stringify(sessionHistory, null, 2)}

RULES:
1. Primary target: small progression using only the tracked fields for this exercise
2. Alternative target: a different progression path
3. If no improvement for 3+ consecutive sessions, set plateau_flag to true
4. Never suggest more than +5% load, +2 reps, or +2 laps in one step
5. Never reduce any tracked value below the latest completed session
6. If progression is not there yet, keep the target the same instead of lowering it
7. For bodyweight work, use reps and optional added external load only
8. Reference actual numbers from the data

Respond ONLY with this exact JSON structure (no other text):
{"primary":{"weight":number|null,"added_weight":number|null,"reps":number|null,"laps":number|null,"duration":number|null,"distance":number|null,"rationale":"string max 200 chars"},"alternative":{"weight":number|null,"added_weight":number|null,"reps":number|null,"laps":number|null,"duration":number|null,"distance":number|null,"rationale":"string max 200 chars"},"plateau_flag":boolean}`;

    // ── Call OpenAI ──────────────────────────────────────────────────────────
    let suggestion: AISuggestion | null = null;
    let source = 'rule-based';

    try {
      const apiKey = Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

      const openai = new OpenAI({ apiKey });

      const response = await openai.chat.completions.create({
        model:           'gpt-5',
        response_format: { type: 'json_object' },
        temperature:     0.2,
        max_tokens:      300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
      });

      const rawText = response.choices[0]?.message?.content ?? '{}';
      const parsed  = JSON.parse(rawText);
      const valid   = validateSuggestion(parsed);

      if (valid) {
        suggestion = applyBounds(valid, baseline);
        source     = 'ai';
        console.log('[generate-ai-suggestion] AI suggestion generated for exercise', exerciseId);
      } else {
        console.warn('[generate-ai-suggestion] AI response failed validation, using rule-based');
      }
    } catch (aiErr) {
      console.error('[generate-ai-suggestion] OpenAI call failed:', (aiErr as Error).message);
      // Fall through to rule-based
    }

    // ── Fallback if AI failed ────────────────────────────────────────────────
    if (!suggestion) {
      suggestion = ruleBased(sessions, exercise.tracking_schema);
      if (baseline.weight > 0 || baseline.addedWeight > 0 || baseline.reps > 0 || baseline.laps > 0) {
        suggestion = applyBounds(suggestion, baseline);
      }
      source = 'rule-based';
    }

    // ── Apply server-computed plateau (overrides AI plateau_flag) ────────────
    suggestion = {
      ...suggestion,
      plateau_flag:             plateau.is_plateau,
      plateau_intervention:     plateau.intervention,
      plateau_sessions_stalled: plateau.is_plateau ? plateau.stalled : undefined,
    };

    if (plateau.is_plateau) {
      console.log(
        `[generate-ai-suggestion] Plateau detected for exercise ${exerciseId}: ${plateau.stalled} stalled sessions`,
      );
    }

    await storeSuggestion(supabase, userId, exerciseId, suggestion, source);

    return json({ data: suggestion, source });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[generate-ai-suggestion] Fatal:', message);
    return json({ error: message }, 500);
  }
});
