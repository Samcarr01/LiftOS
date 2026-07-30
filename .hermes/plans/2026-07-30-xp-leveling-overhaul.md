# XP & Leveling Overhaul Plan v2

## Issues found

1. **Duplicate stage UI** — profile page has both old "Training preferences" link (→ /profile/training with its own selector) AND new "Training Stage" section
2. **Tier sort order** — On the levels page, Obsidian (10-13) displays before Titan (14-19) then jumps to Platinum (20-27) if the TIERS array is out of order for render
3. **Only 3 training stages** — You want more granular progression from beginner to elite
4. **Only 4 XP sources** — session, light session, weekly goal, PR. Boring.
5. **No XP feedback on completion** — The `/workout/complete` page shows duration, sets, volume and PRs but no XP slider. You should see exactly what you earned from that workout.
6. **Name "Transcendent"** — renamed to **Apex**

---

## 1. XP Slider on Completion Page

After a workout completes, the `/workout/complete` page shows an animated XP summary between the stats strip and the exercises list:

- **XP earned this session** — animated counter (0 → actual)
- **Progress bar** — shows pre-session level → post-session level with fill animation
- **Breakdown** — expandable section showing each XP source earned (session base, heavy sets, full session, variety, etc.)
- If a tier promotion happens, the existing `TierPromotionOverlay` fires on top

**How it works technically:** XP is derived on-the-fly from session + PR data. The completion page computes XP total excluding this session, then including this session, then animates between them. No database writes needed — the server already stores the session.

**XP slider component should:**
- Show a horizontal progress bar with the current level label on the left and next level on the right
- Display "XP earned: +XX" as a counter animation on the bar
- Show a tier icon/badge at the current level position
- Use a subtle glow/shine animation on the fill

---

## 2. Expanded XP Sources

Current: 4 sources. Proposed: 12 sources.

| Source | XP | Category | Why |
|---|---|---|---|
| Complete a workout | +50 | Base | (existing) |
| Light / off-day session | +25 | Base | (existing) |
| Hit weekly goal | +75 | Consistency | (existing) |
| Set a PR | +75 | Achievement | (existing) |
| **Heavy set bonus** | **+10 per set ≥85% e1RM** | **Intensity** | Rewards pushing heavy weight. A 5x5 squat session = +50 |
| **Volume PR** | **+100** | **Progressive overload** | First time weekly volume beats previous best. Rewards progressive overload |
| **Full session** | **+30** | **Discipline** | Complete every planned exercise and set. Rewards finishing |
| **Deload week** | **+100** | **Smart training** | Complete a deload. Rewards recovery, not just grinding |
| **Comeback** | **+200** | **Retention** | Return after a 14+ day gap. Rewards getting back to it |
| **Variety bonus** | **+15 per unique exercise** | **Balance** | Up to +75/session. Rewards balanced full-body training |
| **Weekly streak** | **+50 per consecutive week** | **Consistency** | Capped at +200. Rewards showing up week after week |
| **Template user** | **+40** | **Planning** | Complete a workout from a saved template. Rewards planning ahead |

---

## 3. Training Stages (3 → 7)

| Stage | Ordinal | Sessions/wk | Progression | Description |
|---|---|---|---|---|
| **Just Starting** | 0 | 2 | Linear | First steps. Building the habit |
| **Novice** | 1 | 3 | Linear | Learning form, building base |
| **Early Intermediate** | 2 | 3-4 | Double progression | Consistent. Adding structure |
| **Intermediate** | 3 | 4 | Double progression | Solid foundation |
| **Advanced Intermediate** | 4 | 4-5 | Periodised | Refined. Block-aware |
| **Advanced** | 5 | 5 | Periodised | High volume, structured |
| **Elite** | 6 | 5-6 | Periodised | Peak performance |

User always has final control. Engine suggests based on months active, total sessions, recent consistency.

---

## 4. XP Tiers (9 → 12)

| Tier | Level | Color | Animation |
|---|---|---|---|
| Bronze | 1 | Warm bronze | None |
| Iron | 3 | Cool graphite | Pulse |
| Steel | 6 | Steel blue | Breathe |
| Obsidian | 10 | Dark violet | Glint |
| Titan | 14 | Champagne gold | Glow-shift |
| Platinum | 20 | Pearl | Shimmer |
| Diamond | 28 | Ice cyan | Refract |
| Mythic | 37 | Magenta | Gradient-spark |
| Cosmic | 49 | Vivid purple | Holographic |
| **Nebula** | **62** | **Deep indigo** | **Nebula-drift** |
| **Singularity** | **78** | **Void black** | **Event-horizon** |
| **Apex** | **100** | **Solar gold** | **Ascension** |

Renamed Transcendent → Apex. Three new tiers at levels 62, 78 and 100.

---

## 5. UI fixes

- Remove duplicate "Training preferences" link from profile page — keep only the new Training Stage section with 7 stages
- Fix any tier ordering issues in the levels page (ensure tiers sort by minLevel, not array index)
- Make mastery badge bigger on exercise detail page (currently 10px, bump to 12-14px with subtle animation)
- Update the levels page XP rules card to show all 12 sources

---

## Files to change

| File | Change |
|---|---|
| `web/src/lib/leveling/xp.ts` | Add new XP constants, update `computeXp()` to accept set-level data, add new breakdown fields |
| `web/src/lib/leveling/training-stage.ts` | Expand from 3 to 7 stages |
| `web/src/lib/leveling/xp.ts` (TIERS array) | Add Nebula, Singularity, Apex tiers. Rename Transcendent → Apex |
| `web/src/app/(app)/levels/page.tsx` | Update XP rules card to show all 12 sources, fix tier sort if needed, update header text |
| `web/src/app/workout/complete/page.tsx` | Add XP slider section between stats strip and exercises |
| `web/src/app/(app)/profile/page.tsx` | Remove duplicate "Training preferences" link |
| `web/src/app/(app)/exercises/[id]/page.tsx` | Increase mastery badge size |
| `web/src/lib/leveling/tier-visuals.tsx` | Add visuals for new tiers (Nebula, Singularity, Apex) |

## Branch

`fix/xp-leveling-overhaul`