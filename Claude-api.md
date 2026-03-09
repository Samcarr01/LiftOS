# Claude-api – API Endpoints & Edge Functions

This module defines all Supabase Edge Functions, client-side data access patterns, and the API surface.

## Architecture Approach
Most CRUD operations use **Supabase client SDK directly** (with RLS). Edge Functions handle compute-heavy or AI-dependent logic.

---

## Client SDK Operations (Direct Supabase)

### Exercises
#### CRUD
- `exercises.select()` – list user's exercises (filter: is_archived = false)
- `exercises.insert()` – create custom exercise (validate tracking_schema with Zod)
- `exercises.update()` – edit exercise
- `exercises.update({ is_archived: true })` – soft delete

#### Constraints
- **Validate tracking_schema client-side with Zod before insert**
- **Never hard-delete exercises (referenced by historical sessions)**

### Workout Templates
#### CRUD
- `workout_templates.select()` – list templates (ordered by is_pinned DESC, last_used_at DESC)
- `workout_templates.insert()` – create template
- `workout_templates.update()` – edit template
- `workout_templates.delete()` – delete template (cascades template_exercises)
- Duplicate: read template + template_exercises → insert copies with new IDs

### Template Exercises
#### CRUD
- `template_exercises.select()` – fetch exercises for a template (ordered by order_index)
- `template_exercises.insert()` – add exercise to template
- `template_exercises.update()` – reorder, change sets, rest timer
- `template_exercises.delete()` – remove from template

### Set Entries
#### CRUD
- `set_entries.insert()` – log a set (offline queue if no connection)
- `set_entries.update()` – edit a set value
- `set_entries.delete()` – remove a set

#### Constraints
- **Writes must work offline; queue in local DB, sync when online**
- **Autosave on every field change (debounced 500ms)**

### Workout History
#### Queries
- `workout_sessions.select('*, session_exercises(*, set_entries(*))').order('started_at', { ascending: false })` – paginated history
- Filter by date range, template

---

## Edge Functions

### `start-workout`
#### Purpose
Single fast payload to launch a workout session.

#### Input
```typescript
{
  template_id: string; // or null for blank session
}
```

#### Logic
1. Fetch template + template_exercises + exercises
2. Fetch `last_performance_snapshots` for each exercise
3. Fetch cached `ai_suggestions` for each exercise (if Pro user)
4. Create `workout_session` row
5. Create `session_exercises` rows (snapshot from template)
6. Return combined payload

#### Output
```typescript
{
  session: WorkoutSession;
  exercises: Array<{
    session_exercise: SessionExercise;
    exercise: Exercise;
    last_performance: SetEntry[] | null;
    ai_suggestion: AISuggestion | null;
    prefilled_sets: PrefilledSet[];
  }>;
}
```

#### Constraints
- **Must respond in < 500ms for cached data**
- **Prefilled sets = clone of last_performance values**
- **If no last performance, use template defaults (empty values with set count)**
- *Kick off async AI generation if suggestions are stale/missing*

---

### `complete-workout`
#### Purpose
Finalise a workout and trigger post-session processing.

#### Input
```typescript
{
  session_id: string;
}
```

#### Logic
1. Set `completed_at` and compute `duration_seconds`
2. Update `workout_templates.last_used_at`
3. For each exercise in session:
   a. Upsert `last_performance_snapshots` with latest sets
   b. Check and update `personal_records`
   c. Queue AI suggestion regeneration (async)
4. Check if weekly summary needs regenerating

#### Constraints
- **Must be idempotent (safe to call twice)**
- **PR detection runs on: best_weight, best_reps_at_weight, best_e1rm (Epley formula)**

---

### `generate-ai-suggestion`
#### Purpose
Generate progression targets for a specific exercise.

#### Input
```typescript
{
  user_id: string;
  exercise_id: string;
}
```

