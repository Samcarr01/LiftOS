# Fix Cycle 3: Migration Reconciliation

**Priority:** 3 of 5
**Audit source:** `/root/projects/LiftOS/.hermes/audits/2026-07-30-liftos-full-app-audit.md`
**Model:** Claude Code Opus 5 (via `claude` CLI)

## Context

Cycle 1 (offline data integrity) on `fix/offline-data-integrity` ✅
Cycle 2 (entitlement/AI cost) on `fix/entitlement-ai-cost` ✅
This cycle ensures the database schema is reproducible from committed migrations.

## Scope

### H7 — Versioned migrations do not reproduce the schema expected by the app

**Evidence:**
- `workout_sessions` migration lacks fields used by current web completion/home flows
- Types checked into the repo include user fields not present in any committed migration
- A clean Supabase build from Git fails on core pages (`/templates`, `/exercises/new`)

**Required outcome:** A fresh Supabase instance created solely from committed migrations must match what the running app expects.

**Fix — Three parts:**

**1. Audit the gap — what does the app actually query?**
- Search the codebase for every table, column and type referenced in:
  - `web/` Next.js pages and API routes
  - mobile `src/` queries and RPC calls
  - Edge Function database interactions
- Build a complete "expected schema" from usage

**2. Audit the migration chain — what do migrations actually produce?**
- Walk every migration file in `supabase/migrations/` in order
- Build a "migration-produced schema" from the cumulative SQL
- Compare with the expected schema
- Identify every missing column, missing table, wrong type, or missing index

**3. Fix the gaps**
- Create a single new migration that adds only the missing columns/tables/indices
- Do not modify existing migrations (they may already be applied in production)
- Do not drop or alter existing columns — only additive changes
- After the migration, generate fresh TypeScript types:
  - Use `supabase gen types typescript --local` or the Supabase MCP
  - Update `src/types/database.ts` and any web-side types

**4. (Optional but recommended) Add a CI check**
- A script that creates a temporary Supabase project from migrations and validates it against expected tables/types

## Out of scope (this cycle)

- Cycle 4: Progression engine redesign
- Cycle 5: Levels redesign
- Live authenticated browser testing (blocked by Vercel)

## Rules

1. Create branch: `fix/migration-reconciliation`
2. Only additive changes — no ALTER COLUMN, no DROP, no retroactive migration edits
3. One new migration file, clean and commented
4. Regenerate TypeScript types after the migration
5. Report the exact gap found (which fields were missing, which types were wrong)
6. Do not change production data, secrets, or deploy

## Deliverable

Branch `fix/migration-reconciliation` with new migration + regenerated types + gap analysis summary.