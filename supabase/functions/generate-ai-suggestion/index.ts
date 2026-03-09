// @ts-nocheck — Deno runtime; imports via esm.sh / npm: specifier
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'npm:openai';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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
  weight?:    number;
  reps?:      number;
  duration?:  number;
  distance?:  number;
  rationale:  string;
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

  const weight   = typeof t.weight   === 'number' && t.weight   > 0 ? t.weight   : undefined;
  const reps     = typeof t.reps     === 'number' && t.reps     > 0 ? Math.round(t.reps) : undefined;
  const duration = typeof t.duration === 'number' && t.duration > 0 ? t.duration : undefined;
  const distance = typeof t.distance === 'number' && t.distance > 0 ? t.distance : undefined;

  const hasValue = weight !== undefined || reps !== undefined || duration !== undefined || distance !== undefined;
  if (!hasValue) return null;

  const rationale = typeof t.rationale === 'string'
    ? t.rationale.slice(0, 200)
    : 'Based on recent performance.';

  return { weight, reps, duration, distance, rationale };
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

function applyBounds(
  suggestion: AISuggestion,
  lastWeight: number,
  lastReps: number,
): AISuggestion {
  const bound = (t: SuggestionTarget | null): SuggestionTarget | null => {
    if (!t) return null;
    const result = { ...t };
    // Max +5% weight, rounded to nearest 0.25 kg
    if (result.weight !== undefined && lastWeight > 0) {
      result.weight = Math.round(Math.min(result.weight, lastWeight * 1.05) * 4) / 4;
    }
    // Max +2 reps
    if (result.reps !== undefined && lastReps > 0) {
      result.reps = Math.min(result.reps, lastReps + 2);
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

function ruleBased(sessions: SessionData[]): AISuggestion {
  if (sessions.length === 0) {
    return {
      primary:      { reps: 8, rationale: 'No history yet. Start with a comfortable weight for 3 sets of 8.' },
      alternative:  null,
      plateau_flag: false,
    };
  }

  const latest       = sessions[0]; // newest first
  const workingSets  = latest.sets.filter(
    (s) => (s.set_type === 'working' || s.set_type === 'top') && s.is_completed,
  );

  if (workingSets.length === 0) {
    return {
      primary:      { rationale: 'Complete some sets this session to unlock your next target.' },
      alternative:  null,
      plateau_flag: false,
    };
  }

  const hasWeight = workingSets.some(
    (s) => typeof s.values.weight === 'number' && (s.values.weight ?? 0) > 0,
  );

  if (!hasWeight) {
    // Bodyweight / no-weight exercise
    const maxReps = Math.max(...workingSets.map((s) => Number(s.values.reps ?? 0)));
    return {
      primary:      { reps: maxReps + 1, rationale: `You hit ${maxReps} reps last session. Aim for ${maxReps + 1}.` },
      alternative:  { reps: maxReps, rationale: 'Maintain reps with sharper form.' },
      plateau_flag: false,
    };
  }

  // Weight + reps exercise
  const bestWeight = Math.max(...workingSets.map((s) => Number(s.values.weight ?? 0)));
  const topSet     = workingSets.find((s) => Number(s.values.weight) === bestWeight);
  const lastReps   = Number(topSet?.values.reps ?? 0);

  if (latest.allSetsCompleted) {
    const nextWeight = Math.round((bestWeight + 2.5) * 4) / 4;
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

  // Incomplete last session → repeat
  return {
    primary: {
      weight:    bestWeight,
      reps:      lastReps,
      rationale: `Focus on completing all sets at ${bestWeight}kg × ${lastReps}.`,
    },
    alternative: {
      weight:    Math.max(bestWeight - 2.5, 0),
      reps:      lastReps + 1,
      rationale: 'Slightly lighter with an extra rep might help you hit all sets.',
    },
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
  const working = session.sets.filter(
    (s) => (s.set_type === 'working' || s.set_type === 'top') && s.is_completed,
  );
  if (working.length === 0) return 0;
  const bestWeight = Math.max(...working.map((s) => Number(s.values.weight ?? 0)));
  if (bestWeight <= 0) return 0;
  const topSet = working.find((s) => Number(s.values.weight) === bestWeight);
  const reps   = Number(topSet?.values.reps ?? 0);
  return reps > 0 ? epley(bestWeight, reps) : 0;
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
    intervention = 'Try adding 1 extra rep per set before increasing weight. Focus on full range of motion and time under tension.';
  } else if (stalled <= 5) {
    intervention = 'Consider a deload: drop to 85% of your current weight for 1 week, then rebuild. Deloads reset fatigue and often break plateaus.';
  } else {
    intervention = 'Try a variation of this exercise for 2–3 weeks (e.g., different grip or angle), then return to the main lift with fresh stimulus.';
  }

  return { is_plateau: true, stalled, intervention };
}

// ── Tracking-type label for AI prompt ─────────────────────────────────────────

function trackingTypeLabel(schema: unknown): string {
  const fields = (schema as { fields?: { key: string }[] })?.fields ?? [];
  const keys   = fields.map((f) => f.key);
  if (keys.includes('weight') && keys.includes('reps')) return 'weight + reps';
  if (keys.includes('reps')) return 'bodyweight reps only';
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
    const body = await req.json().catch(() => ({}));
    const { user_id: userId, exercise_id: exerciseId } = body as Record<string, string>;

    if (!userId || !exerciseId) {
      return json({ error: 'user_id and exercise_id required' }, 400);
    }

    // Internal function — called by complete-workout via service role
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

    // Extract last session best weight/reps for bounds checking
    const latestWorking = sessions.length > 0
      ? sessions[0].sets.filter(
          (s) => (s.set_type === 'working' || s.set_type === 'top') && s.is_completed,
        )
      : [];
    const lastWeight = Math.max(...latestWorking.map((s) => Number(s.values.weight ?? 0)), 0);
    const lastReps   = Number(
      latestWorking.find((s) => Number(s.values.weight) === lastWeight)?.values.reps ?? 0,
    );

    // ── Compute plateau (always — uses same session data, no extra query) ────
    const plateau = computePlateau(sessions);

    // ── < 2 sessions: rule-based only ───────────────────────────────────────
    if (sessions.length < 2) {
      const suggestion = ruleBased(sessions);
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
1. Primary target: small progression (max +5% weight OR +1-2 reps, NOT both simultaneously)
2. Alternative target: a different progression path
3. If no improvement for 3+ consecutive sessions, set plateau_flag to true
4. Never suggest more than +5kg weight increase or +3 reps in one step
5. Bodyweight exercises (no weight field): reps progression only
6. Reference actual numbers from the data

Respond ONLY with this exact JSON structure (no other text):
{"primary":{"weight":number|null,"reps":number|null,"rationale":"string max 200 chars"},"alternative":{"weight":number|null,"reps":number|null,"rationale":"string max 200 chars"},"plateau_flag":boolean}`;

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
        suggestion = applyBounds(valid, lastWeight, lastReps);
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
      suggestion = ruleBased(sessions);
      if (lastWeight > 0) {
        suggestion = applyBounds(suggestion, lastWeight, lastReps);
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
