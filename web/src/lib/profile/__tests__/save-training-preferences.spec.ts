/**
 * Cycle 2 — RED — Training preferences save (dual write, no backfill)
 *
 * Run with: npx tsx src/lib/profile/__tests__/save-training-preferences.spec.ts
 *
 * Plan: .hermes/plans/2026-08-06-cut-aware-progression-v1.md §7.2 (body_weight_logs),
 * §7.4 (dual write, `users.body_weight_kg` stays authoritative, no backfill),
 * §10.3 (Profile → Training gains a Phase control), §15 Step 9, §18.8.
 * Global Constraint 7: store canonical units (kg) and convert in the UI.
 *
 * Written BEFORE `../save-training-preferences` exists. The debounced autosave in
 * `app/(app)/profile/training/page.tsx` currently inlines its Supabase call inside
 * a React effect, so none of this is reachable by a test. This file pins the
 * behaviour of the extracted helper:
 *
 *   saveTrainingPreferences(adapter, input): Promise<SaveTrainingPreferencesResult>
 *
 * Three properties matter more than the rest:
 *
 *   1. `users.body_weight_kg` is the authoritative current weight (§7.4). The
 *      `body_weight_logs` row is a strictly additive second write. If the second
 *      write fails, the first one stands — the save is not rolled back and the
 *      user is not told their weight was lost.
 *   2. Canonical kilograms, once. The same number reaches both tables, whatever
 *      unit was typed.
 *   3. Order. The authoritative write goes first; history only follows a success.
 *
 * Two further properties come from the independent review of this cycle:
 *
 *   4. A weigh-in is a *deliberate* event. The autosave on this screen is
 *      debounced and re-fires on every unrelated keystroke — a goal toggle, a
 *      rep-range edit — while the body-weight field still holds yesterday's
 *      number. Only a caller that knows the field actually changed may write
 *      history, so the input carries an explicit `recordBodyWeightHistory`
 *      flag. Omitting it means "not known to have changed", which skips
 *      history: a missing reading is a lost signal, a fabricated one is a lie
 *      the trend can never distinguish from a real weigh-in.
 *   5. Overlapping autosaves are ordinary here. An invocation that has been
 *      superseded while its authoritative write was in flight must not go on to
 *      write history, and must tell its caller so the stale toast is suppressed.
 *      That is `isCurrent()`, consulted after the users write and before history.
 *
 * The helper takes an injected persistence adapter and an injected local
 * `loggedOn` / `now`, so there is no Supabase client, no network, no clock and
 * no JSX anywhere in this suite. `localCalendarDay` and
 * `createTrainingPreferencesAdapter` are wished into the same module: today they
 * are private to `app/(app)/profile/training/page.tsx`, where the calendar-day
 * derivation that the daily upsert key depends on cannot be tested at all.
 */

import {
  saveTrainingPreferences,
  localCalendarDay,
  createTrainingPreferencesAdapter,
  parseBodyWeightKg,
  BODY_WEIGHT_LOG_CONFLICT_TARGET,
  type SaveTrainingPreferencesInput,
  type SaveTrainingPreferencesResult,
  type TrainingPreferencesAdapter,
  type TrainingPreferencesClient,
  type UserPreferencesUpdate,
  type BodyWeightLogUpsert,
  type PersistenceOutcome,
  type CalendarDayParts,
} from '../save-training-preferences';
// The module's whole surface, so S14 can state what is missing from it as an
// assertion rather than dying at the import and taking the file down with it.
import * as savePreferencesModule from '../save-training-preferences';
import type { TrainingPhase } from '@/types/training-context';

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

// ── A tiny typed fake for the two writes the helper is allowed to make ────────

interface RecordedLogUpsert {
  row: BodyWeightLogUpsert;
  options: { onConflict: string };
}

interface FakeAdapter extends TrainingPreferencesAdapter {
  /** `<kind>:start` / `<kind>:end` around an await, so a parallel dispatch shows up. */
  trace: string[];
  userPatches: UserPreferencesUpdate[];
  logUpserts: RecordedLogUpsert[];
}

function createFakeAdapter(
  failures: { userError?: string; historyError?: string } = {},
): FakeAdapter {
  const trace: string[] = [];
  const userPatches: UserPreferencesUpdate[] = [];
  const logUpserts: RecordedLogUpsert[] = [];

  async function settle(kind: string, error: string | undefined): Promise<PersistenceOutcome> {
    trace.push(`${kind}:start`);
    await Promise.resolve();
    trace.push(`${kind}:end`);
    return { error: error ? { message: error } : null };
  }

  return {
    trace,
    userPatches,
    logUpserts,
    async updateUser(userId: string, patch: UserPreferencesUpdate) {
      userPatches.push(patch);
      assertEqual(userId, 'user-1', 'The user row is addressed by the id the caller passed');
      return settle('updateUser', failures.userError);
    },
    async upsertBodyWeightLog(row: BodyWeightLogUpsert, options: { onConflict: string }) {
      logUpserts.push({ row, options });
      return settle('upsertBodyWeightLog', failures.historyError);
    },
  };
}

/** The writes that were attempted, in order, ignoring the start/end detail. */
function attempted(adapter: FakeAdapter): string[] {
  return adapter.trace.filter((entry) => entry.endsWith(':start')).map((entry) => entry.split(':')[0]);
}

/**
 * An `isCurrent` that records *when* it was consulted on the same trace as the
 * writes, so the ordering relative to them is observable.
 */
