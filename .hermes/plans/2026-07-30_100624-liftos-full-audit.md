# LiftOS Full Product, UX and Technical Audit Plan

> **For Hermes:** This is an audit-only plan. Do not change application code, Supabase, Edge Functions, secrets, production settings or deployments while executing it. Use Claude Code through the Lift profile for any codebase investigation. Preserve the existing uncommitted `web/public/sw.js` change and record its origin before judging it.

**Goal:** Produce an evidence-backed, prioritised audit of LiftOS that identifies real defects, launch blockers, data/security risks, and the few product improvements most likely to make workout logging faster and more compelling.

**Architecture:** LiftOS has two user-facing products sharing a Supabase backend: an Expo/React Native app at the repository root and a Next.js 16 PWA in `web/`. The audit must test the same core user journey across both surfaces, then separately assess PWA/offline behaviour, native-device behaviour, database/RLS/Edge Function security, data correctness and release readiness.

**Tech stack:** React Native 0.76 / Expo 52 / Expo Router, Next.js 16 App Router, Supabase Auth/Postgres/RLS/Edge Functions, Zustand, SQLite (native) and Dexie/Serwist (web), Zod, Recharts, Playwright.

---

## Current context and audit constraints

- Product promise: log a set in under two seconds, with last-session values prefilled and a clear next target.
- Core workflows exist: authentication, onboarding, exercises, templates, active workouts, offline sync, completion, history, progress, AI suggestions, plateaus and weekly summaries.
- `PROGRESS.md` says all app and web build prompts are complete, but deployment documentation still lists unresolved launch prerequisites. Treat "production-ready" as a claim to validate, not a conclusion.
- Current git state has an uncommitted `web/public/sw.js` modification. Do not overwrite, reset or deploy it in the audit.
- No contact, billing, purchases, app-store submission, database mutation, secret change or production deployment is in scope.
- Audit native and web separately. Do not assume feature parity merely because they share a backend.

## Audit deliverables

Create these audit-only documents:

1. `docs/audits/2026-07-liftos-audit.md` — executive scorecard, evidence, severity-ranked findings and recommended roadmap.
2. `docs/audits/2026-07-liftos-journey-matrix.md` — every critical journey, platform coverage, expected outcome and observed result.
3. `docs/audits/2026-07-liftos-release-gates.md` — binary launch checklist: pass, fail, not-tested or blocked.
4. `docs/audits/2026-07-liftos-backlog.md` — prioritised implementation backlog, one feature/fix per Lift dispatch cycle.

Use this severity model throughout:

| Severity | Meaning | Release effect |
|---|---|---|
| P0 | Data loss, account compromise, inaccessible core workout logging, financial/API abuse | Block release immediately |
| P1 | Broken core workflow, incorrect training data, failed offline recovery, severe mobile UX issue | Fix before public release |
| P2 | Important friction, accessibility gap, misleading analytics or degraded performance | Schedule in first release cycle |
| P3 | Polish, optional visual upgrade or non-core feature gap | Backlog only |

---

## Task 1: Establish a protected baseline

**Objective:** Record exactly what exists before testing and stop existing local work being mistaken for an audit finding.

**Files to inspect:**
- `PROGRESS.md`
- `README.md`
- `web/README.md`
- `package.json`
- `web/package.json`
- `app.config.ts`
- `eas.json`
- `web/next.config.*`
- `web/public/sw.js`
- `.gitignore` and `web/.gitignore`

**Steps:**
1. Record root and `web/` branch, status, most recent commits and remotes.
2. Capture a diff and file timestamp for `web/public/sw.js`; ask Sam whether it is deliberate if git history does not establish its source.
3. Inventory available scripts, lockfiles, environment variable names and test tooling without reading secret values.
4. Produce a two-column architecture map: native-only, shared backend, web-only.
5. Mark all claims in `PROGRESS.md` as "verified", "unverified" or "contradicted" as evidence is gathered.

