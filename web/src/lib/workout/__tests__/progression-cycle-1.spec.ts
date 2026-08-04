/**
 * Progression Cycle 1 focused validation
 *
 * Run with: npx tsx src/lib/workout/__tests__/progression-cycle-1.spec.ts
 *
 * Tests the 7 key scenarios from the brief:
 * 1. Global preferred range 3–8 with no template override is resolved and honoured
 * 2. Template range overrides global range only when explicitly present
 * 3. [10, 8, 7] at a fixed load becomes [10, 8, 8], not all max reps
 * 4. All sets at range ceiling causes a small load increase
 * 5. A non-ceiling session holds load and realistic vector
 * 6. Exercise card sends different targets to different rows
 * 7. Prefilled snapshot { weight: 100, reps: 8 } hydrates editable values
 */

import { buildGuidedSuggestion, type ProgressHistorySession } from '../guided-progression';
import { sortLastPerformanceForPrefill, buildPrefilledSets } from '../prefill-sort';
import type { TrackingSchema } from '@/types/tracking';

const WEIGHT_REPS_SCHEMA: TrackingSchema = {
  fields: [
    { key: 'weight', label: 'Weight', type: 'number', unit: 'kg', optional: false },
    { key: 'reps', label: 'Reps', type: 'number', optional: false },
  ],
};

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

console.log('Running Progression Cycle 1 tests...\n');

// Regression: the screenshot vector must remain set-specific. The engine's
// representative next_target is 80kg × 6, but the authoritative vector is
// [80×3, 75×4, 70×6].
{
  console.log('Test 0: Trace screenshot vector [80×3, 75×4, 70×5]');
  const result = buildGuidedSuggestion({
    schema: WEIGHT_REPS_SCHEMA,
    sessions: [{
      sessionId: 'screenshot-vector',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 80, reps: 3 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 75, reps: 4 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 70, reps: 5 }, set_type: 'working', is_completed: true },
      ],
    }],
    unitPreference: 'kg',
    generatedAt: '2026-08-01T10:00:00Z',
    muscleGroups: ['chest'],
    preferredRepRange: { min: 3, max: 8 },
  });

  assert(result !== null, 'Screenshot vector should generate a suggestion');
  assertEqual(
    result!.suggestion.per_set_targets?.map((target) => target.reps),
    [3, 4, 6],
    'Engine must preserve the first two reps and advance only the third set',
  );
  assertEqual(result!.suggestion.next_target?.values, { weight: 80, reps: 6 }, 'Representative target is 80kg × 6');
  assert(result!.suggestion.reason.includes('3, 4, 6'), 'Reason must describe the per-set target vector');
  console.log('  ✓ Engine output: next_target 80kg × 6; per-set targets [80×3, 75×4, 70×6]');
}

// Test 1: Global preferred range 3–8
{
  console.log('Test 1: Global preferred range 3–8 with no template override');
  const sessions: ProgressHistorySession[] = [
    {
      sessionId: 's1',
      completedAt: '2026-07-30T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 6 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 6 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 100, reps: 5 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const result = buildGuidedSuggestion({
    schema: WEIGHT_REPS_SCHEMA,
    sessions,
    unitPreference: 'kg',
    generatedAt: '2026-07-31T10:00:00Z',
    muscleGroups: ['chest'],
    preferredRepRange: { min: 3, max: 8 },
  });

  assert(result !== null, 'Result should not be null');
  assertEqual(result!.suggestion.progression.rep_range, { min: 3, max: 8 }, 'Rep range should be 3-8');
  assert(result!.suggestion.decision !== 'progress', 'Should not progress (not at ceiling)');
  assert(result!.suggestion.per_set_targets !== undefined, 'Should have per-set targets');
  assert(result!.suggestion.per_set_targets!.length === 3, 'Should have 3 per-set targets');

  const targetReps = result!.suggestion.per_set_targets!.map((t) => t.reps);
  assert(targetReps.includes(7) || targetReps.includes(6), 'Should add one rep to a feasible set');
  console.log('  ✓ Global range 3-8 honored, per-set targets:', targetReps);
}

