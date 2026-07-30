# Fix Cycle 4: Progression Engine Redesign

**Priority:** 4 of 5
**Audit source:** `/root/projects/LiftOS/.hermes/audits/2026-07-30-liftos-full-app-audit.md`
**Model:** Claude Code Opus 5 (via `claude` CLI)

## Context

Cycles 1-3 complete (data integrity, entitlement, migrations). This cycle addresses the core training logic that drives LiftOS's value proposition.

## Findings

### H9 — Current progression logic is automatic escalation, not adaptive progressive overload

**Evidence:** `supabase/functions/generate-ai-suggestion/index.ts:320-350`
**Problem:** The current logic applies a fixed 3% / minimum 1.25kg jump when all sets are completed. It has no concept of:
- Target rep ranges (double progression: add reps first, then weight)
- RIR (reps in reserve) or RPE (rate of perceived exertion)
- Technique/ROM quality
- Pain, fatigue, sleep, stress, illness
- Goal type (hypertrophy vs strength vs endurance)
- Training stage (beginner vs intermediate vs advanced)
- Fatigue versus genuine plateau

### H10 — Suggestion bounds prohibit regression/deload output

**Evidence:** `generate-ai-suggestion/index.ts:148-165`
**Problem:** The output guard forces suggested metrics to never go below the latest completed baseline. This prevents the engine from recommending a deload, fatigue reduction, or technique-focused session even when the data supports it.

## Fix Requirements

### Part 1: Core progression contract

Replace the simple "all sets complete → 3% jump" with a deterministic, explainable rules engine that can output one of:

| Outcome | Meaning | When |
|---|---|---|
| `progress` | Increase weight or reps | All sets completed cleanly within target range, no fatigue signal |
| `hold` | Repeat same weight/reps | Inconsistent completion, technique issues, or early fatigue |
| `deload` | Reduce load or volume | Accumulated fatigue, missed sessions, or scheduled deload week |
| `plateau_detected` | No progress for N sessions | 3+ sessions at same weight without progress |
| `insufficient_evidence` | Not enough data | Fewer than 2 logged sessions for this exercise |

Each outcome must include a **human-readable reason** and **user override** option.

### Part 2: Determine minimal input collection

Start with only the data LiftOS already collects or can collect with minimal UI change:
- Set completion status
- Reps completed vs target reps
- Weight used
- RIR or RPE (add one optional field to set logging)
- Consecutive session count for this exercise
- Gap since last session (days)

Do **not** add sleep, stress, nutrition, or other subjective fields in this cycle. The engine should note "insufficient data" for advanced signals rather than guessing.

### Part 3: Remove the non-regression guard

Remove the hard bounds in `index.ts:148-165` that prevent the engine from suggesting a reduction. Replace with a bounded output that allows conservative reductions (up to -10% load, -1-2 reps) with a clear explanation.

### Part 4: Edge function changes

Update `generate-ai-suggestion/index.ts` to:
- Accept the new input signals
- Implement the deterministic outcomes contract
- Return outcome type + suggested values + human-readable reason
- Cache results for identical inputs (idempotency)

## Out of scope

- Cycle 5: Levels redesign (separate cycle)
- Live authenticated browser testing (blocked by Vercel)
- Adding new UI screens/fields beyond what's minimally required

## Rules

1. Branch: `fix/progression-engine`
2. One commit per fix part
3. Do not change production data, secrets, or deploy
4. Do not break existing suggestion API contract — extend it
5. Keep the LLM fallback path for Pro users but with the new bounded contract
6. Report exact files changed and rationale

## Deliverable

Branch `fix/progression-engine` with all changes committed. Engine can return progress, hold, deload, plateau or insufficient-evidence outcomes with reasons.