function tracedIsCurrent(adapter: FakeAdapter, decide: () => boolean): () => boolean {
  return () => {
    adapter.trace.push('isCurrent:check');
    return decide();
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Everything the page already saves today, with no body weight and no phase. */
const BASE_INPUT: SaveTrainingPreferencesInput = {
  userId: 'user-1',
  goals: ['strength', 'muscle'],
  experience: 'intermediate',
  preferredRepRange: { min: 8, max: 12 },
  prefillSortHeaviestFirst: false,
  weeklyWorkoutTarget: 4,
  unit: 'kg',
  bodyWeight: '',
  // Injected, not derived from `new Date()`: the calendar day is the user's
  // local one, and the unique key `(user_id, logged_on)` depends on it.
  loggedOn: '2026-08-06',
  now: '2026-08-06T10:30:00.000Z',
};

/** The columns the page writes today. Phase keys are additions, asserted separately. */
const BASE_USER_KEYS = [
  'body_weight_kg',
  'experience_level',
  'preferred_rep_range',
  'prefill_sort_heaviest_first',
  'training_goals',
  'weekly_workout_target',
];

console.log('Running Training preferences save (Cycle 2) tests...\n');

// ── S1: a blank body weight clears the column and writes no history ──────────
async function testBlankBodyWeight() {
  console.log('S1: a blank body weight clears users.body_weight_kg and logs nothing');

  // `recordBodyWeightHistory: true` throughout: even when the caller is certain
  // the field changed, clearing it is not a weigh-in.
  const adapter = createFakeAdapter();
  const result = await saveTrainingPreferences(adapter, {
    ...BASE_INPUT,
    bodyWeight: '',
    recordBodyWeightHistory: true,
  });

  const [patch] = adapter.userPatches;
  assertEqual(Object.keys(patch).sort(), BASE_USER_KEYS, 'The user patch is exactly the columns the page saves today');
  assert('body_weight_kg' in patch, 'body_weight_kg is present, so clearing the field clears the column');
  assertEqual(patch.body_weight_kg, null, 'A blank input writes NULL — not 0, and not the previous weight');
  assertEqual(patch.training_goals, ['strength', 'muscle'], 'The rest of the preferences still save');

  assertEqual(attempted(adapter), ['updateUser'], 'No history row is attempted when there is no weight to log');
  assertEqual(adapter.logUpserts.length, 0, 'body_weight_logs gains nothing — no invented history (§7.4)');

  assertEqual(
    Object.keys(result).sort(),
    ['bodyWeightLogged', 'error', 'ok', 'superseded', 'warning'],
    'The result reports success, whether history was written, whether the save was superseded, a non-fatal warning, and a fatal error',
  );
  assertEqual(result.ok, true, 'Saving without a body weight is a complete success');
  assertEqual(result.bodyWeightLogged, false, 'Nothing was logged');
  assertEqual(result.warning, null, 'Skipping history deliberately is not a warning');
  assertEqual(result.error, null, 'No error');
  assertEqual(result.superseded, false, 'This save was the current one — the caller may show its toast');

  // The same discipline for anything that is not a usable weight. A parse
  // failure must never be persisted as a number, and must never be logged.
  for (const bodyWeight of ['   ', 'abc', '0', '-5', '.']) {
    const each = createFakeAdapter();
    const outcome = await saveTrainingPreferences(each, {
      ...BASE_INPUT,
      bodyWeight,
      recordBodyWeightHistory: true,
    });
    assertEqual(
      each.userPatches[0].body_weight_kg,
      null,
      `A body weight of ${JSON.stringify(bodyWeight)} is not a weight — it writes NULL`,
    );
    assertEqual(each.logUpserts.length, 0, `A body weight of ${JSON.stringify(bodyWeight)} writes no history row`);
    assertEqual(outcome.bodyWeightLogged, false, 'An unusable weight is never reported as logged');
  }

  console.log('  ✓ blank / whitespace / junk / 0 / negative → body_weight_kg null, zero history rows');
}

// ── S2: kg writes canonical kilograms to both tables ─────────────────────────
async function testKilogramsDualWrite() {
  console.log('\nS2: a kg user writes the same canonical number to users and body_weight_logs');

  const adapter = createFakeAdapter();
  const result = await saveTrainingPreferences(adapter, {
    ...BASE_INPUT,
    unit: 'kg',
    bodyWeight: '82.5',
    loggedOn: '2026-08-06',
    recordBodyWeightHistory: true,
  });

  assertEqual(adapter.userPatches[0].body_weight_kg, 82.5, 'users.body_weight_kg stays the authoritative current weight');

  assertEqual(adapter.logUpserts.length, 1, 'Exactly one history row per save');
  const { row, options } = adapter.logUpserts[0];
  assertEqual(
    Object.keys(row).sort(),
    ['logged_on', 'user_id', 'weight_kg'],
    'The log row is exactly (user_id, logged_on, weight_kg) — id and created_at are the database\'s',
  );
  assertEqual(row.user_id, 'user-1', 'The row is owned by the saving user — RLS writes auth.uid() = user_id');
  assertEqual(row.logged_on, '2026-08-06', 'logged_on is the injected local calendar day, never a UTC-derived one');
  assertEqual(row.weight_kg, 82.5, 'The log carries the identical canonical number');
  assertEqual(
    options.onConflict,
    'user_id,logged_on',
    'The upsert targets UNIQUE (user_id, logged_on) — saving twice in a day updates, never duplicates',
  );

  assertEqual(result.ok, true, 'The save succeeded');
  assertEqual(result.bodyWeightLogged, true, 'History was written');
  assertEqual(result.warning, null, 'No warning on the happy path');
  assertEqual(result.error, null, 'No error on the happy path');
  assertEqual(result.superseded, false, 'Nothing overtook this save');

  console.log('  ✓ 82.5 kg → users 82.5, log 82.5 on 2026-08-06, onConflict user_id,logged_on');
}

// ── S3: lb converts once, and the converted value is what both tables see ────
async function testPoundsConversion() {
  console.log('\nS3: an lb user writes converted canonical kilograms, never the typed number');

  const adapter = createFakeAdapter();
  await saveTrainingPreferences(adapter, {
    ...BASE_INPUT,
    unit: 'lb',
    bodyWeight: '198',
    loggedOn: '2026-08-06',
    recordBodyWeightHistory: true,
  });

  // 198 / 2.205 = 89.7959… → 89.8, the rounding the profile page already uses.
  const canonicalKg = 89.8;

  assertEqual(adapter.userPatches[0].body_weight_kg, canonicalKg, '198 lb is stored as 89.8 kg (Global Constraint 7)');
  assert(adapter.userPatches[0].body_weight_kg !== 198, 'The typed pounds figure is never persisted raw');
  assertEqual(adapter.logUpserts[0].row.weight_kg, canonicalKg, 'The log row is canonical kg too — one conversion, one number');
  assertEqual(
    adapter.userPatches[0].body_weight_kg,
    adapter.logUpserts[0].row.weight_kg,
    'The two tables can never disagree about the same reading',
  );

  const kgAdapter = createFakeAdapter();
  await saveTrainingPreferences(kgAdapter, {
    ...BASE_INPUT,
    unit: 'kg',
    bodyWeight: '198',
    recordBodyWeightHistory: true,
  });
  assertEqual(kgAdapter.userPatches[0].body_weight_kg, 198, 'The same digits in kg are stored unconverted');

  console.log('  ✓ 198 lb → 89.8 kg in both tables; 198 kg → 198 kg');
}

// ── S4: the authoritative write goes first ───────────────────────────────────
async function testWriteOrder() {
  console.log('\nS4: users is written and settled before body_weight_logs is touched');

  const adapter = createFakeAdapter();
  await saveTrainingPreferences(adapter, { ...BASE_INPUT, bodyWeight: '82.5' });

  assertEqual(
    adapter.trace,
    ['updateUser:start', 'updateUser:end', 'upsertBodyWeightLog:start', 'upsertBodyWeightLog:end'],
    'The writes are sequential — a parallel dispatch would interleave, and history could outlive a failed save',
  );

  console.log('  ✓ updateUser completes before upsertBodyWeightLog begins');
}

// ── S5: a failed authoritative write stops everything and is fatal ───────────
async function testFailedUserUpdate() {
  console.log('\nS5: a failed users update prevents the history row and returns a failure');

  const adapter = createFakeAdapter({ userError: 'permission denied for table users' });
  const result: SaveTrainingPreferencesResult = await saveTrainingPreferences(adapter, {
    ...BASE_INPUT,
    bodyWeight: '82.5',
  });

  assertEqual(attempted(adapter), ['updateUser'], 'History is never written against a save that did not land');
  assertEqual(adapter.logUpserts.length, 0, 'No orphan body_weight_logs row is created');

  assertEqual(result.ok, false, 'The save failed');
  assertEqual(result.bodyWeightLogged, false, 'Nothing was logged');
  assertEqual(result.error, { message: 'permission denied for table users' }, 'The adapter error is surfaced verbatim');
  assertEqual(result.warning, null, 'A hard failure is an error, not a warning');

  console.log('  ✓ one attempted write, no history, ok false with the underlying message');
}

// ── S6: a failed history write is non-fatal and never undoes the save ────────
async function testFailedHistoryWrite() {
  console.log('\nS6: a failed body_weight_logs upsert preserves the users write and warns only');

  const adapter = createFakeAdapter({ historyError: 'relation "body_weight_logs" does not exist' });
  const result = await saveTrainingPreferences(adapter, { ...BASE_INPUT, bodyWeight: '82.5' });

  assertEqual(
    attempted(adapter),
    ['updateUser', 'upsertBodyWeightLog'],
    'Exactly two writes — no third, compensating update rolls the authoritative save back',
  );
  assertEqual(adapter.userPatches.length, 1, 'The users row is written once and left alone');
  assertEqual(
    adapter.userPatches[0].body_weight_kg,
    82.5,
    'The authoritative current weight stands — it is what the profile and onboarding read (§7.4)',
  );

  assertEqual(result.ok, true, 'The save succeeded: the authoritative write landed');
  assertEqual(result.error, null, 'A missing trend row is not an error the user has to act on');
  assertEqual(result.bodyWeightLogged, false, 'History did not land, and the result says so');
  assertEqual(
    result.warning,
    'body_weight_history_unavailable',
    'A non-fatal, machine-readable signal — the trend simply reports "absent" until readings accumulate (§6.3)',
  );

  console.log('  ✓ ok true, error null, warning body_weight_history_unavailable, no rollback');
}

// ── S7: phase is optional, validated, and never fabricated ───────────────────
async function testPhaseIsOptionalAndValidated() {
  console.log('\nS7: training_phase is written only when a valid phase is supplied');

  // Omitted entirely — today's page, unchanged.
  const absent = createFakeAdapter();
  await saveTrainingPreferences(absent, BASE_INPUT);
  assertEqual(
    Object.keys(absent.userPatches[0]).sort(),
    BASE_USER_KEYS,
    'With no phase in the input, no phase column is written — the database default is the database\'s to apply',
  );

  // Each valid phase round-trips.
  for (const phase of ['build', 'maintain', 'cut'] as const) {
    const adapter = createFakeAdapter();
    await saveTrainingPreferences(adapter, { ...BASE_INPUT, phase, currentPhase: phase });
    assertEqual(adapter.userPatches[0].training_phase, phase, `${phase} round-trips into training_phase`);
  }

  // Anything outside the vocabulary is dropped before it can hit chk_training_phase.
  for (const junk of ['bulk', 'recomp', 'CUT', '', ' ', 0, 1, {}, []] as unknown[]) {
    const adapter = createFakeAdapter();
    await saveTrainingPreferences(adapter, { ...BASE_INPUT, phase: junk as never });
    assert(
      !('training_phase' in adapter.userPatches[0]),
      `An unrecognised phase (${JSON.stringify(junk)}) writes no phase column, rather than guessing one`,
    );
    assert(
      !('training_phase_started_at' in adapter.userPatches[0]),
      'An unrecognised phase never stamps a start date either',
    );
  }

  // An explicit null is "no opinion", not a phase.
  const nulled = createFakeAdapter();
  await saveTrainingPreferences(nulled, { ...BASE_INPUT, phase: null });
  assert(!('training_phase' in nulled.userPatches[0]), 'An explicit null leaves the stored phase untouched');

  console.log('  ✓ omitted / build / maintain / cut / junk / null → absent, written, absent');
}

// ── S8: training_phase_started_at is stamped only on an actual change ────────
async function testPhaseStartedAtStamping() {
  console.log('\nS8: training_phase_started_at moves only when the phase actually changes');

  const changed = createFakeAdapter();
  await saveTrainingPreferences(changed, {
    ...BASE_INPUT,
    currentPhase: 'build',
    phase: 'cut',
    now: '2026-08-06T10:30:00.000Z',
  });
  const changedPatch = changed.userPatches[0];
  assertEqual(
    Object.keys(changedPatch).sort(),
    [...BASE_USER_KEYS, 'training_phase', 'training_phase_started_at'].sort(),
    'A real change writes both the phase and its start stamp',
  );
  assertEqual(changedPatch.training_phase, 'cut', 'The new phase is stored');
  assertEqual(
    changedPatch.training_phase_started_at,
    '2026-08-06T10:30:00.000Z',
    'The stamp is the injected clock — the helper never calls new Date() itself',
  );

  // The autosave is debounced and re-fires on every unrelated edit (a rep-range
  // keystroke, a goal toggle). Re-stamping there would silently reset "how long
  // have I been cutting" to zero every time.
  const unchanged = createFakeAdapter();
  await saveTrainingPreferences(unchanged, {
    ...BASE_INPUT,
    currentPhase: 'cut',
    phase: 'cut',
    now: '2026-08-09T18:00:00.000Z',
  });
  const unchangedPatch = unchanged.userPatches[0];
  assertEqual(unchangedPatch.training_phase, 'cut', 'The phase is still written — the update is idempotent');
  assert(
    !('training_phase_started_at' in unchangedPatch),
    'Re-saving the same phase omits the stamp entirely — writing null would erase the real start date',
  );

  // First-ever phase selection: nothing stored yet, so this is a change.
  const first = createFakeAdapter();
  await saveTrainingPreferences(first, {
    ...BASE_INPUT,
    currentPhase: null,
    phase: 'maintain',
    now: '2026-08-06T10:30:00.000Z',
  });
  assertEqual(first.userPatches[0].training_phase, 'maintain', 'The first selection is stored');
  assertEqual(
    first.userPatches[0].training_phase_started_at,
    '2026-08-06T10:30:00.000Z',
    'Moving from "no stored phase" to a phase is a change and is stamped',
  );

  // An unreadable stored phase must not be treated as equal to the new one.
  const junkCurrent = createFakeAdapter();
  await saveTrainingPreferences(junkCurrent, {
    ...BASE_INPUT,
    currentPhase: 'bulk' as never,
    phase: 'cut',
    now: '2026-08-06T10:30:00.000Z',
  });
  assertEqual(
    junkCurrent.userPatches[0].training_phase_started_at,
    '2026-08-06T10:30:00.000Z',
    'An unrecognised stored phase is not the new phase, so the change is stamped',
  );

  console.log('  ✓ build→cut stamped, cut→cut not stamped, null→maintain stamped');
}

// ── S9: phase and body weight are independent ────────────────────────────────
async function testPhaseDoesNotDisturbBodyWeight() {
  console.log('\nS9: a phase change does not change what is logged, or that it is logged');

  const adapter = createFakeAdapter();
  const result = await saveTrainingPreferences(adapter, {
    ...BASE_INPUT,
    unit: 'lb',
    bodyWeight: '198',
    currentPhase: 'build',
    phase: 'cut',
    loggedOn: '2026-08-06',
  });

  assertEqual(adapter.logUpserts[0].row.weight_kg, 89.8, 'The logged weight is unaffected by the phase');
  assertEqual(adapter.logUpserts[0].row.logged_on, '2026-08-06', 'The log day is unaffected by the phase');
  assertEqual(
    adapter.logUpserts[0].options.onConflict,
    'user_id,logged_on',
    'The daily upsert key is unaffected by the phase',
  );
  assertEqual(result.ok, true, 'Both writes landed');
  assertEqual(result.bodyWeightLogged, true, 'History still lands alongside a phase change');

  console.log('  ✓ phase build→cut with 198 lb → 89.8 kg logged on 2026-08-06');
}

// ── S10: an unrelated edit with recordBodyWeightHistory false logs nothing ────
async function testUnrelatedEditWritesNoHistory() {
  console.log('\nS10: recordBodyWeightHistory false saves the weight and writes no history row');

  // The autosave fires because a *goal* changed. The body-weight field still
  // holds the number the user weighed in with days ago, so the caller passes
  // false: the column is still written, but nothing new was measured.
  const adapter = createFakeAdapter();
  const result = await saveTrainingPreferences(adapter, {
    ...BASE_INPUT,
    unit: 'kg',
    bodyWeight: '82.5',
    goals: ['strength', 'muscle', 'fat_loss'],
    weeklyWorkoutTarget: 5,
    recordBodyWeightHistory: false,
  });

  assertEqual(
    attempted(adapter),
    ['updateUser'],
    'Only the authoritative write runs — history belongs to weigh-ins, not to keystrokes',
  );
  assertEqual(adapter.logUpserts.length, 0, 'No body_weight_logs row is invented from a stale field (§7.4, no backfill)');

  const [patch] = adapter.userPatches;
  assertEqual(
    patch.body_weight_kg,
    82.5,
    'users.body_weight_kg is still written — skipping history must never drop the authoritative column',
  );
  assertEqual(patch.training_goals, ['strength', 'muscle', 'fat_loss'], 'The edit that triggered the save still lands');
  assertEqual(patch.weekly_workout_target, 5, 'So does everything else on the screen');

  assertEqual(result.ok, true, 'Skipping history is a complete success');
  assertEqual(result.bodyWeightLogged, false, 'The result says plainly that nothing was logged');
  assertEqual(result.warning, null, 'A deliberate skip is not a warning — nothing went wrong');
  assertEqual(result.error, null, 'And not an error');
  assertEqual(result.superseded, false, 'This save was current; the caller may show its toast');

  // The same for an lb user, and alongside a phase change — the flag governs
  // history on its own, independently of unit and independently of phase.
  const withPhase = createFakeAdapter();
  await saveTrainingPreferences(withPhase, {
    ...BASE_INPUT,
    unit: 'lb',
    bodyWeight: '198',
    currentPhase: 'build',
    phase: 'cut',
    recordBodyWeightHistory: false,
  });
  assertEqual(withPhase.logUpserts.length, 0, 'A phase change is not a weigh-in either');
  assertEqual(withPhase.userPatches[0].body_weight_kg, 89.8, 'The canonical weight is still written for an lb user');
  assertEqual(withPhase.userPatches[0].training_phase, 'cut', 'And the phase change still lands');

  console.log('  ✓ goal / weekly-target / phase edits with the flag false → users written, zero log rows');
}

// ── S11: a superseded save writes no history and announces nothing ───────────
async function testSupersededSaveIsSilent() {
  console.log('\nS11: a save overtaken mid-flight stops before history and reports superseded');

  const adapter = createFakeAdapter();
  const result = await saveTrainingPreferences(adapter, {
    ...BASE_INPUT,
    bodyWeight: '82.5',
    recordBodyWeightHistory: true,
    isCurrent: tracedIsCurrent(adapter, () => false),
  });

  assertEqual(
    adapter.trace,
    ['updateUser:start', 'updateUser:end', 'isCurrent:check'],
    'Currency is consulted once the authoritative write has settled and before history is touched',
  );
  assertEqual(
    adapter.logUpserts.length,
    0,
    'A stale save writes no history: a newer one is already in charge of what the field now says',
  );

  assertEqual(
    Object.keys(result).sort(),
    ['bodyWeightLogged', 'error', 'ok', 'superseded', 'warning'],
    'The result shape is unchanged — supersession is a field, not a different return',
  );
  assertEqual(result.superseded, true, 'The caller is told to stay quiet — no stale "Saved" toast');
  assertEqual(result.ok, true, 'Being overtaken is not a failure: the authoritative write did land');
  assertEqual(result.bodyWeightLogged, false, 'Nothing was logged');
  assertEqual(result.warning, null, 'Being overtaken is not a warning either');
  assertEqual(result.error, null, 'And there is no error to report');

  // Nothing to log, but the toast still has to be suppressed: a superseded save
  // that happened to carry no weight is just as stale as one that did.
  const blank = createFakeAdapter();
  const blankResult = await saveTrainingPreferences(blank, {
    ...BASE_INPUT,
    bodyWeight: '',
    isCurrent: tracedIsCurrent(blank, () => false),
  });
  assertEqual(
    blank.trace,
    ['updateUser:start', 'updateUser:end', 'isCurrent:check'],
    'Currency is checked whether or not there is a weight to log',
  );
  assertEqual(blankResult.superseded, true, 'A superseded save with no body weight is still superseded, not a plain success');
  assertEqual(blankResult.ok, true, 'Its authoritative write landed all the same');

  // Still current: history proceeds, and the caller may speak.
  const current = createFakeAdapter();
  const currentResult = await saveTrainingPreferences(current, {
    ...BASE_INPUT,
    bodyWeight: '82.5',
    recordBodyWeightHistory: true,
    isCurrent: tracedIsCurrent(current, () => true),
  });
  assertEqual(
    current.trace,
    [
      'updateUser:start',
      'updateUser:end',
      'isCurrent:check',
      'upsertBodyWeightLog:start',
      'upsertBodyWeightLog:end',
    ],
    'The current save carries on into history, in the same order as ever',
  );
  assertEqual(
    current.trace.filter((entry) => entry === 'isCurrent:check').length,
    1,
    'Currency is consulted exactly once — a predicate that flips mid-save cannot split the decision',
  );
  assertEqual(currentResult.superseded, false, 'Nothing overtook it');
  assertEqual(currentResult.bodyWeightLogged, true, 'And its weigh-in was logged');

  console.log('  ✓ superseded → no upsert, superseded true, ok true, no warning, no error, no toast');
}

// ── S12: the calendar day is the user's local one, never UTC ─────────────────
/** A date-like whose local and UTC getters deliberately disagree. */
interface ControlledDate {
  value: CalendarDayParts;
  utcReads(): number;
}

function controlledDate(local: [number, number, number], utc: [number, number, number]): ControlledDate {
  let utcReads = 0;
  const countUtc = (reading: number): number => {
    utcReads += 1;
    return reading;
  };
  const value = {
    getFullYear: () => local[0],
    getMonth: () => local[1] - 1,
    getDate: () => local[2],
    // Present, so a UTC-derived implementation would quietly return the *other*
    // valid day rather than crashing — the failure has to be the wrong date.
    getUTCFullYear: () => countUtc(utc[0]),
    getUTCMonth: () => countUtc(utc[1] - 1),
    getUTCDate: () => countUtc(utc[2]),
  };
  return { value, utcReads: () => utcReads };
}

async function testLocalCalendarDayUsesLocalGetters() {
  console.log('\nS12: localCalendarDay reads the local getters, whatever the UTC day is');

  // A 01:30 weigh-in at UTC+09:00: local is already the 6th, UTC is still the 5th.
  const eastOfGreenwich = controlledDate([2026, 8, 6], [2026, 8, 5]);
  assertEqual(
    localCalendarDay(eastOfGreenwich.value),
    '2026-08-06',
    'East of Greenwich the local day wins — a UTC day would file this morning under yesterday',
  );
  assertEqual(eastOfGreenwich.utcReads(), 0, 'The UTC getters are never consulted');

  // A 19:00 weigh-in at UTC−07:00: local is still the 5th, UTC has rolled to the 6th.
  const westOfGreenwich = controlledDate([2026, 8, 5], [2026, 8, 6]);
  assertEqual(
    localCalendarDay(westOfGreenwich.value),
    '2026-08-05',
    'West of Greenwich the local day wins too — a UTC day would merge this evening into tomorrow',
  );
  assertEqual(westOfGreenwich.utcReads(), 0, 'Still no UTC getter is touched');

  // The same split across a year boundary, where a UTC slip changes the year.
  const newYear = controlledDate([2027, 1, 1], [2026, 12, 31]);
  assertEqual(newYear.value.getFullYear(), 2027, 'The fixture really does differ from its UTC counterpart');
  assertEqual(localCalendarDay(newYear.value), '2027-01-01', 'The local year, month and day are all local');
  assertEqual(newYear.utcReads(), 0, 'No UTC getter is touched at a year boundary either');

  // Zero padding on both components — `logged_on` is a DATE column and the
  // unique key is the literal string.
  assertEqual(localCalendarDay(controlledDate([2026, 1, 9], [2026, 1, 9]).value), '2026-01-09', 'Single-digit month and day are padded');
  assertEqual(localCalendarDay(controlledDate([2026, 12, 31], [2026, 12, 31]).value), '2026-12-31', 'Two-digit month and day are left alone');
  assertEqual(localCalendarDay(controlledDate([2026, 10, 1], [2026, 10, 1]).value), '2026-10-01', 'A two-digit month with a single-digit day pads only the day');

  // A real Date built from local components, so this holds in any runner
  // timezone: the constructor and the getters are both local.
  assertEqual(
    localCalendarDay(new Date(2026, 0, 9, 23, 30, 0)),
    '2026-01-09',
    'A real Date at 23:30 local reports its local day, in whatever timezone this test runs',
  );
  assertEqual(
    localCalendarDay(new Date(2026, 7, 6, 0, 15, 0)),
    '2026-08-06',
    'And a real Date at 00:15 local reports the day that has just begun locally',
  );

  console.log('  ✓ local day east and west of Greenwich, across a year boundary, zero-padded, zero UTC reads');
}

// ── S13: the adapter addresses the right table with the right key ────────────
interface RecordingClient {
  client: TrainingPreferencesClient;
  calls: string[];
  updates: Array<{ patch: UserPreferencesUpdate; column: string; value: string }>;
  upserts: RecordedLogUpsert[];
}

function createRecordingClient(errors: { userError?: string; logError?: string } = {}): RecordingClient {
  const calls: string[] = [];
  const updates: Array<{ patch: UserPreferencesUpdate; column: string; value: string }> = [];
  const upserts: RecordedLogUpsert[] = [];

  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      if (table === 'users') {
        return {
          update(patch: UserPreferencesUpdate) {
            calls.push('update');
            return {
              eq(column: string, value: string) {
                calls.push(`eq:${column}`);
                updates.push({ patch, column, value });
                return Promise.resolve({ error: errors.userError ? { message: errors.userError } : null });
              },
            };
          },
        };
      }
      return {
        upsert(row: BodyWeightLogUpsert, options: { onConflict: string }) {
          calls.push('upsert');
          upserts.push({ row, options });
          return Promise.resolve({ error: errors.logError ? { message: errors.logError } : null });
        },
      };
    },
  };

  return { client: client as unknown as TrainingPreferencesClient, calls, updates, upserts };
}