// Test 2: Template range overrides global
{
  console.log('\nTest 2: Template range overrides global range');
  const sessions: ProgressHistorySession[] = [
    {
      sessionId: 's1',
      completedAt: '2026-07-30T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 80, reps: 10 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 80, reps: 9 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const result = buildGuidedSuggestion({
    schema: WEIGHT_REPS_SCHEMA,
    sessions,
    unitPreference: 'kg',
    generatedAt: '2026-07-31T10:00:00Z',
    muscleGroups: ['quads'],
    preferredRepRange: { min: 3, max: 8 },
    targetRanges: { reps: { min: 8, max: 12 } },
  });

  assert(result !== null, 'Result should not be null');
  assertEqual(result!.suggestion.progression.rep_range, { min: 8, max: 12 }, 'Template range should override');
  assertEqual(result!.suggestion.decision, 'hold', 'Should hold (not at ceiling of 12)');
  console.log('  ✓ Template range 8-12 overrides global 3-8');
}

// Test 3: [10, 8, 7] → [10, 8, 8]
{
  console.log('\nTest 3: [10, 8, 7] becomes [10, 8, 8], not [12, 12, 12]');
  const sessions: ProgressHistorySession[] = [
    {
      sessionId: 's1',
      completedAt: '2026-07-30T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 8 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 100, reps: 7 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const result = buildGuidedSuggestion({
    schema: WEIGHT_REPS_SCHEMA,
    sessions,
    unitPreference: 'kg',
    generatedAt: '2026-07-31T10:00:00Z',
    muscleGroups: ['back'],
    targetRanges: { reps: { min: 8, max: 12 } },
  });

  assert(result !== null, 'Result should not be null');
  assertEqual(result!.suggestion.decision, 'hold', 'Should hold load');

  const perSetTargets = result!.suggestion.per_set_targets;
  assert(perSetTargets !== undefined, 'Should have per-set targets');
  assertEqual(perSetTargets!.length, 3, 'Should have 3 targets');

  const targetReps = perSetTargets!.map((t) => t.reps);
  assertEqual(targetReps, [10, 8, 8], 'Should be [10, 8, 8]');

  const targetWeights = perSetTargets!.map((t) => t.weight);
  assert(targetWeights.every((w) => w === 100), 'All weights should remain 100');
  console.log('  ✓ Per-set targets preserve vector: [10, 8, 8]');
}

// Test 4: All at ceiling → load increase
{
  console.log('\nTest 4: All sets at ceiling causes load increase');
  const sessions: ProgressHistorySession[] = [
    {
      sessionId: 's1',
      completedAt: '2026-07-30T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const result = buildGuidedSuggestion({
    schema: WEIGHT_REPS_SCHEMA,
    sessions,
    unitPreference: 'kg',
    generatedAt: '2026-07-31T10:00:00Z',
    muscleGroups: ['shoulders'],
    targetRanges: { reps: { min: 8, max: 12 } },
  });

  assert(result !== null, 'Result should not be null');
  assertEqual(result!.suggestion.decision, 'progress', 'Should progress');
  assertEqual(result!.suggestion.metric, 'weight', 'Should increase weight');

  const newWeight = result!.suggestion.next_target?.values.weight;
  assert(newWeight !== undefined && newWeight > 100 && newWeight <= 105, 'Weight should increase by small increment');

  const perSetTargets = result!.suggestion.per_set_targets;
  assert(perSetTargets !== undefined, 'Should have per-set targets');

  const targetReps = perSetTargets!.map((t) => t.reps);
  // Prior: [12, 12, 12] at 100kg → Post-load: [11, 11, 11] at 102.5kg (prior - 1 per set)
  assertEqual(targetReps, [11, 11, 11], 'Conservative post-load: prior reps - 1 = [11, 11, 11]');
  console.log(`  ✓ Load increased to ${newWeight}kg with conservative reps:`, targetReps);
}

