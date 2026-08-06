# LiftOS — Cut-Aware Progression v1

**Date:** 2026-08-06
**Branch:** `plan/cut-aware-progression-v1`
**Status:** Plan only. No implementation code, migrations, or data changes were made while writing this document.
**Governing rule:** *Record objectively. Interpret contextually. Prescribe conservatively.*

---

## 0. Scope decision up front

**v1 targets the Next.js PWA in `web/` only.**

Reasons drawn from the audit:

- `web/` is the live product (Vercel), and it is where the deterministic engine lives (`web/src/lib/workout/guided-progression.ts`, 1,299 lines).
- The React Native app (`src/`, `app/`) uses an **incompatible legacy suggestion contract** — `src/lib/validation.ts` `AISuggestionDataSchema` is `{ primary, alternative, outcome, plateau_flag }`, whereas web is `{ decision, metric, last_result, next_target, per_set_targets, reason_codes, progression }`. The RN app also routes through the `start-workout` / `complete-workout` Edge Functions, which the web app no longer calls (web computes suggestions inline in `web/src/hooks/use-start-workout.ts` and `web/src/app/api/workouts/complete/route.ts`).
- Bringing RN to parity would mean porting the whole v2 engine contract. That is a separate body of work.

**Explicitly out of scope for v1 (see §14):** RN app, `supabase/functions/*` Edge Functions, the OpenAI-backed `generate-ai-suggestion` function, bodyweight charts, start-of-session readiness prompt, mesocycle planning, autoregulated set counts beyond the Very Low rule.

---

## 1. Audit — current data path, end to end

### 1.1 Storage (Supabase)

| Table | Relevant columns | Notes |
|---|---|---|
| `users` | `unit_preference`, `training_goals`, `experience_level` (7 values since `20260731150000`), `body_weight_kg`, `preferred_rep_range` (jsonb), `prefill_sort_heaviest_first`, `weekly_workout_target` | RLS `own_data` on `auth.uid() = id`. **No phase column. `body_weight_kg` is a single scalar that is overwritten — there is no bodyweight history anywhere in the schema.** |
| `workout_sessions` | `started_at`, `completed_at`, `duration_seconds`, `template_name`, `is_light_session` | RLS `auth.uid() = user_id`. **No readiness column, no phase snapshot.** |
| `session_exercises` | `order_index`, `rest_seconds`, `superset_group_id`, `notes` | RLS via parent-session join. Unique constraint added `20260730000000`. |
| `set_entries` | `set_index`, `values` (jsonb), `set_type` (`warmup\|working\|top\|drop\|failure`), `is_completed`, `logged_at`; `UNIQUE (session_exercise_id, set_index)` | RLS via parent join. **No effort/RIR column.** |
| `last_performance_snapshots` | `sets_data` jsonb, `UNIQUE (user_id, exercise_id)` | Written on completion only when the session is not light (`route.ts:502`). Drives the "Last" column. |
| `ai_suggestions` | `suggestion_data`, `history_snapshot`, `model_version`, `expires_at` | Written on completion (`model_version: 'guided-progression-v2'`, `history_snapshot.schema_version: 2`, `source_session_id`). **Read only by `web/src/hooks/use-exercise-insights.ts` and `buildAlreadyCompletedResponse`.** It is a cache/audit trail, not the authoritative start-time source. |
| `personal_records` | `best_weight`, `best_reps_at_weight`, `best_e1rm`, `best_volume` | Epley duplicated in `route.ts:71`. |

Migration conventions observed: additive only, `ADD COLUMN IF NOT EXISTS`, idempotent (`a606cdd`), file-per-change in `supabase/migrations/`.

### 1.2 Workout start

`web/src/hooks/use-start-workout.ts`

1. Loads template + `template_exercises` (with `target_ranges`).
2. Read branch (parallel): `last_performance_snapshots` for the exercise set; one `users` row (`prefill_sort_heaviest_first, unit_preference, training_goals, experience_level, preferred_rep_range`); `loadHistorySessions()` per exercise.
3. Write branch (parallel): inserts `workout_sessions` + `session_exercises` with client-generated UUIDs.
4. Per exercise: `sortLastPerformanceForPrefill()` → `buildGuidedSuggestion()` → reorders `per_set_targets` by `originalQualifyingOrder` when heaviest-first sorting is on → `buildPrefilledSets()`.
5. `hydrateWorkout(response)` → `router.push('/workout/<id>')`.

`web/src/lib/workout/load-history.ts` selects **all** completed `session_exercises` for the exercise, drops `is_light_session` rows, and sorts newest-first. It returns whole sessions (`sets[]` with `set_type`, `is_completed`) — the natural place to attach per-session context.

### 1.3 Progression calculation

`web/src/lib/workout/guided-progression.ts` — pure, deterministic, no network:

- `classifyExercise()` → `compound | accessory | bodyweight | cardio` (bodyweight = `added_weight` + `reps`).
- `getRepRange()` priority: template `target_ranges.reps` → `users.preferred_rep_range` → `GOAL_REP_RANGES[goal]` → `DEFAULT_REP_RANGES[category]`.
- `analyzeSession()` → working/top sets (falls back to all completed sets), max load, rep vector, avg reps, max Epley e1RM, `allSetsAtCeiling`, `setBreakdown`.
- `detectTrend()` over the newest 5 sessions → `improving | stable | declining | sharp_decline`, using constants `E1RM_IMPROVING_BAND 0.02`, `E1RM_MEANINGFUL_DECLINE 0.05`, `E1RM_SHARP_DECLINE_FROM_PEAK 0.15`, plus a consecutive-down-run counter.
- `countSessionsAtSameLevel()` → plateau counter; threshold 3 (beginner) / 4 (default) / 5 (advanced).
- Break handling: `LONG_BREAK_DAYS 14` → hold; `>= 21 days` → 5% reduction, `decision: 'deload'`; `MODERATE_BREAK_DAYS 7` → tempered copy.
- `buildDoubleProgressionSuggestion()` → progress when `allSetsAtCeiling` (load + one plate step, `roundLoadUp`, conservative per-set reps = prior − 1 floored at range min, **carrying the new load**), otherwise hold with `buildPerSetTargets()` preserving the rep vector and adding exactly one rep to the last feasible set.
- `computeDeloadPercent()` → 10 / 12 / 15%.
- `buildResult()` → `AISuggestionData` + `historySnapshot` provenance.

**Deload today is effectively single-signal:** it can only be reached via `trend === 'sharp_decline'` (pure e1RM) or a ≥21-day break. No readiness, effort, volume tolerance, or bodyweight input exists.

### 1.4 Suggestion persistence and the active workout store

- `web/src/app/api/workouts/complete/route.ts` upserts `set_entries`, stamps `completed_at`/`duration_seconds`/`is_light_session`, writes `last_performance_snapshots` (skipped for light sessions), detects PRs, then **recomputes** suggestions with `buildGuidedSuggestion()` and replaces the `ai_suggestions` rows.
- `web/src/store/active-workout-store.ts` — zustand + `persist` (`localStorage` key `liftos-active-workout`, `partialize` → `workout` + `dismissedSuggestions`). `hydrateWorkout()` deliberately sets `values: {}` (line 88) — **editable inputs stay blank**; `lastPerformanceSets` and `aiSuggestion` are display-only. This contract is protected by `web/tests/progression-ui-regression.tsx`.

