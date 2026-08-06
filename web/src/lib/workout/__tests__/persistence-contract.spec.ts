/**
 * Cycle 2 — RED — Persistence contract (migrations + payload schemas + builders)
 *
 * Run with: npx tsx src/lib/workout/__tests__/persistence-contract.spec.ts
 *
 * Plan: .hermes/plans/2026-08-06-cut-aware-progression-v1.md §7 (migrations, RLS,
 * no backfill), §8 (types + validation), §10.1 (API), §15 Step 9, §17 (migration
 * verification), §18 (backwards compatibility).
 *
 * Written BEFORE the migrations and `../complete-workout-persistence` exist.
 * It pins two things:
 *
 *  1. A *static* contract on the two migration files — idempotent, additive,
 *     strictly-owned, and incapable of rewriting a single existing row. This is
 *     the one place source-string matching is legitimate: the property under test
 *     ("this migration never mutates user data") is a property of the SQL text.
 *
 *  2. The *behaviour* of the persistence edge: payload schemas that keep old
 *     clients working, and pure builders that turn a parsed payload into rows.
 *
 * Wished-for API:
 *   @/lib/validation      ReadinessSchema, TrainingPhaseSchema, RirSchema,
 *                         SetPayloadSchema, CompleteWorkoutRequestSchema
 *   ../complete-workout-persistence
 *                         buildSetEntryUpsertRows, buildSessionCompletionPatch,
 *                         normalizeReadiness, normalizeTrainingPhase, normalizeRir
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  ReadinessSchema,
  TrainingPhaseSchema,
  RirSchema,
  SetPayloadSchema,
  CompleteWorkoutRequestSchema,
} from '@/lib/validation';
import {
  buildSetEntryUpsertRows,
  buildSessionCompletionPatch,
  normalizeReadiness,
  normalizeTrainingPhase,
  normalizeRir,
  type SetEntryUpsertInput,
  type SetEntryUpsertRow,
  type SessionCompletionPatch,
} from '../complete-workout-persistence';

// ── Assertion helpers (same plain style as progression-cycle-1.spec.ts) ───────

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
  }
}

function assertMatch(sql: string, pattern: RegExp, message: string) {
  if (!pattern.test(sql)) {
    throw new Error(`Assertion failed: ${message}\n  Pattern not found: ${pattern}`);
  }
}

function assertNoMatch(sql: string, pattern: RegExp, message: string) {
  const found = sql.match(pattern);
  if (found) {
    throw new Error(`Assertion failed: ${message}\n  Forbidden pattern matched: ${found[0]}`);
  }
}

function assertExported(value: unknown, name: string) {
  if (value === undefined || value === null) {
    throw new Error(`Assertion failed: missing wished-for export \`${name}\``);
  }
}

/** Safe for `undefined`, which JSON.stringify returns as `undefined`, not a string. */
function describeValue(value: unknown): string {
  return String(JSON.stringify(value));
}

// ── Migration file helpers ───────────────────────────────────────────────────

const PHASE_MIGRATION = '20260806090000_add_training_phase_readiness_rir.sql';
const BODY_WEIGHT_MIGRATION = '20260806090100_create_body_weight_logs.sql';

/** Walk up from the cwd so the suite runs from `web/` or from the repo root. */
function findMigrationsDir(): string {
  let dir = resolve(process.cwd());
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, 'supabase', 'migrations');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate supabase/migrations upward from ${process.cwd()}`);
}

/** Strip `--` comments and collapse whitespace so patterns stay formatting-agnostic. */
function normalizeSql(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readMigration(fileName: string): string {
  const path = join(findMigrationsDir(), fileName);
  if (!existsSync(path)) {
    throw new Error(`Migration not found: ${path} — required by plan §7`);
  }
  return normalizeSql(readFileSync(path, 'utf8'));
}

/** The body of `ADD CONSTRAINT <name> CHECK ( … )`, whitespace-normalised. */
function checkConstraintBody(sql: string, constraintName: string): string {
  const match = sql.match(
    new RegExp(`ADD CONSTRAINT\\s+${constraintName}\\s+CHECK\\s*\\((.*?)\\)\\s*;`, 'i'),
  );
  if (!match) {
    throw new Error(`Assertion failed: no \`ADD CONSTRAINT ${constraintName} CHECK (…)\` found`);
  }
  return match[1];
}