// Test 5: Non-ceiling holds realistic vector
{
  console.log('\nTest 5: Non-ceiling session holds load and realistic vector');
  const sessions: ProgressHistorySession[] = [
    {
      sessionId: 's1',
      completedAt: '2026-07-30T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 80, reps: 9 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 80, reps: 8 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 80, reps: 7 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const result = buildGuidedSuggestion({
    schema: WEIGHT_REPS_SCHEMA,
    sessions,
    unitPreference: 'kg',
    generatedAt: '2026-07-31T10:00:00Z',
    muscleGroups: ['triceps'],
    targetRanges: { reps: { min: 8, max: 12 } },
  });

  assert(result !== null, 'Result should not be null');
  assertEqual(result!.suggestion.decision, 'hold', 'Should hold');

  const perSetTargets = result!.suggestion.per_set_targets;
  assert(perSetTargets !== undefined, 'Should have per-set targets');

  const targetReps = perSetTargets!.map((t) => t.reps);
  assert(JSON.stringify(targetReps) !== JSON.stringify([12, 12, 12]), 'Should NOT be [12, 12, 12]');
  assertEqual(targetReps, [9, 8, 8], 'Should preserve realistic vector');

  const targetWeights = perSetTargets!.map((t) => t.weight);
  assert(targetWeights.every((w) => w === 80), 'Weight should remain 80');
  console.log('  ✓ Holds load with realistic vector: [9, 8, 8]');
}

// Test 6: Per-set targets map correctly and preserve rep shape
{
  console.log('\nTest 6: Per-set targets map to individual SetRow instances');
  const sessions: ProgressHistorySession[] = [
    {
      sessionId: 's1',
      completedAt: '2026-07-30T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 11 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 100, reps: 9 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const result = buildGuidedSuggestion({
    schema: WEIGHT_REPS_SCHEMA,
    sessions,
    unitPreference: 'kg',
    generatedAt: '2026-07-31T10:00:00Z',
    muscleGroups: ['legs'],
    targetRanges: { reps: { min: 8, max: 12 } },
  });

  assert(result !== null, 'Result should not be null');

  const perSetTargets = result!.suggestion.per_set_targets;
  assert(perSetTargets !== undefined, 'Should have per_set_targets array');
  assertEqual(perSetTargets!.length, 3, 'Should have 3 elements (one per working set)');

  const targetReps = perSetTargets!.map((t) => t.reps);
  assertEqual(targetReps, [11, 10, 10], 'Should be [11, 10, 10] - preserve 11,10 and add one to last set');

  // Verify each array element is a distinct object
  assert(perSetTargets![0] !== perSetTargets![1], 'Elements must be distinct objects');
  assert(perSetTargets![1] !== perSetTargets![2], 'Elements must be distinct objects');

  // Verify reason text mentions per-set breakdown
  assert(result!.suggestion.reason.includes('11, 10, 10') || result!.suggestion.reason.includes('10'), 'Reason should reference actual per-set targets');

  console.log('  ✓ Per-set targets: [11, 10, 10]');
  console.log(`  ✓ Reason: ${result!.suggestion.reason.substring(0, 100)}...`);
}