#### Logic
1. Fetch last 5 sessions for this exercise
2. Build prompt with performance history
3. Call Claude Haiku with strict JSON output
4. Validate response with Zod
5. Upsert into `ai_suggestions`

#### Constraints
- **Strict JSON mode: no free text from LLM**
- **Bounded suggestions: max +5% weight or +2 reps per session**
- **Fallback: if LLM fails, use simple rule (repeat last session)**
- **Rate limit: 1 call per exercise per session completion**
- **Cost target: < £0.005 per suggestion**
- *Pro tier only*

---

### `detect-plateau`
#### Purpose
Flag exercises where progress has stalled.

#### Input
```typescript
{
  user_id: string;
  exercise_id: string;
}
```

#### Logic
1. Fetch last N sessions (default: 4)
2. Compare top set or estimated 1RM across sessions
3. If no improvement for N exposures → flag plateau
4. Generate intervention suggestion (deload, rep range shift, variation)

#### Output
```typescript
{
  is_plateau: boolean;
  sessions_stalled: number;
  suggestion: string; // e.g., "Try a 10% deload for 1 week"
}
```

#### Constraints
- **N is configurable (default 4 sessions)**
- *Run as part of complete-workout pipeline*
- *Pro tier only*

---

### `generate-weekly-summary`
#### Purpose
Produce the weekly AI summary.

#### Input
```typescript
{
  user_id: string;
  week_start: string; // ISO date
}
```

#### Logic
1. Aggregate: workouts completed, total volume, per-muscle-group volume
2. Identify strongest lift (highest e1RM)
3. Identify most improved muscle group (volume delta vs prior week)
4. Call Claude Haiku for short insight (1-2 sentences)
5. Upsert into `weekly_summaries`

#### Constraints
- **Run via Supabase cron (pg_cron) every Monday 06:00 UTC**
- **Also triggerable on demand from client**
- *Pro tier only for AI insight text; free tier gets stats only*

---

### `sync-offline-queue`
#### Purpose
Receive and apply batched offline mutations.

#### Input
```typescript
{
  mutations: Array<{
    table: string;
    operation: 'insert' | 'update' | 'delete';
    data: Record<string, any>;
    client_id: string; // idempotency key
    timestamp: string;
  }>;
}
```

#### Logic
1. For each mutation, check idempotency key
2. Apply in timestamp order
3. Return success/conflict status per mutation

#### Constraints
- **Last-write-wins for conflicts**
- **Client must retry failed items**
- **Max batch size: 100 mutations**

---

## Zod Schemas (Shared Client + Server)

### TrackingFieldSchema
```typescript
z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  type: z.enum(['number', 'text']),
  unit: z.string().optional(),
  optional: z.boolean().optional().default(false),
})
```

### TrackingSchema
```typescript
z.object({
  fields: z.array(TrackingFieldSchema).min(1).max(10),
})
```

### SetValuesSchema (dynamic)
```typescript
// Generated at runtime from exercise.tracking_schema
function buildSetValuesSchema(trackingSchema: TrackingSchema) {
  const shape: Record<string, ZodType> = {};
  for (const field of trackingSchema.fields) {
    const base = field.type === 'number' ? z.number() : z.string();
    shape[field.key] = field.optional ? base.optional() : base;
  }
  return z.object(shape);
}
```

### AISuggestionSchema
```typescript
z.object({
  primary: z.object({
    weight: z.number().optional(),
    reps: z.number().optional(),
    rationale: z.string().max(200),
  }),
  alternative: z.object({
    weight: z.number().optional(),
    reps: z.number().optional(),
    rationale: z.string().max(200),
  }),
  plateau_flag: z.boolean(),
})
```

## Error Handling
- **All Edge Functions return `{ data, error }` pattern**
- **HTTP 401 for unauthenticated requests**
- **HTTP 422 for validation failures (include Zod error messages)**
- **HTTP 500 with generic message (log details server-side via Sentry)**
- *Never expose internal error details to client*
