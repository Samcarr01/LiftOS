# XP & Leveling Polish

## Issues

1. **Levels page too long** — XP rules (12 sources) + 12 tier rows = lots of scroll
2. **Nebula/Singularity/Apex animations not distinctive** — reuse Orbit/CardinalSparkle patterns from earlier tiers
3. **Training stage confusing** — user doesn't understand what it affects. Old settings (reps, goals, body weight, weekly target) lost because link to `/profile/training` was removed
4. **No weekly session target in onboarding** — user should set 1-7 sessions/week goal during signup
5. **Badges overwhelming** — remove badges section from home page

---

## 1. Levels page — collapse XP rules

Collapse the 12 XP source rules into a toggleable section. Default: collapsed. Button says "Show how XP works (12 sources)". On tap, it expands to show the full list. The tier ladder is always visible.

## 2. Redesign tier animations

Replace Nebula, Singularity, Apex effects with genuinely different designs:

**Nebula (L62, deep indigo)**
- Replace 3 fixed orbits with a drifting particle cloud
- 8-10 small dots that float randomly (not in orbit paths)
- Colour shifts between deep indigo, purple, blue
- Uses CSS animation with random-like delays

**Singularity (L78, void black)**
- Replace 2 tiny orbits with an accretion disk effect
- Bright ring of material spiralling inward toward a dark centre
- Gravitational lensing glow around the edge
- Actually visible against dark backgrounds

**Apex (L100, solar gold)**
- Replace 4 CardinalSparkle with a full corona burst
- Radiating rays of light from the icon
- Brilliant gold pulse like a solar flare
- Most visually impressive — should feel like a final tier

## 3. Training stage + link to old settings

**Profile page:**
- Keep the Training Stage section showing current stage + suggestion
- Add a "More training settings" link that goes to `/profile/training`

**Training page (`/profile/training`):**
- Already has all settings: experience level, weekly goal, rep range, heaviest set first, body weight, goals
- Just needs to be reachable — no code changes needed

## 4. Weekly session target in onboarding

Add a simple stepper control to the onboarding flow:
- "How many sessions per week do you want to aim for?"
- +/- buttons, range 1-7, default 4
- Saves to `weekly_workout_target` in the users table

## 5. Remove badges

Remove the badges section from the home page (`/app/page.tsx`, lines ~404-454). The badges system still exists in the code but no UI for it.

---

## Files to change

| File | Change |
|---|---|
| `web/src/app/(app)/levels/page.tsx` | Collapse XP rules behind toggle button |
| `web/src/lib/leveling/tier-visuals.tsx` | Redesign Nebula, Singularity, Apex TierCardEffects + IconFrontEffects |
| `web/src/app/(app)/profile/page.tsx` | Add "More training settings" link below Training Stage section |
| `web/src/app/onboarding/page.tsx` | Add weekly session target stepper (1-7) |
| `web/src/app/(app)/page.tsx` | Remove badges section (lines 404-454) |

## Branch

`fix/xp-leveling-polish`