async function testAdapterForwardsToTheRightRelations() {
  console.log('\nS13: the Supabase adapter targets users by id and body_weight_logs by the daily key');

  const recorder = createRecordingClient();
  const adapter = createTrainingPreferencesAdapter(recorder.client);

  const patch: UserPreferencesUpdate = {
    training_goals: ['strength'],
    experience_level: 'intermediate',
    body_weight_kg: 82.5,
    preferred_rep_range: { min: 8, max: 12 },
    prefill_sort_heaviest_first: false,
    weekly_workout_target: 4,
  };
  const userOutcome = await adapter.updateUser('user-9', patch);

  assertEqual(
    recorder.calls,
    ['from:users', 'update', 'eq:id'],
    'The user write is from(\'users\').update(patch).eq(\'id\', userId) — nothing else, in that order',
  );
  assertEqual(recorder.updates[0].column, 'id', 'users is addressed by its primary key, not by user_id');
  assertEqual(
    recorder.updates[0].value,
    'user-9',
    'The filter carries the caller\'s user id — an unfiltered update would be every row RLS allows',
  );
  assert(recorder.updates[0].patch === patch, 'The patch is forwarded by identity, neither reshaped nor re-keyed');
  assertEqual(userOutcome.error, null, 'A clean write reports no error');

  const row: BodyWeightLogUpsert = { user_id: 'user-9', logged_on: '2026-08-06', weight_kg: 82.5 };
  const logOutcome = await adapter.upsertBodyWeightLog(row, { onConflict: BODY_WEIGHT_LOG_CONFLICT_TARGET });

  assertEqual(
    recorder.calls,
    ['from:users', 'update', 'eq:id', 'from:body_weight_logs', 'upsert'],
    'History goes to body_weight_logs, and only ever by upsert',
  );
  assert(recorder.upserts[0].row === row, 'The log row is forwarded by identity');
  assertEqual(
    recorder.upserts[0].options,
    { onConflict: 'user_id,logged_on' },
    'The conflict target reaches PostgREST verbatim — it is the UNIQUE (user_id, logged_on) key (§7.2)',
  );
  assertEqual(
    BODY_WEIGHT_LOG_CONFLICT_TARGET,
    'user_id,logged_on',
    'And the exported constant is that key, so the caller and the adapter cannot drift apart',
  );
  assertEqual(logOutcome.error, null, 'A clean upsert reports no error');

  // Errors are surfaced as a plain message, not as the client\'s own object.
  const failing = createRecordingClient({
    userError: 'permission denied for table users',
    logError: 'relation "body_weight_logs" does not exist',
  });
  const failingAdapter = createTrainingPreferencesAdapter(failing.client);
  assertEqual(
    (await failingAdapter.updateUser('user-9', patch)).error,
    { message: 'permission denied for table users' },
    'A failed user write is reported as { message }, so the caller never depends on the client\'s error shape',
  );
  assertEqual(
    (await failingAdapter.upsertBodyWeightLog(row, { onConflict: BODY_WEIGHT_LOG_CONFLICT_TARGET })).error,
    { message: 'relation "body_weight_logs" does not exist' },
    'And so is a failed history write',
  );

  // End to end through the real save, so the two relations are hit in order.
  const endToEnd = createRecordingClient();
  const result = await saveTrainingPreferences(createTrainingPreferencesAdapter(endToEnd.client), {
    ...BASE_INPUT,
    userId: 'user-1',
    unit: 'kg',
    bodyWeight: '82.5',
    loggedOn: '2026-08-06',
    recordBodyWeightHistory: true,
  });
  assertEqual(
    endToEnd.calls,
    ['from:users', 'update', 'eq:id', 'from:body_weight_logs', 'upsert'],
    'A real save drives exactly those two writes through the adapter, users first',
  );
  assertEqual(endToEnd.updates[0].value, 'user-1', 'The saving user is the one filtered on');
  assertEqual(endToEnd.upserts[0].row.user_id, 'user-1', 'And the one the log row belongs to — RLS writes auth.uid() = user_id');
  assertEqual(endToEnd.upserts[0].options.onConflict, 'user_id,logged_on', 'With the daily conflict target');
  assertEqual(result.bodyWeightLogged, true, 'The save reports the history row it wrote');

  console.log('  ✓ users.update().eq(id), body_weight_logs.upsert(onConflict user_id,logged_on), errors mapped');
}

