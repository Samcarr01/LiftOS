/**
 * Cached Target Fallback Regression Test
 *
 * Bug: Legacy cached AI suggestions with `next_target` but no `per_set_targets`
 * caused the universal target (80kg × 8) to repeat as orange row targets across
 * all working sets.
 *
 * Root cause: exercise-card.tsx lines 220-224 falls back from missing per_set_targets
 * to universal `next_target.values` for ALL qualifying rows.
 *
 * Expected: Legacy universal target appears ONLY in summary card, NOT in row targets.
 * Orange row targets should only appear from valid per_set_targets.
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
  console.log('\n=== Cached Target Fallback Regression Test ===\n');
  console.log('Scenario: Legacy cached suggestion with next_target but NO per_set_targets');
  console.log('Prior sets: [80×3, 75×4, 70×5]');
  console.log('Cached target: 80kg × 8 (generic universal)');
  console.log('');
  console.log('BUG: Universal target repeats in orange on every working row');
  console.log('FIX: Universal target appears ONLY in summary card, NOT in rows\n');

  // Legacy cached suggestion: has next_target, NO per_set_targets
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
          { set_index: 0, values: { weight: 80, reps: 3 }, set_type: 'working' },
          { set_index: 1, values: { weight: 75, reps: 4 }, set_type: 'working' },
          { set_index: 2, values: { weight: 70, reps: 5 }, set_type: 'working' },
        ],
        aiSuggestion: {
          decision: 'hold' as const,
          next_target: {
            display: '80kg × 8 reps',
            values: { weight: 80, reps: 8 },
          },
          last_result: {
            display: '80kg × 3 reps',
            values: { weight: 80, reps: 3 },
          },
          reason: 'Generic cached suggestion from legacy system.',
          // CRITICAL: NO per_set_targets — this is a legacy cached suggestion
          progression: {
            eligible: false,
            separate_win_count: 0,
            wins_required: 2,
            last_progression_date: null,
          },
        },
        prefilledSets: [
          { setIndex: 0, values: { weight: 80, reps: 3 }, setType: 'working' as const },
          { setIndex: 1, values: { weight: 75, reps: 4 }, setType: 'working' as const },
          { setIndex: 2, values: { weight: 70, reps: 5 }, setType: 'working' as const },
        ],
      },
    ],
  };

  // Hydrate the store
  useActiveWorkoutStore.getState().hydrateWorkout(startWorkoutResponse);
  const exerciseState = useActiveWorkoutStore.getState().workout!.exercises[0]!;

  // Render the component
  const markup = renderToStaticMarkup(
    React.createElement(ExerciseCard, {
      state: exerciseState,
      exerciseIndex: 0,
      isSuggestionDismissed: false,
    })
  );

  let passed = 0;
  let failed = 0;

  // Test 1: Summary card should show "80kg × 8 reps" (the cached universal target)
  const hasSummaryTarget = markup.includes('80kg × 8 reps');
  if (hasSummaryTarget) {
    console.log('✓ Summary card shows cached target "80kg × 8 reps"');
    passed++;
  } else {
    console.log('✗ Summary card missing cached target "80kg × 8 reps"');
    failed++;
  }

  // Test 2: The universal target "80kg × 8" should NOT appear as row targets
  // Row targets appear in: <p class="text-[11px] font-medium text-primary/70 truncate">TARGET</p>
  // formatTarget outputs "80kg × 8" (no " reps" suffix)
  const rowTargetPattern = /<p class="text-\[11px\] font-medium text-primary\/70 truncate">80kg × 8<\/p>/g;
  const rowTargetMatches = markup.match(rowTargetPattern) || [];
  const rowTargetCount = rowTargetMatches.length;

  // BUG: Currently falls back to universal target, so we expect 3 matches (one per working set)
  // FIX: Should be 0 matches (no row targets without per_set_targets)
  console.log(`\nRow target appearances: ${rowTargetCount} (expected 0 after fix)`);
  if (rowTargetCount === 0) {
    console.log('✓ Universal target does NOT appear as row targets');
    passed++;
  } else {
    console.log('✗ BUG DETECTED: Universal target appears as row targets');
    console.log(`  - Found ${rowTargetCount} occurrences of "80kg × 8" in row target position`);
    console.log('  - Expected: 0 (row targets only from per_set_targets)');
    failed++;
  }

  // Test 3: Last values should still appear
  const hasLast1 = markup.includes('80kg × 3');
  const hasLast2 = markup.includes('75kg × 4');
  const hasLast3 = markup.includes('70kg × 5');
  if (hasLast1 && hasLast2 && hasLast3) {
    console.log('✓ Last values rendered correctly');
    passed++;
  } else {
    console.log('✗ Missing Last values');
    failed++;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  if (failed > 0) {
    console.log('Test FAILED (expected before fix)');
    console.log('After fix: universal target should only appear in summary card, NOT in rows.\n');
    process.exit(1);
  } else {
    console.log('All tests PASSED.\n');
    process.exit(0);
  }
}

runTest();
