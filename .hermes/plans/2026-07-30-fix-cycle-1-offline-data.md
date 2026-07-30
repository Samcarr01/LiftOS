# Fix Cycle 1: Offline Data Integrity

**Priority:** 1 of 5
**Audit source:** `/root/projects/LiftOS/.hermes/audits/2026-07-30-liftos-full-app-audit.md`
**Model:** Claude Code Opus 5 (via `claude` CLI)

## Context

Full audit completed 30 July 2026. 10 High, 8 Medium, 2 Low findings. This cycle addresses the top-priority data-integrity findings. Users trust LiftOS with workout records — offline data loss is the highest product risk.

## Scope

### H1 — Offline edits to completed sets can silently sync stale values

**File:** `src/lib/offline/local-db.ts:91-98`
**Problem:** `INSERT OR IGNORE` uses a queue ID that is reused when a completed set is edited. Local mirror updates but the new mutation is silently ignored by the server.
**Fix:** Replace `INSERT OR IGNORE` with an upsert strategy that generates a unique queue ID per mutation, or use `INSERT ... ON CONFLICT DO UPDATE`. Ensure edited sets produce a new queue row that the sync layer processes.

### H2 — Deleted sets are not queued for remote deletion

**File:** Native set-deletion path in the mobile app
**Problem:** Deleting a set locally removes/reindexes local state but does not push a deletion mutation to the sync queue. The set persists in Supabase history.
**Fix:** Route all set-deletion actions through the offline queue with an explicit "delete" operation type. The sync handler must resolve the correct remote set.

### H3 — Sync exceptions can strand mutations in `syncing` forever

**File:** `src/lib/offline/sync-manager.ts:56-57, 115-117`
**Problem:** Catch block only logs; pending-row selection excludes `syncing` rows. A single sync failure leaves mutations stranded.
**Fix:** On sync failure, revert `syncing` rows back to `pending` with a retry count. After N retries, mark them as `failed` with a visible retry state.

### H4 — Active offline workouts do not survive force-quit

**File:** Zustand store + SQLite persistence
**Problem:** Active workout/session/timer state is in-memory Zustand. SQLite persists queue rows and local sets but not the active workout structure.
**Fix:** Persist active workout state to SQLite (session context, current exercise, timer state, logged sets) and restore it on app relaunch. Confirm with a force-stop → relaunch → resume flow.

### H8 — Offline `session_exercises` upsert uses no matching database constraint

**File:** Offline sync function
**Problem:** Upsert conflicts on `(session_id, exercise_id, order_index)` but the Supabase table only has a primary key. Postgres cannot apply the intended upsert.
**Fix:** Either add a unique constraint on `(session_id, exercise_id, order_index)` to the schema, or change the offline upsert strategy to match the actual constraint.

### M1 — Finish-workout race

**File:** Workout completion handler
**Problem:** Set logging is asynchronous. Completion does not prove all queued writes have landed. A final set can be omitted from summaries/PRs/suggestions.
**Fix:** Before marking a workout complete, await confirmation that all pending sync mutations for that session have resolved. Add a completion barrier.

### M2 — Sync protocol treats missing result as success

**File:** `sync-manager.ts:90-98`
**Problem:** A mutation can be cleared when the server response has no corresponding result entry. Partial response can mean silent data loss.
**Fix:** Only clear a mutation after receiving an explicit success acknowledgement for that specific mutation ID. Missing results should trigger a retry.

### M5 — Offline API operation contract is incomplete

**File:** Offline queue handler
**Problem:** Some advertised insert/delete operations do not execute as named. Concurrent handling can violate intended ordering.
**Fix:** Audit every operation type against its implementation. Add operation ordering guarantees. Test concurrent queuing behaviour.

## Out of scope (this cycle)

- H5, H6: Entitlement/AI cost (cycle 2)
- H7: Migration reconciliation (cycle 3)
- Progression redesign (cycle 4)
- Levels redesign (cycle 5)
- Live authenticated browser testing (blocked by Vercel, revisit after Trusted IPs or manual test)

## Rules

1. Create a branch: `fix/offline-data-integrity`
2. One fix per commit, descriptive messages
3. Do not change production data, secrets, or deploy
4. Run any available tests after each change
5. No schema changes without checking existing migrations and RLS
6. Report exact files changed and rationale for each fix

## Deliverable

Branch `fix/offline-data-integrity` with all fixes committed. Summary of changes per finding. Build passes with `npm run build` in the web directory.