/** Every single-quoted literal inside a fragment, in order. */
function quotedLiterals(fragment: string): string[] {
  return [...fragment.matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

/** Leading tokens of table-level constraints, which are not columns. */
const TABLE_CONSTRAINT_KEYWORDS = new Set([
  'UNIQUE',
  'PRIMARY',
  'CHECK',
  'CONSTRAINT',
  'FOREIGN',
  'EXCLUDE',
  'LIKE',
]);

/**
 * The column names a `CREATE TABLE` declares, in declaration order.
 *
 * Splits the table body on top-level commas only, so `CHECK (weight_kg > 0)`
 * and `UNIQUE (user_id, logged_on)` do not fragment, then drops the entries
 * that are table constraints rather than columns.
 */
function declaredColumns(sql: string, tablePattern: string): string[] {
  const header = new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ${tablePattern}\\s*\\(`, 'i');
  const match = sql.match(header);
  if (!match || match.index === undefined) {
    throw new Error(`Assertion failed: no \`CREATE TABLE ${tablePattern} (…)\` found`);
  }

  // Re-scan from the opening paren so the body is captured with balanced nesting.
  let depth = 0;
  let body = '';
  for (let i = match.index + match[0].length - 1; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === '(') {
      depth += 1;
      if (depth === 1) continue;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    body += char;
  }

  const items: string[] = [];
  let current = '';
  depth = 0;
  for (const char of body) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      items.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  items.push(current);

  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => item.split(/\s+/)[0])
    .filter((first) => !TABLE_CONSTRAINT_KEYWORDS.has(first.toUpperCase()));
}

/** A named constraint must be dropped before it is added, or re-running fails. */
function assertDropThenAdd(sql: string, constraintName: string) {
  const dropIndex = sql.search(new RegExp(`DROP CONSTRAINT IF EXISTS\\s+${constraintName}\\b`, 'i'));
  const addIndex = sql.search(new RegExp(`ADD CONSTRAINT\\s+${constraintName}\\b`, 'i'));
  assert(dropIndex >= 0, `${constraintName} must be dropped with DROP CONSTRAINT IF EXISTS first`);
  assert(addIndex >= 0, `${constraintName} must be re-added by name`);
  assert(dropIndex < addIndex, `${constraintName}: the DROP must precede the ADD (idempotent re-run)`);
}

/**
 * Statements that would rewrite, delete or invent user data. A migration in this
 * plan is additive only — §7.3 and §18.1: "no migration mutates existing rows".
 */
const DESTRUCTIVE_PATTERNS: Array<[RegExp, string]> = [
  [/\bUPDATE\s+\w/i, 'no UPDATE — existing rows are never rewritten'],
  [/\bDELETE\s+FROM\b/i, 'no DELETE'],
  [/\bINSERT\s+INTO\b/i, 'no INSERT — no backfill, no invented history'],
  [/\bTRUNCATE\b/i, 'no TRUNCATE'],
  [/\bDROP\s+TABLE\b/i, 'no DROP TABLE'],
  [/\bDROP\s+COLUMN\b/i, 'no DROP COLUMN'],
  [/\bALTER\s+COLUMN\b/i, 'no ALTER COLUMN — existing column definitions are untouched'],
  [/\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b/i, 'no function redefinition in a column migration'],
];

console.log('Running Persistence contract (Cycle 2) tests...\n');

// ═════════════════════════════════════════════════════════════════════════════
// Part 1 — Static migration contract (§7)
// ═════════════════════════════════════════════════════════════════════════════

