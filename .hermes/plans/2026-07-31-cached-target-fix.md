# LiftOS Cached Target Fallback Fix

> **For Lift:** Use Claude Code CLI for this implementation. Work only on `lift/cached-target-fix`.

**Goal:** Stop a legacy cached generic suggestion such as `80kg × 8` being rendered as orange per-set targets across every working row when a workout begins.

**Proven root cause:** `use-start-workout.ts` loads existing unexpired `ai_suggestions` on start rather than recalculating. `exercise-card.tsx` then falls back from missing `per_set_targets` to `next_target.values` for each working row. This makes a single cached target repeat beneath every set.

## Scope and acceptance criteria

1. Write a failing rendered workout UI test first using a legacy cached suggestion with `next_target` but no `per_set_targets` and prior sets `80×3`, `75×4`, `70×5`.
2. Prove the old behaviour renders `80kg × 8` three times in orange, then apply the smallest production fix.
3. After the fix, a generic legacy `next_target` must remain only in the summary card if that card is shown. It must never be copied into orange row targets.
4. Orange row targets appear only from valid `per_set_targets`, mapped sequentially to working/top sets. They stay absent for warm-up/drop/failure and legacy missing-target rows.
5. Preserve blank editable fields and Last display behaviour from `a6e0f8e`.
6. Do not add start-time recomputation, DB schema changes, migrations, readiness/RIR work, external API calls, cache invalidation jobs, or visual redesign in this fix. We will address optional fresh-generation design after this safety fix.

## Files likely to change

- `web/src/components/workout/exercise-card.tsx`
- `web/tests/progression-ui-regression.tsx`
- `PROGRESS.md`

## TDD and verification

- Record the failing test output before production edit.
- Run the focused rendered UI test after the change.
- Run the existing Cycle 1 progression test.
- Run `npm run build` with safe placeholder public Supabase values if needed.
- Restore generated `web/public/sw.js` if build touches it.
- Run `git diff --check`.
- Do not commit, push, open a PR, merge or deploy.