**Validation:**
- No files altered except audit documents.
- Audit report lists all uncommitted work separately from product findings.

---

## Task 2: Map the real user journeys and acceptance criteria

**Objective:** Define what "good" means before reviewing screens, so the audit is not subjective design commentary.

**Files to inspect:**
- `src/screens/**`
- `src/components/**`
- `src/hooks/**`
- `web/src/app/**`
- `web/src/components/**`
- `web/src/lib/**`
- `web/src/stores/**` if present

**Journeys to map:**
1. First visit → account creation → onboarding → first template → first workout.
2. Returning lifter → home → start pinned/recent workout → prefilled sets.
3. Active workout → edit weight/reps → complete set → rest timer → next exercise.
4. Offline active workout → log multiple sets → close/reopen app → reconnect → verify server result.
5. Finish workout → PR/summary → home/history/progress consistency.
6. Add/edit/archive exercise → template editor → correct exercise data appears in workout.
7. Progress → select exercise → switch metric/range → interpret chart and plateau/suggestion.
8. Profile → unit change, data export and account deletion boundaries.
9. Authentication, password reset and expired-session recovery.
10. PWA install/update/offline/reconnect path; native app background/resume path.

**For every journey document:**
- Starting state and test data required.
- Expected outcome and timing target.
- Native route and web route.
- Network state.
- Data writes and Edge Functions involved.
- Analytics event expected.
- Accessibility and one-handed mobile concern.

**Validation:**
- Journey matrix includes all 10 journeys and explicitly marks unsupported or untested platform paths.

---

## Task 3: UX and interaction audit against the LiftOS aha moment

**Objective:** Find where the product fails its core promise: start quickly, see the last session, log reliably and know what to do next.

**Primary files/screens:**
- Native: `src/screens/home/home-screen.tsx`, `src/screens/workout/active-workout.tsx`, `src/components/active-workout/{exercise-card,set-row,numeric-input,rest-timer,ai-suggestion-banner,finish-workout-dialog}.tsx`
- Web: `web/src/app/(app)/page.tsx`, `web/src/app/workout/[id]/page.tsx`, `web/src/components/workout/{exercise-card,set-row,numeric-input,rest-timer,finish-dialog,superset-card}.tsx`
- Shared supporting UI: `web/src/components/layout/{bottom-nav,sidebar-nav,offline-indicator,pwa-install-banner,pwa-update-banner}.tsx`

**Steps:**
1. Walk the critical workout journey as a new user and as a returning user on 375px, 390px, 768px and 1440px viewports for the PWA.
2. Measure interaction count and time-to-first-completed-set. The target is fewer than 2 seconds after selecting a prefilled set.
3. Check tap target size, thumb reach, keyboard/numpad flow, focus states, error recovery and accidental destructive actions.
4. Review screen hierarchy: what should be visible before scrolling, what is decorative noise, and whether progress/AI callouts distract during logging.
5. Check empty, loading, error, offline and slow-network states on every core screen.
6. Assess visual consistency: spacing, typography, colour contrast, navigation labels, motion and chart legibility.
7. Score each screen: clarity, speed, confidence, accessibility and perceived quality, each out of five.

**Evidence:**
- Annotated screenshots or route/state descriptions.
- Exact component/route reference for every finding.
- Reproduction steps, not opinions alone.

**Validation:**
- The final report separates P0/P1 workout-flow defects from subjective visual polish.

---

## Task 4: Functional and data-integrity audit

**Objective:** Verify that workout data, PRs, snapshots, units and offline mutations remain correct in realistic failure cases.

**Files to inspect:**
- `src/hooks/use-start-workout.ts`, `src/hooks/use-complete-workout.ts`, `src/store/active-workout-store.ts`
- `src/lib/offline/{local-db,sync-queue,sync-manager}.ts`
- `src/hooks/use-history.ts`, `src/hooks/use-progress.ts`
- `src/lib/validation.ts`, `src/types/**`
- `supabase/functions/{start-workout,complete-workout,sync-offline-queue,generate-ai-suggestion,generate-weekly-summary}/index.ts`
- Web equivalents under `web/src/lib/`, `web/src/hooks/`, `web/src/components/providers/`

