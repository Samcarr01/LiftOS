# Claude-db – Database Schema & Data Model

This module defines all Supabase Postgres tables, the field-driven tracking schema, RLS policies, and indexing strategy.

## Core Design Principle
Sets are logged using a **generic field-value map** (`jsonb`), not fixed columns. Each exercise defines a **tracking schema** that declares what fields a set contains. This enables fully custom exercise types without schema changes.

---

## Entity Definitions

### users
#### Columns
- `id` uuid PK (from Supabase Auth)
- `email` text NOT NULL
- `display_name` text
- `unit_preference` text DEFAULT 'kg' CHECK ('kg', 'lb')
- `subscription_tier` text DEFAULT 'free' CHECK ('free', 'pro')
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()

#### Constraints
- **RLS: user can only read/write own row**

---

### exercises
#### Columns
- `id` uuid PK DEFAULT gen_random_uuid()
- `user_id` uuid FK → users.id NOT NULL
- `name` text NOT NULL
- `muscle_groups` text[] DEFAULT '{}'
- `tracking_schema` jsonb NOT NULL
- `unit_config` jsonb DEFAULT '{}'
- `default_rest_seconds` int DEFAULT 90
- `notes` text
- `is_archived` boolean DEFAULT false
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()

#### tracking_schema Examples
```json
// Weight + Reps (most common)
{
  "fields": [
    { "key": "weight", "label": "Weight", "type": "number", "unit": "kg" },
    { "key": "reps", "label": "Reps", "type": "number" }
  ]
}

// Bodyweight + optional added weight
{
  "fields": [
    { "key": "reps", "label": "Reps", "type": "number" },
    { "key": "added_weight", "label": "Added Weight", "type": "number", "unit": "kg", "optional": true }
  ]
}

// Time-based
{
  "fields": [
    { "key": "duration", "label": "Duration", "type": "number", "unit": "seconds" }
  ]
}

// Distance
{
  "fields": [
    { "key": "distance", "label": "Distance", "type": "number", "unit": "metres" },
    { "key": "duration", "label": "Time", "type": "number", "unit": "seconds", "optional": true }
  ]
}

// Laps
{
  "fields": [
    { "key": "laps", "label": "Laps", "type": "number" },
    { "key": "duration", "label": "Time", "type": "number", "unit": "seconds", "optional": true }
  ]
}

// Fully custom
{
  "fields": [
    { "key": "band_color", "label": "Band", "type": "text" },
    { "key": "holds", "label": "Holds", "type": "number" }
  ]
}
```

#### Constraints
- **RLS: user_id = auth.uid()**
- **tracking_schema must validate against Zod schema on insert/update**
- *Provide seed exercises for common lifts (bench, squat, deadlift, OHP, row, pull-up)*

#### Indexes
- `idx_exercises_user` on (user_id, is_archived)

---

### workout_templates
#### Columns
- `id` uuid PK DEFAULT gen_random_uuid()
- `user_id` uuid FK → users.id NOT NULL
- `name` text NOT NULL
- `is_pinned` boolean DEFAULT false
- `last_used_at` timestamptz
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()

#### Constraints
- **RLS: user_id = auth.uid()**

#### Indexes
- `idx_templates_user_pinned` on (user_id, is_pinned, last_used_at DESC)

---

### template_exercises
#### Columns
- `id` uuid PK DEFAULT gen_random_uuid()
- `template_id` uuid FK → workout_templates.id ON DELETE CASCADE
- `exercise_id` uuid FK → exercises.id
- `order_index` int NOT NULL
- `default_set_count` int DEFAULT 3
- `rest_seconds` int
- `superset_group_id` text
- `target_ranges` jsonb
- `notes` text

#### Constraints
- **Unique (template_id, order_index)**
- *superset_group_id is a simple string tag; exercises with the same tag are grouped*

#### target_ranges Example
```json
{
  "weight": { "min": 60, "max": 70 },
  "reps": { "min": 6, "max": 10 }
}
```

---

### workout_sessions
#### Columns
- `id` uuid PK DEFAULT gen_random_uuid()
- `user_id` uuid FK → users.id NOT NULL
- `template_id` uuid FK → workout_templates.id (nullable for ad-hoc)
- `started_at` timestamptz NOT NULL DEFAULT now()
- `completed_at` timestamptz
- `duration_seconds` int
- `notes` text
- `created_at` timestamptz DEFAULT now()

#### Constraints
- **RLS: user_id = auth.uid()**

#### Indexes
- `idx_sessions_user_date` on (user_id, started_at DESC)
- `idx_sessions_template` on (user_id, template_id, started_at DESC)

---

