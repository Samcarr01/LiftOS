# Claude-ai – AI Engine (Suggestions, Plateaus, Summaries)

This module defines all AI-powered features: progression suggestions, plateau detection, and weekly summaries. All AI calls are server-side via Supabase Edge Functions using **OpenAI GPT-5 or GPT-5.2**.

## AI Provider
**OpenAI GPT-5 / GPT-5.2** via OpenAI API (called from Supabase Edge Functions only).

### Cost Targets
- Suggestion generation: < £0.005 per exercise
- Weekly summary: < £0.01 per user per week
- **Total AI cost per active user per month: < £0.50**

### API Configuration
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
});

const response = await openai.chat.completions.create({
  model: 'gpt-5',  // or 'gpt-5.2' when available
  response_format: { type: 'json_object' },
  temperature: 0.2,
  max_tokens: 300,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
});

const result = JSON.parse(response.choices[0].message.content);
```

---

## Feature 1: Progression Suggestions

### Purpose
Give the user a concrete, bounded target for each exercise at workout start.

### Trigger
- On `start-workout`: serve cached suggestions
- On `complete-workout`: regenerate suggestions for exercises performed

### Prompt Template
```
You are a strength training coach. Given the recent performance history below, suggest the next session target.

EXERCISE: {exercise_name}
TRACKING TYPE: {tracking_type} (e.g., weight+reps)
RECENT SESSIONS (newest first):
{session_history_json}

RULES:
1. Primary target: suggest a small progression (max +5% weight OR +1-2 reps, never both)
2. Alternative target: suggest a different progression path
3. If the user has failed to improve for 3+ sessions, set plateau_flag to true
4. Suggestions must be realistic and conservative
5. Never suggest more than +5kg weight increase or +3 reps increase in a single step
6. For bodyweight exercises, focus on rep progression only

Respond ONLY with valid JSON matching this schema:
{
  "primary": { "weight": number|null, "reps": number|null, "rationale": "string max 200 chars" },
  "alternative": { "weight": number|null, "reps": number|null, "rationale": "string max 200 chars" },
  "plateau_flag": boolean
}
```

### Validation
- **Parse response with Zod AISuggestionSchema**
- **If validation fails: fallback to rule-based suggestion**
- **If API call fails: fallback to "repeat last session" suggestion**

### Rule-Based Fallback
```
if (last_session_all_sets_completed && reps >= target_max):
  suggestion = last_weight + smallest_increment, same_reps
elif (last_session_all_sets_completed):
  suggestion = same_weight, last_reps + 1
else:
  suggestion = same_weight, same_reps (repeat)
```

### Constraints
- **Max weight increment: 5kg / 10lb**
- **Max rep increment: 3 reps**
- **Suggestions must reference recent data, not hallucinate**
- **Cache suggestions in `ai_suggestions` table with 7-day expiry**
- *If exercise has < 2 sessions history, skip AI and use simple defaults*

---

## Feature 2: Plateau Detection

### Purpose
Identify when a user is stuck and suggest interventions.

### Definition of Plateau
No improvement in **estimated 1RM** (Epley formula) for N consecutive sessions of the same exercise, where N defaults to 4.

### Epley Formula
```
e1RM = weight × (1 + reps / 30)
```

### Detection Logic
```
1. Fetch last N session_exercises for this exercise
2. Calculate e1RM for top set of each session
3. If max(recent_e1RMs) <= e1RM_from_N_sessions_ago:
   → plateau detected
4. Count consecutive stalled sessions
```

### Intervention Suggestions (Template-Based, No AI Call)
- **2-3 sessions stalled:** "Try adding 1 extra rep before increasing weight"
- **4-5 sessions stalled:** "Consider a deload: drop to 85% weight for 1 week, then rebuild"
- **6+ sessions stalled:** "Try a variation exercise (e.g., close-grip bench for bench press plateau)"

### Constraints
- **Plateau detection runs on workout completion, not in real-time**
- **Only flag plateau if user has >= 4 sessions of that exercise**
- **Deload suggestions must be specific: include exact weight reduction percentage**
- *Store plateau status in ai_suggestions.suggestion_data.plateau_flag*

---

## Feature 3: Weekly Summary

### Purpose
End-of-week recap with stats and a short AI-generated insight.

### Data Aggregation (Server-Side)
```
1. Count workout_sessions where started_at in [week_start, week_end]
2. Sum total volume: SUM(weight × reps) across all set_entries
3. Count total sets
4. Group volume by muscle_group
5. Find strongest lift: exercise with highest e1RM this week
6. Compare vs previous week for deltas
7. Find most improved muscle group (biggest volume increase)
```

### AI Insight Prompt
```
You are a concise fitness analyst. Given this week's training summary, write 1-2 sentences of insight.

STATS:
- Workouts: {count}
- Total volume: {volume}kg
- Strongest lift: {exercise} at {weight}kg × {reps}
- Most improved: {muscle_group} (+{delta}% volume)
- Muscle groups trained: {list}
- Comparison vs last week: {delta_summary}

RULES:
1. Be encouraging but honest
2. If something stalled, mention it briefly
3. Max 2 sentences
4. No generic platitudes

Respond with plain text only. No JSON, no markdown.
```

### Constraints
- **Generated via pg_cron every Monday 06:00 UTC**
- **Also triggerable on demand when user opens Weekly Summary screen**
- *Cache in weekly_summaries table*

---

## AI Safety & Boundaries
- **Never suggest exercises the user hasn't created (avoid hallucination)**
- **Never suggest weight decreases without labelling it as a deload**
- **Never suggest anything that implies injury risk (e.g., "push through pain")**
- **All suggestions are optional; user can always dismiss**
- **AI rationale must be under 200 characters and reference actual data**
- **No health/medical advice; purely training progression guidance**
- *Disclaimer on first use: "AI suggestions are guidance only. Listen to your body."*

## Model Configuration
```json
{
  "provider": "openai",
  "model": "gpt-5",
  "fallback_model": "gpt-5.2",
  "max_tokens": 300,
  "temperature": 0.2,
  "response_format": { "type": "json_object" },
  "system_prompt": "You are a strength training progression coach. Respond only with valid JSON unless instructed otherwise.",
  "env_var": "OPENAI_API_KEY"
}
```

## Edge Function Dependencies
```json
// deno.json or import_map.json for Supabase Edge Functions
{
  "imports": {
    "openai": "https://deno.land/x/openai/mod.ts"
  }
}
```
*Alternatively use the npm openai package via npm: specifier in Deno.*