**Tests to design before any production code changes:**
1. Starting a template clones the last performance correctly for fewer, equal and greater set counts.
2. A duplicate workout-completion request is idempotent.
3. Offline set updates survive an app/PWA restart and sync once, in the intended order.
4. Repeated reconnects cannot overwrite newer server data with stale values.
5. Kg/lb presentation cannot corrupt canonical stored values or charts.
6. Personal records and estimated 1RM only use eligible completed working/top sets.
7. Archived exercises cannot silently disappear from historical sessions.
8. AI suggestion bounds cannot exceed documented progression limits.

**Steps:**
1. Establish safe audit test accounts and disposable templates. Never use Sam’s personal workout records for destructive test cases.
2. Run the current test/lint/typecheck commands to discover baseline coverage and failures.
3. Run isolated manual tests against a non-production/staging project if one exists; if it does not, classify that as a release risk rather than improvising database writes.
4. Compare client state, offline queue state and Supabase rows after every test.
5. Log exact input, expected data and observed data in the journey matrix.

**Validation:**
- Every mutation path has an idempotency and reconnect outcome.
- Findings distinguish a confirmed data defect from an untested risk.

---

## Task 5: Security, privacy and AI-cost audit

**Objective:** Confirm users can only access their own data and that public endpoints cannot be abused to create AI spend or expose data.

**Files/configuration to inspect:**
- `supabase/migrations/*.sql`
- `supabase/functions/**/index.ts`
- `src/lib/supabase.ts`, `web/src/lib/supabase/**`
- Auth callbacks, middleware and route guards under `app/**` and `web/src/app/**`
- `.env.example`, `web/.env.example`, `.gitignore`, `app.config.ts`, `web/next.config.*`

**Checks:**
1. Verify all 11 tables have RLS enabled and all policies prevent cross-user reads/writes.
2. Review every Edge Function’s JWT policy, especially `generate-ai-suggestion`, which project notes describe as `verify_jwt=false`.
3. Confirm unauthenticated callers cannot trigger AI generation, weekly summaries, deletes or privileged reads.
4. Review rate limiting, payload size limits, input validation and per-user AI-cache behaviour.
5. Search the tracked repository and build output configuration for secrets, service-role credentials, private URLs and debug logging. Do not print any matched secret values.
6. Verify account deletion and export behaviour are truthful, scoped and recoverable only where documented.
7. Review PostHog/Sentry events for unnecessary health, training or personal data.

**Validation:**
- Produce a security table with endpoint, auth required, data accessed, abuse risk and required remediation.
- Any unauthenticated route that can spend AI credits or bypass user scope is P0/P1 depending on exploitability.

---

## Task 6: PWA, offline, performance and resilience audit

**Objective:** Ensure the web app behaves like a reliable gym companion under real mobile conditions.

**Files to inspect:**
- `web/src/components/providers/sync-manager-boot.tsx`
- `web/src/components/layout/{offline-indicator,pwa-install-banner,pwa-update-banner}.tsx`
- `web/src/lib/offline/**`
- `web/src/app/offline/page.tsx`
- `web/next.config.*`
- `web/public/sw.js`
- Serwist configuration and manifest/icon files in `web/public/`

**Steps:**
1. Build the PWA locally and test it using a production server, never development mode, because the service worker is disabled in development.
2. Test first load, repeat load, install prompt, installed mode, update flow and hard-refresh recovery.
3. Use browser network controls to test offline during active workout, reconnect, a failed Edge Function and a stale service worker.
4. Inspect caching rules to confirm API/auth/Edge Function responses are never unintentionally cached.
5. Run Lighthouse or equivalent on mobile and desktop. Record performance, accessibility, best practices and SEO separately.
6. Analyse JavaScript bundles, image sizes, chart loading and long-task risk on the active-workout route.
7. Test Safari iOS-specific PWA guidance and Android Chrome install/update behaviour.

