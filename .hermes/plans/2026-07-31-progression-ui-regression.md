# LiftOS Progressive Target UI Regression Fix

> **For Lift:** Use Claude Code CLI (`claude -p --model sonnet`) throughout. Work only on `lift/progression-ui-regression`.

**Goal:** Fix the live workout screen so editable fields are never auto-filled from a progression recommendation or prior performance, and the orange target beneath each prior set displays the actual set-specific recommendation rather than a repeated generic `80kg × 8`.

**Architecture:** This is a regression investigation before a fix. Trace the complete runtime path: completed-set history → guided suggestion → `ExerciseCard` target mapping → `SetRow` last-set display / input initialisation. Prove the root cause with a failing rendered-component test before changing production code.

## Non-negotiable acceptance criteria

1. **Inputs are blank.** On a newly opened workout, editable `weight` and `reps` inputs must be empty for every unlogged set. They must not be populated from `prefilledSets`, `lastSets`, `perSetTargets`, `targetWeight`, `targetRep`, or suggestion state.
2. **Last performance is display-only.** Actual prior values remain visible only in the non-editable `Last` reference area.
3. **Orange target is display-only and set-specific.** Directly beneath each applicable prior set, render the corresponding per-set recommendation. It must not overwrite an input or get copied across all working rows.
4. **No generic repeat.** With prior sets `80×3`, `75×4`, `70×5`, the target mapping must preserve the distinct values emitted by the progression engine. It must never render `80×8` under every row unless the engine explicitly returns that exact value for all rows, which the new test fixture must not do.
5. Warm-up, drop and failure rows stay excluded from working-set target mapping.
6. Do not add readiness, RIR/RPE, fatigue, database, migration, API, design, or deployment work.

## Root-cause procedure

1. Read `PROGRESS.md`, `src/components/workout/exercise-card.tsx`, `src/components/workout/set-row.tsx`, `src/store/active-workout-store.ts`, and the Cycle 1 progression tests.
2. Locate every `defaultValue`, `value`, effect, hydration call, or store initialisation that can write to editable set fields.
3. Locate the exact props passed to each `SetRow` for last values and target values. Record the observed data shape for all three example rows.
4. Find a working test/component harness. Add a failing regression test that renders the workout exercise UI with the three distinct prior sets and three distinct targets.
5. Only after the failure demonstrates the actual bad path, apply the smallest correction.

## Likely files

- `web/src/components/workout/exercise-card.tsx`
- `web/src/components/workout/set-row.tsx`
- `web/src/store/active-workout-store.ts`
- `web/src/lib/workout/__tests__/progression-cycle-1.spec.ts` or a focused component regression test next to the components
- `PROGRESS.md`

## Required verification

- A rendered-component or equivalent UI-level regression test proves: blank input values; `Last` shows `80×3`, `75×4`, `70×5`; orange targets are distinct and display-only.
- Existing 9 Cycle 1 progression tests still pass.
- `npm run build` passes with safe placeholder public Supabase environment values if the local worktree lacks them.
- `git diff --check` passes.
- Report the root cause before/after, exact changed files, and test/build output.

## Operating limits

No commit, push, PR, merge, deployment, production data, service-worker changes or secrets. Do not claim the screenshot is fixed without a UI-level test that exercises the rendering path.