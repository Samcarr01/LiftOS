# LiftOS start-time progressive targets

**Approved scope:** Implement start-time target calculation. No database migration, live-data mutation, commit, push or deploy.

## Required UX
Tap Start Workout → load latest completed performance → calculate realistic per-set targets now → show them in orange immediately. Inputs remain blank. No user must complete an extra workout to obtain a valid suggestion.

## Constraints
- Use the deterministic guided-progression engine. Do not call paid AI services.
- The start route already has the authenticated user, template, exercise IDs and Supabase server client. Make the server calculate targets before it returns the StartWorkoutResponse.
- Cached `ai_suggestions` is never the authoritative recommendation. It may be ignored for this path.
- Preserve stale-suggestion protections as a fallback/legacy safety net.

## Acceptance
1. Existing prior performance `80×3, 75×4, 70×5` yields set-specific targets on first workout start.
2. No top card or orange target can be sourced from a stale cached generic `80×8` row.
3. Inputs blank; Last display unchanged.
4. Target generation has a targeted server/start flow test plus all existing focused tests and production build.
