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

interface SessionRow {
  id:         string;
  started_at: string;
}

interface ExerciseRow {
  id:            string;
  name:          string;
  muscle_groups: string[];
}

interface PRRow {
  exercise_id:  string;
  record_type:  string;
  record_value: number;
  achieved_at:  string;
}

interface AIAnalysis {
  headline:             string;
  wins:                 string[];
  focus_areas:          string[];
  exercise_callouts:    { name: string; note: string }[];
  next_week_tip:        string;
  training_consistency: string;
}

interface ExerciseHighlight {
  name:      string;
  volume:    number;
  sets:      number;
  best_set:  string;
  delta_pct: number | null;
}

interface WeeklySummaryData {
  workouts_completed:  number;
  total_volume_kg:     number;
  total_sets:          number;
  strongest_lift:      { exercise: string; value: string } | null;
  most_improved_group: string | null;
  muscle_volume:       Record<string, number>;
  insight:             string | null;
  // New enriched fields
  volume_by_week:      { week: string; volume: number }[];
  muscle_split:        { muscle: string; volume: number; percentage: number }[];
  session_days:        string[];
  prs_this_week:       { exercise: string; record_type: string; value: number }[];
  ai_analysis:         AIAnalysis | null;
  exercise_highlights: ExerciseHighlight[];
}

// ── Week helpers ───────────────────────────────────────────────────────────────