// ── M1: phase / readiness / rir columns ──────────────────────────────────────
{
  console.log('M1: 20260806090000_add_training_phase_readiness_rir.sql');

  const sql = readMigration(PHASE_MIGRATION);

  // Idempotency: every added column guards itself.
  assertNoMatch(
    sql,
    /ADD COLUMN(?!\s+IF NOT EXISTS)/i,
    'Every ADD COLUMN must be ADD COLUMN IF NOT EXISTS (house style, commit a606cdd)',
  );
  assertEqual(
    (sql.match(/ADD COLUMN IF NOT EXISTS/gi) ?? []).length,
    5,
    'Exactly five columns are added: training_phase, training_phase_started_at, readiness, phase_at_session, rir',
  );

  // users.training_phase — defaulted so every existing row reads `build` (§13, §18.3).
  assertMatch(
    sql,
    /ALTER TABLE public\.users ADD COLUMN IF NOT EXISTS training_phase text[^;]*NOT NULL[^;]*DEFAULT 'build'/i,
    "users.training_phase is text NOT NULL DEFAULT 'build'",
  );
  assertMatch(
    sql,
    /ALTER TABLE public\.users ADD COLUMN IF NOT EXISTS training_phase_started_at timestamptz/i,
    'users.training_phase_started_at is a nullable timestamptz',
  );
  assertDropThenAdd(sql, 'chk_training_phase');
  assertEqual(
    quotedLiterals(checkConstraintBody(sql, 'chk_training_phase')).sort(),
    ['build', 'cut', 'maintain'],
    'chk_training_phase allows exactly build | maintain | cut',
  );

  // workout_sessions.readiness — optional, and NULL must stay legal for all history.
  assertMatch(
    sql,
    /ALTER TABLE public\.workout_sessions ADD COLUMN IF NOT EXISTS readiness text/i,
    'workout_sessions.readiness is a nullable text column',
  );
  assertNoMatch(
    sql,
    /ADD COLUMN IF NOT EXISTS readiness text[^;]*NOT NULL/i,
    'readiness must remain nullable — null means "never asked" (§3)',
  );
  assertDropThenAdd(sql, 'chk_session_readiness');
  const readinessCheck = checkConstraintBody(sql, 'chk_session_readiness');
  assertMatch(readinessCheck, /readiness IS NULL OR/i, 'chk_session_readiness explicitly permits NULL');
  assertEqual(
    quotedLiterals(readinessCheck).sort(),
    ['high', 'low', 'normal', 'very_low'],
    'chk_session_readiness allows exactly high | normal | low | very_low',
  );

  // workout_sessions.phase_at_session — the snapshot, nullable on all history (§4).
  assertMatch(
    sql,
    /ALTER TABLE public\.workout_sessions ADD COLUMN IF NOT EXISTS phase_at_session text/i,
    'workout_sessions.phase_at_session is a nullable text column',
  );
  assertNoMatch(
    sql,
    /ADD COLUMN IF NOT EXISTS phase_at_session text[^;]*(NOT NULL|DEFAULT)/i,
    'phase_at_session takes no default — history is never retro-labelled with a phase',
  );
  assertDropThenAdd(sql, 'chk_session_phase');
  const phaseCheck = checkConstraintBody(sql, 'chk_session_phase');
  assertMatch(phaseCheck, /phase_at_session IS NULL OR/i, 'chk_session_phase explicitly permits NULL');
  assertEqual(
    quotedLiterals(phaseCheck).sort(),
    ['build', 'cut', 'maintain'],
    'chk_session_phase allows exactly build | maintain | cut',
  );

  // set_entries.rir — one nullable smallint on the compact 0…3 RIR scale, where
  // 3 means "3 or more reps in reserve" (§7.1, §12).
  assertMatch(
    sql,
    /ALTER TABLE public\.set_entries ADD COLUMN IF NOT EXISTS rir smallint/i,
    'set_entries.rir is a nullable smallint',
  );
  assertNoMatch(
    sql,
    /ADD COLUMN IF NOT EXISTS rir smallint[^;]*(NOT NULL|DEFAULT)/i,
    'rir must be nullable with no default — absence is not RIR 0',
  );
  assertDropThenAdd(sql, 'chk_set_rir');
  assertMatch(
    checkConstraintBody(sql, 'chk_set_rir'),
    /rir IS NULL OR rir BETWEEN 0 AND 3/i,
    'chk_set_rir allows NULL or 0…3 (3 === "3+")',
  );

  // Existing RLS is inherited, not rewritten (§7.3).
  assertNoMatch(sql, /CREATE POLICY/i, 'No policy is created — users/workout_sessions/set_entries inherit their own');
  assertNoMatch(sql, /DROP POLICY/i, 'No existing policy is dropped');
  assertNoMatch(sql, /DISABLE ROW LEVEL SECURITY/i, 'RLS is never disabled');

  for (const [pattern, message] of DESTRUCTIVE_PATTERNS) {
    assertNoMatch(sql, pattern, message);
  }

  console.log('  ✓ 5 idempotent ADD COLUMNs, 4 named DROP+ADD checks, no row mutation, no policy change');
}