**Validation:**
- No stale UI leaves the user unsure whether sets are saved.
- No service-worker behaviour can serve a broken old build after a deployment.
- Every offline sync failure has a visible, actionable recovery path.

---

## Task 7: Native app and release-readiness audit

**Objective:** Separate a working local Expo project from a shippable iOS/Android product.

**Files/configuration to inspect:**
- `app.config.ts`
- `eas.json`
- `app/_layout.tsx`, `app/(tabs)/_layout.tsx`
- `assets/**`
- `src/lib/{analytics,sentry,supabase}.ts`
- `README.md` production checklist

**Steps:**
1. Run the non-mutating Expo diagnostics, TypeScript check, lint and test-discovery commands.
2. Confirm iOS and Android identifiers, icons, splash, permissions, deep-link schemes and auth redirect URLs are production-safe.
3. Identify missing EAS project configuration, store records, privacy policy, crash reporting and analytics configuration.
4. Verify app behaviour through background/resume, screen lock, poor network and interrupted workout states.
5. Confirm native and web versions do not diverge in core data semantics.
6. Produce a launch-gate checklist with owner, evidence and a hard yes/no status for each platform.

**Validation:**
- "Production-ready" may only remain in project documentation if every P0/P1 release gate is proven.

---

## Task 8: Product strategy and backlog synthesis

**Objective:** Convert findings into a short, leverage-first implementation roadmap instead of a vague list of ideas.

**Decision framework:**

| Priority factor | Question |
|---|---|
| Core promise | Does it make logging a set faster, more accurate or more motivating? |
| Risk | Does it prevent data loss, account risk or AI-cost abuse? |
| Retention | Does it create a reason to return after a workout? |
| Effort | Can Lift ship it in one tightly scoped dispatch cycle? |
| Evidence | Is it observed in testing rather than assumed? |

**Steps:**
1. Deduplicate findings from all audit streams.
2. Score each finding by severity, user impact, confidence, effort and dependency.
3. Recommend a maximum of five immediate changes. Each must be small enough for one Lift dispatch cycle.
4. Put visual-only ideas behind functional/security blockers.
5. Produce a three-horizon roadmap:
   - **Release blockers:** P0/P1 fixes required before public launch.
   - **First 30 days:** retention and workout-loop improvements.
   - **Later:** monetisation, advanced programming and social features.
6. Ask Sam to approve each implementation brief individually. Do not batch work.

**Validation:**
- The executive summary starts with the top three decisions Sam needs to make.
- Each backlog item identifies owner (Lift), paths likely to change, acceptance criteria and tests.

---

## Recommended audit sequence

1. Protected baseline and journey map.
2. Web/PWA workout-flow and mobile UX review.
3. Native workout-flow and mobile UX review.
4. Data integrity and offline-sync tests.
5. Security/privacy/AI-cost review.
6. Performance/PWA resilience review.
7. Native release-gate review.
8. Synthesis and Sam decision meeting.

## Task 9: Research-grounded progressive-overload, performance and fatigue-engine audit

**Objective:** Test the current suggestion engine against Sam’s six supplied training manuals. Determine whether it is an explainable, conservative progression system or an oversimplified automatic load-increase feature.

**Research inputs:**
- `Biological Adaptation Engine_ Mechanistic Research Synthesis.pdf`
- `Optimisation_and_Sustainability_Engine_for_Resistance_Training.pdf`
- `Performance & Fatigue Engine.pdf`
- `Progressive overload.pdf`
- `The_Complete_Fitness_Operating_System_Research_&_Methods_Compendium.pdf`
- `The Complete Fitness Operating System Core Playbook.pdf`

