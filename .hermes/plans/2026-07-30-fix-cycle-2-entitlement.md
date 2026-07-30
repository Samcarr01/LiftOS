# Fix Cycle 2: Entitlement & AI Cost Protection

**Priority:** 2 of 5
**Audit source:** `/root/projects/LiftOS/.hermes/audits/2026-07-30-liftos-full-app-audit.md`
**Model:** Claude Code Opus 5 (via `claude` CLI)

## Context

Cycle 1 (offline data integrity) complete on branch `fix/offline-data-integrity`. This cycle protects against cost and entitlement exposure.

## Scope

### H5 — Subscription entitlement can be self-escalated

**Evidence:** `supabase/migrations/20260305103134_rls_policies.sql:15-16` permits all operations on a user's own row. `subscription_tier` is an editable field and server code reads it for Pro behaviour.

**Problem:** A signed-in free user can potentially set their own tier to Pro through the public API.

**Fix:**
- Create a new RLS policy that prevents users from updating `subscription_tier` on their own row
- The `subscription_tier` field should only be settable by a service-role or admin function
- Add a Supabase Edge Function (or modify existing billing webhook) that is the sole authoritative path for tier changes
- Verify: a free user PATCH to `subscription_tier='pro'` must be rejected

### H6 — Paid AI routes lack durable entitlement and rate controls

**Evidence:**
- `generate-ai-suggestion` and `generate-weekly-summary` authenticate callers but provider invocation is not guarded by an authoritative Pro entitlement/rate limit
- Workout completion also triggers suggestion regeneration
- Any account can create paid-provider spend, including repeated cache-bypass requests

**Fix:**
- Add a durable Pro entitlement check at the start of each AI-generating Edge Function
- The check must read the user's `subscription_tier` from the database (not from the client JWT claims, which can be stale)
- Add rate limiting (per-user, per-hour) to paid AI routes
- Ensure free users receive a 403 or deterministic no-AI output
- Ensure workout completion for free users does not trigger a paid model call
- Ensure AI suggestion calls are idempotent (cached results for identical inputs)

## Out of scope (this cycle)

- H7: Migration reconciliation (cycle 3)
- Progression redesign (cycle 4)
- Levels redesign (cycle 5)
- Live authenticated browser testing (blocked by Vercel)

## Rules

1. Create a branch: `fix/entitlement-ai-cost`
2. One fix per commit, descriptive messages
3. Do not change production data, secrets, or deploy
4. Do not delete existing migrations — add new ones
5. RLS changes must be additive and reversible
6. Report exact files changed and rationale for each fix

## Deliverable

Branch `fix/entitlement-ai-cost` with all fixes committed. Summary of changes per finding.