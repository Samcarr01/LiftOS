# LiftOS Full App Audit

**Date:** 30 July 2026  
**Mode:** Read-only. No application code, database records, secrets, production configuration or deployments were changed.

## Executive summary

LiftOS has a promising product foundation: native secure token storage, persistent offline queueing, RLS enabled on the original schema, authenticated Edge Function entry points, a working public PWA login surface, and a clear training-product direction.

It is **not ready to be described as production-ready**. The highest risks are data integrity in offline workouts, entitlement/API-cost control, migration drift, and a progression engine that automatically escalates from set completion without the recovery/technique/effort inputs required by Sam’s supplied manuals.

| Severity | Count | Meaning |
|---|---:|---|
| High | 10 | Data loss/corruption, spend/entitlement exposure, release blockers, or unsafe product logic |
| Medium | 8 | Reliability, accessibility, integrity, UX or scalability defects |
| Low | 2 | Quality or integrity hardening |
| Blocked | 2 | Cannot be validated without an approved test account and normal browser access |

## Scope and evidence

### Audited
- Native Expo app: navigation, active workout, SQLite queue, sync/recovery, completion, accessibility, release config.
- Web Next.js PWA: build, public login, static UX/accessibility source review, level/XP model.
- Supabase schema, RLS, migration reproducibility and all relevant Edge Functions.
- AI suggestion, progressive-overload and level/tier/streak systems.
- Six supplied training manuals, applied as audit criteria rather than treated as medical rules.

### Verified runtime results
- `https://lift-os.vercel.app/login` rendered the public sign-in page with no captured JavaScript errors on the first load.
- Local web `npm run build` **failed**. Missing public Supabase values caused prerender failures at `/templates` and `/exercises/new`.
- Later live-browser interactions were blocked by Vercel’s security checkpoint. No account was created and no form was submitted.
- Native dependencies are not installed in this checkout, so Expo compile/device behaviour is unverified.

### Explicitly not tested
- Authenticated PWA flows, account recovery email, workout creation/logging/completion and profile changes. These require an approved disposable audit account.
- Native device/simulator behaviour, force-quit recovery and EAS build output. Root packages need installation first.
- Actual remote Supabase schema/policies. Findings assess the committed migration state; remote drift must be checked separately.

---

## High findings

### H1. Offline edits to completed sets can silently sync stale values
**Evidence:** `src/lib/offline/local-db.ts:91-98` inserts queue rows with `INSERT OR IGNORE`; the queue ID is reused when a completed set is edited. The local mirror updates but the new mutation can be ignored.

**Impact:** A user may see corrected weight/reps locally while Supabase retains the old set. Progress, PRs and AI suggestions can then be wrong.

**Required test:** complete a set offline → edit it → reconnect → confirm the final remote values match the final local values.

### H2. Deleted sets are not queued for remote deletion
**Evidence:** native set deletion only removes/reindexes local state; the sync function supports deletion but the mobile delete path does not queue it.

**Impact:** Deleted sets remain in remote history; reindexing can overwrite the wrong remote set.

**Required test:** sync a workout → delete a set offline/online → sync → verify exactly the intended remote set is gone and no set is overwritten.

### H3. Sync exceptions can strand mutations in `syncing` forever
**Evidence:** `src/lib/offline/sync-manager.ts:56-57` marks rows syncing. Its catch block only logs (`115-117`), while pending selection excludes syncing rows. `local-db.ts:101-111` only selects pending rows.

**Impact:** Workout data can stop retrying after an unexpected sync failure.

**Required test:** throw after marking a batch syncing, restart the app, and prove every stale lease returns to pending/failed with a visible retry state.

### H4. Active offline workouts do not survive force-quit
**Evidence:** SQLite persists queue rows and local sets, but not the active workout/session/timer structure. The active workout is in-memory Zustand state.

**Impact:** A user who loses the app offline can lose their live workout context and cannot reliably resume it.

**Required test:** begin/log offline → force-stop → relaunch → resume → reconnect → finish with one correct server record.

### H5. Subscription entitlement can be self-escalated
**Evidence:** `supabase/migrations/20260305103134_rls_policies.sql:15-16` permits all operations on a user’s own row. `subscription_tier` is an editable field (`20260305103051_create_tables.sql:11-18`) and server code reads it for Pro behaviour.

**Impact:** A signed-in free user can potentially set their own tier to Pro through the public API.

**Required test:** a free user PATCH to set `subscription_tier='pro'` must be rejected; only a privileged verified billing flow may change entitlement.

### H6. Paid AI routes lack durable entitlement and rate controls
**Evidence:** `generate-ai-suggestion` and `generate-weekly-summary` authenticate callers but provider invocation is not guarded by an authoritative Pro entitlement/rate limit. Workout completion also triggers suggestion regeneration.

**Impact:** Any account can potentially create paid-provider spend, including repeated cache-bypass requests.

**Required test:** free calls return 403 or deterministic no-AI output; Pro calls are idempotent and rate-limited; completing a free workout does not create a paid model call.

### H7. Versioned migrations do not reproduce the schema expected by the app
**Evidence:** the original `workout_sessions` migration lacks fields used by current web completion/home flows. Checked-in DB types include user fields not introduced by committed migrations.

**Impact:** A clean environment built from Git can fail on core pages and cannot be trusted for recovery, CI or new environments.

**Required test:** start a fresh Supabase instance from committed migrations; run type generation and core start/complete/home/onboarding/levels paths with no schema mismatch.