// ── M2: body_weight_logs ─────────────────────────────────────────────────────
{
  console.log('\nM2: 20260806090100_create_body_weight_logs.sql');

  const sql = readMigration(BODY_WEIGHT_MIGRATION);

  assertMatch(
    sql,
    /CREATE TABLE IF NOT EXISTS public\.body_weight_logs/i,
    'The table is created idempotently',
  );
  assertMatch(
    sql,
    /user_id uuid NOT NULL REFERENCES public\.users\s*\(\s*id\s*\)\s*ON DELETE CASCADE/i,
    'user_id is a NOT NULL FK to public.users(id) with ON DELETE CASCADE',
  );
  assertMatch(sql, /logged_on date NOT NULL/i, 'logged_on is a NOT NULL date — one row per calendar day');
  assertMatch(
    sql,
    /weight_kg numeric NOT NULL CHECK \(\s*weight_kg > 0\s*\)/i,
    'weight_kg is canonical kg, NOT NULL, and strictly positive (Global Constraint 7)',
  );
  assertMatch(
    sql,
    /UNIQUE \(\s*user_id\s*,\s*logged_on\s*\)/i,
    'UNIQUE (user_id, logged_on) — the daily upsert key',
  );

  // §7.2 lists the table exactly: id, user_id, logged_on, weight_kg, created_at.
  // Nothing more. A column the approved schema does not declare is a column no
  // writer maintains, so it would sit at its DEFAULT forever while reading like
  // a real "last edited" timestamp to anyone querying the trend.
  assertEqual(
    declaredColumns(sql, 'public\\.body_weight_logs'),
    ['id', 'user_id', 'logged_on', 'weight_kg', 'created_at'],
    'body_weight_logs declares exactly the five columns of plan §7.2, in order',
  );
  assertNoMatch(
    sql,
    /\bupdated_at\b/i,
    'No updated_at column — §7.2 does not declare one, and the daily upsert never sets it, so it would be a permanently stale timestamp',
  );
  assertMatch(
    sql,
    /created_at timestamptz NOT NULL DEFAULT now\(\)/i,
    'created_at is a NOT NULL timestamptz defaulted by the database',
  );

  // RLS: enabled, own-data only, on both read and write paths (Global Constraint 1).
  assertMatch(
    sql,
    /ALTER TABLE public\.body_weight_logs ENABLE ROW LEVEL SECURITY/i,
    'RLS is enabled on the new table',
  );
  const dropPolicyIndex = sql.search(/DROP POLICY IF EXISTS "own_data" ON public\.body_weight_logs/i);
  const createPolicyIndex = sql.search(/CREATE POLICY "own_data" ON public\.body_weight_logs/i);
  assert(dropPolicyIndex >= 0, 'The policy is dropped with IF EXISTS first (idempotent re-run)');
  assert(createPolicyIndex > dropPolicyIndex, 'DROP POLICY precedes CREATE POLICY');
  assertMatch(
    sql,
    /CREATE POLICY "own_data" ON public\.body_weight_logs FOR ALL USING \(\s*auth\.uid\(\) = user_id\s*\) WITH CHECK \(\s*auth\.uid\(\) = user_id\s*\)/i,
    'own_data is FOR ALL with both USING and WITH CHECK on auth.uid() = user_id',
  );
  assertNoMatch(sql, /USING \(\s*true\s*\)/i, 'No permissive USING (true) escape hatch');
  assertNoMatch(sql, /WITH CHECK \(\s*true\s*\)/i, 'No permissive WITH CHECK (true) escape hatch');
  assertNoMatch(
    sql,
    /(DROP|CREATE|ALTER) POLICY[^;]*ON public\.(users|workout_sessions|session_exercises|set_entries)\b/i,
    'No policy on any pre-existing table is touched',
  );

  assertMatch(
    sql,
    /CREATE INDEX IF NOT EXISTS idx_body_weight_logs_user_date ON public\.body_weight_logs \(\s*user_id\s*,\s*logged_on DESC\s*\)/i,
    'The (user_id, logged_on DESC) index is created idempotently',
  );

  // §7.4 — dual write, no backfill. users.body_weight_kg is left exactly as-is.
  for (const [pattern, message] of DESTRUCTIVE_PATTERNS) {
    assertNoMatch(sql, pattern, message);
  }
  assertNoMatch(
    sql,
    /body_weight_kg/i,
    'The migration never reads or copies users.body_weight_kg — no backfill (§7.4)',
  );

  console.log('  ✓ exactly the §7.2 columns, idempotent table/index/policy, FK cascade, daily unique key, strict own-data RLS, no backfill');
}

