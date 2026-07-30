# Wire Three-System Levels into UI (take 2)

**Model:** Claude Code Opus 5 (via `claude` CLI)

## Context

All 5 fix cycles are merged to main. The three leveling system files exist in `web/src/lib/leveling/` (training-stage.ts, movement-mastery.ts, process-recognition.ts, index.ts). They need to be wired into the UI.

## What to wire

### 1. Training Stage — profile/settings page

**File:** `web/src/app/(app)/profile/page.tsx` or similar
**What:** Show the user's current training stage (Beginner/Intermediate/Advanced) with a short description. The user should be able to change it. The `suggestStage()` function from `training-stage.ts` can suggest one.

### 2. Movement Mastery — exercise detail page

**File:** `web/src/app/(app)/exercises/[id]/page.tsx`
**What:** Add a colored badge next to the exercise name showing the mastery level: Familiar, Consistent, Proficient, or Mastered. Based on `computeExerciseMastery()` from `movement-mastery.ts`.

### 3. Process Recognition — home page

**File:** `web/src/app/(app)/page.tsx`
**What:** Add a badges/streaks section showing earned badges from `process-recognition.ts`. Use the existing streak data from the page.

## Rules

1. Branch: `fix/wire-levels-ui`
2. Additive only — do not remove existing XP display
3. Use existing UI components and styling
4. Do not change production data, secrets, or deploy
5. Report exact files changed

## Deliverable

Branch with all three systems wired into the UI. Summary of changes.