function resolveWeekStart(input: string | undefined): string {
  let d: Date;
  if (input) {
    d = new Date(input + 'T00:00:00Z');
    if (isNaN(d.getTime())) throw new Error('Invalid week_start date');
  } else {
    d = new Date();
    d.setUTCHours(0, 0, 0, 0);
  }
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().split('T')[0];
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Epley e1RM ─────────────────────────────────────────────────────────────────

function epley(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

// ── Per-exercise aggregation ──────────────────────────────────────────────────

interface ExerciseAgg {
  name:       string;
  volume:     number;
  sets:       number;
  bestWeight: number;
  bestReps:   number;
  bestE1RM:   number;
}

interface AggResult {
  totalVolumeKg:   number;
  totalSets:       number;
  bestE1RM:        number;
  bestExercise:    string;
  bestE1RMLabel:   string;
  muscleVolume:    Record<string, number>;
  exerciseAggs:    Map<string, ExerciseAgg>;
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
  const exerciseAggs = new Map<string, ExerciseAgg>();

  for (const se of seRows) {
    const ex = exerciseMap.get(se.exercise_id);
    const exName = ex?.name ?? 'Unknown';
    const workingSets = (se.set_entries ?? []).filter(
      (s) => s.is_completed && (s.set_type === 'working' || s.set_type === 'top'),
    );

    if (!exerciseAggs.has(se.exercise_id)) {
      exerciseAggs.set(se.exercise_id, {
        name: exName, volume: 0, sets: 0,
        bestWeight: 0, bestReps: 0, bestE1RM: 0,
      });
    }
    const agg = exerciseAggs.get(se.exercise_id)!;

    for (const s of workingSets) {
      const w = Number(s.values.weight ?? 0);
      const r = Number(s.values.reps   ?? 0);

      if (w > 0 && r > 0) {
        const vol = w * r;
        totalVolumeKg += vol;
        totalSets     += 1;
        agg.volume    += vol;
        agg.sets      += 1;

        const e = epley(w, r);
        if (e > bestE1RM) {
          bestE1RM      = e;
          bestExercise  = exName;
          bestE1RMLabel = `${w}kg × ${r}`;
        }
        if (e > agg.bestE1RM) {
          agg.bestE1RM   = e;
          agg.bestWeight = w;
          agg.bestReps   = r;
        }

        for (const mg of (ex?.muscle_groups ?? [])) {
          muscleVolume[mg] = (muscleVolume[mg] ?? 0) + vol;
        }
      } else if (r > 0) {
        totalSets += 1;
        agg.sets  += 1;
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
    exerciseAggs,
  };
}

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

// ── AI Insight (structured) ───────────────────────────────────────────────────

async function generateStructuredInsight(
  apiKey: string,
  stats: {
    workouts: number;
    volume: number;
    totalSets: number;
    strongest: string;
    mostImproved: string | null;
    muscleGroups: string[];
    prevVolume: number | null;
    volumeByWeek: { week: string; volume: number }[];
    exerciseHighlights: ExerciseHighlight[];
    prs: { exercise: string; record_type: string; value: number }[];
    sessionDays: string[];
    muscleSplit: { muscle: string; volume: number; percentage: number }[];
  },
): Promise<AIAnalysis | null> {
  const prevDelta = stats.prevVolume != null && stats.prevVolume > 0
    ? `${stats.volume > stats.prevVolume ? '+' : ''}${Math.round((stats.volume - stats.prevVolume) / stats.prevVolume * 100)}% vs last week`
    : 'first week on record';

  const volumeTrend = stats.volumeByWeek
    .map((w) => `${w.week}: ${Math.round(w.volume)}kg`)
    .join(', ');

  const exerciseBreakdown = stats.exerciseHighlights
    .slice(0, 8)
    .map((e) => {
      const delta = e.delta_pct !== null ? ` (${e.delta_pct > 0 ? '+' : ''}${e.delta_pct}% vs prev week)` : '';
      return `- ${e.name}: ${e.sets} sets, ${Math.round(e.volume)}kg volume, best set ${e.best_set}${delta}`;
    })
    .join('\n');

  const prList = stats.prs.length > 0
    ? stats.prs.map((p) => `- ${p.exercise}: ${p.record_type} = ${p.value}`).join('\n')
    : 'None this week';

  const muscleSplitText = stats.muscleSplit
    .map((m) => `${m.muscle}: ${Math.round(m.percentage)}%`)
    .join(', ');

  const prompt =
    `You are a knowledgeable strength coach analysing a lifter's weekly training data. Provide specific, actionable feedback.\n\n` +
    `STATS:\n` +
    `- Workouts this week: ${stats.workouts} (on ${stats.sessionDays.join(', ') || 'no days'})\n` +
    `- Total volume: ${stats.volume}kg (${stats.totalSets} working sets)\n` +
    `- Volume trend (last 4 weeks): ${volumeTrend || 'no prior data'}\n` +
    `- Comparison: ${prevDelta}\n` +
    `- Strongest lift: ${stats.strongest}\n` +
    `- Most improved muscle group: ${stats.mostImproved ?? 'N/A'}\n\n` +
    `MUSCLE SPLIT:\n${muscleSplitText || 'N/A'}\n\n` +
    `EXERCISE BREAKDOWN:\n${exerciseBreakdown || 'No exercises logged'}\n\n` +
    `PERSONAL RECORDS HIT:\n${prList}\n\n` +
    `INSTRUCTIONS:\n` +
    `Respond with a JSON object (no markdown, no code fences). The JSON must have exactly these fields:\n` +
    `{\n` +
    `  "headline": "One punchy sentence summarising the week (max 25 words)",\n` +
    `  "wins": ["2-3 specific achievements — reference actual numbers and exercise names"],\n` +
    `  "focus_areas": ["1-2 specific things to improve — reference muscle imbalances, missed groups, or stalled lifts"],\n` +
    `  "exercise_callouts": [{"name": "Exercise Name", "note": "specific observation about this exercise"}],\n` +
    `  "next_week_tip": "One actionable suggestion for next week based on the data",\n` +
    `  "training_consistency": "Brief note on training frequency and schedule pattern"\n` +
    `}\n\n` +
    `RULES:\n` +
    `1. Be specific — use the actual numbers, exercise names, and percentages from the data\n` +
    `2. If volume is trending down, mention it honestly\n` +
    `3. If muscle groups are imbalanced (e.g. 40%+ on one group, 0% on another), flag it\n` +
    `4. Keep each string concise — no filler words\n` +
    `5. exercise_callouts should cover 2-4 of the most notable exercises\n` +
    `6. Don't invent data that wasn't provided\n` +
    `7. Output ONLY the JSON object, nothing else`;

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model:       'gpt-5',
    temperature: 0.4,
    max_tokens:  600,
    messages: [
      { role: 'system', content: 'You are a strength coach. Respond with valid JSON only, no markdown.' },
      { role: 'user',   content: prompt },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) return null;

  try {
    // Strip potential markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned) as AIAnalysis;
    // Validate required fields exist
    if (!parsed.headline || !Array.isArray(parsed.wins)) return null;
    return parsed;
  } catch {
    console.error('[generate-weekly-summary] Failed to parse AI JSON:', raw.slice(0, 200));
    return null;
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

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

    // ── Check cache ───────────────────────────────────────────────────────
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

    // ── Fetch this week's sessions ────────────────────────────────────────
    const { data: sessions } = await supabase
      .from('workout_sessions')
      .select('id, started_at')
      .eq('user_id', user.id)
      .gte('started_at', weekStart + 'T00:00:00Z')
      .lt('started_at',  weekEnd   + 'T00:00:00Z')
      .not('completed_at', 'is', null);

    const sessionList = (sessions ?? []) as SessionRow[];
    const sessionIds = sessionList.map((s) => s.id);

    // Extract training days
    const sessionDays = [...new Set(
      sessionList.map((s) => DAY_NAMES[new Date(s.started_at).getUTCDay()])
    )];

    // ── Fetch session exercises + set_entries ─────────────────────────────
    const { data: seRows } = sessionIds.length
      ? await supabase
          .from('session_exercises')
          .select('exercise_id, set_entries ( values, set_type, is_completed )')
          .in('session_id', sessionIds)
      : { data: [] };

    // ── Fetch exercise metadata ───────────────────────────────────────────
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

    // ── Aggregate current week ────────────────────────────────────────────
    const cur = aggregate(seRows ?? [], exerciseMap);

    // ── Fetch PRs achieved this week ──────────────────────────────────────
    const { data: prRows } = await supabase
      .from('personal_records')
      .select('exercise_id, record_type, record_value, achieved_at')
      .eq('user_id', user.id)
      .gte('achieved_at', weekStart + 'T00:00:00Z')
      .lt('achieved_at', weekEnd + 'T00:00:00Z');

    const prsThisWeek = (prRows ?? []).map((pr: PRRow) => ({
      exercise:    exerciseMap.get(pr.exercise_id)?.name ?? 'Unknown',
      record_type: pr.record_type,
      value:       pr.record_value,
    }));

    // ── Fetch volume history (last 4 weeks including current) ─────────────
    const volumeByWeek: { week: string; volume: number }[] = [];
    const weeksToFetch = [
      addDays(weekStart, -21),
      addDays(weekStart, -14),
      addDays(weekStart, -7),
      weekStart,
    ];

    // Fetch previous summaries for volume trend
    const { data: prevSummaries } = await supabase
      .from('weekly_summaries')
      .select('week_start, summary_data')
      .eq('user_id', user.id)
      .in('week_start', weeksToFetch.slice(0, 3)); // first 3 weeks from cache

    const prevSummaryMap = new Map(
      (prevSummaries ?? []).map((s: { week_start: string; summary_data: WeeklySummaryData }) => [
        s.week_start, s.summary_data,
      ]),
    );

    for (const w of weeksToFetch) {
      if (w === weekStart) {
        volumeByWeek.push({ week: w, volume: cur.totalVolumeKg });
      } else {
        const prev = prevSummaryMap.get(w);
        volumeByWeek.push({ week: w, volume: prev?.total_volume_kg ?? 0 });
      }
    }

    // ── Previous week data for deltas ─────────────────────────────────────
    const prevData = prevSummaryMap.get(prevStart);
    const prevMuscleVolume = prevData?.muscle_volume ?? {};
    const prevVolumeKg = prevData?.total_volume_kg ?? null;

    // Previous week per-exercise volumes for delta calculation
    let prevExerciseVolumes: Record<string, number> = {};
    if (prevData?.exercise_highlights) {
      for (const eh of prevData.exercise_highlights) {
        prevExerciseVolumes[eh.name] = eh.volume;
      }
    }

    const improvedGroup = mostImprovedGroup(cur.muscleVolume, prevMuscleVolume);

    // ── Build muscle split ────────────────────────────────────────────────
    const totalMuscleVol = Object.values(cur.muscleVolume).reduce((a, b) => a + b, 0);
    const muscleSplit = Object.entries(cur.muscleVolume)
      .sort((a, b) => b[1] - a[1])
      .map(([muscle, volume]) => ({
        muscle,
        volume: Math.round(volume),
        percentage: totalMuscleVol > 0 ? Math.round((volume / totalMuscleVol) * 100) : 0,
      }));

    // ── Build exercise highlights ─────────────────────────────────────────
    const exerciseHighlights: ExerciseHighlight[] = [...cur.exerciseAggs.values()]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .map((agg) => {
        const prevVol = prevExerciseVolumes[agg.name] ?? null;
        const deltaPct = prevVol !== null && prevVol > 0
          ? Math.round(((agg.volume - prevVol) / prevVol) * 100)
          : null;
        return {
          name:      agg.name,
          volume:    Math.round(agg.volume),
          sets:      agg.sets,
          best_set:  agg.bestWeight > 0 ? `${agg.bestWeight}kg × ${agg.bestReps}` : `${agg.bestReps} reps`,
          delta_pct: deltaPct,
        };
      });

    // ── Build summary data ────────────────────────────────────────────────
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
      volume_by_week:      volumeByWeek,
      muscle_split:        muscleSplit,
      session_days:        sessionDays,
      prs_this_week:       prsThisWeek,
      ai_analysis:         null,
      exercise_highlights: exerciseHighlights,
    };

    // ── AI analysis ───────────────────────────────────────────────────────
    try {
      const apiKey = Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

      const aiResult = await generateStructuredInsight(apiKey, {
        workouts:           sessionIds.length,
        volume:             cur.totalVolumeKg,
        totalSets:          cur.totalSets,
        strongest:          cur.bestExercise
          ? `${cur.bestExercise} at ${cur.bestE1RMLabel}`
          : 'N/A',
        mostImproved:       improvedGroup,
        muscleGroups:       Object.keys(cur.muscleVolume),
        prevVolume:         prevVolumeKg,
        volumeByWeek,
        exerciseHighlights,
        prs:                prsThisWeek,
        sessionDays,
        muscleSplit,
      });

      summaryData.ai_analysis = aiResult;
      // Also set legacy insight field from headline for backward compat
      if (aiResult?.headline) {
        summaryData.insight = aiResult.headline;
      }

      console.log('[generate-weekly-summary] AI analysis generated for user', user.id);
    } catch (aiErr) {
      console.error('[generate-weekly-summary] AI analysis failed:', (aiErr as Error).message);
    }

    // ── Upsert ────────────────────────────────────────────────────────────
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