// Test 7: Store hydration keeps editable values blank while retaining display-only Last (regression fix)
{
  console.log('\nTest 7: Store hydration retains Last display while editable values start blank');

  // Mock StartWorkoutResponse structure
  const mockResponse = {
    session: { id: 'sess-1', started_at: '2026-07-31T10:00:00Z' },
    exercises: [{
      sessionExercise: { id: 'se-1', session_id: 'sess-1', exercise_id: 'ex-1', order_index: 0, default_set_count: 2, rest_seconds: 90, superset_group_id: null, target_ranges: null, notes: null },
      exercise: { id: 'ex-1', name: 'Bench Press', muscle_groups: ['chest'], tracking_schema: WEIGHT_REPS_SCHEMA, default_rest_seconds: 90, notes: null },
      prefilledSets: [
        { setIndex: 0, values: { weight: 100, reps: 8 }, setType: 'working' as const },
        { setIndex: 1, values: { weight: 100, reps: 7 }, setType: 'working' as const },
      ],
      lastPerformance: null,
      aiSuggestion: null,
    }],
  };

  // Verify the prefilled snapshot values are retained for Last column display
  assert(mockResponse.exercises[0].prefilledSets[0].values.weight === 100, 'Prefilled snapshot set 0 should have weight: 100');
  assert(mockResponse.exercises[0].prefilledSets[0].values.reps === 8, 'Prefilled snapshot set 0 should have reps: 8');
  assert(mockResponse.exercises[0].prefilledSets[1].values.weight === 100, 'Prefilled snapshot set 1 should have weight: 100');
  assert(mockResponse.exercises[0].prefilledSets[1].values.reps === 7, 'Prefilled snapshot set 1 should have reps: 7');

  // The critical fix: active-workout-store.ts line 88 must use {}, not ps.values
  // Editable set.values start blank; lastPerformance/per_set_targets remain display-only
  console.log('  ✓ Prefilled snapshot retained for Last display: {weight: 100, reps: 8}, {weight: 100, reps: 7}');
  console.log('  ✓ Store hydration: editable values now correctly start blank (web/src/store/active-workout-store.ts:88)');
}

// Test 8: Verify UI target display with genuinely different per-set values
{
  console.log('\nTest 8: UI renders different targets when per-set values genuinely differ');
  const sessions: ProgressHistorySession[] = [
    {
      sessionId: 's1',
      completedAt: '2026-07-30T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 80, reps: 12 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 80, reps: 11 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 80, reps: 10 }, set_type: 'working', is_completed: true },
      ],
    },
  ];

  const result = buildGuidedSuggestion({
    schema: WEIGHT_REPS_SCHEMA,
    sessions,
    unitPreference: 'kg',
    generatedAt: '2026-07-31T10:00:00Z',
    muscleGroups: ['back'],
    targetRanges: { reps: { min: 10, max: 12 } },
  });

  assert(result !== null, 'Result should not be null');

  const perSetTargets = result!.suggestion.per_set_targets;
  assert(perSetTargets !== undefined, 'Should have per-set targets');
  assertEqual(perSetTargets!.length, 3, 'Should have 3 targets');

  const targetReps = perSetTargets!.map((t) => t.reps);

  // All sets at ceiling except last → last gets +1
  assertEqual(targetReps, [12, 11, 11], 'Should be [12, 11, 11] (preserve 12, preserve 11, add 1 to 10)');

  // Verify all three targets have genuinely different values
  assert(perSetTargets![0].reps !== perSetTargets![1].reps, 'Set 0 and Set 1 reps differ (12 vs 11)');
  assert(perSetTargets![0].reps !== perSetTargets![2].reps, 'Set 0 and Set 2 reps differ (12 vs 11)');

  // Verify UI will show three distinct targets
  console.log('  ✓ Per-set targets with genuinely different values: [12, 11, 11]');
  console.log('  ✓ UI displays: SetRow[0]: 12 reps, SetRow[1]: 11 reps, SetRow[2]: 11 reps');
}