// ═════════════════════════════════════════════════════════════════════════════
// Part 2 — Payload schema behaviour (§8, §18.7)
// ═════════════════════════════════════════════════════════════════════════════

{
  console.log('\nP1: wished-for validation exports exist');
  assertExported(ReadinessSchema, 'ReadinessSchema');
  assertExported(TrainingPhaseSchema, 'TrainingPhaseSchema');
  assertExported(RirSchema, 'RirSchema');
  assertExported(SetPayloadSchema, 'SetPayloadSchema');
  assertExported(CompleteWorkoutRequestSchema, 'CompleteWorkoutRequestSchema');
  console.log('  ✓ ReadinessSchema, TrainingPhaseSchema, RirSchema, SetPayloadSchema, CompleteWorkoutRequestSchema');
}

// ── P2: the vocabulary schemas are strict on their own ───────────────────────
{
  console.log('\nP2: the standalone vocabulary schemas are strict');

  assertEqual(ReadinessSchema.safeParse('very_low').success, true, 'very_low is a readiness');
  assertEqual(ReadinessSchema.safeParse('exhausted').success, false, 'exhausted is not a readiness');
  assertEqual(ReadinessSchema.safeParse(null).success, false, 'the bare schema is not nullable — the field is');

  assertEqual(TrainingPhaseSchema.safeParse('cut').success, true, 'cut is a phase');
  assertEqual(TrainingPhaseSchema.safeParse('bulk').success, false, 'bulk is not a phase');

  assertEqual(RirSchema.safeParse(0).success, true, 'RIR 0 is valid — it means "nothing left"');
  assertEqual(RirSchema.safeParse(2).success, true, 'RIR 2 is valid — mid-scale');
  assertEqual(RirSchema.safeParse(3).success, true, 'RIR 3 is valid — the top of the scale, meaning "3 or more"');
  assertEqual(RirSchema.safeParse(4).success, false, '4 is out of range — the scale caps at 3, which already means 3+');
  assertEqual(RirSchema.safeParse(-1).success, false, 'negative RIR is meaningless');
  assertEqual(RirSchema.safeParse(1.5).success, false, 'RIR is an integer scale');
  assertEqual(RirSchema.safeParse('3').success, false, 'a stringified RIR is malformed — the scale is numeric');

  console.log('  ✓ strict enums; RIR bounded to 0…3 (3 === "3+")');
}

// ── P3: an old client's workout payload still completes ──────────────────────
{
  console.log('\nP3: a pre-Cycle-2 completion payload parses unchanged');

  const legacyPayload = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    isLightSession: false,
    exercises: [
      {
        sessionExerciseId: '22222222-2222-4222-8222-222222222222',
        sets: [
          { setIndex: 0, values: { weight: 100, reps: 10 }, setType: 'working', isCompleted: true },
        ],
      },
    ],
  };

  const parsed = CompleteWorkoutRequestSchema.parse(legacyPayload);
  assertEqual(parsed.sessionId, legacyPayload.sessionId, 'sessionId survives');
  assertEqual(parsed.exercises[0].sets[0].values, { weight: 100, reps: 10 }, 'Raw set values survive');
  assertEqual(parsed.readiness ?? null, null, 'Omitted readiness is nullish, never a fabricated value');

  console.log('  ✓ a stale cached PWA shell keeps completing workouts (§18.7)');
}

// ── P4: readiness — valid survives, explicit null survives, junk degrades ────
{
  console.log('\nP4: readiness is optional context, never a completion blocker');

  const base = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    exercises: [],
  };

  assertEqual(
    CompleteWorkoutRequestSchema.parse({ ...base, readiness: 'very_low' }).readiness,
    'very_low',
    'A valid readiness survives verbatim',
  );
  assertEqual(
    CompleteWorkoutRequestSchema.parse({ ...base, readiness: 'high' }).readiness,
    'high',
    'high survives verbatim',
  );
  assertEqual(
    CompleteWorkoutRequestSchema.parse({ ...base, readiness: null }).readiness,
    null,
    'An explicit null survives as null — "asked and skipped" is still null',
  );

  const junk = CompleteWorkoutRequestSchema.safeParse({ ...base, readiness: 'exhausted' });
  assertEqual(junk.success, true, 'An unrecognised readiness must NOT reject the completion');
  assertEqual(
    junk.success ? junk.data.readiness ?? null : 'PARSE_FAILED',
    null,
    'An unrecognised readiness degrades to null — a lost optional signal never loses a workout',
  );

  console.log('  ✓ valid / explicit null / junk → very_low, null, null (and the workout still saves)');
}