// ── S14: a redisplayed weight is not a new weigh-in (RED) ────────────────────
/** kg → whatever the profile screen should put in the input field, in `unit`. */
type BodyWeightInputFormatter = (weightKg: number, unit: 'kg' | 'lb') => string;

const moduleSurface = savePreferencesModule as unknown as Record<string, unknown>;

async function testPoundsRoundTripIsNotAWeighIn() {
  console.log('\nS14: a stored weight redisplayed in pounds and read back is the same weight');

  // The display half of the conversion currently lives in
  // `app/(app)/profile/training/page.tsx` as an inline `String(Math.round(kg *
  // 2.205))`, while the parse half lives here. The two round differently, so
  // loading a profile in pounds and touching an unrelated field makes the page
  // believe the user weighed in. Both halves have to be one pair, in one place.
  //
  // Until the module owns the projection, the projection *is* whatever the
  // profile screen does today — mirrored here verbatim, so what fails below is
  // the arithmetic the user actually experiences and not a missing name.
  const ownedFormatter = moduleSurface.formatBodyWeightInput as BodyWeightInputFormatter | undefined;
  const formatBodyWeightInput: BodyWeightInputFormatter =
    typeof ownedFormatter === 'function'
      ? ownedFormatter
      : (weightKg, unit) => (unit === 'lb' ? String(Math.round(weightKg * 2.205)) : String(weightKg));

  // Every canonical weight the column can hold must survive the round trip
  // through the field the user is looking at.
  for (const storedKg of [80.1, 82.5, 89.8, 68.4, 92.3, 74.8, 55.6, 100]) {
    const shownInPounds = formatBodyWeightInput(storedKg, 'lb');
    assertEqual(
      parseBodyWeightKg(shownInPounds, 'lb'),
      storedKg,
      `${storedKg} kg shown as ${shownInPounds} lb and read straight back must still be ${storedKg} kg`,
    );

    const shownInKilograms = formatBodyWeightInput(storedKg, 'kg');
    assertEqual(
      parseBodyWeightKg(shownInKilograms, 'kg'),
      storedKg,
      `${storedKg} kg shown in kg round-trips too — the pair holds for both units`,
    );
  }

  assert(
    formatBodyWeightInput(80.1, 'lb') !== formatBodyWeightInput(80.2, 'lb'),
    'Two stored weights 0.1 kg apart must not collapse onto one pounds display — whole pounds are too coarse for the column\'s own resolution',
  );

  // The consequence, stated as the profile screen states it: `isWeighIn` is the
  // canonical parse of the field against the canonical number last written.
  const storedKg = 80.1;
  const shown = formatBodyWeightInput(storedKg, 'lb');

  const untouched = createFakeAdapter();
  const untouchedResult = await saveTrainingPreferences(untouched, {
    ...BASE_INPUT,
    unit: 'lb',
    bodyWeight: shown,
    // The edit that actually fired the autosave. The weight field was never touched.
    goals: ['strength', 'muscle', 'fat_loss'],
    recordBodyWeightHistory: parseBodyWeightKg(shown, 'lb') !== storedKg,
  });

  assertEqual(
    untouched.logUpserts.length,
    0,
    'Redisplaying a weight is not weighing yourself — a fabricated reading is one the trend can never tell from a real one (§6.3)',
  );
  assertEqual(
    untouched.userPatches[0].body_weight_kg,
    storedKg,
    'And the authoritative column keeps the weight it already held — a redisplay must not nudge it',
  );
  assertEqual(untouchedResult.bodyWeightLogged, false, 'The result agrees that nothing was logged');
  assertEqual(untouchedResult.ok, true, 'The unrelated edit still saves');

  // The fix must not silence real weigh-ins: a number the user actually
  // changed still reaches history.
  const typed = '175';
  const weighedIn = createFakeAdapter();
  const weighedInResult = await saveTrainingPreferences(weighedIn, {
    ...BASE_INPUT,
    unit: 'lb',
    bodyWeight: typed,
    recordBodyWeightHistory: parseBodyWeightKg(typed, 'lb') !== storedKg,
  });
  assertEqual(weighedIn.logUpserts.length, 1, 'A weight the user really did change is still logged');
  assertEqual(weighedIn.logUpserts[0].row.weight_kg, 79.4, '175 lb is stored and logged as 79.4 kg');
  assertEqual(weighedInResult.bodyWeightLogged, true, 'And the result says so');

  console.log('  ✓ stored kg → pounds field → parsed back is unchanged; a real change still logs');
}