**Current implementation to inspect:**
- `supabase/functions/generate-ai-suggestion/index.ts`
- `supabase/functions/complete-workout/index.ts`
- `src/lib/ai/rule-based-fallback.ts`
- `src/lib/validation.ts`
- `src/types/app.ts`
- `src/components/active-workout/{ai-suggestion-banner,plateau-warning,exercise-card}.tsx`
- `src/hooks/use-progress.ts`
- Web equivalents under `web/src/lib/`, `web/src/components/workout/` and `web/src/components/progress/`
- `supabase/migrations/20260305103051_create_tables.sql`

**Audit questions:**
1. Does every progression decision distinguish goal, exercise type, equipment increment, rep range, completed reps, target effort, technique and symptoms?
2. Does the algorithm use true double progression where appropriate: earn reps with acceptable technique and effort before the smallest viable load increase?
3. Can it avoid changing multiple major stressors at once: load, sets, reps, frequency, rest or conditioning?
4. Can it distinguish a recovered plateau from a fatigue stall, poor logging, altered technique or incomplete adherence?
5. Can it hold/reduce volume when performance and recovery conflict, rather than presenting every incomplete session as a simple repeat and every completed session as permission to progress?
6. Does it treat RIR/RPE, sleep, stress, soreness, pain/function, illness, concurrent conditioning and training novelty as required inputs, optional inputs or known gaps?
7. Are all AI/heuristic recommendations explainable, versioned, bounded, logged and user-overridable?
8. Can any unauthenticated or malformed request incur AI cost, leak data or generate unsafe advice?

**Required assessment model:**

| State to distinguish | Minimum decision inputs | Permitted output |
|---|---|---|
| Valid progression | Comparable performance, technique/ROM pass, target effort, stable tolerance | Add one rep or the smallest viable load increment, not both plus more volume |
| Hold | Missing/comparability uncertainty, form failure, grinding/failure, poor recovery signal | Repeat, cap optional work, or gather data |
| Fatigue stall | Performance down plus rising fatigue/recovery signals | Reduce back-off volume first; preserve only tolerable quality work |
| Recovered plateau | Stable comparable performance, adherence and recovery, no pain/illness | Change exactly one variable and reassess |
| Pain/symptom concern | Symptom trend and function, including next 24–48 hour response | Modify the provoking loading vector and use escalation wording, never a diagnosis |
| Insufficient evidence | Sparse history, missing RIR/RPE, changed exercise/ROM or unreliable sensor data | Explain uncertainty; do not auto-escalate |

**Required test cases:**
- `PO-01`: all sets reach top of a configured rep range at target effort and form → smallest load increase only.
- `PO-02`: some sets below top range → rep progression, no load increase.
- `PO-03`: form/ROM or pain flag → no automatic load progression.
- `PO-04`: attempted combined load/volume/rest change → one-variable guard prevents it.
- `FAT-01`: comparable output materially down plus fatigue up → conservative volume reduction, not a diagnosis.
- `FAT-02`: poor HRV/recovery proxy alone but stable performance → no automatic deload.
- `PLAT-01`: stable, adherent and recovered over a configured comparable window → candidate plateau, one adjustment only.
- `PLAT-02`: no progression plus fatigue/performance decline → fatigue stall, not plateau.
- `AUD-01`: recommendation records input snapshot, rule/version, confidence, user override and final executed plan.

**Medical and evidence boundary:**
- Numerical thresholds in the manuals are defaults or heuristics unless independently validated for the user. They must not be presented as diagnosis or personal limits.
- The app must never claim “CNS fatigue”, infer tissue damage from pain, diagnose RED-S/injury, or provide clinical clearance.
- Health, cycle, injury, biomarker and nutrition data require explicit consent, a stated decision purpose, and a safe fallback when omitted.

**Validation:**
- Report a gap matrix: manual requirement → current input/data model → current rule → user explanation → test coverage → severity/recommendation.
- Identify which recommendations are deterministic rules and which are LLM-generated. The interface must never disguise a heuristic as personalised medical intelligence.

---

## Task 10: Training-stage and level-system audit

