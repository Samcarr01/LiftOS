# LiftOS Final Polish

## Issues

1. **Toast notifications too high** — sonner Toaster is positioned `top-center` on line 114 of `layout.tsx`. On mobile, this overlaps with the phone status bar. Change to `bottom-center`.

2. **Save fails on training stage** — Database column `experience_level` has a CHECK constraint: `CHECK (experience_level IN ('beginner', 'intermediate', 'advanced'))`. The new 7-stage values (`just-starting`, `novice`, `early-intermediate`, `intermediate`, `advanced-intermediate`, `advanced`, `elite`) are rejected. Fix: create a new migration to drop and recreate the constraint with all 7 values.

3. **Training stage shows sessions/wk** — `profile/page.tsx` lines 484-487 still show "3 sessions/wk · double-progression progression". Delete these 4 lines. Training stage should only show the label and description.

4. **Training page overflows on phone** — `profile/training/page.tsx` lines 170-184: 7 experience buttons in a horizontal flex container don't fit 375px width. Add `overflow-x-auto` to the container with `flex-nowrap` so users can scroll horizontally.

5. **Tier animations look wrong** — Nebula, Singularity, Apex animations in `tier-visuals.tsx` and `globals.css` need rework. The motion, speed, and style aren't right. Simplify the CSS keyframes — make animations faster, brighter, more visible. Remove overly complex multi-layer effects if they don't work visually.

6. **Promotion overlay boring for new tiers** — `tier-promotion-overlay.tsx` has no entries for Nebula, Singularity, or Apex in:
   - `tierNameGradient()` — falls through to plain gradient
   - `tierNameAnimation()` — falls through to `'none'`
   - `PARTICLE_TIERS` — only Diamond, Mythic, Cosmic get confetti
   - `confettiColorsForTier()` — falls through to white
   Add custom entries for all 3 tiers with appropriate colours, animations, and confetti.

---

## Files to change

| File | Change |
|---|---|
| `web/src/app/layout.tsx` | Change Toaster position from `top-center` to `bottom-center` |
| `supabase/migrations/20260731150000_update_experience_level_check.sql` | **New file** — DROP existing CHECK constraint, ADD new one with 7 values |
| `web/src/app/(app)/profile/page.tsx` | Delete lines 484-487 (sessions/wk + progression text) |
| `web/src/app/(app)/profile/training/page.tsx` | Add `overflow-x-auto` + `flex-nowrap` to experience buttons container |
| `web/src/lib/leveling/tier-visuals.tsx` | Simplify Nebula, Singularity, Apex effects — brighter, faster, cleaner |
| `web/src/app/globals.css` | Update/replace animation keyframes for the 3 tiers |
| `web/src/components/home/tier-promotion-overlay.tsx` | Add Nebula, Singularity, Apex entries for gradient, animation, confetti |

## Branch

`fix/final-polish`