### 1.5 Rendered UI

- `web/src/components/workout/exercise-card.tsx` — suggestion card (accent by `decision`: green progress / blue deload / amber hold), header line `Set targets: …` from `per_set_targets` (falls back to `next_target.display` for legacy rows), `was …` line, reason text; then maps `per_set_targets[qualifyingIndex]` onto working/top rows only.
- `web/src/components/workout/set-row.tsx` — `Last` value plus the orange target line (`text-primary/70`, `text-[11px]`), rendered only for `working`/`top` and only while the set is incomplete. Inputs are `NumericInput`, always blank until typed.
- `web/src/components/workout/superset-card.tsx` — **renders `SetRow` without `aiTarget`.** Superset rows currently show no progression guidance. Pre-existing gap; noted, not fixed in v1 (§14).
- `web/src/components/workout/finish-dialog.tsx` — sheet with exercise/set/open-set counts, **Light / off day** toggle, offline branch (queues `set_entries` inserts), online branch (POST `/api/workouts/complete`).
- `web/src/app/(app)/profile/training/page.tsx` — debounced autosave of goals, experience, rep range, heaviest-first, body weight, weekly target. The natural home for a Phase control.

### 1.6 Offline

`web/src/lib/offline/{index,sync-queue,indexed-db,sync-manager}.ts` — Dexie queue, `addToQueue`/`processQueue`, exponential backoff to a 5-minute cap, batches of 100 to the `sync-offline-queue` Edge Function. `OfflineMutationSchema` (`web/src/lib/validation.ts`) allows tables `set_entries | workout_sessions | session_exercises` and operations `insert | update | delete`, with `data: z.record(z.string(), z.unknown())` — so **new columns need no schema change client-side**, but the Edge Function's column handling must be verified (§10).

### 1.7 Tests

- `web/src/lib/workout/__tests__/progression-cycle-1.spec.ts` — 13 assertions, plain `assert`/`assertEqual`, run with `npx tsx`.
- `web/tests/progression-ui-regression.tsx`, `web/tests/cached-target-regression.tsx` — SSR rendered tests via `renderToStaticMarkup` with a stubbed `localStorage`, run with `npx tsx`.
- `web/tests/full-app.spec.ts`, `web/tests/authenticated-app.spec.ts` — Playwright against the **deployed** URL; `setViewportSize({ width: 375, height: 812 })` is already the mobile convention.
- `web/package.json` has **no `test` script** and `tsx` is not a declared devDependency. `node_modules` is absent in this worktree.

### 1.8 What already exists, what is reusable, what is missing

**Exists and reusable as-is:** deterministic engine and its rep-range priority chain; per-set target vector and its heaviest-first re-ordering; `is_light_session` opt-out; reason codes; suggestion provenance (`source_session_id`, `schema_version`); Epley e1RM; plateau counter; blank-input contract; offline queue; RLS pattern; idempotent migration style.

**Reusable with extension:** `loadHistorySessions()` (add per-session context columns); `AISuggestionDataSchema.progression` (add optional explainability fields); `finish-dialog.tsx` (already the "how was that session" moment — the Light/off-day toggle proves the pattern and the tap budget).

**Missing entirely:** training phase; readiness; per-session evidence weighting; effort/RIR; bodyweight history (only a mutable scalar); volume-tolerance signal; multi-signal deload; any separation between observation, interpretation, and prescription — today all three are interleaved inside `buildGuidedSuggestion()`.

---

## 2. Architecture — three explicit layers

The core of this plan is a boundary, not a formula. Phase and readiness must be structurally incapable of touching recorded facts.

```
set_entries (raw)  ─►  OBSERVATION  ─►  INTERPRETATION  ─►  PRESCRIPTION  ─►  UI
                        pure facts       weight+confidence    decision+targets
                        no context       context in           phase applied here
```

### 2.1 Layer 1 — Observation (raw, objective)

**New file:** `web/src/lib/workout/observation.ts`

```ts
export interface SetObservation {
  setIndex: number;
  setType: SetType;
  isCompleted: boolean;
  values: SetValues;
  load: number;          // weight | added_weight | height, per schema
  reps: number;
  e1rm: number;          // Epley; 0 when not weight+reps
  volumeKg: number;
}

export interface SessionObservation {
  sessionId: string;
  completedAt: string;
  workingSets: SetObservation[];   // working | top, else all completed
  topLoad: number;
  repVector: number[];
  avgReps: number;
  bestE1rm: number;
  totalVolumeKg: number;
  completedWorkingSetCount: number;
  plannedWorkingSetCount: number;  // rows present, completed or not
  allSetsAtCeiling: boolean;
  hasRepDropoff: boolean;
  finalWorkingSetRir: 0 | 1 | 2 | 3 | null;  // 3 === "3+"; raw, uninterpreted
}
```

**Hard rules:**

- `buildSessionObservations(sessions, schema, repRange)` takes **no** phase, readiness, bodyweight, or confidence parameter. This is enforced by the function signature and by a test (§11, T1).
- 80×8 → 80×7 produces the same `SessionObservation` regardless of any context. Readiness never rewrites a rep.
- Cardio/laps/duration/height schemas are observed with the same struct (`e1rm: 0`).

### 2.2 Layer 2 — Interpretation (context and confidence)

**New file:** `web/src/lib/workout/interpretation.ts`
**New file:** `web/src/lib/workout/bodyweight-trend.ts`
**New file:** `web/src/types/training-context.ts`

```ts
export type TrainingPhase = 'build' | 'maintain' | 'cut';
export type Readiness = 'high' | 'normal' | 'low' | 'very_low';

export interface SessionContext {
  sessionId: string;
  readiness: Readiness | null;      // null = never asked
  phaseAtSession: TrainingPhase | null;
  isLightSession: boolean;
}

export interface WeightedSession {
  observation: SessionObservation;
  context: SessionContext;
  evidenceWeight: number;           // 0.50 … 1.15 — never 0
  weightFloorApplied: 'large_drop' | 'repeat_decline' | null;
}

export interface TrendAssessment {
  direction: 'improving' | 'stable' | 'declining' | 'sharp_decline';
  weightedBaselineE1rm: number;
  weightedBaselineLoad: number;
  cleanQualifyingRun: number;       // consecutive sessions clearing the ceiling
  progressionConfidence: number;    // 0…1
  signals: SignalBreakdown[];       // every component, named + valued
}

export interface FatigueAssessment {
  deloadConfidence: number;         // 0…1
  contributingSignalCount: number;
  hardOverride: boolean;
  signals: SignalBreakdown[];
}

export interface SignalBreakdown {
  key: string;        // 'ceiling_evidence' | 'rising_effort' | …
  raw: number | null; // null = signal absent (never asked / no data)
  weight: number;     // fixed coefficient
  contribution: number;
}
```

Every number the user could ever be shown is traceable to a `SignalBreakdown` row. There is no opaque score and no model call.

### 2.3 Layer 3 — Prescription