// ── P5: RIR — optional per set, degrades the same way ────────────────────────
{
  console.log('\nP5: set-level RIR is optional and degrades to null');

  const legacySet = {
    setIndex: 0,
    values: { weight: 100, reps: 10 },
    setType: 'working',
    isCompleted: true,
  };

  assertEqual(
    SetPayloadSchema.parse(legacySet).rir ?? null,
    null,
    'A set logged before RIR existed parses with no RIR',
  );
  assertEqual(SetPayloadSchema.parse({ ...legacySet, rir: 0 }).rir, 0, 'RIR 0 survives — it is not falsy-erased');
  assertEqual(SetPayloadSchema.parse({ ...legacySet, rir: 2 }).rir, 2, 'RIR 2 survives');
  assertEqual(SetPayloadSchema.parse({ ...legacySet, rir: 3 }).rir, 3, 'RIR 3 survives — the top of the scale ("3+") round-trips');
  assertEqual(SetPayloadSchema.parse({ ...legacySet, rir: null }).rir, null, 'An explicit null survives');

  const junkRir = SetPayloadSchema.safeParse({ ...legacySet, rir: 4 });
  assertEqual(junkRir.success, true, 'An out-of-range RIR must not reject the set');
  assertEqual(
    junkRir.success ? junkRir.data.rir ?? null : 'PARSE_FAILED',
    null,
    'An out-of-range RIR degrades to null — the reps and weight are what matter',
  );

  console.log('  ✓ omitted / 0 / 2 / 3 / null / 4 → null, 0, 2, 3, null, null');
}

// ── P6: unknown keys are stripped, not fatal ─────────────────────────────────
{
  console.log('\nP6: unknown keys are stripped, keeping old and new clients compatible');

  const withExtras = SetPayloadSchema.parse({
    setIndex: 1,
    values: { weight: 80, reps: 8 },
    setType: 'top',
    isCompleted: true,
    // A future/legacy client sending something we do not model.
    effort: 'hard',
    clientVersion: '1.4.2',
  });
  assert(!('effort' in withExtras), 'Unknown set keys are stripped, never persisted');
  assert(!('clientVersion' in withExtras), 'Unknown client metadata is stripped');
  assertEqual(withExtras.setIndex, 1, 'Known keys survive stripping');

  const requestWithExtras = CompleteWorkoutRequestSchema.parse({
    sessionId: '11111111-1111-4111-8111-111111111111',
    exercises: [],
    mood: 'great',
  });
  assert(!('mood' in requestWithExtras), 'Unknown request keys are stripped, never persisted');

  console.log('  ✓ extras dropped silently; the completion still succeeds');
}

// ═════════════════════════════════════════════════════════════════════════════
// Part 3 — Pure row builders and normalizers (§10.1)
// ═════════════════════════════════════════════════════════════════════════════