**Objective:** Redesign the level concept in the roadmap so it supports adherence and mastery without prescribing unsafe training volume or rewarding users for ignoring recovery.

**Current implementation to inspect:**
- `web/src/lib/leveling/tier-visuals.tsx`
- `web/src/components/home/{level-chip,tier-promotion-overlay,streak-heatmap}.tsx`
- `web/src/app/(app)/levels/page.tsx`
- Level, tier, XP and streak references across `web/src/**`
- Native equivalents, if any, across `src/**` and `app/**`
- User/profile schema in `supabase/migrations/20260305103051_create_tables.sql`

**Audit principles from the supplied manuals:**
1. Separate **training stage** from gamified level.
   - Training stage is a safety/programming classification: beginner, intermediate or advanced based on current response to training, technique, recovery and progression rate.
   - It must never be advanced simply because a user earns XP, streaks or badges.
2. Separate **exercise mastery** from absolute strength.
   - Mastery should reward technically sound, repeatable, personally appropriate progress, with accessible routes for different equipment and ability.
3. Separate **engagement/process recognition** from overload.
   - Reward planned sessions, safe reduced sessions, weekly reviews, recovery behaviour and returning after a lapse.
   - Never reward pain override, excessive volume, missed rest or training through a deload.
4. Protect sustainability.
   - Deloads, maintenance blocks, modified sessions and planned rest must preserve adherence credit.
   - Streaks should mean “sessions aligned with plan”, not consecutive days of maximal effort.

**Required audit checks:**
1. Map every current XP/tier/streak trigger, display and promotion effect.
2. Determine whether the level system changes programme dose, AI suggestions, user perception of expertise or user behaviour.
3. Test whether illness, travel, pain, deload, accessibility modification and low-readiness sessions cause unfair XP/streak penalties.
4. Identify native/web feature-parity gaps so a user cannot receive conflicting level states.
5. Assess whether current copy causes status pressure, compulsive exercise, body comparison or unsafe progression incentives.
6. Create a three-layer target model:

| Layer | Purpose | Must not do |
|---|---|---|
| Training stage | Conservative programme defaults and progression style | Act as a public score or be earned by XP |
| Exercise/movement mastery | Celebrate skill, technique and personal progress | Require 1RMs, a specific commercial gym or a bodyweight target |
| Process/identity recognition | Support consistency, recovery, reflection and return after lapse | Reward pain override, excessive volume or breaking rest plans |

**Required acceptance criteria:**
- `LVL-01`: XP, streaks and badges alone cannot upgrade training stage.
- `LVL-02`: stage changes require observed training-response evidence, explanation and user confirmation/override.
- `LVL-03`: planned deloads, rest and reduced/recovery sessions retain adherence credit.
- `LVL-04`: XP cannot be earned for overriding pain/recovery warnings.
- `LVL-05`: mastery criteria offer personal-baseline and accessible-equipment pathways; no 1RM is required.
- `LVL-06`: returning after a lapse receives a reduced-volume restart path without losing historic progress.
- `LVL-07`: social ranking/body metrics are opt-in and not required for participation.

**Validation:**
- Produce a current-system map and a proposed target-state diagram.
- Classify each level-system finding as safety, retention, fairness/accessibility, UX or optional delight.
- Do not redesign or implement levels until Sam approves a separate visual/product brief after the audit.

---

## Audit completion criteria

The audit is complete only when:

- Every core journey has a pass/fail/not-tested status for web and native.
- Security and AI-cost exposure are assessed with evidence.
- Offline data integrity is tested or explicitly blocked by lack of a safe environment.
- Existing uncommitted `web/public/sw.js` work is explained and isolated.
- Release readiness is recorded as a binary gate, not a general impression.
- The progressive-overload system has a manual-to-code gap matrix and testable safety/progression criteria.
- The level system has a current-state map plus a safety-first three-layer target model.
- Sam receives a ranked backlog with no more than five recommended immediate fixes.
- No production code, database state, deployment or secret is changed during the audit.