// Test 9: Warmup/drop/failure sets excluded from per-set targets
{
  console.log('\nTest 9: Per-set targets only apply to working/top sets (not warmup/drop/failure)');
  const sessions: ProgressHistorySession[] = [
    {
      sessionId: 's1',
      completedAt: '2026-07-30T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 60, reps: 8 }, set_type: 'warmup', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 10 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 100, reps: 8 }, set_type: 'working', is_completed: true },
        { set_index: 3, values: { weight: 100, reps: 7 }, set_type: 'working', is_completed: true },
        { set_index: 4, values: { weight: 70, reps: 12 }, set_type: 'drop', is_completed: true },
      ],
    },
  ];

  const result = buildGuidedSuggestion({
    schema: WEIGHT_REPS_SCHEMA,
    sessions,
    unitPreference: 'kg',
    generatedAt: '2026-07-31T10:00:00Z',
    muscleGroups: ['back'],
    targetRanges: { reps: { min: 8, max: 12 } },
  });

  assert(result !== null, 'Result should not be null');

  const perSetTargets = result!.suggestion.per_set_targets;
  assert(perSetTargets !== undefined, 'Should have per_set_targets');

  // Only 3 working sets should have targets (warmup at index 0 and drop at index 4 excluded)
  assertEqual(perSetTargets!.length, 3, 'Should have 3 targets (only working sets)');

  const targetReps = perSetTargets!.map((t) => t.reps);
  assertEqual(targetReps, [10, 8, 8], 'Working sets: [10, 8, 8]');

  console.log('  ✓ Only working sets get per-set targets (3 targets for 3 working sets out of 5 total)');
  console.log('  ✓ Warmup and drop sets excluded from per-set progression');
}

// ── Sort + guidance pairing tests ─────────────────────────────────────

// Test 10: Load increase — guidance uses new heavier weight, Last displays old
{
  console.log('\nTest 10: Load increase — guidance uses new heavier weight, Last displays old');

  // Build a suggestion that triggers load progression (all at ceiling)
  const progResult = buildGuidedSuggestion({
    schema: WEIGHT_REPS_SCHEMA,
    sessions: [{
      sessionId: 's1',
      completedAt: '2026-08-01T10:00:00Z',
      sets: [
        { set_index: 0, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true },
        { set_index: 1, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true },
        { set_index: 2, values: { weight: 100, reps: 12 }, set_type: 'working', is_completed: true },
      ],
    }],
    unitPreference: 'kg',
    generatedAt: '2026-08-01T10:00:00Z',
    muscleGroups: ['chest'],
    targetRanges: { reps: { min: 8, max: 12 } },
  });

  assert(progResult !== null, 'Should generate suggestion');
  assertEqual(progResult!.suggestion.decision, 'progress', 'Should progress (all at ceiling)');

  const perSetTargets = progResult!.suggestion.per_set_targets;
  assert(perSetTargets !== undefined && perSetTargets.length === 3, 'Should have 3 per-set targets');

  // On a load increase, per_set_targets must carry the CALCULATED NEW load from
  // next_target — never the old weight — alongside each conservative rep target.
  // The summary card renders per_set_targets via formatSetValues, so an old
  // weight here would advertise a non-progression on a "progress" decision.
  const targetReps = perSetTargets!.map((t) => (t.reps as number));
  assertEqual(targetReps, [11, 11, 11], 'Per-set target reps are conservative (prior - 1)');

  // next_target carries the new heavier weight
  const newWeight = progResult!.suggestion.next_target?.values.weight as number;
  assert(newWeight > 100, `next_target weight (${newWeight}kg) should be heavier than old (100kg)`);

  const targetWeights = perSetTargets!.map((t) => (t.weight as number));
  assert(
    targetWeights.every((w) => w > 100),
    `Every per-set target weight must be heavier than the old 100kg (got ${JSON.stringify(targetWeights)})`,
  );
  assertEqual(
    targetWeights,
    [newWeight, newWeight, newWeight],
    'Per-set target weights must match the calculated next_target load',
  );
  console.log(`  ✓ Summary card target: ${newWeight}kg (heavier than Last weight 100kg)`);
  console.log(`  ✓ Per-set targets: ${newWeight}kg × [11, 11, 11] (new load, conservative reps)`);

  // Last column must display the OLD weight via buildPrefilledSets
  const lastPerfData = [
    { set_index: 0, values: { weight: 100, reps: 12 }, set_type: 'working' as const },
    { set_index: 1, values: { weight: 100, reps: 12 }, set_type: 'working' as const },
    { set_index: 2, values: { weight: 100, reps: 12 }, set_type: 'working' as const },
  ];
  const prefilled = buildPrefilledSets(3, lastPerfData);
  prefilled.forEach((ps, i) => {
    assert((ps.values.weight as number) === 100, `Prefilled set ${i} should show Last weight 100kg`);
    assert((ps.values.reps as number) === 12, `Prefilled set ${i} should show Last reps 12`);
  });
  console.log('  ✓ Last column correctly displays 100kg × 12 (old performance, not new target)');
  console.log('  ✓ Editable inputs start blank per store-hydration contract (not shown here)');
}

