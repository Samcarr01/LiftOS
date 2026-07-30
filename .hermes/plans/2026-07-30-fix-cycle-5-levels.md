# Fix Cycle 5: Levels Redesign

**Priority:** 5 of 5
**Audit source:** `/root/projects/LiftOS/.hermes/audits/2026-07-30-liftos-full-app-audit.md`
**Model:** Claude Code Opus 5 (via `claude` CLI)

## Context

Cycles 1-4 complete (data integrity, entitlement, migrations, progression engine). This is the final fix cycle.

## Findings

### L1 — XP can be inflated by empty normal sessions and client-created PR rows

**Evidence:** `web/src/lib/leveling/xp.ts:173-195` awards XP based on session/PR inputs, not verified valid work.

### L2 — Current levels are pure accumulated XP/tier cosmetics

**Problem:** The system does not distinguish programming stage, exercise mastery and process recognition. It risks status incentives rather than safe adherence.

## Requirements

Split the current monolithic XP/level system into three independent systems:

### System 1: Training Stage (programming)

Controls conservative programme defaults and progression style. Must never be based on XP, streaks, badges or public rank.

Stages should be user-set with optional guidance:
- **Beginner** — conservative volume, linear progression defaults
- **Intermediate** — moderate volume, periodisation awareness
- **Advanced** — higher volume, block/program awareness

The stage is set by the user during onboarding, not earned through XP. The engine should suggest a stage based on training history (months logged, session consistency) but the user has final control.

### System 2: Movement Mastery (exercise skill)

Tracks per-exercise familiarity and personal progress. Helps the user see they are improving.

- Based on: session count for that exercise, technique consistency, control demonstrated
- Not based on: absolute load, 1RM, bodyweight ratio
- Shown per exercise, not as a global rank

### System 3: Process Recognition (adherence)

Rewards showing up, deloading properly, and returning after a lapse.

**Non-negotiable acceptance criteria:**
- Deloads and recovery sessions preserve adherence credit
- XP cannot reward safety-warning overrides (e.g., training through pain)
- Social/body comparison stays opt-in
- A streak or badge must never make someone "advanced" for programming purposes
- Stage change requires user control, not automatic promotion

## Out of scope

- Live authenticated browser testing (blocked by Vercel)
- New UI screens for the three systems (core logic changes only)
- Social features or leaderboards

## Rules

1. Branch: `fix/levels-redesign`
2. Do not delete the existing XP system — extend it with the three-system separation
3. Additive changes only to the database schema (new tables if needed)
4. Do not change production data, secrets, or deploy
5. Report exact files changed and the three-system contract

## Deliverable

Branch `fix/levels-redesign` with the three-system separation. Existing XP continues to work but is no longer the sole determinant of user "level".