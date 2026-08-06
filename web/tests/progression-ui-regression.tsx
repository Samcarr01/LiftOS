/**
 * Regression test: Progressive Overload UI – Progression Cycle 1
 *
 * Test that ExerciseCard correctly renders:
 * - Per-set AI targets on working/top sets only (not warmup/drop/failure)
 * - "Last:" prefilled values from lastPerformanceSets
 * - Blank NumericInput values (never prefilled from AI targets)
 *
 * Fixture: 3 working sets with prior [80×3, 75×4, 70×5]
 * Expected AI targets: [80×3, 75×4, 70×6]
 * + warmup/drop/failure rows with no AI targets
 */

// Mock localStorage for zustand persist middleware
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
} as Storage;

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useActiveWorkoutStore } from '../src/store/active-workout-store';
import { ExerciseCard } from '../src/components/workout/exercise-card';
import type { StartWorkoutResponse } from '../src/types/app';

function runTest() {
  // Build a StartWorkoutResponse matching the bug scenario:
  // 3 prefilled working sets with prior values [80×3, 75×4, 70×5]
  // and per_set_targets [80×3, 75×4, 70×6]. next_target is intentionally
  // generic (80×6), matching the screenshot contradiction.
  const startWorkoutResponse: StartWorkoutResponse = {
    session: {
      id: 'ws_1',
      user_id: 'test_user',
      template_id: null,
      template_name: 'Test Workout',
      started_at: new Date().toISOString(),
      completed_at: null,
      created_at: new Date().toISOString(),
      duration_seconds: null,
      notes: null,
      is_light_session: false,
      readiness: null,
      phase_at_session: null,
    },
    exercises: [
      {
        sessionExercise: {
          id: 'se_bench',
          session_id: 'ws_1',
          exercise_id: 'ex_bench',
          order_index: 0,
          rest_seconds: 180,
          superset_group_id: null,
          notes: null,
        },
        exercise: {
          id: 'ex_bench',
          user_id: 'test_user',
          name: 'Barbell Bench Press',
          muscle_groups: ['chest', 'triceps'],
          tracking_schema: {
            fields: [
              { key: 'weight', label: 'Weight', unit: 'kg', type: 'number', optional: false },
              { key: 'reps', label: 'Reps', type: 'number', optional: false },
            ],
          },
          unit_config: 'metric',
          default_rest_seconds: 180,
          is_archived: false,
          notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        lastPerformance: [
          { set_index: 0, values: { weight: 60, reps: 8 }, set_type: 'warmup' },
          { set_index: 1, values: { weight: 80, reps: 3 }, set_type: 'working' },
          { set_index: 2, values: { weight: 75, reps: 4 }, set_type: 'working' },
          { set_index: 3, values: { weight: 70, reps: 5 }, set_type: 'working' },
          { set_index: 4, values: { weight: 60, reps: 8 }, set_type: 'drop' },
          { set_index: 5, values: { weight: 80, reps: 2 }, set_type: 'failure' },
        ],
        aiSuggestion: {
          decision: 'progress' as const,
          next_target: {
            display: '80kg × 6 reps',
            values: { weight: 80, reps: 6 },
          },
          last_result: {
            display: '80kg × 3 reps',
            values: { weight: 80, reps: 3 },
          },
          reason: 'Reps dropped 3 → 5 across sets (normal fatigue). Target 3, 4, 6 reps, adding one rep to a specific set.',
          per_set_targets: [
            { weight: 80, reps: 3 },
            { weight: 75, reps: 4 },
            { weight: 70, reps: 6 },
          ],
          progression: {
            eligible: true,
            separate_win_count: 1,
            wins_required: 2,
            last_progression_date: null,
          },
        },
        prefilledSets: [
          { setIndex: 0, values: { weight: 60, reps: 8 }, setType: 'warmup' as const },
          { setIndex: 1, values: { weight: 80, reps: 3 }, setType: 'working' as const },
          { setIndex: 2, values: { weight: 75, reps: 4 }, setType: 'working' as const },
          { setIndex: 3, values: { weight: 70, reps: 5 }, setType: 'working' as const },
          { setIndex: 4, values: { weight: 60, reps: 8 }, setType: 'drop' as const },
          { setIndex: 5, values: { weight: 80, reps: 2 }, setType: 'failure' as const },
        ],
      },
    ],
  };

  // Hydrate the store with the response
  useActiveWorkoutStore.getState().hydrateWorkout(startWorkoutResponse);

  // Retrieve the hydrated exercise from store
  const exerciseState = useActiveWorkoutStore.getState().workout!.exercises[0]!;

  // Render the actual ExerciseCard component with the real store state
  const markup = renderToStaticMarkup(
    React.createElement(ExerciseCard, {
      state: exerciseState,
      exerciseIndex: 0,
      isSuggestionDismissed: false,
    })
  );

  console.log('\n=== Progression UI Regression Test ===\n');
  console.log('Fixture: 3 working sets with prior [80×3, 75×4, 70×5]');
  console.log('Expected AI targets: [80×3, 75×4, 70×6]');
  console.log('Expected Last values: [80kg × 3, 75kg × 4, 70kg × 5]');
  console.log('Expected input values: blank (never prefilled)\n');

  let passed = 0;
  let failed = 0;

  // Test 0: The suggestion header must summarize the authoritative per-set
  // vector, not repeat its generic representative target (80kg × 6 reps).
  const hasSetSpecificHeader = markup.includes('Set targets: 80kg x 3 reps · 75kg x 4 reps · 70kg x 6 reps');
  const hasGenericHeader = markup.includes('80kg × 6 reps');
  const hasVectorReason = markup.includes('Target 3, 4, 6 reps');
  if (hasSetSpecificHeader && !hasGenericHeader && hasVectorReason) {
    console.log('✓ Header, reason, and row targets use the same [3, 4, 6] vector');
    passed++;
  } else {
    console.log('✗ Header/reason target contradiction remains');
    if (!hasSetSpecificHeader) console.log('  - Missing set-specific header');
    if (hasGenericHeader) console.log('  - Generic 80kg × 6 reps header rendered');
    if (!hasVectorReason) console.log('  - Reason does not describe 3, 4, 6');
    failed++;
  }

  // Test 1: AI targets appear on working sets (formatTarget outputs "80kg × 3")
  const hasTarget1 = markup.includes('80kg × 3');
  const hasTarget2 = markup.includes('75kg × 4');
  const hasTarget3 = markup.includes('70kg × 6');
  if (hasTarget1 && hasTarget2 && hasTarget3) {
    console.log('✓ All 3 AI targets rendered');
    passed++;
  } else {
    console.log('✗ Missing AI targets:');
    if (!hasTarget1) console.log('  - 80kg × 3');
    if (!hasTarget2) console.log('  - 75kg × 4');
    if (!hasTarget3) console.log('  - 70kg × 6');
    failed++;
  }

  // Test 2: Last values appear (formatLast outputs "80kg × 3")
  const hasLast1 = markup.includes('Last') && markup.includes('80kg × 3');
  const hasLast2 = markup.includes('75kg × 4');
  const hasLast3 = markup.includes('70kg × 5');
  if (hasLast1 && hasLast2 && hasLast3) {
    console.log('✓ All 3 Last values rendered');
    passed++;
  } else {
    console.log('✗ Missing Last values:');
    if (!hasLast1) console.log('  - 80kg × 3');
    if (!hasLast2) console.log('  - 75kg × 4');
    if (!hasLast3) console.log('  - 70kg × 5');
    failed++;
  }

  // Test 3: AI targets do NOT appear on warmup/drop/failure
  // The per-set target appears in SetRow at line 130-134, in a <p> tag with class "text-[11px]".
  // This is distinct from the AI banner which shows "82.5kg × 4 reps" (with " reps" suffix).
  // We extract all occurrences of the small target text and verify exactly 3 working sets have targets.

  // Match the exact structure: <p class="text-[11px] font-medium text-primary/70 truncate">80kg × 3</p>
  // where TARGET is formatted by formatTarget() which produces "80kg × 3" (no " reps")
  const target1Matches = markup.match(/<p class="text-\[11px\] font-medium text-primary\/70 truncate">80kg × 3<\/p>/g) || [];
  const target2Matches = markup.match(/<p class="text-\[11px\] font-medium text-primary\/70 truncate">75kg × 4<\/p>/g) || [];
  const target3Matches = markup.match(/<p class="text-\[11px\] font-medium text-primary\/70 truncate">70kg × 6<\/p>/g) || [];

  const target1Count = target1Matches.length;
  const target2Count = target2Matches.length;
  const target3Count = target3Matches.length;

  // We expect exactly 3 working sets with targets, so each should appear exactly once
  if (target1Count === 1 && target2Count === 1 && target3Count === 1) {
    console.log('✓ Per-set targets appear exactly once on each working set');
    passed++;
  } else {
    console.log('✗ Per-set targets not correctly isolated to working sets');
    if (target1Count !== 1) console.log(`  - Target 80kg × 3 appears ${target1Count} times in set rows (expected 1)`);
    if (target2Count !== 1) console.log(`  - Target 75kg × 4 appears ${target2Count} times in set rows (expected 1)`);
    if (target3Count !== 1) console.log(`  - Target 70kg × 6 appears ${target3Count} times in set rows (expected 1)`);
    failed++;
  }

  // Test 4: NumericInput values are blank (REGRESSION: this will fail if inputs are prefilled)
  // The bug at line 88 writes `values: ps.values`, so inputs will have 80, 3, 75, 4, 70, 5 from history
  // Check for ANY hydrated values from history OR targets
  const hasHistoryWeight1 = markup.includes('value="80"');
  const hasHistoryReps1 = markup.includes('value="3"');
  const hasHistoryWeight2 = markup.includes('value="75"');
  const hasHistoryReps2 = markup.includes('value="4"');
  const hasHistoryWeight3 = markup.includes('value="70"');
  const hasHistoryReps3 = markup.includes('value="5"');
  const hasTargetWeight1 = markup.includes('value="82.5"');
  const hasTargetReps1 = markup.includes('value="4"');
  const hasTargetWeight2 = markup.includes('value="77.5"');
  const hasTargetReps2 = markup.includes('value="5"');
  const hasTargetWeight3 = markup.includes('value="72.5"');
  const hasTargetReps3 = markup.includes('value="6"');

  const hasAnyPrefilled = hasHistoryWeight1 || hasHistoryReps1 || hasHistoryWeight2 || hasHistoryReps2 ||
                          hasHistoryWeight3 || hasHistoryReps3 || hasTargetWeight1 || hasTargetReps1 ||
                          hasTargetWeight2 || hasTargetReps2 || hasTargetWeight3 || hasTargetReps3;

  if (!hasAnyPrefilled) {
    console.log('✓ NumericInput values are blank (not prefilled)');
    passed++;
  } else {
    console.log('✗ REGRESSION: NumericInput values are prefilled');
    if (hasHistoryWeight1) console.log('  - Found value="80" (history weight)');
    if (hasHistoryReps1) console.log('  - Found value="3" (history reps)');
    if (hasHistoryWeight2) console.log('  - Found value="75" (history weight)');
    if (hasHistoryReps2) console.log('  - Found value="4" (history reps)');
    if (hasHistoryWeight3) console.log('  - Found value="70" (history weight)');
    if (hasHistoryReps3) console.log('  - Found value="5" (history reps)');
    if (hasTargetWeight1) console.log('  - Found value="82.5" (target weight)');
    if (hasTargetWeight2) console.log('  - Found value="77.5" (target weight)');
    if (hasTargetWeight3) console.log('  - Found value="72.5" (target weight)');
    if (hasTargetReps3) console.log('  - Found value="6" (target reps)');
    failed++;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  if (failed > 0) {
    console.log('Test FAILED. See failures above.');
    process.exit(1);
  } else {
    console.log('All tests PASSED.');
    process.exit(0);
  }
}

runTest();
