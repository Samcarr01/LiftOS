# LiftOS Fix Plan — Claude Code Audit

## Issue 1: Training Stage shows sessions/wk + progression
**File:** `web/src/app/(app)/profile/page.tsx` — lines 484-487

**Problem:** Training Stage section still says "3 sessions/wk · double-progression progression". The user wants training stage to be just a title with no mention of sessions or progression.

**Fix:** Delete lines 484-487 (the `<p>` tag showing sessions/wk and progression style).

---

## Issue 2: Training page overflows on phone
**File:** `web/src/app/(app)/profile/training/page.tsx` — lines 170-184

**Problem:** The 7 experience buttons (Just Starting, Novice, Early Int., Intermediate, Adv. Int., Advanced, Elite) don't fit in 375px width. They overflow horizontally.

**Fix:** Add `overflow-x-auto` with `flex-nowrap` to the container so users can scroll horizontally to see all 7 options. Add a subtle scroll hint (fading gradient at edges) so it's clear there's more to see.

---

## Issue 3: Badges still visible
**File:** `web/src/app/(app)/page.tsx`

**Problem:** Code confirms badges section was removed. User may be seeing a stale Vercel cache. Vercel auto-deploys sometimes serve old static files.

**Fix:** Force a fresh Vercel deployment by pushing an empty commit or redeploying via the Vercel dashboard. Add a small cache-busting change if needed.

---

## Issue 4: Tier animations look terrible
**File:** `web/src/lib/leveling/tier-visuals.tsx`

**Problem:** The animations are conceptually distinctive (nebula cloud, accretion disk, solar corona) but the user says they look terrible. Likely issues:
- CSS animations are too subtle or not rendering properly
- Colors are too muted against dark backgrounds
- The effects look different in the browser than intended

**Fix:** Simplify the animations. Make them bolder and more visible. Use:
- Brighter colors with higher contrast against dark backgrounds
- Faster, more noticeable animation cycles
- More apparent visual impact (larger glow, brighter pulses)

---

## Files to change

| File | Change |
|---|---|
| `web/src/app/(app)/profile/page.tsx` | Delete lines 484-487 (sessions/wk + progression text) |
| `web/src/app/(app)/profile/training/page.tsx` | Add `overflow-x-auto` to experience buttons container |
| `web/src/lib/leveling/tier-visuals.tsx` | Simplify and brighten Nebula, Singularity, Apex animations |

**Branch:** `fix/final-polish`