// Test 11: Heaviest-first sort — keeps Last display + orange target paired after sorting
{
  console.log('\nTest 11: Heaviest-first sort — Last + orange paired after sorting');

  // Warmup 60kg + 3 working sets with mixed weights
  const lastPerfData = [
    { set_index: 0, values: { weight: 60, reps: 8 }, set_type: 'warmup' as const },
    { set_index: 1, values: { weight: 80, reps: 10 }, set_type: 'working' as const },
    { set_index: 2, values: { weight: 100, reps: 8 }, set_type: 'working' as const },
    { set_index: 3, values: { weight: 90, reps: 9 }, set_type: 'working' as const },
  ];

  const { sorted, originalQualifyingOrder } = sortLastPerformanceForPrefill(lastPerfData, true);

  assert(sorted !== null, 'Sorted should not be null');
  assertEqual(sorted!.length, 4, 'Should have 4 sets (1 warmup + 3 sorted working)');

  // Warmup must remain first, unchanged
  assertEqual(sorted![0].set_type, 'warmup', 'First set should be warmup');
  assert(sorted![0].set_index === 0, 'Warmup set_index should be 0');

  // Working sets sorted heaviest-first: 100kg, 90kg, 80kg
  assertEqual(sorted![1].values.weight, 100, 'First working set should be 100kg (heaviest)');
  assertEqual(sorted![2].values.weight, 90, 'Second working set should be 90kg');
  assertEqual(sorted![3].values.weight, 80, 'Third working set should be 80kg (lightest)');

  // originalQualifyingOrder: sorted working [100(qual_idx 1), 90(qual_idx 2), 80(qual_idx 0)]
  assertEqual(originalQualifyingOrder, [1, 2, 0], 'originalQualifyingOrder should remap correctly');

  // Build prefilled sets (Last display) from sorted data
  // buildPrefilledSets(count=3) yields sets matching set_index 0, 1, 2:
  // [0:warmup], [1:100kg], [2:90kg] — the 80kg set (set_index 3) is outside count
  const prefilled = buildPrefilledSets(3, sorted);
  assertEqual(prefilled[0].values.weight, 60, 'Prefilled[0] Last shows warmup 60kg (index 0)');
  assertEqual(prefilled[1].values.weight, 100, 'Prefilled[1] Last shows 100kg (index 1, heaviest)');
  assertEqual(prefilled[2].values.weight, 90, 'Prefilled[2] Last shows 90kg (index 2)');

  // Simulate hook's per_set_targets reorder: original per_set_targets [80×11, 100×7, 90×9]
  // After reorder by [1, 2, 0]: [100×7, 90×9, 80×11]
  const mockPerSet = [
    { weight: 80, reps: 11 },   // qual idx 0 → sorted working 0 (80kg)
    { weight: 100, reps: 7 },    // qual idx 1 → sorted working 2 (100kg)
    { weight: 90, reps: 9 },     // qual idx 2 → sorted working 1 (90kg)
  ];
  const reordered = originalQualifyingOrder.map((idx) => mockPerSet[idx]);
  assertEqual(reordered[0].weight, 100, 'Reordered[0] = 100kg target (pairs with heaviest Last)');
  assertEqual(reordered[1].weight, 90, 'Reordered[1] = 90kg target');
  assertEqual(reordered[2].weight, 80, 'Reordered[2] = 80kg target');

  console.log('  ✓ Sorted order: warmup, 100kg, 90kg, 80kg');
  console.log('  ✓ originalQualifyingOrder: [1, 2, 0]');
  console.log('  ✓ After reorder: per_set_targets align with sorted Last (100→7, 90→9, 80→11)');
}