// ── S15: the page's own baseline, over a whole autosave session ──────────────
// Cycle 3, plan Risk 2. S8 pins the helper: an unchanged phase is not stamped.
// This pins the *caller* contract that makes S8 true in the app — the profile
// screen keeps a `lastSavedPhase` ref and advances it after every successful
// save, so the second, third and fourth debounce of a session compare against
// what was actually stored rather than against the phase loaded on mount.
async function testAutosaveSessionStampsOncePerRealChange() {
  console.log('\nS15: over a session of autosaves, only a real phase change stamps a start date');

  // Exactly what `app/(app)/profile/training/page.tsx` does, in eight lines:
  // pass the baseline in, advance it on success.
  let lastSavedPhase: TrainingPhase | null = 'build';  // loaded from the server
  const stamps: Array<string | undefined> = [];

  async function autosave(selectedPhase: TrainingPhase | null, now: string) {
    const adapter = createFakeAdapter();
    const result = await saveTrainingPreferences(adapter, {
      ...BASE_INPUT,
      now,
      phase: selectedPhase,
      currentPhase: lastSavedPhase,
    });
    stamps.push(adapter.userPatches[0].training_phase_started_at);
    if (result.ok && selectedPhase !== null) lastSavedPhase = selectedPhase;
    return adapter.userPatches[0];
  }

  // 1. A goal toggle right after load. Same phase, nothing to stamp.
  const goalEdit = await autosave('build', '2026-08-07T09:00:00.000Z');
  assert(!('training_phase_started_at' in goalEdit), 'An unrelated edit after load does not stamp a start date');
  assertEqual(goalEdit.training_phase, 'build', 'The phase column is still written — the update stays idempotent');

  // 2. The user taps Cut. This is the change, and the only stamp of the session.
  const changed = await autosave('cut', '2026-08-07T09:01:00.000Z');
  assertEqual(changed.training_phase_started_at, '2026-08-07T09:01:00.000Z', 'The real change is stamped');

  // 3. Three more debounces from unrelated typing — a rep-range keystroke, a
  //    weekly-target tap, a body-weight edit. Without the advanced baseline
  //    each of these would look like build→cut again and reset "cutting since".
  const after = [
    await autosave('cut', '2026-08-07T09:02:00.000Z'),
    await autosave('cut', '2026-08-08T18:00:00.000Z'),
    await autosave('cut', '2026-08-14T07:30:00.000Z'),
  ];
  for (const patch of after) {
    assert(
      !('training_phase_started_at' in patch),
      'A later unrelated autosave never rewrites the start date, even a week into the cut',
    );
    assertEqual(patch.training_phase, 'cut', 'And it still saves the phase the user is in');
  }

  // 4. Switching back is a change again.
  const back = await autosave('build', '2026-08-21T08:00:00.000Z');
  assertEqual(back.training_phase_started_at, '2026-08-21T08:00:00.000Z', 'Cut → build starts a new phase');

  assertEqual(
    stamps.filter((stamp) => stamp !== undefined).length,
    2,
    'Six saves, two real changes, two stamps',
  );

  // A failed save must not advance the baseline: the change never landed, so
  // the retry has to stamp it.
  let failedBaseline: TrainingPhase | null = 'build';
  const failing = createFakeAdapter({ userError: 'offline' });
  const failedResult = await saveTrainingPreferences(failing, {
    ...BASE_INPUT,
    phase: 'cut',
    currentPhase: failedBaseline,
    now: '2026-08-07T10:00:00.000Z',
  });
  if (failedResult.ok) failedBaseline = 'cut';
  assertEqual(failedResult.ok, false, 'The write failed');
  assertEqual(failedBaseline, 'build', 'So the baseline stays where it was');

  const retry = createFakeAdapter();
  await saveTrainingPreferences(retry, {
    ...BASE_INPUT,
    phase: 'cut',
    currentPhase: failedBaseline,
    now: '2026-08-07T10:00:05.000Z',
  });
  assertEqual(
    retry.userPatches[0].training_phase_started_at,
    '2026-08-07T10:00:05.000Z',
    'The retry after a failure stamps the change that never landed',
  );

  console.log('  ✓ six autosaves, two changes, two stamps; a failed save does not advance the baseline');
}