### H8. Offline `session_exercises` upsert uses no matching database constraint
**Evidence:** the offline function conflicts on `(session_id, exercise_id, order_index)`, but `session_exercises` only has a primary key in `20260305103051_create_tables.sql:82-91`.

**Impact:** Postgres cannot apply the intended upsert reliably. Offline exercise creation may fail.

**Required test:** fresh DB insert, retry, update and delete each prove idempotent behaviour with no conflict-target error.

### H9. Current progression logic is automatic escalation, not adaptive progressive overload
**Evidence:** `generate-ai-suggestion/index.ts:320-350` progresses a weighted exercise when `latest.allSetsCompleted`, using a fixed 3%/minimum 1.25kg jump. Its core session input carries sets and completion only (`19-31`), not target rep ranges, RIR/RPE, technique, pain, sleep, stress, goal, conditioning or training status.

**Impact:** The current system cannot implement the manual-derived requirements for double progression, fatigue-aware holding, recovered-plateau detection or tissue/recovery protection. It can present a confident next target from insufficient data.

**Required test:** use `PO-01` through `PLAT-02` from the audit plan. The engine must be able to return progress, hold, fatigue reduction, candidate plateau or insufficient evidence with a human-readable reason.

### H10. Suggestion bounds prohibit regression/deload output
**Evidence:** `generate-ai-suggestion/index.ts:148-165` forces suggested metrics not below the latest completed baseline. It prevents the model from recommending a reduced load, rep/distance/duration target after a fatigue signal.

**Impact:** Even if future AI reasoning detects fatigue, the output guard forces non-regression. This directly conflicts with a deload/recovery product requirement.

**Required test:** a valid fatigue state may offer a conservative reduction with a clear non-diagnostic explanation and user override; an ordinary progression still remains bounded.

---

## Medium findings

| ID | Finding | Evidence / impact |
|---|---|---|
| M1 | Finish-workout race | Set logging is asynchronous and completion does not prove all queued writes have landed. A final set can be omitted from summaries/PRs/suggestions. |
| M2 | Sync protocol treats missing result as success | `sync-manager.ts:90-98` can clear a mutation when the server response has no corresponding result. Partial response can mean silent data loss. |
| M3 | Child records do not enforce same-owner exercise relation | RLS checks parent ownership, but a user may attach another user’s exercise UUID to their own template/session. |
| M4 | JSON exercise/set data lacks trusted boundary validation | Tracking schema and set values are JSONB with limited database-side invariants. Malformed direct/offline writes can pollute progression data. |
| M5 | Offline API operation contract is incomplete/concurrent | Some advertised insert/delete operations do not execute as named; concurrent handling can violate intended ordering. |
| M6 | Native active workout accessibility is incomplete | No native accessibility labels/roles/states were found; icon/value-only controls cannot be reliably announced by VoiceOver/TalkBack. |
| M7 | Large workouts are unvirtualized | Native active workout renders its exercise tree in a `ScrollView`, risking input/scroll jank on large templates. |
| M8 | Release observability/test setup is incomplete | Sentry is not fully configured, EAS submit identity is placeholder, production checklist remains incomplete, and native test command/tooling is not CI-ready. |

---

## Low findings

| ID | Finding | Impact |
|---|---|---|
| L1 | XP can be inflated by empty normal sessions and client-created PR rows | Undermines tier integrity. `web/src/lib/leveling/xp.ts:173-195` awards XP based on session/PR inputs, not verified valid work. |
| L2 | Current levels are pure accumulated XP/tier cosmetics | The system does not distinguish programming stage, exercise mastery and process recognition. It risks status incentives rather than safe adherence. |

---

## Level-system target state

Keep three distinct systems:

| System | Controls | Must never be based on |
|---|---|---|
| Training stage | Programme default dose/progression style | XP, streaks, badges or public rank |
| Exercise mastery | Skill and personally appropriate performance | A compulsory 1RM, bodyweight target or specific gym equipment |
| Process recognition | Plan-aligned sessions, deloads, recovery, reviews and return after lapse | Training through pain, missed rest or unsafe volume |

**Non-negotiable acceptance criteria:** deloads/recovery sessions preserve adherence credit; XP cannot reward safety-warning overrides; stage change requires observed response-to-training evidence and user control; social/body comparison stays opt-in.

---

## Prioritised fix order

1. **Protect data first:** fix offline mutation identity, deletion, recovery and completion ordering, with real reconnection/force-quit tests.
2. **Protect money and entitlement:** lock `subscription_tier`, gate/rate-limit all paid AI routes, and make generation idempotent.
3. **Make the platform reproducible:** reconcile migrations/types and test a clean Supabase reset in CI.
4. **Replace automatic progression:** define a deterministic, explainable readiness/progression contract before expanding LLM use. Add only the minimal input collection needed for a safe first version.
5. **Redesign levels after safety foundations:** split training stage, mastery and process recognition. Do not reward raw attendance or PR rows alone.

## Recommended next implementation cycle

**One feature only:** offline data-integrity hardening.

It has the highest product risk because users trust LiftOS with workout records. The deliverable should be a small, isolated branch that addresses mutation IDs, explicit deletes, sync lease recovery and finish ordering, plus automated sync tests. Atlas should review the diff and test a forced offline/reconnect path before any production release.

## Appendix: source caveat

The supplied manuals are useful research and operating guidance. Their numerical examples are not personal medical advice or immutable thresholds. LiftOS should expose recommendations as configurable, explainable training heuristics, preserve user control, and escalate red-flag symptoms to appropriate professional support rather than diagnosing users.
