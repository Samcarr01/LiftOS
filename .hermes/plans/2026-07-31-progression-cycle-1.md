# LiftOS Progressive Overload Cycle 1

> **For Lift:** Use Claude Code CLI for all development work. Work only on branch `lift/progression-cycle-1`.

**Goal:** Make existing progression targets honour the user's configured rep range and actual set-by-set performance, removing the universal `×8` / rep-ceiling prescription.

**Architecture:** Keep Cycle 1 bounded to the existing data model and cached-suggestion workflow. Do not add readiness, RIR/RPE, form quality, migrations, or production writes. The recommendation engine should resolve the correct configured range, preserve a per-set rep vector, and only prescribe one achievable rep of progression at a time. The UI should display the individual target for each working/top set.

**Out of scope:** Pre-workout readiness, RIR/RPE capture, fatigue model, deload redesign, deployment, Supabase migrations, production DB queries/writes, push, and PR creation. Those are Cycle 2+.

## Required behaviour

1. **Configured range wins.** Verify and preserve the documented priority: template exercise range → user's global preferred range → goal range → category fallback. Add tests covering the global `3–8` range.
2. **No universal midpoint target.** For a user range of `3–8`, no fallback/default path may display `8` simply because a compound lift is being progressed.
3. **Per-set targets.** Preserve the latest qualifying working/top-set rep vector. Example: prior `10, 8, 7` in an `8–12` range should become `10, 8, 8` at the same load, not `12, 12, 12`.
4. **Load progression.** Increase load only when every qualifying set reaches the configured range ceiling. At higher load, start from a conservative feasible target based on actual prior performance and the configured range, not a broad-category midpoint.
5. **Hold behaviour.** If a session does not earn progression, hold the load and previous realistic vector. Never turn a hold into an instruction to hit the range ceiling across every set.
6. **Display.** Each working/top set must receive its own target values. The explanation should say whether the user is holding, adding one rep, or increasing load.
7. **Regression fix.** `hydrateWorkout()` must initialise editable prefilled set values from `prefilledSets[].values`, rather than `{}`.

## Likely files

- `src/lib/workout/guided-progression.ts` — target/range resolution and progression output.
- `src/components/workout/exercise-card.tsx` — pass set-specific targets.
- `src/components/workout/set-row.tsx` — render target assigned to that set.
- `src/store/active-workout-store.ts` — preserve prefilled values.
- Existing tests or new focused unit tests adjacent to the progression engine.

## Test cases

- Global preferred range `3–8` with no template override is resolved and honoured.
- Template range overrides global range only when explicitly present.
- `[10, 8, 7]` at a fixed load becomes `[10, 8, 8]`, not all max reps.
- All sets at range ceiling causes a small load increase.
- A non-ceiling session holds load and realistic vector.
- Exercise card sends different targets to different rows.
- Prefilled snapshot `{ weight: 100, reps: 8 }` hydrates editable values.

## Operating rules

- Read `PROGRESS.md` and relevant project guidance before changing code.
- Use `claude -p --model sonnet` for the implementation.
- Make only the required Cycle 1 changes.
- No production access, deploy, push, PR, or commit unless explicitly instructed later.
- Run focused tests and `npm run build`.
- Report exact files changed, test/build output, unresolved risks, and whether the configured 3–8 range is verified end-to-end.