// ── S16: two phase changes across one in-flight save ─────────────────────────
// Cycle 3, independent review. S15 walks a session in which every save settles
// before the next debounce fires. Thumbs are faster than networks: tapping Cut
// and then Build again inside one slow round trip enqueues the second autosave
// while the first is still waiting on the server.
//
// The fix is a caller contract, and this test states it as one. Two rules make
// the serialised queue in `app/(app)/profile/training/page.tsx` sound, and both
// are mirrored below exactly as that page implements them:
//
//   a. The baseline is read where the save is *performed* — inside the chain —
//      not where it is enqueued. A baseline captured in the debounce body
//      predates the commit of the save ahead of it in the queue.
//   b. The baseline advances after every write that *lands*, including one
//      whose result came back `superseded`. The authoritative write is never
//      rolled back, so the row holds that phase whether or not the caller went
//      on to show a toast.
//
// Without (a) or (b), cut→build reads as build→build, stamps nothing, and the
// stored row says "Build, started the day the cut began". With both, the phase
// the row holds and the phase the caller passes as `currentPhase` never
// diverge — which is why the helper has no business remembering a phase of its
// own between calls (S17).

interface GatedAdapter {
  adapter: TrainingPreferencesAdapter;
  /** The recording fake underneath, so the patch it received is still readable. */
  recorder: FakeAdapter;
  /** The server finally answering the authoritative write. */
  release: () => void;
  settled: () => boolean;
}