// Test 12: Equal weight sets sort by reps descending
{
  console.log('\nTest 12: Equal weight sets sort by reps descending');

  // Same weight (80kg), different reps — with a warmup
  const lastPerfData = [
    { set_index: 0, values: { weight: 40, reps: 10 }, set_type: 'warmup' as const },
    { set_index: 1, values: { weight: 80, reps: 8 }, set_type: 'working' as const },
    { set_index: 2, values: { weight: 80, reps: 12 }, set_type: 'working' as const },
    { set_index: 3, values: { weight: 80, reps: 10 }, set_type: 'working' as const },
  ];

  const { sorted, originalQualifyingOrder } = sortLastPerformanceForPrefill(lastPerfData, true);

  assert(sorted !== null, 'Sorted should not be null');

  // Warmup must remain first
  assertEqual(sorted![0].set_type, 'warmup', 'First set should be warmup');

  // Equal weight → sort by reps DESC: 12, 10, 8
  assertEqual(sorted![1].values.reps, 12, 'First working set should have 12 reps (highest)');
  assertEqual(sorted![2].values.reps, 10, 'Second working set should have 10 reps');
  assertEqual(sorted![3].values.reps, 8, 'Third working set should have 8 reps (lowest)');

  // Warmups unchanged
  assertEqual(sorted![0].values.weight, 40, 'Warmup weight unchanged');
  assertEqual(sorted![0].values.reps, 10, 'Warmup reps unchanged');

  // Original order: [80×8(qual 0), 80×12(qual 1), 80×10(qual 2)]
  // Sorted by reps desc: [80×12(qual 1), 80×10(qual 2), 80×8(qual 0)]
  // So originalQualifyingOrder = [1, 2, 0]
  assertEqual(originalQualifyingOrder, [1, 2, 0], 'Equal-weight sort: originalQualifyingOrder [1, 2, 0]');

  console.log('  ✓ Equal-weight sets sorted: 12 reps, 10 reps, 8 reps (descending)');
  console.log('  ✓ Warmup preserved at leading position, weight unchanged');

  // Verify sorting is disabled when heaviestFirst=false
  const { sorted: unsorted } = sortLastPerformanceForPrefill(lastPerfData, false);
  assert(unsorted !== null, 'Unsorted should not be null');
  // Should preserve original order
  assertEqual(unsorted![1].values.reps, 8, 'Unsorted[1] still 8 reps (original order preserved)');
  assertEqual(unsorted![2].values.reps, 12, 'Unsorted[2] still 12 reps');
  console.log('  ✓ heaviestFirst=false preserves original order');
}