`web/src/lib/workout/guided-progression.ts` is refactored to consume `TrendAssessment` + `FatigueAssessment` + `TrainingPhase` and to emit the **unchanged** `AISuggestionData` shape plus optional explainability fields. Phase is applied here and only here.

---

## 3. Readiness weighting

**Rule 3/4 compliance: every eligible session stays in the baseline. No completed normal session is ever assigned zero weight.**

| Readiness | Evidence weight | Rationale |
|---|---|---|
| `high` | **1.15** | Capped so one great day cannot dominate a trend. |
| `normal` | **1.00** | Baseline. |
| `null` (never asked) | **1.00** | Absence of an answer is not evidence of a bad day. All historical sessions land here — this is the backwards-compatibility hinge. |
| `low` | **0.70** | Counts, weighs less. |
| `very_low` | **0.50** | Hard floor. Never lower, never zero. |

`is_light_session` remains a separate, explicit, user-driven exclusion (unchanged, `load-history.ts:56`). Readiness is *not* an exclusion mechanism.

### 3.1 Overrides so real drops still matter (rule 4)

Applied after the table lookup, taking the **maximum** of the base weight and the floor:

1. **Large-drop floor — 0.85.** If a session's `bestE1rm` is ≥ **12%** below the weighted baseline e1RM, its weight floors at 0.85 regardless of readiness. A big drop on a Very Low day is still a big drop.
2. **Repeat-decline floor — 0.85.** If two consecutive sessions both decline and both are tagged `low`/`very_low`, the **second** one floors at 0.85. Repeated low-readiness underperformance is itself a signal, not noise to be discounted twice.

Both floors are recorded in `weightFloorApplied` and surfaced in `signals`.

### 3.2 Weighted baseline

```
weightedBaselineE1rm = Σ(wᵢ · e1rmᵢ) / Σ(wᵢ)     over the newest 5 eligible sessions
weightedBaselineLoad = Σ(wᵢ · topLoadᵢ) / Σ(wᵢ)  same window
```

`detectTrend()` keeps its existing band constants but compares against the **weighted** baseline instead of a plain mean, and the consecutive-down-run counter ignores runs whose cumulative weighted drop is under `E1RM_MEANINGFUL_DECLINE` (0.05) — preserving today's noise floor.

---

## 4. Phase: Build / Maintain / Cut

**Phase changes interpretation and prescription only. It never alters a stored fact, never re-labels history, and is never an input to `observation.ts`.**

| Lever | Build | Maintain | Cut |
|---|---|---|---|
| `progressionConfidence` required to increase load | **0.60** | **0.70** | **0.80** |
| Consecutive clean qualifying sessions required for a load increase | **1** | **1** | **2** |
| Rep progression (add a rep at the same load) | allowed | allowed | **allowed — this is Cut's primary path** |
| `deloadConfidence` threshold | **0.65** | **0.60** | **0.55** |
| Plate increment | one step | one step | **one step (unchanged)** |
| Proactive load reduction absent decline | never | never | **never** |

Notes on the design:

- **Cut does not shrink the jump — it delays it.** A plate is the smallest real increment; a "half increment" rounds back to the same plate and would be theatre. Cut instead demands higher confidence *and* a repeated clean session. This is exactly rule 5: progression is still available when genuinely earned, just harder to earn.
- **Cut's deload threshold is the lowest,** because fatigue accumulates faster in a deficit and the cost of a late deload is higher.
- Maintain sits between the two on progression and is slightly quicker than Build to deload (a maintenance block has no mandate to grind).

**Phase snapshotting.** Each session stores `phase_at_session`. Interpretation uses the phase *stored on each session* for that session's weighting narrative, and the **user's current phase** for the prescription. This is how "phase changed mid-trend" resolves cleanly (§13).

---

## 5. Very Low readiness — volume first (rule 6)

When the most recent eligible session is tagged `very_low`:

**Default prescription — reduce volume, preserve load:**