/** A fake adapter whose users write is issued at once and then hangs. */
function createGatedAdapter(): GatedAdapter {
  const recorder = createFakeAdapter();
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let settled = false;

  return {
    recorder,
    release: open,
    settled: () => settled,
    adapter: {
      ...recorder,
      async updateUser(userId: string, patch: UserPreferencesUpdate) {
        // The patch leaves for the server immediately — it is already decided,
        // and already contains (or omits) the stamp — and only the *answer* is
        // deferred, exactly as a slow round trip defers it.
        const outcome = await recorder.updateUser(userId, patch);
        await gate;
        settled = true;
        return outcome;
      },
    },
  };
}

/** Drains the microtask queue so a queued chain can reach its next await. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function testOverlappingPhaseChangesEachStartTheirOwnPhase() {
  console.log('\nS16: a second phase change made while the first save is in flight starts its own phase');

  // The page's autosave machinery, mirrored: one serialised chain, a generation
  // counter, and a `lastSavedPhase` baseline advanced after every write that
  // lands — superseded or not.
  let lastSavedPhase: TrainingPhase | null = 'build'; // loaded from the server
  let chain: Promise<void> = Promise.resolve();
  let generation = 0;
  /** The generations whose results came back superseded, so (b) is observable. */
  const supersededGenerations: number[] = [];
  /** What each save was actually compared against, in the order they ran. */
  const baselines: Array<TrainingPhase | null> = [];

  function enqueue(selectedPhase: TrainingPhase, now: string, adapter: TrainingPreferencesAdapter) {
    generation += 1;
    const thisGeneration = generation;

    chain = chain
      .catch(() => undefined)
      .then(() => {
        // (a) Read here, where the save runs. By the time this link of the
        // chain is reached, the save ahead of it has committed, and its phase
        // is what the row holds.
        const baselinePhase = lastSavedPhase;
        baselines.push(baselinePhase);
        return saveTrainingPreferences(adapter, {
          ...BASE_INPUT,
          now,
          phase: selectedPhase,
          currentPhase: baselinePhase,
          isCurrent: () => generation === thisGeneration,
        });
      })
      .then((result) => {
        // (b) The authoritative write is never rolled back, so once it lands
        // the row holds this phase whether or not a newer save has taken over
        // the screen. The baseline advances on that fact alone.
        if (result.ok) lastSavedPhase = selectedPhase;

        // Only what the *user* sees — the toast, the displayed start date —
        // belongs to whoever is current.
        if (result.superseded) supersededGenerations.push(thisGeneration);
      });
  }

  // 09:00:00 — the user taps Cut. The autosave fires and the write leaves.
  const cut = createGatedAdapter();
  enqueue('cut', '2026-08-07T09:00:00.000Z', cut.adapter);
  await flush();
  assertEqual(cut.recorder.userPatches.length, 1, 'The Cut save has issued its authoritative write');
  assert(!cut.settled(), 'And that write is still in flight — the server has not answered yet');

  // 09:00:20 — before the answer arrives the user changes their mind and taps
  // Build. A second, distinct transition, decided against a phase the user can
  // see on the screen: Cut.
  const build = createGatedAdapter();
  enqueue('build', '2026-08-07T09:00:20.000Z', build.adapter);
  await flush();
  assertEqual(
    build.recorder.userPatches.length,
    0,
    'The second save waits behind the first — the chain serialises them, so neither write can land out of order',
  );

  // The server answers both, oldest first.
  cut.release();
  await flush();
  build.release();
  await chain;

  const cutPatch = cut.recorder.userPatches[0];
  const buildPatch = build.recorder.userPatches[0];

  assertEqual(
    [cutPatch.training_phase, buildPatch.training_phase],
    ['cut', 'build'],
    'Both transitions were committed, in the order the user made them',
  );
  assertEqual(
    cutPatch.training_phase_started_at,
    '2026-08-07T09:00:00.000Z',
    'build → cut starts the cut at the moment it was chosen',
  );
  assertEqual(
    buildPatch.training_phase_started_at,
    '2026-08-07T09:00:20.000Z',
    'cut → build is a second, distinct change: it starts its own phase, rather than inheriting a baseline captured before the cut was committed',
  );
  assert(
    cutPatch.training_phase_started_at !== buildPatch.training_phase_started_at,
    'Two committed transitions, two start dates — one stamp for two changes would date the new phase from the old one',
  );

  assertEqual(buildPatch.training_phase, 'build', 'Build is the last word: it is the phase the user is left in');
  assertEqual(lastSavedPhase, 'build', 'And the baseline settles on the phase that was committed last');

  // The two caller rules, stated as observations rather than as arrangement.
  assertEqual(
    supersededGenerations,
    [1],
    'The Cut save was the one overtaken — it is the only result the caller threw away',
  );
  assertEqual(
    baselines,
    ['build', 'cut'],
    'Rule (a) and rule (b) together: the second save was compared against Cut, the phase the first one had already committed — not against Build, the phase on screen when its debounce fired',
  );

  console.log('  ✓ build→cut and cut→build across one in-flight write → two stamps, final phase build');
}