### session_exercises
#### Columns
- `id` uuid PK DEFAULT gen_random_uuid()
- `session_id` uuid FK → workout_sessions.id ON DELETE CASCADE
- `exercise_id` uuid FK → exercises.id
- `order_index` int NOT NULL
- `rest_seconds` int
- `superset_group_id` text
- `notes` text

#### Constraints
- **Snapshot of template_exercise at workout time; changes to template don't retroactively alter history**

---

### set_entries
#### Columns
- `id` uuid PK DEFAULT gen_random_uuid()
- `session_exercise_id` uuid FK → session_exercises.id ON DELETE CASCADE
- `set_index` int NOT NULL
- `values` jsonb NOT NULL
- `set_type` text DEFAULT 'working' CHECK ('warmup', 'working', 'top', 'drop', 'failure')
- `is_completed` boolean DEFAULT false
- `notes` text
- `logged_at` timestamptz DEFAULT now()

#### Constraints
- **values must conform to the exercise's tracking_schema fields**
- **Unique (session_exercise_id, set_index)**

#### values Example
```json
{ "weight": 80, "reps": 5 }
```

#### Indexes
- `idx_sets_session_exercise` on (session_exercise_id, set_index)

---

### last_performance_snapshots
#### Purpose
O(1) lookup for "what did I do last time on this exercise?" Updated on workout completion.

#### Columns
- `id` uuid PK DEFAULT gen_random_uuid()
- `user_id` uuid FK → users.id NOT NULL
- `exercise_id` uuid FK → exercises.id NOT NULL
- `session_id` uuid FK → workout_sessions.id
- `sets_data` jsonb NOT NULL
- `performed_at` timestamptz NOT NULL
- `updated_at` timestamptz DEFAULT now()

#### Constraints
- **Unique (user_id, exercise_id)**
- **RLS: user_id = auth.uid()**

#### sets_data Example
```json
[
  { "set_index": 1, "values": { "weight": 80, "reps": 5 }, "set_type": "working" },
  { "set_index": 2, "values": { "weight": 80, "reps": 5 }, "set_type": "working" },
  { "set_index": 3, "values": { "weight": 80, "reps": 4 }, "set_type": "working" }
]
```

#### Indexes
- `idx_last_perf_user_exercise` on (user_id, exercise_id)

---

### ai_suggestions
#### Columns
- `id` uuid PK DEFAULT gen_random_uuid()
- `user_id` uuid FK → users.id NOT NULL
- `exercise_id` uuid FK → exercises.id NOT NULL
- `suggestion_data` jsonb NOT NULL
- `history_snapshot` jsonb NOT NULL
- `model_version` text NOT NULL
- `created_at` timestamptz DEFAULT now()
- `expires_at` timestamptz

#### Constraints
- **RLS: user_id = auth.uid()**
- **Cached; regenerated on workout completion or manual refresh**
- *expires_at defaults to 7 days from creation*

#### suggestion_data Example
```json
{
  "primary": { "weight": 82.5, "reps": 5, "rationale": "+2.5kg same reps, linear progression" },
  "alternative": { "weight": 80, "reps": 6, "rationale": "Same weight, +1 rep micro-progression" },
  "plateau_flag": false
}
```

---

### personal_records
#### Columns
- `id` uuid PK DEFAULT gen_random_uuid()
- `user_id` uuid FK → users.id NOT NULL
- `exercise_id` uuid FK → exercises.id NOT NULL
- `record_type` text NOT NULL CHECK ('best_weight', 'best_reps_at_weight', 'best_e1rm', 'best_volume')
- `record_value` numeric NOT NULL
- `record_context` jsonb
- `achieved_at` timestamptz NOT NULL
- `session_id` uuid FK → workout_sessions.id

#### Constraints
- **RLS: user_id = auth.uid()**
- **Unique (user_id, exercise_id, record_type)**

---

### weekly_summaries
#### Columns
- `id` uuid PK DEFAULT gen_random_uuid()
- `user_id` uuid FK → users.id NOT NULL
- `week_start` date NOT NULL
- `summary_data` jsonb NOT NULL
- `created_at` timestamptz DEFAULT now()

#### Constraints
- **Unique (user_id, week_start)**
- **RLS: user_id = auth.uid()**

#### summary_data Example
```json
{
  "workouts_completed": 4,
  "total_volume_kg": 12500,
  "strongest_lift": { "exercise": "Bench Press", "value": "82.5kg x 5" },
  "most_improved_group": "chest",
  "insight": "Bench trending up; squat stalled 3 weeks."
}
```

---

## RLS Policy Template
```sql
-- Apply to every table with user_id column
CREATE POLICY "Users can only access own data"
ON {table_name}
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

## Migration Strategy
- *Use Supabase CLI migrations*
- *Seed common exercises on first user signup via database trigger or Edge Function*
- *All timestamps stored as UTC*