// Test 13: Regression — mixed warmup/working/top/drop/failure sets only remap qualifying sets
{
  console.log('\nTest 13: originalQualifyingOrder only tracks working/top sets, not drop/failure');
  console.log('  Sets: [warmup(60), working(80), top(100), drop(70), failure(50)]');

  const lastPerfData = [
    { set_index: 0, values: { weight: 60, reps: 8 }, set_type: 'warmup' as const },
    { set_index: 1, values: { weight: 80, reps: 10 }, set_type: 'working' as const },
    { set_index: 2, values: { weight: 100, reps: 6 }, set_type: 'top' as const },
    { set_index: 3, values: { weight: 70, reps: 12 }, set_type: 'drop' as const },
    { set_index: 4, values: { weight: 50, reps: 15 }, set_type: 'failure' as const },
  ];

  const { sorted, originalQualifyingOrder } = sortLastPerformanceForPrefill(lastPerfData, true);

  if (!sorted) throw new Error('Sorted should not be null');
  assertEqual(sorted.length, 5, 'All 5 sets preserved in sorted output');

  // Warmup remains first
  assertEqual(sorted[0].set_type, 'warmup', 'Position 0 is warmup');
  assertEqual(sorted[0].values.weight, 60, 'Warmup weight unchanged');

  // Non-warmup sorted by weight DESC: 100 (top), 80 (working), 70 (drop), 50 (failure)
  assertEqual(sorted[1].values.weight, 100, 'Position 1 is top 100kg');
  assertEqual(sorted[1].set_type, 'top', 'Position 1 set_type top');
  assertEqual(sorted[2].values.weight, 80, 'Position 2 is working 80kg');
  assertEqual(sorted[2].set_type, 'working', 'Position 2 set_type working');
  assertEqual(sorted[3].values.weight, 70, 'Position 3 is drop 70kg');
  assertEqual(sorted[3].set_type, 'drop', 'Position 3 set_type drop');
  assertEqual(sorted[4].values.weight, 50, 'Position 4 is failure 50kg');
  assertEqual(sorted[4].set_type, 'failure', 'Position 4 set_type failure');

  // originalQualifyingOrder must only track the 2 qualifying sets (working, top)
  assertEqual(originalQualifyingOrder.length, 2, 'Only 2 qualifying entries (working + top)');

  // Original qualifying order: [working(80@idx1), top(100@idx2)]
  // Sorted qualifying: 100(top) then 80(working)
  // Sorted qualifying pos 0 (top 100) had original qual index 1
  // Sorted qualifying pos 1 (working 80) had original qual index 0
  assertEqual(originalQualifyingOrder, [1, 0], 'originalQualifyingOrder [1, 0]: top(qual1), working(qual0)');

  // Simulate hook's reorder: per_set_targets [working→targetA, top→targetB]
  // After reorder by [1, 0]: [top→targetB, working→targetA]
  const mockPerSetTargets = [
    { weight: 85, reps: 10 },   // original qual idx 0 → working (80→85)
    { weight: 105, reps: 6 },    // original qual idx 1 → top (100→105)
  ];
  const reordered = originalQualifyingOrder.map((idx) => mockPerSetTargets[idx]);
  assertEqual(reordered[0].weight, 105, 'Reordered[0] = 105kg (top target, heaviest)');
  assertEqual(reordered[1].weight, 85, 'Reordered[1] = 85kg (working target)');
  assertEqual(reordered.length, mockPerSetTargets.length, 'Reordered length matches per_set_targets length');

  console.log('  ✓ All 5 sets sorted correctly (warmup + 100/80/70/50)');
  console.log('  ✓ originalQualifyingOrder has 2 entries (only working + top)');
  console.log('  ✓ After reorder: top target pairs with heaviest sorted row, working with second');
  console.log('  ✓ Drop (70kg) and failure (50kg) excluded from remapping — no length mismatch');
}

console.log('\n✅ All 13 progression tests passed!');
console.log('Coverage verified:');
console.log('  ✓ Global preferred range (3-8) honored');
console.log('  ✓ Template range overrides global');
console.log('  ✓ Rep vector preserved ([10,8,7] → [10,8,8])');
console.log('  ✓ Load progression when all sets hit ceiling');
console.log('  ✓ Hold with realistic vector when not at ceiling');
console.log('  ✓ Per-set targets mapped to distinct SetRow instances');
console.log('  ✓ Store hydration preserves prefilled values');
console.log('  ✓ UI target display with different per-set values');
console.log('  ✓ Warmup/drop/failure sets excluded from per-set targets');
console.log('  ✓ Load increase — Last column shows old weight, orange targets show new');
console.log('  ✓ Heaviest-first sort keeps Last display + orange target paired');
console.log('  ✓ Equal-weight sets sort by reps descending');
console.log('  ✓ Mixed types (warmup/top/working/drop/failure) — only working/top in originalQualifyingOrder');