// ── B1: every upsert row carries the same keys, legacy sets included ─────────
{
  console.log('\nB1: set_entries upsert rows are key-homogeneous; legacy sets yield rir null');

  const exercises: SetEntryUpsertInput[] = [
    {
      sessionExerciseId: 'se-1',
      sets: [
        // Legacy: no rir key at all.
        { setIndex: 0, values: { weight: 100, reps: 10 }, setType: 'working', isCompleted: true },
        // New: an explicit RIR on the final working set.
        { setIndex: 1, values: { weight: 100, reps: 9 }, setType: 'working', isCompleted: true, rir: 0 },
      ],
    },
    {
      sessionExerciseId: 'se-2',
      sets: [
        { setIndex: 0, values: { weight: 60, reps: 12 }, setType: 'warmup', isCompleted: true, notes: 'felt easy' },
        { setIndex: 1, values: {}, setType: 'working', isCompleted: false, rir: 3 },
      ],
    },
  ];

  const rows: SetEntryUpsertRow[] = buildSetEntryUpsertRows(exercises);

  assertEqual(rows.length, 4, 'One row per payload set, flattened across exercises');

  const EXPECTED_KEYS = [
    'is_completed',
    'notes',
    'rir',
    'session_exercise_id',
    'set_index',
    'set_type',
    'values',
  ];
  for (const row of rows) {
    assertEqual(
      Object.keys(row).sort(),
      EXPECTED_KEYS,
      'Every row must carry an identical key set — a heterogeneous bulk upsert drops columns silently',
    );
  }

  assertEqual(rows[0].rir, null, 'A set logged without RIR persists NULL, not 0');
  assertEqual(rows[1].rir, 0, 'RIR 0 persists as 0 — "nothing left in the tank" is real data');
  assertEqual(rows[3].rir, 3, 'RIR 3 persists as 3');
  assertEqual(rows[0].session_exercise_id, 'se-1', 'Rows carry their owning session_exercise_id');
  assertEqual(rows[2].notes, 'felt easy', 'Existing note handling is unchanged');
  assertEqual(rows[3].notes, null, 'A missing note is still null, as today');
  assertEqual(rows[0].values, { weight: 100, reps: 10 }, 'Raw values pass through untouched');
  assertEqual(rows[3].is_completed, false, 'Open rows are still upserted, as today');

  console.log('  ✓ 4 homogeneous rows; rir null / 0 / 3 preserved distinctly');
}

// ── B2: an invalid RIR is dropped, the set is not ────────────────────────────
{
  console.log('\nB2: an invalid RIR degrades to null without losing the set');

  const rows = buildSetEntryUpsertRows([
    {
      sessionExerciseId: 'se-1',
      sets: [
        { setIndex: 0, values: { weight: 100, reps: 10 }, setType: 'working', isCompleted: true, rir: 9 },
        { setIndex: 1, values: { weight: 100, reps: 10 }, setType: 'working', isCompleted: true, rir: null },
      ],
    },
  ]);

  assertEqual(rows.length, 2, 'Both sets are still persisted');
  assertEqual(rows[0].rir, null, 'RIR 9 is out of range → null');
  assertEqual(rows[0].values, { weight: 100, reps: 10 }, 'The recorded work is untouched by a bad optional signal');
  assertEqual(rows[1].rir, null, 'An explicit null stays null');

  console.log('  ✓ raw sets survive; only the optional column degrades');
}

// ── B3: the completion patch adds context without disturbing completion ─────
{
  console.log('\nB3: the session completion patch keeps its existing fields and adds nullable context');

  const withContext: SessionCompletionPatch = buildSessionCompletionPatch({
    completedAt: '2026-08-06T10:30:00.000Z',
    durationSeconds: 3720,
    isLightSession: false,
    readiness: 'low',
    phaseAtSession: 'cut',
  });

  assertEqual(
    Object.keys(withContext).sort(),
    ['completed_at', 'duration_seconds', 'is_light_session', 'phase_at_session', 'readiness'],
    'The patch is exactly the three existing completion fields plus two nullable context columns',
  );
  assertEqual(withContext.completed_at, '2026-08-06T10:30:00.000Z', 'completed_at is preserved verbatim');
  assertEqual(withContext.duration_seconds, 3720, 'duration_seconds is preserved verbatim');
  assertEqual(withContext.is_light_session, false, 'is_light_session is preserved verbatim');
  assertEqual(withContext.readiness, 'low', 'readiness is stamped when given');
  assertEqual(withContext.phase_at_session, 'cut', 'phase_at_session snapshots the phase in force (§4)');

  const legacy = buildSessionCompletionPatch({
    completedAt: '2026-08-06T10:30:00.000Z',
    durationSeconds: 900,
    isLightSession: true,
    // No readiness, no phase — an offline finish, or a user who skipped the chips.
  });

  assertEqual(
    Object.keys(legacy).sort(),
    ['completed_at', 'duration_seconds', 'is_light_session', 'phase_at_session', 'readiness'],
    'The key set does not change when context is absent — the update stays one statement',
  );
  assertEqual(legacy.is_light_session, true, 'The Light/off-day opt-out is untouched by this change');
  assertEqual(legacy.duration_seconds, 900, 'duration_seconds still comes from the caller');
  assertEqual(legacy.readiness, null, 'Missing readiness writes NULL — "never asked" (§3)');
  assertEqual(legacy.phase_at_session, null, 'Missing phase writes NULL — never a guessed build');

  const junk = buildSessionCompletionPatch({
    completedAt: '2026-08-06T10:30:00.000Z',
    durationSeconds: 60,
    isLightSession: false,
    readiness: 'exhausted' as never,
    phaseAtSession: 'bulk' as never,
  });
  assertEqual(junk.readiness, null, 'An unrecognised readiness never reaches the check constraint');
  assertEqual(junk.phase_at_session, null, 'An unrecognised phase never reaches the check constraint');
  assertEqual(junk.completed_at, '2026-08-06T10:30:00.000Z', 'Bad context never blocks the completion stamp');

  console.log('  ✓ completion fields intact; context columns present and nullable in every branch');
}

