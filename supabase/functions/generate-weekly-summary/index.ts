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

// ── Types ──────────────────────────────────────────────────────────────────────

interface SetRow {
  values:       Record<string, number | null>;
  set_type:     string;
  is_completed: boolean;
}

interface SERow {
  exercise_id: string;
  set_entries: SetRow[];
}

interface ExerciseRow {
  id:            string;
  name:          string;
  muscle_groups: string[];
}

interface WeeklySummaryData {
  workouts_completed:  number;
  total_volume_kg:     number;
  total_sets:          number;
  strongest_lift:      { exercise: string; value: string } | null;
  most_improved_group: string | null;
  muscle_volume:       Record<string, number>;
  insight:             string | null;
}

// ── Week helpers ───────────────────────────────────────────────────────────────

/** Ensure week_start is a valid YYYY-MM-DD Monday.
 *  If not provided, defaults to the most recent Monday (UTC). */
function resolveWeekStart(input: string | undefined): string {
  let d: Date;
  if (input) {
    d = new Date(input + 'T00:00:00Z');
    if (isNaN(d.getTime())) throw new Error('Invalid week_start date');
  } else {
    d = new Date();
    d.setUTCHours(0, 0, 0, 0);
  }
  // Adjust to Monday (getUTCDay: 0=Sun, 1=Mon…)
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

// ── Epley e1RM ─────────────────────────────────────────────────────────────────

function epley(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

// ── Stats aggregation ──────────────────────────────────────────────────────────

interface AggResult {
  totalVolumeKg: number;
  totalSets:     number;
  bestE1RM:      number;
  bestExercise:  string;
  bestE1RMLabel: string;        // "100kg × 5"
  muscleVolume:  Record<string, number>;
}

function aggregate(
  seRows: SERow[],
  exerciseMap: Map<string, ExerciseRow>,
): AggResult {
  let totalVolumeKg = 0;
  let totalSets     = 0;
  let bestE1RM      = 0;
  let bestExercise  = '';
  let bestE1RMLabel = '';
  const muscleVolume: Record<string, number> = {};

  for (const se of seRows) {
    const ex = exerciseMap.get(se.exercise_id);
    const workingSets = (se.set_entries ?? []).filter(
      (s) => s.is_completed && (s.set_type === 'working' || s.set_type === 'top'),
    );

    for (const s of workingSets) {
      const w = Number(s.values.weight ?? 0);
      const r = Number(s.values.reps   ?? 0);

      if (w > 0 && r > 0) {
        const vol = w * r;
        totalVolumeKg += vol;
        totalSets     += 1;

        const e = epley(w, r);
        if (e > bestE1RM) {
          bestE1RM      = e;
          bestExercise  = ex?.name ?? 'Unknown';
          bestE1RMLabel = `${w}kg × ${r}`;
        }

        // Attribute volume to muscle groups
        for (const mg of (ex?.muscle_groups ?? [])) {
          muscleVolume[mg] = (muscleVolume[mg] ?? 0) + vol;
        }
      } else if (r > 0) {
        // Bodyweight — count the set but no volume
        totalSets += 1;
      }
    }
  }

  return {
    totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    totalSets,
    bestE1RM,
    bestExercise,
    bestE1RMLabel,
    muscleVolume,
  };
}

/** Find the muscle group with the biggest absolute volume increase vs prev week. */
function mostImprovedGroup(
  cur: Record<string, number>,
  prev: Record<string, number>,
): string | null {
  let bestGroup = '';
  let bestDelta = -Infinity;

  for (const [group, vol] of Object.entries(cur)) {
    const prevVol = prev[group] ?? 0;
    const delta = vol - prevVol;
    if (delta > bestDelta) {
      bestDelta = delta;
      bestGroup = group;
    }
  }

  return bestGroup || null;
}

// ── AI Insight ─────────────────────────────────────────────────────────────────

async function generateInsight(
  apiKey: string,
  stats: {
    workouts: number;
    volume:   number;
    strongest: string;
    mostImproved: string | null;
    muscleGroups: string[];
    prevVolume: number | null;
  },
): Promise<string | null> {
  const prevDelta = stats.prevVolume != null && stats.prevVolume > 0
    ? `${stats.volume > stats.prevVolume ? '+' : ''}${Math.round((stats.volume - stats.prevVolume) / stats.prevVolume * 100)}% vs last week`
    : 'first week on record';

  const prompt =
    `You are a concise fitness analyst. Given this week's training summary, write 1-2 sentences of insight.\n\n` +
    `STATS:\n` +
    `- Workouts: ${stats.workouts}\n` +
    `- Total volume: ${stats.volume}kg\n` +
    `- Strongest lift: ${stats.strongest}\n` +
    `- Most improved: ${stats.mostImproved ?? 'N/A'}\n` +
    `- Muscle groups trained: ${stats.muscleGroups.join(', ') || 'none'}\n` +
    `- Comparison vs last week: ${prevDelta}\n\n` +
    `RULES:\n` +
    `1. Be encouraging but honest\n` +
    `2. If something stalled, mention it briefly\n` +
    `3. Max 2 sentences\n` +
    `4. No generic platitudes\n\n` +
    `Respond with plain text only. No JSON, no markdown.`;

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model:       'gpt-5',
    temperature: 0.4,
    max_tokens:  120,
    messages: [
      { role: 'system', content: 'You are a concise fitness analyst. Respond with 1-2 sentences of plain text only.' },
      { role: 'user',   content: prompt },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? null;
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    // Client (user JWT) or service-role call
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const weekStart = resolveWeekStart(body.week_start as string | undefined);
    const weekEnd   = addDays(weekStart, 7);
    const prevStart = addDays(weekStart, -7);

    // ── Check cache — serve existing row unless forced ─────────────────────
    const forceRefresh = body.force === true;
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('weekly_summaries')
        .select('summary_data')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .maybeSingle();

      if (cached?.summary_data) {
        return json({ data: cached.summary_data, week_start: weekStart, source: 'cached' });
      }
    }

    // ── Fetch this week's sessions ─────────────────────────────────────────
    const { data: sessions } = await supabase
      .from('workout_sessions')
      .select('id')
      .eq('user_id', user.id)
      .gte('started_at', weekStart + 'T00:00:00Z')
      .lt('started_at',  weekEnd   + 'T00:00:00Z')
      .not('completed_at', 'is', null);

    const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);

    // ── Fetch session exercises + set_entries ──────────────────────────────
    const { data: seRows } = sessionIds.length
      ? await supabase
          .from('session_exercises')
          .select('exercise_id, set_entries ( values, set_type, is_completed )')
          .in('session_id', sessionIds)
      : { data: [] };

    // ── Fetch exercise metadata (names + muscle groups) ────────────────────
    const exerciseIds = [...new Set((seRows ?? []).map((se: SERow) => se.exercise_id))];
    const { data: exerciseRows } = exerciseIds.length
      ? await supabase
          .from('exercises')
          .select('id, name, muscle_groups')
          .in('id', exerciseIds)
      : { data: [] };

    const exerciseMap = new Map<string, ExerciseRow>(
      (exerciseRows ?? []).map((e: ExerciseRow) => [e.id, e]),
    );

    // ── Aggregate current week ─────────────────────────────────────────────
    const cur = aggregate(seRows ?? [], exerciseMap);

    // ── Fetch previous week (for deltas + most improved) ──────────────────
    let prevMuscleVolume: Record<string, number> = {};
    let prevVolumeKg: number | null = null;

    const { data: prevSummary } = await supabase
      .from('weekly_summaries')
      .select('summary_data')
      .eq('user_id', user.id)
      .eq('week_start', prevStart)
      .maybeSingle();

    if (prevSummary?.summary_data) {
      const pd = prevSummary.summary_data as WeeklySummaryData;
      prevMuscleVolume = pd.muscle_volume ?? {};
      prevVolumeKg     = pd.total_volume_kg;
    }

    const improvedGroup = mostImprovedGroup(cur.muscleVolume, prevMuscleVolume);

    // ── Build summary (stats part) ─────────────────────────────────────────
    const summaryData: WeeklySummaryData = {
      workouts_completed:  sessionIds.length,
      total_volume_kg:     cur.totalVolumeKg,
      total_sets:          cur.totalSets,
      strongest_lift:      cur.bestExercise
        ? { exercise: cur.bestExercise, value: cur.bestE1RMLabel }
        : null,
      most_improved_group: improvedGroup,
      muscle_volume:       cur.muscleVolume,
      insight:             null,
    };

    // ── AI insight ─────────────────────────────────────────────────────────
    try {
      const apiKey = Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

      summaryData.insight = await generateInsight(apiKey, {
        workouts:     sessionIds.length,
        volume:       cur.totalVolumeKg,
        strongest:    cur.bestExercise
          ? `${cur.bestExercise} at ${cur.bestE1RMLabel}`
          : 'N/A',
        mostImproved: improvedGroup,
        muscleGroups: Object.keys(cur.muscleVolume),
        prevVolume:   prevVolumeKg,
      });

      console.log('[generate-weekly-summary] AI insight generated for user', user.id);
    } catch (aiErr) {
      console.error('[generate-weekly-summary] AI insight failed:', (aiErr as Error).message);
      // insight stays null — stats still stored
    }

    // ── Upsert weekly_summaries ────────────────────────────────────────────
    await supabase
      .from('weekly_summaries')
      .upsert(
        {
          user_id:      user.id,
          week_start:   weekStart,
          summary_data: summaryData,
        },
        { onConflict: 'user_id,week_start' },
      );

    return json({ data: summaryData, week_start: weekStart, source: 'generated' });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[generate-weekly-summary] Fatal:', message);
    return json({ error: message }, 500);
  }
});