- Working-set target = `max(2, priorWorkingSetCount − 1)`.
- Load = `weightedBaselineLoad` (not necessarily the last session's load).
- Per-set rep targets keep the prior vector, truncated to the reduced set count. No rep increase.
- Reason code `VERY_LOW_READINESS_VOLUME_FIRST`.

**Load reduction is justified only when at least one of these is true:**

1. `finalWorkingSetRir === 0` at that load in the last session, **or**
2. the top working set's reps fell ≥ **25%** versus the weighted baseline *at the same load*, **or**
3. `deloadConfidence ≥ phase threshold` (i.e. the deload model fired independently).

Then load drops **one plate step** (not a percentage deload) with reason code `VERY_LOW_READINESS_LOAD_BACKOFF`. A percentage deload remains reserved for the multi-signal fatigue path in §6.

**Load-preservation rule (prevents a downward spiral from one bad day):** when the most recent session is `low`/`very_low` **and** its top load is below `weightedBaselineLoad`, the prescription uses `weightedBaselineLoad` with the volume reduction above, and emits `PRESERVE_LOAD_REDUCE_VOLUME`. A single self-deloaded bad day does not become the new ceiling.

---

## 6. Confidence models (deterministic, explainable)

> **All coefficients and thresholds below are proposed defaults and are assumptions requiring product validation with Sam.** They are declared as named constants in one block at the top of `interpretation.ts` so they can be tuned without touching logic.

### 6.1 Progression confidence — 0…1

```
progressionConfidence =
    0.40 · ceilingEvidence     // weighted fraction of working sets at/above the rep-range ceiling
  + 0.25 · trendComponent      // improving 1.0 | stable 0.6 | declining 0.2 | sharp_decline 0.0
  + 0.15 · repeatEvidence      // prior qualifying session also cleared ceiling 1.0 | partial 0.4 | no 0.0
  + 0.10 · effortHeadroom      // RIR 3+ → 1.0 | 2 → 0.7 | 1 → 0.35 | 0 → 0.1 | missing → 0.5
  + 0.10 · readinessContext    // high 1.0 | normal 0.8 | low 0.4 | very_low 0.2 | missing 0.8
```

**Missing-signal policy:** absent signals take an explicit **neutral** default (`0.5` for effort, `0.8` for readiness — matching `normal`). Absence never silently penalises a user who has not opted into the optional inputs, and never inflates confidence either.

### 6.2 Deload confidence — 0…1, converging evidence only (rule 7)

```
deloadConfidence =
    0.30 · performanceDecline  // weighted consecutive declines + cumulative weighted drop
  + 0.20 · readinessTrend      // share of the last 3 eligible sessions tagged low/very_low
  + 0.20 · risingEffort        // RIR falling toward 0 at equal-or-lower load; missing → 0.0
  + 0.15 · volumeTolerance     // completed ÷ planned working sets across the last 3 sessions
  + 0.10 · bodyweightTrend     // 7-day average falling ≥1%/week for ≥2 weeks; missing → 0.0
  + 0.05 · contextFlag         // ≥7-day break, or ≥2 light sessions in the last 3
```

**Note the asymmetry with §6.1:** here, missing optional signals contribute **0.0**, not a neutral value. We never manufacture fatigue evidence out of silence.

**Safeguard A — against false positives.** A deload requires **all** of:
- `deloadConfidence ≥ phase threshold`, **and**
- **≥ 2 distinct non-zero contributing signals**, **and**
- **≥ 2 eligible sessions** in the interpretation window.

No single signal can reach any threshold on its own — the largest coefficient is 0.30, well under the lowest threshold (0.55).

**Safeguard B — against missed fatigue.** A **hard override** fires a deload irrespective of the other signals when `performanceDecline ≥ 0.9` — i.e. three consecutive weighted declines, or ≥15% below the window peak. This is deliberately calibrated to reproduce today's `sharp_decline` behaviour, so a user with zero readiness/RIR/bodyweight data sees **exactly** the current app. `hardOverride: true` is recorded in the assessment.

**Safeguard C — bodyweight never vetoes (rule 8).** `bodyweightTrend` is strictly additive. There is no code path in which a falling bodyweight reduces `deloadConfidence` or blocks a deload. Asserted by a dedicated test (§11, T7).

**Deload magnitude** continues to use the existing `computeDeloadPercent()` ladder (10 / 12 / 15%), now keyed off `deloadConfidence` rather than raw decline count: `< 0.75 → 10%`, `0.75–0.85 → 12%`, `> 0.85 → 15%`.

### 6.3 Bodyweight trend (rule 9)

`web/src/lib/workout/bodyweight-trend.ts`:

- Input: `body_weight_logs` rows (§7.2), newest first.
- Compute a **7-day rolling average**; compare the latest window to the window ending 14 days earlier.
- Emit `null` (signal absent, contributes 0.0) unless there are **≥ 3 readings spanning ≥ 10 days**. One reading is never a trend.
- `raw = 1.0` when the average falls ≥1%/week sustained over ≥2 weeks; `0.5` for 0.5–1%/week; `0` otherwise.

---

## 7. Schema, RLS, and migrations

Two new migration files, both additive and idempotent, matching the house style.

### 7.1 `supabase/migrations/20260806090000_add_training_phase_readiness_rir.sql`

```sql
-- users: current training phase (interpretation/prescription only — never rewrites history)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS training_phase text NOT NULL DEFAULT 'build';
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS chk_training_phase,
  ADD CONSTRAINT chk_training_phase CHECK (training_phase IN ('build','maintain','cut'));
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS training_phase_started_at timestamptz;

-- workout_sessions: optional readiness + the phase in force at the time
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS readiness text;
ALTER TABLE public.workout_sessions
  DROP CONSTRAINT IF EXISTS chk_session_readiness,
  ADD CONSTRAINT chk_session_readiness
    CHECK (readiness IS NULL OR readiness IN ('high','normal','low','very_low'));
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS phase_at_session text;
ALTER TABLE public.workout_sessions
  DROP CONSTRAINT IF EXISTS chk_session_phase,
  ADD CONSTRAINT chk_session_phase
    CHECK (phase_at_session IS NULL OR phase_at_session IN ('build','maintain','cut'));

-- set_entries: optional reps-in-reserve on the final working set (3 === "3+")
ALTER TABLE public.set_entries
  ADD COLUMN IF NOT EXISTS rir smallint;
ALTER TABLE public.set_entries
  DROP CONSTRAINT IF EXISTS chk_set_rir,
  ADD CONSTRAINT chk_set_rir CHECK (rir IS NULL OR rir BETWEEN 0 AND 3);
```

### 7.2 `supabase/migrations/20260806090100_create_body_weight_logs.sql`

```sql
CREATE TABLE IF NOT EXISTS public.body_weight_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  logged_on  date        NOT NULL,
  weight_kg  numeric     NOT NULL CHECK (weight_kg > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, logged_on)
);

ALTER TABLE public.body_weight_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_data" ON public.body_weight_logs;
CREATE POLICY "own_data" ON public.body_weight_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_body_weight_logs_user_date
  ON public.body_weight_logs (user_id, logged_on DESC);
```

### 7.3 RLS notes

- `users.training_phase`, `workout_sessions.readiness/phase_at_session` inherit the existing `own_data` policies — no policy change needed.
- `set_entries.rir` inherits the existing parent-join policy — no policy change needed.
- `body_weight_logs` gets its own `auth.uid() = user_id` policy, matching Global Constraint 1.
- **No migration writes or mutates any user row.** `users.body_weight_kg` is left exactly as-is (see §7.4).

### 7.4 Bodyweight: dual write, no backfill

`users.body_weight_kg` stays the authoritative "current weight" for everything that reads it today (`profile/training`, `onboarding`). The profile page additionally upserts a `body_weight_logs` row keyed on `(user_id, current date)`. The trend signal simply reports "absent" until three readings accumulate — no backfill, no invented history.

---

## 8. Type changes

`web/src/types/database.ts`:

- `users` Row/Insert/Update: `training_phase: 'build'|'maintain'|'cut'`, `training_phase_started_at: string | null`.
- `workout_sessions` Row/Insert/Update: `readiness: 'high'|'normal'|'low'|'very_low' | null`, `phase_at_session: 'build'|'maintain'|'cut' | null`.
- `set_entries` Row/Insert/Update: `rir: number | null`.
- New `body_weight_logs` table entry + `export type BodyWeightLogRow`.

`web/src/types/app.ts`:

- `ActiveWorkoutState` gains `readiness: Readiness | null` (defaults `null` in `hydrateWorkout`).
- `SetEntry` gains `rir?: 0 | 1 | 2 | 3 | null`.
- Re-export `TrainingPhase` / `Readiness` from `@/types/training-context`.

`web/src/lib/validation.ts`:

- `AISuggestionDataSchema.progression` gains **optional** fields:
  `phase`, `readiness_of_latest`, `progression_confidence`, `deload_confidence`, `confidence_signals` (array of `{ key, raw, weight, contribution }`, max 12), `evidence_weights` (array of `{ session_id, weight, floor }`, max 5).
- `reason_codes` max raised **8 → 12** (reads of old rows are unaffected; new suggestions can carry phase + readiness codes alongside existing ones).
- New `ReadinessSchema`, `TrainingPhaseSchema`, `RirSchema` (`z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])`).
- `SetPayloadSchema` (in the complete route) gains `rir: RirSchema.nullable().optional()`.
- `CompleteWorkoutRequestSchema` gains `readiness: ReadinessSchema.nullable().optional()`.

**`src/types/database.ts` (RN) is intentionally not updated.** The RN app has already diverged; touching it would imply porting the v2 contract. Drift is recorded here deliberately.

---

## 9. New reason codes

Appended to `REASON_CODES` in `guided-progression.ts` (additive — every existing code keeps its exact string):

```
PHASE_CUT_REQUIRES_REPEAT      // Cut: one clean session logged, one more needed
PHASE_CUT_CONFIDENCE_SHORT     // Cut: confidence below the 0.80 bar
PHASE_MAINTAIN_CONSERVATIVE
LOW_READINESS_WEIGHTED         // session counted at reduced weight
VERY_LOW_READINESS_VOLUME_FIRST
VERY_LOW_READINESS_LOAD_BACKOFF
PRESERVE_LOAD_REDUCE_VOLUME
LARGE_DROP_FULL_WEIGHT         // low-readiness floor applied — the drop still counts
REPEATED_LOW_READINESS
MULTI_SIGNAL_DELOAD            // converging-evidence deload
DELOAD_HARD_OVERRIDE           // performance decline alone forced it
RISING_EFFORT_DETECTED
BODYWEIGHT_TREND_CONTEXT
RIR_MISSING_NEUTRAL
```

The UI branches on codes, never on copy — this is already the established pattern.

---

## 10. API, offline, and UI changes

### 10.1 API

`web/src/app/api/workouts/complete/route.ts`:

- Accept optional `readiness` on the request; write it plus `phase_at_session` (read from `users.training_phase` in the existing preferences query, which gains `training_phase`) in the existing `workout_sessions` update at line ~480.
- Include `rir` in the `set_entries` upsert column list (~line 450).
- Pass phase + per-session context into `buildGuidedSuggestion()`.
- Bump `model_version` to `guided-progression-v3` and `history_snapshot.schema_version` to `3`.

`web/src/hooks/use-start-workout.ts`:

- Add `training_phase` to the existing `users` select (line 118) — zero extra round trips.
- `loadHistorySessions()` returns readiness/phase per session; pass through to `buildGuidedSuggestion()`.

`web/src/lib/workout/load-history.ts`:

- Extend the select to `workout_sessions ( completed_at, is_light_session, readiness, phase_at_session )` and `set_entries ( …, rir )`; map into `SessionContext` alongside the existing `ProgressHistorySession`.

### 10.2 Offline

- **Readiness** lives on `ActiveWorkoutState`, so zustand `persist` carries it through a crash/close. The offline branch in `finish-dialog.tsx` additionally queues a `{ table: 'workout_sessions', operation: 'update', data: { id, readiness, phase_at_session } }` mutation. `OfflineMutationSchema` already permits this table/operation pair — no client schema change.
- **RIR** rides along in the existing queued `set_entries` payload (`data` is an open record).
- **Verification required (do not assume):** the `sync-offline-queue` Edge Function (`supabase/functions/sync-offline-queue/index.ts`) was **not** read during this audit. Before shipping, confirm it does not whitelist columns per table; if it does, either widen the whitelist or accept that readiness/RIR captured offline are dropped. **Raw set data is never at risk either way** — worst case the new optional context is lost and interpretation degrades to the "missing" defaults, which is a designed, safe state.
- Degradation is silent-by-design: no error toast for a missing optional signal.

### 10.3 UI

| File | Change |
|---|---|
| `web/src/components/workout/finish-dialog.tsx` | Add a **readiness chip row** — 4 chips (`High` / `Normal` / `Low` / `Very low`) directly above the existing Light/off-day toggle. Nothing preselected; skipping is free and silent. Sends `readiness` in the POST body. |
| **new** `web/src/components/workout/readiness-chips.tsx` | Presentational 4-chip control, ≥44px tap targets, single row at 375px, `role="radiogroup"`, `aria-checked`. |
| **new** `web/src/components/workout/rir-chips.tsx` | Optional `3+ / 2 / 1 / 0` chip row rendered **inside `exercise-card.tsx`, only under the final working/top set, only once that set is marked complete.** Collapsed to a single muted line (`Last set effort?`) until tapped. |
| `web/src/components/workout/exercise-card.tsx` | Render a small **phase pill** (`Cut` / `Maintain`) in the suggestion card header when phase ≠ Build; render the RIR row; unchanged per-set target mapping. |
| `web/src/components/workout/set-row.tsx` | Unchanged rendering contract — orange target remains set-specific, working/top only, inputs stay blank. Only accepts an optional `rirSlot` render prop. |
| `web/src/app/(app)/profile/training/page.tsx` | Add a **Phase** segmented control (Build / Maintain / Cut) to the existing debounced autosave block; writes `training_phase` and stamps `training_phase_started_at` on change. Body-weight save additionally upserts a `body_weight_logs` row. |
| `web/src/store/active-workout-store.ts` | `readiness` state + `setReadiness()`; `rir` on `SetEntry` + `setSetRir()`. `hydrateWorkout()` keeps `values: {}` — **the blank-input contract is untouched.** |

**Rule 13 is preserved throughout:** editable inputs stay blank, Last stays display-only, orange targets remain valid set-specific guidance. Readiness and RIR are *new* controls, not prefills.

### 10.4 Analytics

`web/` currently has **no analytics client** (only the RN app has `src/lib/analytics.ts`). v1 does **not** add one. Instead, define the event contract now so it is ready when web analytics lands:

`readiness_logged {readiness, session_id}` · `rir_logged {rir, exercise_id}` · `phase_changed {from, to}` · `deload_suggested {confidence, signal_count, hard_override}` · `progression_suppressed_by_phase {phase, confidence, required}` · `progression_applied {phase, confidence}`.

The `signals[]` breakdown already stored in `ai_suggestions.suggestion_data` gives a complete post-hoc audit trail without any client instrumentation, which is enough to validate the default coefficients (§16, decision 3).

---

## 11. Worked examples

Rep range 8–12, kg, compound (2.5kg step) unless stated.

### E1 — Legacy user, nothing optional filled in (backwards compatibility)
`[100×12, 100×12, 100×12]`, no readiness, no RIR, no phase → phase defaults to `build`.
- ceilingEvidence 1.0 → 0.40 · trend stable 0.6 → 0.15 · repeatEvidence 0 (single session) → 0.00 · effort missing 0.5 → 0.05 · readiness missing 0.8 → 0.08
- **progressionConfidence = 0.68 ≥ 0.60 (Build)** → progress to 102.5kg, per-set `[11, 11, 11]`.
- **Identical to today's output.** The existing 13-test suite must pass unchanged.

### E2 — Cut: progression is earned, not gifted
Same `[100×12, 100×12, 100×12]`, phase `cut`, readiness `normal`, RIR `2`, prior session `[12, 11, 10]`.
- 0.40 + 0.15 + (repeat partial 0.4 → 0.06) + (RIR 2 → 0.07) + (normal → 0.08) = **0.76 < 0.80** and `cleanQualifyingRun = 1 < 2`
- → **hold 100kg**, targets `[12, 12, 12]`, codes `PHASE_CUT_REQUIRES_REPEAT` + `PHASE_CUT_CONFIDENCE_SHORT`.
- Copy: *"Clean session at 100kg × 12 across all sets. In a cut we want one more like it before adding weight — repeat 100kg × 12,12,12."*

**Next session, same performance repeated:** repeatEvidence 1.0 → 0.40 + 0.15 + 0.15 + 0.07 + 0.08 = **0.85 ≥ 0.80**, `cleanQualifyingRun = 2` → **progress to 102.5kg**, per-set `[11, 11, 11]`. Rule 5 satisfied: Cut allows progression when genuinely earned.

### E3 — Low readiness, small drop
Prior `[100×8, 100×8, 100×7]` (normal); latest `[100×8, 100×7, 100×7]` tagged `low`.
- Observation records the drop objectively. Evidence weight 0.70. e1RM unchanged (top set 8 both) → no large-drop floor.
- Not at ceiling → hold path. Per-set targets preserve the vector and add one rep to the last feasible set → `[8, 8, 8]`.
- Codes: `PARTIAL_REP_PROGRESS`, `LOW_READINESS_WEIGHTED`.
- Copy: *"Logged as a low-readiness day — it still counts, just weighted lighter. Hold 100kg and aim 8, 8, 8."*

### E4 — Large one-off drop on a Very Low day (rule 4 + rule 6)
Prior `[100×10, 100×10, 100×9]`; latest `[85×6, 85×5]` tagged `very_low`.
- Readiness base weight 0.50, but e1RM 133.3 → 102.0 = **−23% ≥ 12%** → **large-drop floor 0.85** (`LARGE_DROP_FULL_WEIGHT`). The drop is not discounted away.
- Deload check: performanceDecline high but only one declining session → 0.30 × 0.5 = 0.15; readinessTrend 1/3 → 0.067; everything else absent → **0.217 < 0.65** → no deload. Correct: one bad day is not a fatigue pattern.
- Latest load (85) < `weightedBaselineLoad` (≈96) and readiness is very_low → **`PRESERVE_LOAD_REDUCE_VOLUME` + `VERY_LOW_READINESS_VOLUME_FIRST`**: prescribe **100kg × 2 working sets**, targets `[10, 9]`.
- Copy: *"Rough one last time — that still counts. Two quality sets at 100kg this time rather than three."*

### E5 — Multi-signal deload during a cut, with bodyweight falling (rules 7, 8)
Last 3 sessions e1RM 140 → 136 → 131; readiness `normal, low, low`; RIR `2 → 1 → 0` at the same load; completed working sets `3/3, 3/3, 2/3`; 7-day average bodyweight −1.2%/week for 3 weeks. Phase `cut`.
- performanceDecline 0.8 → **0.240** · readinessTrend 0.67 → **0.134** · risingEffort 1.0 → **0.200** · volumeTolerance 0.4 → **0.060** · bodyweightTrend 1.0 → **0.100** · contextFlag 0
- **deloadConfidence = 0.734 ≥ 0.55 (Cut)**, 5 contributing signals, ≥2 eligible sessions → **deload at 10%** (confidence < 0.75) → 90kg from 100kg.
- **Remove the bodyweight signal entirely and it is 0.634 — still fires.** The deload is not bodyweight-driven, and the falling bodyweight did not block it (rule 8).
- Codes: `MULTI_SIGNAL_DELOAD`, `RISING_EFFORT_DETECTED`, `BODYWEIGHT_TREND_CONTEXT`.

### E6 — Missed-fatigue guard for a user with no optional data
Three consecutive weighted declines, no readiness, no RIR, no bodyweight.
- readinessTrend 0, risingEffort 0, bodyweightTrend 0 → weighted sum alone = 0.30 → below every threshold.
- **`performanceDecline = 0.95 ≥ 0.9` → hard override fires the deload anyway.** Behaviour matches today's `sharp_decline` path exactly. `hardOverride: true`, code `DELOAD_HARD_OVERRIDE`.

---

## 12. Should optional final-set RIR ship in v1? — **Yes**

**Recommendation: include it, as a strictly optional, never-nagging, one-tap control.**

**For:**
- Rule 10 states plainly that rising effort cannot be inferred from load and reps. Without RIR, `risingEffort` is permanently 0.0 and a 0.20-weight slot in the deload model is dead — which pushes the model back toward e1RM-only inference, the exact failure rule 7 exists to prevent.
- Codebase fit is genuinely good: `set_entries` already has a per-set row with a unique key and an idempotent upsert path; the completion route already enumerates columns; the offline queue payload is an open record. This is one nullable smallint, not a new subsystem.
- It also feeds `effortHeadroom` in the progression model, which is what lets Cut distinguish "clean 12s with 2 in reserve" from "grinding 12s at RIR 0" — the difference between an earned load increase and an injury.

**Against (and the mitigations):**
- It is a second post-set tap. → Mitigated: rendered **only** under the final working/top set of an exercise, **only** after that set is completed, collapsed to a single muted line until tapped. Three working sets = one optional tap, not three.
- It could be stored in `set_entries.values` with no migration. → **Rejected.** `values` is driven by `tracking_schema`, so `NumericInput` would render RIR as an editable field and `formatSetValues()` would leak it into the "Last" line and the orange targets — directly violating rule 13. A dedicated nullable column is the correct place.
- Partial adoption creates uneven data. → Mitigated by the asymmetric missing-signal policy (§6): missing RIR is neutral for progression (0.5) and contributes zero to deload. A user who never taps it sees precisely today's behaviour.

**Guardrail:** if RIR adoption after a month is below roughly one session in four, the `risingEffort` coefficient should be revisited rather than the feature quietly relied upon.

---

## 13. Edge cases

| Case | Behaviour |
|---|---|
| **Missing phase** | `training_phase` defaults `'build'` (loosest thresholds) → identical to today's decisions. `phase_at_session` NULL on all history. |
| **Missing readiness** | Weight 1.00, `readinessContext` 0.8. Never treated as `low`. Every historical session lands here. |
| **Missing bodyweight** | `bodyweightTrend` absent → contributes 0.0. Fewer than 3 readings or <10 days span → still absent. |
| **Missing RIR** | `effortHeadroom` 0.5 (neutral) for progression; `risingEffort` 0.0 for deload. Code `RIR_MISSING_NEUTRAL`. |
| **Mixed set types** | Unchanged: `PROGRESSION_SET_TYPES = {working, top}` drives observation, per-set targets, and the qualifying-index mapping in `exercise-card.tsx`. Warmup/drop/failure never receive targets or an RIR prompt. Covered by existing test 9 and 13. |
| **Bodyweight exercises** (`added_weight` + `reps`) | `classifyExercise() → 'bodyweight'`; load key `added_weight`; e1RM computed on `added_weight` (existing behaviour, acknowledged as an approximation). All phase/readiness logic applies unchanged. |
| **Added-weight movements at +0kg** | `added_weight = 0` → `buildDeloadTarget` already floors at `Math.max(0, …)`. Very-Low load backoff is skipped when load is already 0 → falls back to volume reduction only. |
| **Light sessions** | Still fully excluded from history (`load-history.ts:56`) and from snapshot writes. Readiness is *not* a substitute — they are orthogonal. A light session contributes to `contextFlag` (0.05) only. |
| **Return from break** | Existing gates run **before** phase logic: ≥21d → deload 5%, 14–20d → hold, 7–13d → tempered copy. Phase then modulates only the subsequent sessions. A break also raises `contextFlag`. |
| **Sparse history (1 session)** | `repeatEvidence = 0`; `INSUFFICIENT_HISTORY` still appended by `buildResult()` when `sessionCount < 2`. Under Cut, `cleanQualifyingRun = 1 < 2` → holds. First-session prefill/targets still render (core UX). |
| **Large one-off drop** | Large-drop floor 0.85 (§3.1) — counted near-fully even on a Very Low day; but a single session cannot satisfy the ≥2-session deload requirement. See E4. |
| **Repeated Low readiness** | Repeat-decline floor 0.85 on the second consecutive declining low session; `readinessTrend` climbs toward 1.0 and feeds the deload model. Code `REPEATED_LOW_READINESS`. |
| **Phase changed mid-trend** | Raw observations and evidence weights are untouched. Each session keeps its own `phase_at_session` for narrative; the **current** phase alone sets thresholds. Switching Build→Cut mid-run may convert a pending progress into a hold with `PHASE_CUT_REQUIRES_REPEAT` — intended and explained in copy. No history is rewritten. |
| **Incomplete workouts** | `completed_at IS NULL` → excluded by `load-history.ts` (unchanged). Open sets inside a completed session lower `volumeTolerance` — which is the point of that signal. |
| **Old cached suggestions** | `ai_suggestions` rows with `schema_version` 2 or absent still parse (all new fields optional). Consumers accept `2 \| 3`. Start-time guidance is recomputed live and never sourced from the cache, so a stale row cannot surface as a target — the `cached-target-regression.tsx` invariant holds. |
| **Superset exercises** | `superset-card.tsx` passes no `aiTarget` today; that stays true in v1. Readiness (session-level) still applies; the RIR chip is not rendered inside supersets. Flagged in §14. |
| **Cardio / laps / duration** | Observation struct still produced (`e1rm: 0`); progression falls through to the existing cardio/fallback builders. Phase gates apply to load-bearing progressions only; cardio progression is unchanged. |
| **Unit `lb` users** | All thresholds are ratios or plate steps; `roundLoad`/`roundLoadUp` already branch on `unitPreference`. Bodyweight logs are stored canonically in kg (Global Constraint 7). |

---

## 14. Explicitly out of scope for v1 (later ideas)

- React Native app parity and the `supabase/functions/*` Edge Functions.
- Per-set-target rendering inside `superset-card.tsx` (pre-existing gap, separate fix).
- Start-of-session readiness prompt ("I feel rough today, adjust now") — v1 interprets the readiness of the *previous* session. See open decision 1.
- Bodyweight charting, scale/HealthKit integration, automatic weight import.
- Autoregulated set counts beyond the Very Low volume rule; per-exercise phase overrides.
- Illness/pain/injury tagging as a first-class signal (rule 7 mentions it "where supported" — no such field exists; `contextFlag` is the placeholder).
- Coefficient auto-tuning or any ML/LLM scoring. The model stays hand-written and inspectable.
- Adding a web analytics client.

---

## 15. TDD implementation sequence

Prerequisite (this worktree has no `node_modules`):

```bash
cd web && npm install
npm pkg set devDependencies.tsx="^4.19.0" && npm install   # make `tsx` deterministic
npm pkg set scripts.test:progression="tsx src/lib/workout/__tests__/run-all.ts"
```

Every step below writes the failing test **first**, watches it fail for the stated reason, then implements.

**Step 0 — Baseline (no code change).**
```bash
cd web
npx tsx src/lib/workout/__tests__/progression-cycle-1.spec.ts   # expect: 13/13 pass
npx tsx tests/progression-ui-regression.tsx                     # expect: pass
npx tsx tests/cached-target-regression.tsx                      # expect: pass
npx tsc --noEmit                                                # record the pre-existing use-history.ts errors verbatim
```
The recorded `tsc` output is the baseline; the count must not grow.

**Step 1 — Observation purity.**
Write `__tests__/observation.spec.ts` (**T1**): `buildSessionObservations()` produces byte-identical output for the same sets regardless of any context argument; 80×8 → 80×7 is recorded as a drop with no interpretation; warmup/drop/failure excluded from `workingSets`; `plannedWorkingSetCount` counts incomplete rows. → fails (module absent) → implement `observation.ts`.

**Step 2 — Readiness weighting.**
`__tests__/interpretation.spec.ts` (**T2**): weight table exact values; **no input ever yields 0** (fuzz all four levels + null); missing readiness ⇒ 1.00; large-drop floor 0.85 on a `very_low` session at −23% (E4); repeat-decline floor on the second consecutive low decline. → implement the weighting half of `interpretation.ts`.

**Step 3 — Progression confidence.**
**T3**: E1 = 0.68, E2 = 0.76 then 0.85 (exact, ±0.005); every `SignalBreakdown` present with a non-null `weight`; contributions sum to `progressionConfidence`.

**Step 4 — Phase gating.**
`__tests__/phase-prescription.spec.ts` (**T4**): E2 holds under Cut at confidence 0.76, progresses at 0.85 with `cleanQualifyingRun === 2`; the same input progresses immediately under Build; **phase never changes `SessionObservation`** (assert deep-equality of observations across all three phases).

**Step 5 — Very Low volume-first.**
**T5**: E4 yields 2 working sets at the preserved baseline load with `VERY_LOW_READINESS_VOLUME_FIRST` + `PRESERVE_LOAD_REDUCE_VOLUME`; load reduction fires **only** under the three justifications (three positive cases, one negative).

**Step 6 — Deload confidence.**
`__tests__/deload-confidence.spec.ts` (**T6**): E5 = 0.734; single-signal maximum (0.30) never reaches any threshold; the ≥2-signal and ≥2-session guards each independently block; **T7**: with `bodyweightTrend` removed E5 still fires (bodyweight never vetoes — rule 8); **T8**: hard override fires E6 with zero optional data.

**Step 7 — History plumbing.**
**T9**: `loadHistorySessions()` maps `readiness`/`phase_at_session`/`rir` into `SessionContext` from a fixture row shape; rows missing the columns produce `null`s and not throws.

**Step 8 — Engine integration + regression gate.**
Refactor `guided-progression.ts` onto the new layers. **The Step 0 suite must pass byte-for-byte unchanged** — this is the backwards-compatibility gate. Add codes to `REASON_CODES`; extend `AISuggestionDataSchema` (optional fields, `reason_codes` max → 12); confirm a v2-shaped cached row still parses (**T10**).

**Step 9 — Persistence.**
Migrations (§7). Types (§8). Complete-route + start-hook plumbing. `model_version → guided-progression-v3`, `schema_version → 3`, consumers accept `2 | 3`.

**Step 10 — UI + rendered acceptance at 375px.** (see §16)

**Step 11 — Offline.**
Verify `sync-offline-queue` column handling (§10.2). Add the `workout_sessions` readiness update to the offline branch of `finish-dialog.tsx`. Manual check: airplane mode → log → finish → reconnect → readiness and RIR land, or degrade silently with raw sets intact.

**Step 12 — Full verification.** (see §17)

---

## 16. Rendered mobile acceptance tests at 375px

Two complementary layers, both following patterns already in the repo.

### 16.1 SSR markup tests (`npx tsx`, no browser)

**New `web/tests/readiness-rir-ui.tsx`** — mirrors `progression-ui-regression.tsx` (stub `localStorage`, `renderToStaticMarkup`, hydrate the real store, render the real component):

1. `FinishDialog` renders exactly 4 readiness chips, **none preselected**.
2. `ExerciseCard` renders the RIR row **only** under the final working/top set, **only** once completed; never under warmup/drop/failure.
3. **Rule 13 regression:** with readiness `very_low` and a full suggestion present, **no `value="…"` appears on any `NumericInput`** — inputs stay blank.
4. Orange row targets remain set-specific: the `[3, 4, 6]` fixture still renders `80kg × 3`, `75kg × 4`, `70kg × 6`, exactly once each.

**New `web/tests/phase-guidance-375.tsx`:**

5. Under Cut with confidence 0.76, the card shows the hold accent, the `Cut` pill, and copy containing "one more" — and **no** load-increase number.
6. Under Build the same fixture shows the progress accent and `102.5kg`.
7. A v2-shaped legacy cached suggestion (no `per_set_targets`, no new fields) renders the summary card and **no** orange row targets — the `cached-target-regression.tsx` invariant, re-asserted post-refactor.

```bash
cd web
npx tsx tests/readiness-rir-ui.tsx
npx tsx tests/phase-guidance-375.tsx
npx tsx tests/progression-ui-regression.tsx
npx tsx tests/cached-target-regression.tsx
```

### 16.2 Playwright at 375 × 812 against a local server

**New `web/tests/mobile-progression-375.spec.ts`** — `BASE = process.env.E2E_BASE ?? 'http://localhost:3000'` (existing specs hardcode the Vercel URL; the new spec must run locally).

```bash
cd web
npm run build && npm run start &          # or: npm run dev
E2E_BASE=http://localhost:3000 npx playwright test tests/mobile-progression-375.spec.ts
```

Assertions at `setViewportSize({ width: 375, height: 812 })`:

- `document.documentElement.scrollWidth <= 375` on the active-workout screen with a suggestion card, a phase pill, and the RIR row all present — **no horizontal overflow**.
- Every readiness chip and RIR chip has `boundingBox().height >= 44` and `width >= 44` (one-handed use, Global Constraint 8).
- The 4 readiness chips sit on **one row** (all `boundingBox().y` values equal within 2px).
- The finish sheet's Save button remains reachable above `env(safe-area-inset-bottom)` with the readiness row added — the sheet does not clip.
- The suggestion card's `Set targets:` line is not truncated at 375px for a 3-set vector.
- Tapping a readiness chip then Save completes the workout and the completion screen renders.

---

## 17. Verification checklist

**Unit / engine**
```bash
cd web
npx tsx src/lib/workout/__tests__/observation.spec.ts
npx tsx src/lib/workout/__tests__/interpretation.spec.ts
npx tsx src/lib/workout/__tests__/phase-prescription.spec.ts
npx tsx src/lib/workout/__tests__/deload-confidence.spec.ts
npx tsx src/lib/workout/__tests__/progression-cycle-1.spec.ts   # 13/13, unchanged
```

**Rendered** — the four `tsx` commands in §16.1, then the Playwright command in §16.2.

**Typecheck**
```bash
cd web && npx tsc --noEmit
```
Pass condition: **no new errors**. The pre-existing `web/src/hooks/use-history.ts` failures (`never.map` / `never.length`, recorded at Step 0) are the only permitted output; fixing them is out of scope.

**Build**
```bash
cd web && npm run build
```
Pass condition: build succeeds; route count unchanged (no new routes in v1); the Serwist service worker regenerated during build is **restored to HEAD** afterwards, per the precedent set in PROGRESS.md (31 Jul 2026).

**Lint**
```bash
cd web && npm run lint
```

**Migrations** (Supabase MCP — implementation phase only; nothing applied while planning)
1. `apply_migration` both files to a **development branch**, never prod first.
2. `list_tables` → confirm `body_weight_logs` exists with the four columns.
3. `execute_sql` against `information_schema.columns` → confirm `users.training_phase`, `workout_sessions.readiness`, `workout_sessions.phase_at_session`, `set_entries.rir`.
4. `execute_sql` against `pg_policies` → confirm `own_data` exists on `body_weight_logs` and that no existing policy changed.
5. **Re-apply both migrations** → must succeed unchanged (idempotency, per `a606cdd`).
6. Confirm every existing row: `training_phase = 'build'`, `readiness IS NULL`, `phase_at_session IS NULL`, `rir IS NULL` — no data rewritten.
7. Only then promote to production.

**Manual smoke (375px device or emulation)**
Start workout → orange targets identical to pre-change for a legacy user → log sets, inputs start blank → tap RIR once → finish, tap `Low`, save → reopen the same workout → guidance reflects the low-readiness weighting and names it → switch phase to Cut in Profile → Training → start again → guidance holds with the Cut explanation.

---

## 18. Backwards compatibility summary

1. Every new column is nullable or defaulted; every migration is additive and idempotent; **no migration mutates existing rows**.
2. Historical sessions carry `readiness = NULL` → weight 1.00 → the weighted baseline collapses to today's plain mean → identical trend maths.
3. `training_phase` defaults to `'build'`, whose thresholds reproduce today's decisions (proven numerically in E1 and by the unchanged 13-test suite in Step 8).
4. The deload **hard override** is calibrated to today's `sharp_decline`, so users with no optional data see no behavioural change at all.
5. `AISuggestionData` gains only optional fields; `decision` / `metric` / `next_target` / `per_set_targets` / `reason` are untouched. Cached v2 rows parse and render (T10, §16.1 case 7).
6. `reason_codes` max 8 → 12 is a widening; old rows validate unchanged.
7. `/api/workouts/complete` gains only optional request fields — a stale cached PWA shell keeps working.
8. `users.body_weight_kg` remains the current-weight source of truth for existing readers; `body_weight_logs` is purely additive with no backfill.
9. The RN app is untouched and continues against the Edge Functions on its own legacy contract.

---

## 19. Genuinely open product decisions

Everything else in this plan is answerable from the code or the approved direction. These four are not.

1. **Readiness capture point.** v1 captures readiness at *finish*, describing the session just completed, and applies it to the *next* session's prescription. This is the low-friction choice and fits the existing Light/off-day pattern exactly — but it means rule 6's Very Low behaviour lands one session later than a "how do you feel right now?" prompt would. **Recommended: ship finish-time in v1**, add an optional start-time override in v1.1 if the lag proves annoying. Needs Sam's confirmation.

2. **Silent phase default.** Existing users are defaulted to `build` without being asked. This preserves current behaviour exactly, but a lifter who is actually cutting gets Build aggressiveness until they visit Profile → Training. Alternative: a one-time, dismissible prompt on the home screen. **Recommended: silent default plus a visible Phase row in Profile.** Needs confirmation.

3. **The coefficients and thresholds themselves** (§3, §4, §6) are proposed defaults, not derived from Sam's data. They are grouped as named constants for exactly this reason. Proposal: run v1 with these values, use the `signals[]` breakdown persisted in `ai_suggestions.suggestion_data` to review roughly 6–8 weeks of real sessions, then tune once. Specifically uncertain: the Cut confidence bar (0.80), the large-drop floor trigger (12%), and the `risingEffort` weight (0.20, which is only meaningful if RIR adoption is decent).

4. **What "volume" means for the Very Low reduction.** v1 reduces the *working-set count* by one (floor 2) and leaves load and per-set reps alone. The alternative — keeping the set count and trimming reps per set — preserves movement practice at the cost of a fuzzier progression signal. **Recommended: set-count reduction**, because it keeps each remaining set a clean, comparable data point. Needs confirmation.