// ── B4: the phase normalizer never invents a phase ───────────────────────────
{
  console.log('\nB4: normalizeTrainingPhase emits build | maintain | cut | null — and never guesses');

  assertEqual(normalizeTrainingPhase('build'), 'build', 'build round-trips');
  assertEqual(normalizeTrainingPhase('maintain'), 'maintain', 'maintain round-trips');
  assertEqual(normalizeTrainingPhase('cut'), 'cut', 'cut round-trips');

  // The column defaults to 'build' in Postgres. That default is the *database's*
  // to apply — a failed or empty read must never manufacture it client-side, or a
  // cutting lifter silently gets Build thresholds after one flaky query.
  const nonPhases: unknown[] = [undefined, null, '', ' ', 'bulk', 'recomp', 0, 1, NaN, {}, [], true];
  for (const value of nonPhases) {
    assertEqual(
      normalizeTrainingPhase(value),
      null,
      `normalizeTrainingPhase(${describeValue(value)}) must be null, never a fabricated phase`,
    );
  }

  // Explicit, because this is the failure mode that matters.
  assert(normalizeTrainingPhase(undefined) !== 'build', 'A missing preferences row must not become build');
  assert(
    normalizeTrainingPhase({ message: 'permission denied' }) !== 'build',
    'A query error object must not become build',
  );

  console.log('  ✓ 12 non-phase inputs → null; no path fabricates build');
}

// ── B5: readiness and RIR normalizers, same discipline ───────────────────────
{
  console.log('\nB5: normalizeReadiness and normalizeRir follow the same rule');

  assertEqual(normalizeReadiness('high'), 'high', 'high round-trips');
  assertEqual(normalizeReadiness('very_low'), 'very_low', 'very_low round-trips');
  for (const value of [undefined, null, '', 'exhausted', 'VERY_LOW', 2, {}] as unknown[]) {
    assertEqual(
      normalizeReadiness(value),
      null,
      `normalizeReadiness(${describeValue(value)}) must be null, never a guessed level`,
    );
  }
  assert(normalizeReadiness('rough') !== 'low', 'Free text is never mapped onto a readiness level');

  assertEqual(normalizeRir(0), 0, 'RIR 0 survives normalisation');
  assertEqual(normalizeRir(2), 2, 'RIR 2 survives normalisation');
  assertEqual(normalizeRir(3), 3, 'RIR 3 survives normalisation — 3 means "3 or more"');
  for (const value of [undefined, null, 4, -1, 1.5, '2', {}, NaN] as unknown[]) {
    assertEqual(
      normalizeRir(value),
      null,
      `normalizeRir(${describeValue(value)}) must be null — absence is not RIR 0`,
    );
  }

  console.log('  ✓ only exact vocabulary members survive; everything else is null');
}

console.log('\n✅ All Persistence contract (Cycle 2) tests passed!');
console.log('Coverage verified:');
console.log('  ✓ Both migrations are additive, idempotent and mutate no existing row');
console.log('  ✓ Check constraints allow exactly the documented vocabulary, NULL included');
console.log('  ✓ body_weight_logs: exactly the §7.2 columns (no updated_at), FK cascade, daily unique key, RLS on, own-data USING + WITH CHECK');
console.log('  ✓ Old completion and set payloads still parse; readiness/RIR are optional');
console.log('  ✓ Invalid optional context degrades to null instead of failing a workout');
console.log('  ✓ Upsert rows are key-homogeneous; legacy sets persist rir NULL');
console.log('  ✓ The completion patch keeps its existing fields and never guesses a phase');
