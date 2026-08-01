# LiftOS stale-suggestion guard

**Approved scope:** One regression fix. No database migration, no live data mutation, no readiness work.

## Problem
At workout start, the app reads `last_performance_snapshots` and `ai_suggestions` independently. A cached suggestion may describe an older session while Last values show a newer session. Generic / legacy cached suggestions must not render as a current top recommendation or orange row targets.

## Minimal design
1. When a completed workout writes its `ai_suggestions` row, add JSON provenance to `history_snapshot`: `source_session_id: session.id` and `schema_version: 2`.
2. At workout start, select the latest snapshot `session_id` plus each suggestion `history_snapshot`.
3. Hydrate `aiSuggestion` only when the suggestion provenance has `schema_version === 2` and its `source_session_id` equals the snapshot session ID. Otherwise hydrate `null`.
4. Legacy rows lacking provenance are stale by definition. They show Last data only: no misleading summary and no orange targets.
5. Add rendered start-workout regression coverage for both stale legacy mismatch and matching fresh suggestion. Keep current blank-input and per-set tests green.

## Acceptance criteria
- A legacy generic `80kg × 8` whose snapshot source differs from current `80×3/75×4/70×5` cannot render in summary or rows.
- A fresh matching suggestion with valid per_set_targets still renders set-specific orange values.
- The completion route writes provenance.
- Focused tests plus production build pass.