// ── S17: a superseded write leaves no memory behind it (RED) ─────────────────
// Cycle 3, independent review. S16 establishes that the caller's `currentPhase`
// is authoritative: the page reads it inside the queue and advances it after
// every write that lands, superseded included, so it and the row can never
// disagree. A helper that *also* remembers the phase a superseded save
// committed is therefore holding a duplicate of a fact it was already being
// told — and a duplicate that nothing reliably clears.
//
// The copy is module-global and keyed only by user id, so it outlives the
// screen that created it. Tap Cut, be overtaken, navigate away; come back to
// Profile → Training later in the same session and the page re-reads the row
// from the server, so the baseline it passes is authoritative by construction.
// If that remembered phase is consulted in preference to it, the transition the
// user just made is read as "no change", no `training_phase_started_at` is
// written, and "cutting since" silently dates from whatever the row held
// before. The user is owed a stamp and does not get one.
//
// The rule this pins is narrow and absolute: the phase a save compares against
// is the phase its caller passed. Nothing a previous call did may override it.
async function testSupersededWriteDoesNotOverrideAFreshBaseline() {
  console.log('\nS17: a superseded write never overrides the baseline a later caller passes');

  // 09:00 — the user taps Cut. The write lands, and is never rolled back, but a
  // newer save has taken the screen, so this result is thrown away unshown.
  const overtaken = createFakeAdapter();
  const overtakenResult = await saveTrainingPreferences(overtaken, {
    ...BASE_INPUT,
    phase: 'cut',
    currentPhase: 'build',
    now: '2026-08-07T09:00:00.000Z',
    isCurrent: () => false,
  });

  assertEqual(overtakenResult.superseded, true, 'That save was overtaken — the caller shows nothing');
  assertEqual(overtakenResult.ok, true, 'Its authoritative write landed all the same');
  assertEqual(overtaken.userPatches[0].training_phase, 'cut', 'And it did commit Cut to the row');
  assertEqual(
    overtaken.userPatches[0].training_phase_started_at,
    '2026-08-07T09:00:00.000Z',
    'build → cut was a real change, so it was stamped',
  );

  // 11:15 — a fresh save, with a baseline its caller vouches for: the row holds
  // Build. Selecting Cut against it is a real transition and must start its own
  // phase, exactly as the identical inputs do in S8.
  const fresh = createFakeAdapter();
  const freshResult = await saveTrainingPreferences(fresh, {
    ...BASE_INPUT,
    phase: 'cut',
    currentPhase: 'build',
    now: '2026-08-07T11:15:00.000Z',
    isCurrent: () => true,
  });

  const freshPatch = fresh.userPatches[0];
  assertEqual(freshPatch.training_phase, 'cut', 'The selected phase is stored');
  assertEqual(freshResult.superseded, false, 'This save is the current one');
  assertEqual(freshResult.ok, true, 'And it landed');
  assertEqual(
    freshPatch.training_phase_started_at,
    '2026-08-07T11:15:00.000Z',
    'build → cut is stamped from the caller\'s own baseline — a phase committed by an earlier, discarded save is not a substitute for what this caller was able to read',
  );
  assert(
    freshPatch.training_phase_started_at !== '2026-08-07T09:00:00.000Z',
    'And it is this transition\'s clock, not the earlier one\'s — inheriting that stamp would date the cut from a save the user never saw complete',
  );

  // The converse, so the rule cannot be satisfied by stamping unconditionally:
  // a baseline that really does equal the selection is still not a change.
  const unchanged = createFakeAdapter();
  await saveTrainingPreferences(unchanged, {
    ...BASE_INPUT,
    phase: 'cut',
    currentPhase: 'cut',
    now: '2026-08-07T11:20:00.000Z',
    isCurrent: () => true,
  });
  assert(
    !('training_phase_started_at' in unchanged.userPatches[0]),
    'Trusting the caller cuts both ways: cut → cut is not a change and is not stamped, whatever went before',
  );

  console.log('  ✓ superseded build→cut, then a fresh build→cut → its own stamp; cut→cut still unstamped');
}

async function main() {
  await testBlankBodyWeight();
  await testKilogramsDualWrite();
  await testPoundsConversion();
  await testWriteOrder();
  await testFailedUserUpdate();
  await testFailedHistoryWrite();
  await testPhaseIsOptionalAndValidated();
  await testPhaseStartedAtStamping();
  await testPhaseDoesNotDisturbBodyWeight();
  await testUnrelatedEditWritesNoHistory();
  await testSupersededSaveIsSilent();
  await testLocalCalendarDayUsesLocalGetters();
  await testAdapterForwardsToTheRightRelations();
  await testPoundsRoundTripIsNotAWeighIn();
  await testAutosaveSessionStampsOncePerRealChange();
  await testOverlappingPhaseChangesEachStartTheirOwnPhase();
  await testSupersededWriteDoesNotOverrideAFreshBaseline();

  console.log('\n✅ All Training preferences save (Cycle 2) tests passed!');
  console.log('Coverage verified:');
  console.log('  ✓ A blank or unusable body weight writes NULL and skips history entirely');
  console.log('  ✓ kg and lb both reach users and body_weight_logs as one canonical kg number');
  console.log('  ✓ The log row is (user_id, injected logged_on, weight_kg) upserted on user_id,logged_on');
  console.log('  ✓ The authoritative users write completes before history is attempted');
  console.log('  ✓ A failed users write blocks history and fails the save');
  console.log('  ✓ A failed history write keeps the users write and returns a non-fatal warning');
  console.log('  ✓ Phase is optional, validated to build | maintain | cut, and never fabricated');
  console.log('  ✓ training_phase_started_at is stamped only on a real phase change');
  console.log('  ✓ recordBodyWeightHistory false saves the column and writes no history row');
  console.log('  ✓ A superseded save stops before history and reports superseded, so no stale toast fires');
  console.log('  ✓ localCalendarDay reads local getters only — never the UTC ones');
  console.log('  ✓ The adapter writes users.update().eq(id) and body_weight_logs.upsert(onConflict user_id,logged_on)');
  console.log('  ✓ A stored weight redisplayed in pounds round-trips, so it is not mistaken for a weigh-in');
  console.log('  ✓ A session of autosaves stamps once per real phase change, and a failed save keeps the baseline');
  console.log('  ✓ Two phase changes across one in-flight save each start their own phase, ending in the last one chosen');
  console.log('  ✓ The phase a save is compared against is the one its caller passed — a superseded write leaves nothing behind that can override it');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
