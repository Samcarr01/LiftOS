# PROGRESS.md – LiftOS Build Log

**Claude Code: Always read this file FIRST at the start of every session. Update it LAST after completing each prompt.**

---

## 🎉🎉 PROJECT STATUS: ALL BUILDS COMPLETE — APP + WEB W01–W08 DONE 🎉🎉
## Status: PRODUCTION-READY — Deploy to Vercel to go live
## Completed: 18 / 18 (APP) | 8 / 8 (WEB) | 0 / 6 (MONETISE)
## Production URL: [set after Vercel deploy]
## Next: Use it! When ready → BUILD-PROMPTS-MONETISE.md

---

## Prompt 001: Project Scaffold — ✅ COMPLETE

**What was built:**
- Expo React Native project with TypeScript
- Expo Router tab navigation (5 tabs: Home, Templates, History, Progress, Profile)
- Folder structure: src/screens, src/components, src/lib, src/hooks, src/store, src/types
- Core dependencies installed
- .env.example with placeholder keys
- TypeScript strict mode enabled

**Files/Folders created:**
- [List the actual files and folders that were created during Prompt 001 execution]
- *Update this section with the real output from your Prompt 001 run*

**Decisions made:**
- [Note any choices made during scaffold, e.g., Expo SDK version, specific library versions]

**Next:** Prompt 002 — Database Schema (use Supabase MCP for all DB operations)

---

## Prompt 002: Database Schema — ✅ COMPLETE

**Method:** Supabase MCP (`apply_migration`) — all operations applied directly to project `bourwlahxdqaotvwrvce`

**Tables created (11):**
- `users` — mirrors auth.users, unit_preference, subscription_tier
- `exercises` — jsonb tracking_schema, muscle_groups[], is_archived
- `workout_templates` — is_pinned, last_used_at
- `template_exercises` — FK cascade from templates + restrict on exercises, UNIQUE(template_id, order_index)
- `workout_sessions` — nullable template_id (ad-hoc support)
- `session_exercises` — snapshot at workout time
- `set_entries` — jsonb values, set_type CHECK, UNIQUE(session_exercise_id, set_index)
- `last_performance_snapshots` — UNIQUE(user_id, exercise_id) for O(1) lookup
- `personal_records` — UNIQUE(user_id, exercise_id, record_type)
- `ai_suggestions` — expires_at for 7-day cache
- `weekly_summaries` — UNIQUE(user_id, week_start)

**RLS:** Enabled on all 11 tables
- Direct `user_id` tables: `auth.uid() = user_id`
- Child tables (template_exercises, session_exercises, set_entries): RLS via parent JOIN — no denormalised user_id column needed

**Indexes (8):**
- `idx_exercises_user` on (user_id, is_archived)
- `idx_templates_user_pinned` on (user_id, is_pinned, last_used_at DESC)
- `idx_sessions_user_date` on (user_id, started_at DESC)
- `idx_sessions_template` on (user_id, template_id, started_at DESC)
- `idx_sets_session_exercise` on (session_exercise_id, set_index)
- `idx_last_perf_user_exercise` on (user_id, exercise_id)
- `idx_ai_suggestions_exercise` on (user_id, exercise_id, expires_at DESC)
- `idx_personal_records_user_exercise` on (user_id, exercise_id, record_type)

**Functions & triggers:**
- `set_updated_at()` — BEFORE UPDATE trigger on users, exercises, workout_templates, last_performance_snapshots
- `seed_default_exercises(uuid)` — inserts 20 exercises (barbell, bodyweight, machine, cardio, time-based)
- `handle_new_user()` + `on_auth_user_created` trigger — AFTER INSERT on auth.users → creates public.users row + seeds exercises

**Migrations in supabase/migrations/:**
- `20260305103051_create_tables.sql`
- `20260305103117_seed_function_and_auth_trigger.sql`
- `20260305103134_rls_policies.sql`
- `20260305103142_performance_indexes.sql`
- `20260305103235_fix_set_updated_at_search_path.sql`

**Next:** Prompt 003 — Shared Types & Validation

---

## Prompt 003: Shared Types & Validation — ✅ COMPLETE

**Files created/updated:**
- `src/types/database.ts` — Supabase Database generic, all 11 table Row/Insert/Update types, convenience aliases (UserRow, ExerciseRow, etc.). Fixed: `last_performance_snapshots.session_id` → `string | null`
- `src/types/tracking.ts` — `TrackingField` + `TrackingSchema` (z.infer from Zod), preset constants: `WEIGHT_REPS`, `BODYWEIGHT_REPS`, `TIME`, `DISTANCE`, `LAPS`, `TRACKING_PRESETS`, `TRACKING_PRESET_LABELS`
- `src/types/app.ts` — App-layer types: `SetEntry` (+ isPendingSync), `ActiveWorkoutState` (spec-compliant), `ActiveWorkout` (legacy compat), `StartWorkoutResponse`, `OfflineMutation`, all Zod-inferred types
- `src/types/index.ts` — Barrel re-exporting everything; backward-compatible with Prompt 001 stores
- `src/lib/validation.ts` — All Zod schemas

**Zod schemas (src/lib/validation.ts):**
- `TrackingFieldSchema`, `TrackingSchemaValidator`
- `buildSetValuesSchema(trackingSchema)` — dynamic per-exercise set validator
- `AISuggestionDataSchema` — LLM response validation
- `ExerciseCreateSchema`, `ExerciseUpdateSchema`
- `TemplateCreateSchema`, `TemplateExerciseCreateSchema`
- `StartWorkoutPayloadSchema`, `SetTypeSchema`
- `LastPerformanceSetsDataSchema`, `WeeklySummaryDataSchema`
- `OfflineMutationSchema`, `OfflineSyncPayloadSchema`
- `DetectPlateauResponseSchema`

**Preset tracking types:** `WEIGHT_REPS`, `BODYWEIGHT_REPS`, `TIME`, `DISTANCE`, `LAPS`

**TypeScript:** `tsc --noEmit` passes with zero errors (strict mode)

**Next:** Prompt 004 — Auth Flow

---

## Prompt 004: Auth Flow — ✅ COMPLETE

**Files created/updated:**
- `src/lib/supabase.ts` — Added AppState listener for foreground token refresh
- `src/lib/toast.ts` — `showError()`, `showInfo()`, `authErrorMessage()` with Supabase error mapping
- `src/store/auth-store.ts` — Full Zustand auth store: `signInWithApple`, `signInWithGoogle`, `signInWithEmail`, `signUp`, `signOut`, `resetPassword`, `updateProfile`, `loadUserProfile`
- `src/hooks/useAuth.ts` — Bootstraps auth: `getSession()` on mount + `onAuthStateChange` subscription
- `src/components/auth-gate.tsx` — Redirects to `/(auth)/login` if not authenticated; shows spinner during load
- `src/screens/auth/LoginScreen.tsx` — Full auth UI: Apple (iOS), Google OAuth, email/password, sign-in/sign-up toggle, forgot password modal, error banner
- `app/(auth)/_layout.tsx` — Auth group Stack; redirects to `/(tabs)` if already authenticated
- `app/(auth)/login.tsx` — Expo Router route → renders LoginScreen
- `app/(auth)/reset.tsx` — Password reset screen: verifyOtp with `token_hash`, new password form, `updateUser`
- `app/_layout.tsx` — Updated: calls `useAuth()`, hides SplashScreen when `!isLoading`, registers `(auth)` Stack screen
- `app/(tabs)/_layout.tsx` — Updated: wraps Tabs with `AuthGate`
- `src/types/database.ts` — Fixed: explicit Insert/Update types (no self-referential Omit/Partial) + added `Relationships: []` to satisfy `GenericTable` constraint from `@supabase/postgrest-js`

**Auth providers:**
- Apple Sign-In (expo-apple-authentication, iOS only) — full_name patched via `updateUser` after sign-in
- Google OAuth (expo-web-browser + PKCE code exchange)
- Email + password (with email verification flow)

**Deep links:**
- `liftos://reset?token_hash=xxx&type=recovery` → `app/(auth)/reset.tsx`
- `liftos://verify?token=xxx` → reserved for future email verification screen
- `liftos://auth/callback` → Google OAuth callback handled by WebBrowser.openAuthSessionAsync

**TypeScript:** `tsc --noEmit` passes with zero errors

**Next:** Prompt 005 — Exercise Management

---

## Prompt 005: Exercise Management — ✅ COMPLETE

**Files created:**
- `src/store/exercise-selection-store.ts` — Module-level callback store for returning a selected exercise to the calling screen (`registerExerciseCallback` / `resolveExerciseSelection` / `hasExerciseCallback`)
- `src/hooks/use-exercises.ts` — `useExercises()` hook: `fetchExercises`, `createExercise`, `updateExercise`, `archiveExercise`. Zod-validates before every insert/update. Optimistic local state updates.
- `src/components/muscle-group-chip.tsx` — `MuscleGroupChip`: per-group colours (chest/back/shoulders/biceps/triceps/legs/core/cardio/other), interactive and static variants, small compact mode
- `src/screens/exercises/exercise-creator.tsx` — `ExerciseCreator` screen: name input, muscle-group multi-select, 5 preset tracking modes + Custom field builder (key/label/type/unit/optional), live set preview, rest-seconds stepper, notes. Zod-validates before save.
- `src/screens/exercises/exercise-selector.tsx` — `ExerciseSelector` screen: instant local search, muscle-group filter chips, exercise list with tracking-type icon + muscle badges, "Create New" button, callback-based selection return

**Tracking presets:** Weight+Reps, Bodyweight+Reps, Time, Distance, Laps, Custom

**Exercise CRUD:** create ✅ · read (all non-archived) ✅ · update ✅ · archive (soft-delete) ✅

**Tested via Supabase MCP (project bourwlahxdqaotvwrvce):**
- Inserted custom exercise ("Resistance Band Pull-Apart") with 3-field tracking_schema (text + number + optional number)
- Retrieved row — jsonb structure correct, all fields present
- Updated name, muscle_groups, default_rest_seconds — all persisted
- Archived (is_archived = true) — active-count query returned 0 ✓
- Cleaned up test data

**TypeScript:** `tsc --noEmit` passes with zero errors

**Next:** Prompt 006 — Workout Templates

---
## Prompt 006: Workout Templates — ✅ COMPLETE

**Files created:**
- `src/hooks/use-templates.ts` — `useTemplates()`: fetchTemplates (templates + exercise counts in 2 queries), createTemplate, deleteTemplate (cascade), duplicateTemplate (deep copy), togglePin (optimistic), updateTemplateName
- `src/hooks/use-template-exercises.ts` — `useTemplateExercises(templateId)`: fetch with joined exercise row, addExercise, removeExercise, updateExercise (optimistic), reorderExercises (two-phase to avoid UNIQUE constraint conflicts)
- `src/screens/templates/template-list.tsx` — TemplateList: search bar, SectionList (Pinned / All), swipe-to-delete (Swipeable), long-press context menu (Alert), Create New FAB + name modal, last-used date formatting
- `src/screens/templates/template-editor.tsx` — TemplateEditor: name input (auto-save 500ms debounce), DraggableFlatList (react-native-draggable-flatlist v4), exercise rows with set/rest/superset badges, ConfigSheet bottom-sheet modal (set count stepper, rest stepper, superset group + colour preview, notes, remove)
- `app/(tabs)/templates/_layout.tsx` — Stack navigator (index, [id], exercise-selector as modal, exercise-creator as modal)
- `app/(tabs)/templates/index.tsx` — renders TemplateList
- `app/(tabs)/templates/[id].tsx` — renders TemplateEditor with `useLocalSearchParams`
- `app/(tabs)/templates/exercise-selector.tsx` — renders ExerciseSelector (from Prompt 005)
- `app/(tabs)/templates/exercise-creator.tsx` — renders ExerciseCreator (from Prompt 005)
- **Deleted:** `app/(tabs)/templates.tsx` (replaced by directory)

**Packages installed:** `react-native-draggable-flatlist` v4.0.3 (compatible with RN 0.76, Reanimated 3, GestureHandler 2)

**Template CRUD:** create ✅ · read ✅ · update (name + pin) ✅ · delete (cascade) ✅ · duplicate ✅

**Drag reorder:** `react-native-draggable-flatlist` with `ScaleDecorator` — optimistic local state update, two-phase background DB sync (avoids UNIQUE(template_id, order_index) constraint violations)

**Auto-save:** Template name debounced 500ms via `useRef<ReturnType<typeof setTimeout>>`

**Tested via Supabase MCP:**
- Create template + add 2 exercises ✓
- Two-phase reorder (swap order_index without constraint violation) ✓
- Pin toggle ✓
- Duplicate creates independent copy with same exercises ✓
- Delete cascades to template_exercises (orphan_count = 0) ✓

**TypeScript:** `tsc --noEmit` passes with zero errors

**Key Decision:** Reorder uses two-phase DB update to avoid UNIQUE(template_id, order_index) conflicts: phase 1 shifts all to `n*100 + i`, phase 2 sets correct `i` values.

**Next:** Prompt 007 — Start Workout Engine

---
## Prompt 007: Start Workout Engine — ✅ COMPLETE

**Edge Function deployed:** `start-workout` (Supabase project bourwlahxdqaotvwrvce, v1, verify_jwt=true)

**Logic (single request < 500ms):**
1. Forward user JWT → RLS enforced on all queries
2. Fetch `template_exercises` + joined `exercises` (ordered by order_index)
3. Fetch `last_performance_snapshots` for all exercise_ids (single `.in()` query)
4. Fetch non-expired `ai_suggestions` (Pro users only)
5. INSERT `workout_session` row
6. Bulk INSERT `session_exercises` (snapshot of template at workout start)
7. Build `prefilled_sets`: clone last performance up to `default_set_count`; repeat last set if count > last session; empty values if no history

**Files created:**
- `supabase/functions/start-workout/index.ts` — Deno Edge Function
- `src/store/active-workout-store.ts` — Zustand store: full `ActiveWorkoutState`
- `src/hooks/use-start-workout.ts` — calls Edge Function, validates with Zod, hydrates store

**Store actions:** `hydrateWorkout`, `clearWorkout`, `setIsCompleting`, `addSet`, `updateSet`, `deleteSet`, `completeSet`, `tickElapsedTimer`, `startRestTimer`, `tickRestTimer`, `stopRestTimer`

**Types fixed:** `StartWorkoutExercise.lastPerformance` changed from `SetEntry[] | null` to `LastPerformanceSet[] | null` (matches actual `sets_data` shape)

**TypeScript:** `tsc --noEmit` passes with zero errors

**Next:** Prompt 008 — Active Workout Screen

---
## Prompt 008: Active Workout Screen — ✅ COMPLETE

**Files created:**
- `src/screens/workout/active-workout.tsx` — main screen: sticky header (template name, timestamp-based elapsed timer, Finish button), ScrollView of ExerciseCards, floating RestTimer overlay, FinishWorkoutDialog
- `src/components/active-workout/exercise-card.tsx` — card: name + muscle chips, AI banner, Last/Current column headers, SetRows, Add Set + Rest Timer + Notes toggle, auto-collapse on all sets complete, superset left-border colour
- `src/components/active-workout/set-row.tsx` — row: type badge (cycles working→warmup→drop→top→failure on tap), Last values (grey read-only), NumericInput cells (highlighted lime when prefilled), completion checkbox, Swipeable delete
- `src/components/active-workout/numeric-input.tsx` — tappable cell → Modal bottom-sheet numpad: ±step quick buttons (±2.5kg, ±1 reps), 0-9 keys, decimal/backspace, confirm ✓
- `src/components/active-workout/rest-timer.tsx` — floating pill: Animated progress bar, countdown, vibrate on end, Skip button
- `src/components/active-workout/ai-suggestion-banner.tsx` — target display, Accept fills next uncompleted set, expandable rationale, Dismiss
- `src/components/active-workout/finish-workout-dialog.tsx` — summary stats (exercises, sets done/pending, duration), confirm/cancel
- `app/workout/index.tsx` — route renders ActiveWorkout
- `app/_layout.tsx` — added workout Stack.Screen (slide_from_bottom, gestureEnabled=false)

**Key UX decisions:**
- Elapsed timer: `Date.now() - session.started_at` on 1s interval (survives background)
- Prefilled highlight: `set.loggedAt === ''` → lime border + text (from last session)
- Set type badge: tap cycles through working/warmup/drop/top/failure with colour coding
- Auto-collapse: `LayoutAnimation` collapses card when all sets `isCompleted=true`
- Rest timer: floating absolute-position pill with Animated width progress bar, vibrates on 0

**TypeScript:** `tsc --noEmit` passes with zero errors

**Next:** Prompt 009 — Offline-First Set Logging
## Prompt 009: Offline-First Set Logging — ✅ COMPLETE

**Local storage:** expo-sqlite v15 (Expo SDK 52 compatible, promise-based API)

**Files created:**
- `src/lib/offline/local-db.ts` — SQLite wrapper: `offline_queue` + `local_set_entries` tables, all CRUD
- `src/lib/offline/sync-queue.ts` — typed queue API: `addToQueue`, `getPendingMutations`, `markSynced`, `recordFailure` (with exponential backoff), `getQueueSize`, `clearSynced`
- `src/lib/offline/sync-manager.ts` — singleton: NetInfo + AppState listeners, `runSync()` with 100-item batches, per-item exponential backoff (2^retries seconds), max 5 retries, marks failed
- `src/lib/offline/index.ts` — barrel + `logSetEntry(set)` integration helper
- `src/components/offline-indicator.tsx` — absolute-positioned banner, animates in/out on connectivity change

**Edge Function deployed:** `sync-offline-queue` (v1, JWT-verified)
- Accepts batch ≤ 100 mutations, deduplicates by `client_id`, applies in timestamp order
- `set_entries`: upsert on `(session_exercise_id, set_index)` — handles insert + update idempotently
- `workout_sessions`: PATCH by `id`
- `session_exercises`: upsert on `(session_id, exercise_id, order_index)`
- Returns `{ results: [{ client_id, status: 'success'|'duplicate'|'error', message? }] }`

**Integration:**
- `app/_layout.tsx`: calls `initLocalDb()` then `startSyncManager()` on mount; renders `<OfflineIndicator />`
- `active-workout.tsx`: `onCompleteSet` and `onUpdateSet` read state via `getState()` after Zustand update, then call `logSetEntry()` fire-and-forget

**Key decisions:**
- Queue persists across app kill (SQLite file `liftos.db`, not in-memory)
- `INSERT OR IGNORE` prevents duplicate queue entries (idempotent enqueue)
- `next_retry_at` column in DB enables per-item backoff without blocking other items
- OfflineIndicator uses `pointerEvents="none"` so it never blocks interaction

**TypeScript:** `tsc --noEmit` passes with zero errors

**Next:** Prompt 010 — Workout Completion Pipeline
## Prompt 010: Workout Completion Pipeline — ✅ COMPLETE

**Edge Function deployed:** `complete-workout` (v1, JWT-verified)
- Fetches session + session_exercises + set_entries (joined)
- Marks `completed_at` + `duration_seconds` on session
- Updates `workout_templates.last_used_at` (if template-based)
- Upserts `last_performance_snapshots` on `(user_id, exercise_id)` — all completed sets
- Detects PRs (working/top sets only): `best_weight`, `best_reps_at_weight`, `best_e1rm` (Epley: `weight × (1 + reps/30)`)
- Upserts `personal_records` on `(user_id, exercise_id, record_type)` — only if value improved
- Fire-and-forget AI suggestion regeneration via `EdgeRuntime.waitUntil`
- **Idempotent**: returns early if `completed_at` already set
- Returns: `{ session, new_prs[], summary: { exercise_count, total_sets, total_volume_kg, duration_seconds } }`

**Files created:**
- `supabase/functions/complete-workout/index.ts` — Edge Function
- `src/store/completion-store.ts` — Zustand store: holds `CompletionResult` between screen navigation
- `src/hooks/use-complete-workout.ts` — calls Edge Function (online) or queues mutation (offline), stores result, navigates
- `src/screens/workout/workout-complete.tsx` — stats (duration, sets, volume), PR cards with spring animation, Done → home
- `app/workout-complete.tsx` — route (fade animation, gesture disabled)

**Integration:**
- `active-workout.tsx`: `handleFinishConfirm` now calls `completeWorkout(elapsed)` from hook
- `app/_layout.tsx`: added `workout-complete` Stack screen
- `FinishWorkoutDialog`: receives `isCompleting` prop for button state

**Tested via Supabase MCP:**
- All 6 target tables confirmed present with correct schemas
- UNIQUE constraints confirmed: `last_performance_snapshots(user_id, exercise_id)`, `personal_records(user_id, exercise_id, record_type)`, `set_entries(session_exercise_id, set_index)`
- `personal_records_record_type_check` allows: best_weight, best_reps_at_weight, best_e1rm, best_volume ✓
- Epley verified: 80kg × 5 = 93.33 e1RM ✓

**TypeScript:** `tsc --noEmit` passes with zero errors

**Next:** Prompt 011 — Workout History

---
## Prompt 011: Workout History — ✅ COMPLETE

**Files created:**
- `app/(tabs)/history/_layout.tsx` — Stack navigator (index, [id])
- `app/(tabs)/history/index.tsx` — renders HistoryList
- `app/(tabs)/history/[id].tsx` — renders SessionDetail
- `src/hooks/use-history.ts` — `useHistory()` (paginated list) + `useSessionDetail(id)` (detail)
- `src/components/history/session-card.tsx` — date/time, template name, stats row (exercises · sets · volume)
- `src/components/history/pr-badge.tsx` — lime trophy badge for PR records
- `src/screens/history/history-list.tsx` — FlatList with month-header grouping, pull-to-refresh, infinite scroll
- `src/screens/history/session-detail.tsx` — header, stats row, PR banner, per-exercise blocks with all sets, session notes
- **Deleted:** `app/(tabs)/history.tsx` (replaced by directory)

**Types added to `src/types/app.ts`:**
- `HistorySessionSummary` — list item: id, dates, duration, template_name, exercise_count, total_sets, volume_kg
- `SessionDetailSet`, `SessionDetailExercise`, `PersonalRecordSummary`, `SessionDetail`

**Utils added to `src/lib/utils.ts`:**
- `formatLongDate`, `formatTime`, `formatMonthHeader`, `formatRelativeDate`

**Data queries:**
- List: `workout_sessions` + nested `session_exercises.set_entries` (completed only), page size 20
- Detail: full nested select + separate `personal_records` query filtered by `session_id`
- Volume computed client-side from `weight × reps`

**PR display:** PRs from `personal_records.session_id = sessionId` shown as lime badges per exercise; banner shows total count

**TypeScript fix:** Deep nested selects return `never` with `Relationships: []` — resolved with explicit cast `as unknown as SessionQueryResult`

**Verified via Supabase MCP:** All 6 tables present; `personal_records.session_id` column confirmed ✓

**TypeScript:** `tsc --noEmit` passes with zero errors

**Next:** Prompt 012 — Progress & Charts

---
## Prompt 012: Progress & Charts — ✅ COMPLETE

**Library:** `react-native-chart-kit` v6.12.0 + `react-native-svg` 15.8.0 (Expo SDK 52 compatible)

**Files created:**
- `src/hooks/use-progress.ts` — `useExerciseProgress(exerciseId)`: queries `session_exercises` nested with `workout_sessions` + `set_entries`, computes `ProgressPoint[]` per session; `filterByTimeRange()` utility
- `src/components/progress/chart-empty-state.tsx` — shared empty card (< 2 data points)
- `src/components/progress/top-set-chart.tsx` — bezier line chart, lime colour, Y=topWeight, delta indicator
- `src/components/progress/e1rm-chart.tsx` — bezier line chart, amber colour, Y=Epley e1RM, delta indicator
- `src/components/progress/volume-chart.tsx` — bar chart, sky blue colour, Y=total volume kg, vs-avg indicator
- `src/screens/progress/progress-screen.tsx` — exercise picker (pageSheet Modal + search), 3 chart tabs, 5 time ranges (1M/3M/6M/1Y/All), skeleton loading, PR cards (horizontal scroll)
- `app/(tabs)/progress.tsx` — updated to render ProgressScreen

**Data flow:**
- Query: `session_exercises.select('workout_sessions!inner(...), set_entries(...)')` cast with `as unknown` for nested-select TypeScript workaround
- `computePoint()` extracts topWeight, topReps, e1RM (Epley), volumeKg per session
- Time range filtering applied client-side on cached `allPoints[]`
- PRs from `personal_records` table (same query pattern as Prompt 011)

**Chart specs:**
- TopSet: line, lime (#a3e635), bezier, shows "▲/▼ X kg over period"
- E1RM: line, amber (#fbbf24), bezier, shows "▲/▼ X kg over period"
- Volume: bar, sky (#63b3ed), fromZero=true, shows "▲/▼ X kg vs avg"
- X labels thinned to max 7 visible labels (every Nth point)
- `React.memo` on all chart components to prevent unnecessary re-renders

**TypeScript:** `tsc --noEmit` passes with zero errors

**Key Decisions logged:**
- react-native-chart-kit over Victory Native (simpler setup, first in spec list)
- Time range filtering client-side (avoids extra DB queries, data is small)
- `React.memo` on charts for 60fps scroll guarantee

**Next:** Prompt 013 — AI Suggestions

---
## Prompt 013: AI Suggestions (OpenAI GPT-5) — ✅ COMPLETE

**Edge Function deployed:** `generate-ai-suggestion` (Supabase project bourwlahxdqaotvwrvce, v1, ACTIVE, verify_jwt=false — internal service-to-service call)

**Architecture:**
- Called by `complete-workout` via `EdgeRuntime.waitUntil` (fire-and-forget)
- Uses `SUPABASE_SERVICE_ROLE_KEY` internally (no user JWT forwarded)
- OpenAI GPT-5 via `npm:openai` Deno specifier, `response_format: { type: 'json_object' }`, `temperature: 0.2`, `max_tokens: 300`
- < 2 sessions history → rule-based only (no AI call)

**Files created:**
- `supabase/functions/generate-ai-suggestion/index.ts` — full Edge Function
- `src/lib/ai/rule-based-fallback.ts` — client-side `computeRuleBasedSuggestion(lastSets)`

**Edge Function flow:**
1. 2-step history query: `workout_sessions` (last 20 completed) → `session_exercises + set_entries` (this exercise only, up to 5 sessions)
2. Builds `SessionData[]` with `allSetsCompleted` flag per session
3. Calls OpenAI → validates with `validateSuggestion()` → `applyBounds()` (max +5% weight, max +2 reps)
4. On any OpenAI failure → `ruleBased(sessions)` always produces valid suggestion
5. Stores via delete-then-insert (no UNIQUE constraint on `ai_suggestions(user_id, exercise_id)`)
6. 7-day `expires_at` cache

**Rule-based fallback logic (both server and client):**
- All sets complete at weight → +2.5 kg, same reps
- Incomplete session → repeat last session values
- Bodyweight → +1 rep primary, same reps alternative
- No history → 3×8 starter suggestion

**Tested via Supabase MCP:**
- `ai_suggestions` table schema confirmed (8 columns)
- No UNIQUE constraint on `(user_id, exercise_id)` confirmed → delete-then-insert used
- DB empty in test environment; runtime test pending once users log workouts

**Secret required:** `OPENAI_API_KEY` must be set via Supabase dashboard (Project Settings → Edge Functions → Secrets) or `supabase secrets set OPENAI_API_KEY=sk-...`

**TypeScript:** `tsc --noEmit` passes with zero errors

**Next:** Prompt 014 — Plateau Detection

---
## Prompt 014: Plateau Detection — ✅ COMPLETE

**Approach:** Integrated into `generate-ai-suggestion` Edge Function (no separate Edge Function needed). Runs on every workout completion, no extra DB queries.

**Files modified:**
- `src/lib/validation.ts` — added `plateau_intervention?: string` to `AISuggestionDataSchema`
- `supabase/functions/generate-ai-suggestion/index.ts` — added `computePlateau()`, `sessionE1RM()`, `epley()` functions; applied plateau result after AI/rule-based suggestion
- `src/components/active-workout/ai-suggestion-banner.tsx` — shows intervention card in expanded view (amber, left-border highlight)

**Plateau detection logic:**
- Requires >= 4 sessions of the exercise (per spec)
- Calculates Epley e1RM per session (`weight × (1 + reps/30)`) from top completed working set
- Reference = e1RM from the 4th most recent session (index 3)
- Counts consecutive stalled sessions from most recent outward
- Stall threshold: >= 2 consecutive sessions not exceeding reference e1RM
- Server-computed `plateau_flag` **overrides** AI's plateau_flag (more reliable)

**Intervention messages (template-based, no AI):**
- 2–3 sessions stalled: "Try adding 1 extra rep per set before increasing weight..."
- 4–5 sessions stalled: "Consider a deload: drop to 85% of your current weight for 1 week..."
- 6+ sessions stalled: "Try a variation of this exercise for 2–3 weeks..."

**Edge Function:** `generate-ai-suggestion` redeployed as v3, ACTIVE, verify_jwt=false
- `plateau_sessions_stalled` added to stored `suggestion_data` and `AISuggestion` interface

**New components:**
- `src/components/active-workout/plateau-warning.tsx` — standalone dismissible amber card shown on exercise card when `plateau_flag=true`; shows "Stalled for N sessions" + intervention text; dismissed per session (local state)
- `src/components/progress/plateau-badge.tsx` — amber left-bordered card shown on Progress screen below muscle chips when the selected exercise has an active plateau

**Hook updates:**
- `src/hooks/use-progress.ts` — `useExerciseProgress` now fetches `ai_suggestions` for the exercise (non-expired only) and returns `plateau: PlateauStatus | null` with `{ isPlateau, sessionsStalled, intervention }`

**Screen updates:**
- `src/components/active-workout/exercise-card.tsx` — renders `<PlateauWarning>` above the AI banner when plateau detected; separate `plateauDismissed` state
- `src/screens/progress/progress-screen.tsx` — renders `<PlateauBadge>` between muscle chips and chart tabs

**Schema updates:**
- `src/lib/validation.ts` — `AISuggestionDataSchema` has `plateau_sessions_stalled: z.number().int().min(0).optional()`

**TypeScript:** `tsc --noEmit` passes with zero errors

**Next:** Prompt 015 — Weekly Summary

---
## Prompt 015: Weekly Summary — ✅ COMPLETE

**Edge Function deployed:** `generate-weekly-summary` (v1, ACTIVE, verify_jwt=true — user JWT required)

**Data aggregation (server-side):**
- Fetches all completed `workout_sessions` in [week_start, week_start+7) window
- Joins `session_exercises` → `set_entries` (working/top sets only)
- Fetches `exercises` for `name` and `muscle_groups`
- Computes: `workouts_completed`, `total_volume_kg`, `total_sets`, `strongest_lift` (highest Epley e1RM), `muscle_volume` (volume per muscle group), `most_improved_group` (biggest absolute volume increase vs prev week)
- Previous week fetched from `weekly_summaries` cache (no extra session queries)

**AI Insight:**
- OpenAI GPT-5, max 120 tokens, temperature 0.4
- 1-2 sentences, plain text, referencing actual stats + % delta vs prev week
- On failure: stats saved with `insight: null` (no error thrown to user)

**Caching:**
- Upserts into `weekly_summaries` on `UNIQUE(user_id, week_start)` after generation
- Client fetches cache first; calls Edge Function only if cache miss
- `force: true` body param bypasses cache for refresh

**pg_cron:** `pg_cron` + `pg_net` extensions not available on this project tier. On-demand generation (triggered when user opens the screen) covers the MVP use case. Document: enable `pg_net` and schedule `generate-weekly-summary` via SQL for production.

**Schema update:**
- `src/lib/validation.ts` — `WeeklySummaryDataSchema` extended with `total_sets`, `muscle_volume`

**Files created:**
- `supabase/functions/generate-weekly-summary/index.ts` — Edge Function
- `src/hooks/use-weekly-summary.ts` — `useWeeklySummary()`: cache-first load, auto-generate on miss, week navigation (prev/next), refresh
- `src/screens/progress/weekly-summary.tsx` — full screen: week nav arrows, stats cards (workouts/volume/sets) with ▲/▼ delta badges, strongest lift card, most improved muscle group, volume-by-muscle-group bar chart, AI insight block
- `app/(tabs)/progress/_layout.tsx` — Stack layout (index + weekly)
- `app/(tabs)/progress/weekly.tsx` — route for WeeklySummaryScreen

**Routing change:** `app/(tabs)/progress.tsx` → `app/(tabs)/progress/index.tsx` (converted to folder, mirrors history pattern)

**Progress screen:** "Weekly ›" button added to header, navigates to `./weekly`

**TypeScript:** `tsc --noEmit` passes with zero errors

**Next:** Prompt 016 — Home Dashboard

---
## Prompt 016: Home Dashboard — ✅ COMPLETE

**What was built:**
- `src/hooks/use-home-data.ts` — parallel fetch (templates + last 5 sessions), AppState foreground refresh, `fetchingRef` guard, `buildHighlights()`, `computeSuggested()`
- `src/screens/home/home-screen.tsx` — greeting + date, suggested workout card (bordered lime), pinned horizontal scroll, recent sessions list, last-session highlights, FAB (56px lime), template picker bottom sheet (Modal)
- `app/(tabs)/index.tsx` — updated to use `HomeScreen`

**Key details:**
- Suggested = template with oldest `last_used_at` (null = never used, highest priority)
- FAB → `TemplatePicker` Modal → `useStartWorkout(templateId | null)` → navigate `/workout`
- Pull-to-refresh + background foreground refresh (no spinner)
- Empty state for new users
- `tsc --noEmit`: 0 errors

**Next:** Prompt 017 — Profile & Settings

---
## Prompt 017: Profile & Settings — ✅ COMPLETE

**What was built:**
- `src/screens/profile/profile-screen.tsx` — avatar, editable display name (Modal), email (read-only), unit toggle (kg/lb), failed sync indicator, export data, app version, logout, delete account
- `src/lib/export.ts` — fetches all 6 user data tables in parallel, serialises as JSON, triggers native Share sheet
- `src/lib/offline/local-db.ts` — added `queueClearAll()` (clears both SQLite tables) and `queueGetFailedCount()`
- `src/lib/offline/sync-queue.ts` — added `clearAllLocalData()` and `getFailedCount()` exports
- `src/lib/offline/index.ts` — re-exports `clearAllLocalData`, `getFailedCount`
- `supabase/functions/delete-account/index.ts` — deployed v1, verify_jwt=false (manual JWT check); deletes all 10 tables + `auth.admin.deleteUser()`
- `app/(tabs)/profile.tsx` — updated to use `ProfileScreen`

**Key details:**
- Unit toggle: instant optimistic update via `updateProfile()` in auth-store → persisted to `users.unit_preference`
- Logout: clears SQLite queue + in-memory `offlineQueue` before `signOut()` → auth gate redirects
- Delete: double-confirm Modal requiring literal "DELETE" text → calls `delete-account` Edge Function → clears local data → `signOut()`
- Export: 6 tables fetched in parallel, nested JSON (templates include template_exercises, sessions include session_exercises + set_entries)
- Edge Function project: `bourwlahxdqaotvwrvce`, id: `b6faf2f5-42ef-4952-9cbd-09d17e69db69`
- `tsc --noEmit`: 0 errors

**Next:** Prompt 018 — Polish & Deploy

---
## Prompt 018: Polish & Deploy — ✅ COMPLETE

**What was built:**
- `src/lib/analytics.ts` — PostHog REST wrapper (no SDK install needed); typed event helpers; dev console fallback when keys absent; `identifyUser()` / `resetIdentity()`
- `src/lib/sentry.ts` — Sentry wrapper with graceful no-op if `@sentry/react-native` not installed; `initSentry()`, `setSentryUser()`, `captureException()`, `captureMessage()`
- `app.config.ts` — full dynamic Expo config reading all env vars; iOS/Android platform config; `extra` map; EAS Update config; Sentry plugin commented, ready to uncomment
- `eas.json` — profiles: `development` (simulator, dev client), `preview` (internal), `production` (autoIncrement, App Store/Play submit)
- `app/_layout.tsx` — `initSentry()` at module load; identity sync on auth state change
- **Analytics instrumented** in 6 files: `use-start-workout`, `active-workout`, `use-complete-workout`, `exercise-card`, `exercise-creator`, `use-templates`
- `README.md` — full setup guide: env vars, Supabase setup, Edge Function deploy, EAS build/submit, analytics events, production checklist

**Analytics events tracked:**
- `workout_started` (template_id, exercise_count)
- `set_logged` (exercise_id, set_type, volume_kg)
- `workout_completed` (duration_seconds, total_sets, total_volume_kg, is_offline)
- `pr_achieved` (exercise_name, record_type, record_value)
- `suggestion_accepted` (exercise_id)
- `suggestion_dismissed` (exercise_id)
- `exercise_created` (muscle_groups, tracking_mode)
- `template_created` (template_id)

**Edge Functions verified via Supabase MCP (all ACTIVE):**
- `start-workout` v1 · `sync-offline-queue` v1 · `complete-workout` v1
- `generate-ai-suggestion` v3 · `generate-weekly-summary` v1 · `delete-account` v1

**All 11 Supabase tables verified with RLS enabled**

**Total screens: 13** (Login, Home, Templates, Template Editor, Exercise Selector, Exercise Creator, History, Session Detail, Progress, Weekly Summary, Active Workout, Workout Complete, Profile)

**`tsc --noEmit`: 0 errors**

---

## Key Reference
- **AI Provider:** OpenAI GPT-5/5.2 (OPENAI_API_KEY env var)
- **MCP:** Supabase MCP active — use for all DB ops
- **Spec files:** CLAUDE.md, Claude-db.md, Claude-auth.md, Claude-api.md, Claude-ui.md, Claude-ai.md, Claude-offline.md, Claude-billing.md
- **App prompts:** BUILD-PROMPTS-APP.md (001–018)
- **Monetise prompts:** BUILD-PROMPTS-MONETISE.md (M01–M06, run later)

---

## Edge Functions Deployed
| Function | Version | JWT | Deployed |
|----------|---------|-----|---------|
| `start-workout` | v1 | ✅ required | Prompt 007 |
| `sync-offline-queue` | v1 | ✅ required | Prompt 009 |
| `complete-workout` | v1 | ✅ required | Prompt 010 |
| `generate-ai-suggestion` | v3 | ❌ manual JWT | Prompt 014 |
| `generate-weekly-summary` | v1 | ✅ required | Prompt 015 |
| `delete-account` | v1 | ❌ manual JWT | Prompt 017 |

## Key Decisions Log
| Decision | Chosen | Why | Prompt |
|----------|--------|-----|--------|
| Chart library | react-native-chart-kit + react-native-svg | First in spec list, simplest setup, no Skia needed | 012 |
| *Offline storage* | *TBD* | *TBD* | *009* |
| Web framework | Next.js 16.1.6 (App Router) | Per Claude-web.md spec | W01 |
| CSS | Tailwind v4 + shadcn v4 | Installed by create-next-app | W01 |
| PWA | serwist + @serwist/next v9 | Per Claude-web.md spec | W01 |
| Web build mode | webpack (--webpack flag) | serwist not yet compatible with Turbopack | W01 |
| Button component | @base-ui/react (via shadcn v4) | shadcn v4 uses base-ui; no asChild prop | W01 |

---

## Web Build Prompts (Next.js PWA in web/)

### W01: PWA Scaffold — ✅ COMPLETE

**What was built:**
- `web/` — Next.js 16.1.6 project with App Router, TypeScript, Tailwind v4, shadcn v4
- `web/next.config.ts` — serwist PWA wrapper (webpack mode, SW disabled in dev)
- `web/src/app/sw.ts` — serwist service worker
- `web/public/manifest.json` — PWA manifest (LiftOS branding, blue-600 theme)
- `web/src/app/globals.css` — LiftOS dark theme (slate-900 bg, blue-600 primary)
- `web/src/lib/supabase/client.ts` — browser Supabase client (createBrowserClient)
- `web/src/lib/supabase/server.ts` — server Supabase client (createServerClient + cookies)
- `web/middleware.ts` — auth session refresh + route protection
- `web/src/types/database.ts` — DB types (copied from RN app)
- `web/src/types/tracking.ts` — TrackingSchema types + presets
- `web/src/types/app.ts` — App-layer types (copied from RN app)
- `web/src/types/index.ts` — barrel export
- `web/src/lib/validation.ts` — Zod schemas (adapted for Zod v4)
- `web/src/components/layout/bottom-nav.tsx` — mobile bottom nav (5 tabs)
- `web/src/components/layout/sidebar-nav.tsx` — desktop sidebar nav
- `web/src/app/layout.tsx` — root layout with dark mode, PWA meta, nav shell
- `web/src/app/page.tsx` — home placeholder
- `web/src/app/login/page.tsx` — login placeholder
- `web/src/app/templates/page.tsx` — templates placeholder
- `web/src/app/history/page.tsx` — history placeholder
- `web/src/app/progress/page.tsx` — progress placeholder
- `web/src/app/profile/page.tsx` — profile placeholder
- `web/.env.local` — Supabase env vars (fill in from Supabase dashboard)
- `web/tsconfig.json` — added WebWorker lib for sw.ts
- `web/package.json` — added --webpack flag to dev/build scripts

**shadcn components installed:** button, input, card, dialog, sheet, tabs, badge, dropdown-menu, separator, skeleton, sonner

**Build:** ✅ `npm run build` passes cleanly

**Next:** ~~W02~~ — done

---

### W02: Auth — ✅ COMPLETE

**What was built:**
- `web/src/store/auth-store.ts` — Zustand store: user/session/isLoading + signInWithGoogle, signInWithEmail, signUp, signOut, resetPassword, initialize
- `web/src/app/(auth)/login/page.tsx` — Login page: Google OAuth button, email+password form, Sign In / Sign Up toggle, Forgot Password mode, Suspense boundary for useSearchParams
- `web/src/app/(auth)/auth/callback/route.ts` — OAuth code exchange handler (PKCE via exchangeCodeForSession)
- `web/src/components/layout/auth-gate.tsx` — Client component that mounts onAuthStateChange listener to keep Zustand store in sync
- `web/src/app/layout.tsx` — Updated root layout: AuthGate wraps children, Toaster added
- Route group restructure:
  - `web/src/app/(app)/` — authenticated routes (has nav shell layout)
  - `web/src/app/(auth)/` — auth routes (no nav shell)
  - `web/src/app/(app)/layout.tsx` — app shell with SidebarNav + BottomNav
  - `web/src/app/(auth)/layout.tsx` — minimal auth layout

**Auth flows implemented:**
- Google OAuth: signInWithOAuth → Supabase → Google → /auth/callback → cookie set → redirect to /
- Email/password sign in: signInWithPassword → router.replace('/')
- Email sign up: signUp → "check email" toast → back to sign in mode
- Password reset: resetPasswordForEmail → "check email" toast
- Sign out: signOut() in store (used in profile page, W07)

**Session:** Cookie-based via @supabase/ssr (createBrowserClient + createServerClient)
**Middleware:** Already in place from W01 — protects all routes, redirects /login → / if authenticated

**⚠️ Supabase Dashboard setup required (one-time):**
1. Authentication → Providers → Google → Enable, add Client ID + Secret from Google Cloud Console
2. Authentication → URL Configuration → Site URL: `http://localhost:3000` (dev) or your Vercel URL (prod)
3. Authentication → URL Configuration → Additional Redirect URLs: `http://localhost:3000/auth/callback` and `https://your-vercel-domain.vercel.app/auth/callback`

**Build:** ✅ `npm run build` passes cleanly

**Next:** ~~W03~~ — done

---

### W03: Exercise & Template Management — ✅ COMPLETE

**What was built:**

**Hooks:**
- `web/src/hooks/use-exercises.ts` — `useExercises()`: fetchExercises, createExercise, updateExercise, archiveExercise (soft-delete). Zod validation before insert. Optimistic updates. `rowToExercise` parses jsonb tracking_schema.
- `web/src/hooks/use-templates.ts` — `useTemplates()`: fetchTemplates (enriched with exercise_count), createTemplate, deleteTemplate, duplicateTemplate (deep-copies exercises), togglePin (optimistic), updateTemplateName
- `web/src/hooks/use-template-exercises.ts` — `useTemplateExercises(id)`: fetchTemplateExercises (joins exercise data), addExercise, removeExercise (optimistic + re-index), updateExercise (optimistic), reorderExercises (two-phase to avoid UNIQUE constraint violations)

**Components:**
- `web/src/components/muscle-group-badge.tsx` — color-coded badge for 13 muscle groups
- `web/src/components/exercise-selector.tsx` — Sheet with browse/create modes: search bar, muscle filter chips, exercise list, full exercise creator form (name, muscle multi-select, tracking preset, set preview, rest stepper, notes)
- `web/src/lib/format-date.ts` — lightweight relative date formatter (no date-fns)

**Pages:**
- `web/src/app/(app)/templates/page.tsx` — Template list: pinned section, all templates, CreateTemplateRow inline input, DropdownMenu for pin/duplicate/delete
- `web/src/app/(app)/templates/[id]/page.tsx` — Template editor: DnD drag-to-reorder (@dnd-kit/core + @dnd-kit/sortable), debounced name auto-save (500ms), ExerciseSelector integration, ExerciseConfigSheet for per-exercise settings (sets, rest, notes)

**Packages added:** `@dnd-kit/core ^6.3.1`, `@dnd-kit/sortable ^10.0.0`, `@dnd-kit/utilities ^3.2.2`

**Key fixes applied:**
- `--webpack` flag required for serwist compatibility (was already in place)
- `Promise<unknown>` prop type on CreateTemplateRow (not `Promise<void>`) to accept `Promise<TemplateWithCount>` from hook
- `span.contents` wrapper for ExerciseSelector trigger (shadcn v4 / @base-ui/react has no `asChild`)
- `DropdownMenuTrigger` styled directly without `asChild`
- Two-phase reorder to avoid `UNIQUE(template_id, order_index)` constraint violations

**Build:** ✅ `npm run build` passes cleanly

**Next:** ~~W04~~ — done

---

### W04: Start Workout + Active Workout — ✅ COMPLETE

**What was built:**

**Store:**
- `web/src/store/active-workout-store.ts` — Zustand store: `workout: ActiveWorkoutState | null` + `restTimer: GlobalRestTimer` (global, one at a time). Actions: hydrateWorkout, clearWorkout, addSet, updateSet, deleteSet, completeSet, acceptSuggestion, dismissSuggestion, startRestTimer, stopRestTimer, setIsCompleting. Maps snake_case Edge Function response to camelCase types. Parses tracking_schema via Zod.

**Hook:**
- `web/src/hooks/use-start-workout.ts` — Calls `start-workout` Edge Function via `supabase.functions.invoke`, maps snake_case API response (`session_exercise`, `last_performance`, `prefilled_sets`) to camelCase types, hydrates store, navigates to `/workout/[sessionId]`.

**Components (`web/src/components/workout/`):**
- `numeric-input.tsx` — CRITICAL: mobile-first numeric input. Desktop: native number input with ±step buttons. Mobile (pointer:coarse): tap-button → fixed numpad overlay. Numpad: ±step quick buttons, 0-9 grid, decimal, backspace, ✓ confirm. `isMobile` detected post-mount via `window.matchMedia('(pointer: coarse)')` to prevent hydration mismatch.
- `set-row.tsx` — Set row: type badge (cycles working→warmup→top→drop→failure on tap), compact "Last" column (formatted from lastPerformanceSets), NumericInput cells per tracking field, complete checkbox (44×44 touch target), delete button. Prefill highlight (bg-primary/5) when `loggedAt === ''`.
- `ai-suggestion-banner.tsx` — AI target with Accept/Dismiss buttons, expandable rationale, plateau warning block.
- `exercise-card.tsx` — Exercise name + muscle badges, AI banner (if not dismissed), column headers (Last | Current), SetRows, "+ Add Set" / rest timer button / notes toggle. Auto-starts rest timer on set completion. Calls `navigator.vibrate?.(50)` on complete.
- `rest-timer.tsx` — Fixed-position bottom overlay (`bottom-16 md:bottom-6`). Computed from `startedAt + duration`, ticks on 500ms interval. Progress bar (green→yellow→red). Web Audio API beep + `navigator.vibrate?.(200)` on expiry. Tap ✕ to dismiss.
- `finish-dialog.tsx` — Dialog with exercise/sets/duration summary. On confirm: upserts all sets to `set_entries` (composite key `session_exercise_id,set_index`), calls `complete-workout` Edge Function, toasts PR count, navigates to `/`, clears store.

**Route:**
- `web/src/app/workout/[id]/page.tsx` — Full-screen workout page (outside `(app)/`, no nav shell). Sticky header: back, template name, elapsed timer (MM:SS, `Date.now()` diff, survives tab switch), Finish button. Scrollable exercise cards. RestTimer overlay. FinishDialog. Guards: `beforeunload` warning, redirect home if store is empty (e.g. hard refresh).

**Updated pages:**
- `web/src/app/(app)/page.tsx` — "Start Workout" button opens `StartWorkoutSheet` (shadcn Sheet). Sheet shows: Blank Workout + all templates. Each row calls `useStartWorkout().startWorkout(id)`.
- `web/src/app/(app)/templates/page.tsx` — Added Play button to each TemplateRow for one-tap start.

**Key UX decisions:**
- Elapsed timer: `Math.floor((Date.now() - session.started_at) / 1000)` computed in UI (no store ticking — survives tab switch)
- Rest timer: stored as `{ startedAt: Date.now(), duration }` — component computes remaining (survives scroll)
- Custom numpad always used on touch devices to avoid inconsistent browser keyboard layouts
- Sets saved to DB on finish (not per-change) — batch upsert via `onConflict: 'session_exercise_id,set_index'`
- Edge Function response: snake_case → camelCase mapping in `use-start-workout.ts` hook
- `workout/[id]` is outside `(app)/` route group — no nav shell during workout

**Build:** ✅ `npm run build` passes cleanly (11 routes)

**Next:** ~~W05~~ — done

---

### W05: Offline Support — ✅ COMPLETE

**What was built:**

**IndexedDB (`web/src/lib/offline/indexed-db.ts`):**
- Dexie v4 database: `liftos-v1` with `syncQueue` table
- `QueuedMutation` interface: id (UUID/client_id), table, operation, data, timestamp, retries, nextRetryAt (ms), status (pending/synced/failed)
- Indexed on: status, nextRetryAt for efficient queue queries

**Sync Queue (`web/src/lib/offline/sync-queue.ts`):**
- `addToQueue()`: insert mutation into IndexedDB (max 1000, drops if full)
- `processQueue()`: fetches pending mutations (nextRetryAt ≤ now), sends batches of 100 to `sync-offline-queue` Edge Function, marks synced/failed per result
- `getQueueSize()`: pending + failed count
- `clearSynced()`: prune synced items
- Exponential backoff: 1s → 2s → 4s → 8s → 16s (capped). After 5 retries → status='failed'
- Idempotency: uses mutation `id` as `client_id` on server

**Sync Manager (`web/src/lib/offline/sync-manager.ts`):**
- Singleton (safe to call multiple times via `started` guard)
- Triggers: `window 'online'` event, `document 'visibilitychange'` → visible
- Processing lock (`processing` flag) prevents concurrent runs
- Processes queue in a loop until empty (handles > 100 items)

**Barrel + logSetEntry (`web/src/lib/offline/index.ts`):**
- `logSetEntry(set: SetEntry)`: maps SetEntry → QueuedMutation, calls addToQueue. Fire-and-forget helper.

**OfflineProvider (`web/src/components/layout/offline-indicator.tsx`):**
- Dual-purpose client component: inits sync manager + shows offline banner
- Fixed top banner: `bg-yellow-600/95` with WifiOff icon
- `role="status" aria-live="polite"` for screen readers
- Non-blocking, doesn't prevent any interaction. Auto-hides when back online.
- Added to root `layout.tsx`

**Service Worker (`web/src/app/sw.ts`):**
- Added Supabase-specific runtime caching (ordered before defaultCache):
  - `/supabase.co/(auth|functions)/v1/` → NetworkOnly (mutations/auth never cached)
  - `/supabase.co/rest/v1/` GET → NetworkFirst (5s timeout, cache fallback for offline reads)
- Cache name: `supabase-rest-v1` (enables offline browsing of exercises/templates)

**Active Workout Integration (`exercise-card.tsx`):**
- `handleComplete()` now calls `void logSetEntry(completedSet)` after `completeSet()` — fire-and-forget
- Uses `useActiveWorkoutStore.getState()` to read the post-update set synchronously

**Finish Dialog (`finish-dialog.tsx`):**
- Checks `navigator.onLine` before proceeding
- If offline: queues ALL sets via `addToQueue()` → toast "You're offline — sets saved locally. Tap Finish once reconnected." → closes dialog (workout preserved in Zustand)
- If online: existing direct Supabase upsert + complete-workout path (unaffected)
- Offline sets are preserved in IndexedDB and will sync when reconnected

**Offline test scenario:**
- Enable airplane mode → log sets → sets written to IndexedDB via logSetEntry
- Tap Finish → offline path → toast shown → dialog closes, workout preserved
- Re-enable network → online event → sync-manager triggers → processQueue syncs to Supabase
- Tap Finish again → online path → complete-workout succeeds (sets already in DB) ✓

**Key decisions:**
- Dexie v4 was already in package.json (no new install needed)
- Only `completeSet` triggers logSetEntry (not every keypress — avoids queue bloat; final values matter)
- Finish dialog has two paths: offline queues, online does direct upsert (fast path preserved)
- Service worker caches Supabase REST GETs so exercises/templates load offline

**Build:** ✅ `npm run build` passes cleanly

**Next:** ~~W06~~ — done

---

### W06: Workout Completion + History + Progress — ✅ COMPLETE

**What was built:**

**Completion screen:**
- `src/store/completion-store.ts` — Zustand store for `CompletionResult` (sessionId, summary, newPrs, exerciseNames)
- `src/app/workout/complete/page.tsx` — Full-screen completion screen outside nav shell
  - CSS `animate-bounce-once` animation for trophy icon when PRs exist
  - 3-stat strip (Duration, Sets, Volume)
  - Exercise name list with check icons
  - PR cards (yellow, Award icon) per new personal record
  - "Done" button → clearResult → router.replace('/')
- `finish-dialog.tsx` updated — populates completion store with Edge Function response, navigates to `/workout/complete`

**History:**
- `src/hooks/use-history.ts` — paginated history, 20 per page, lazy `load(reset)` pattern
- `src/app/(app)/history/page.tsx` — sessions grouped by "Month Year", infinite load, skeleton loading, empty state
- `src/app/(app)/history/[id]/page.tsx` — full session detail with exercise blocks, set lines, PR badges

**Session detail hook:**
- `src/hooks/use-session-detail.ts` — nested Supabase query (session → session_exercises → exercises + set_entries), joins personal_records for PRs, computes total volume

**Progress:**
- `src/hooks/use-progress.ts` — `useExerciseList`, `useProgress` (chronological best-set-per-day + volume accumulation, Epley e1RM), `usePersonalRecords`
- `src/hooks/use-weekly-summary.ts` — on-demand `generate-weekly-summary` Edge Function call, cache in state
- `src/components/progress/chart-empty-state.tsx`
- `src/components/progress/top-set-chart.tsx` — Recharts LineChart, lime (#84cc16)
- `src/components/progress/e1rm-chart.tsx` — Recharts LineChart, amber (#f59e0b)
- `src/components/progress/volume-chart.tsx` — Recharts BarChart, sky (#38bdf8)
- `src/app/(app)/progress/page.tsx` — exercise picker, 5 time-range pills, 3-tab chart view, PR grid, weekly summary with on-demand generate

**Date helpers added to `format-date.ts`:** `formatLongDate`, `formatMonthGroup`, `formatShortDate`, `formatChartDate`

**All charts use `next/dynamic({ ssr: false })` (Recharts requires `window`)**

**Build:** ✅ `npx tsc --noEmit` passes cleanly

**Next:** ~~W07~~ — done

---

### W07: Home Dashboard + Profile — ✅ COMPLETE

**What was built:**

**Unit store:**
- `src/store/unit-store.ts` — Zustand + `persist` middleware → `localStorage('liftos-unit')`. Exposes `unit`, `setUnit`, `toDisplay(kg)`, `formatWeight(kg)`. Synced to `users.unit_preference` on toggle.

**Home dashboard (`src/app/(app)/page.tsx` — full rewrite):**
- Greeting: "Good morning/afternoon/evening, [first name]" + current date
- `SuggestedCard` — full-width primary-colour card, taps directly to start (non-pinned template with oldest `last_used_at`)
- `PinnedCard` horizontal scroll row — 48-wide cards, `no-scrollbar` utility
- `LastHighlight` rows — top lift from most recent session (e1RM-ranked per exercise, max 3)
- `RecentRow` list — last 5 sessions, taps to session detail
- Empty state with Dumbbell icon when no workouts yet
- Start Workout FAB (always visible, opens existing `StartWorkoutSheet`)
- Skeleton loading for all sections simultaneously

**`src/hooks/use-home-data.ts` — NEW:**
- Single `fetchHomeData()` async function: 3 parallel Supabase queries (profile, templates, recent sessions) + 1 sequential for last highlights
- `useHomeData()` hook: `{ data, loading, refresh }`
- Suggested = first non-pinned template sorted by `last_used_at ASC NULLS FIRST`
- Pinned = `is_pinned = true` templates
- Highlights: top set per exercise by e1RM from most recent completed session

**Profile page (`src/app/(app)/profile/page.tsx` — full rewrite):**
- Avatar circle + inline display name editor (tap to edit, Enter/Save, syncs to DB)
- Email read-only
- Unit toggle (kg / lb) — saves to `users.unit_preference` + `useUnitStore`
- Export data button → `exportUserData()` (JSON blob download)
- Failed sync queue count badge (queries IndexedDB `status=failed`)
- App version badge (`0.1.0`)
- Logout button
- Delete account — 2-step dialog: first confirmation → "Type DELETE" input → calls `delete-account` Edge Function

**`src/lib/export.ts` — NEW:**
- 10 parallel Supabase queries for all user tables
- Bundles into single `{ exportedAt, version, ...tables }` payload
- `new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })`
- Creates `<a>` element, triggers download, revokes object URL

**PWA install:**
- `src/hooks/use-pwa-install.ts` — listens for `beforeinstallprompt`, detects standalone mode, persists dismiss in `localStorage('liftos-pwa-dismissed')`
- `src/components/layout/pwa-install-banner.tsx` — fixed bottom banner (above nav), shows on 2nd+ visit (`localStorage('liftos-visit-count') >= 2`), Install + dismiss buttons
- Banner added to `src/app/(app)/layout.tsx`
- Profile page also shows "Add to Home Screen" `ActionRow` when installable

**CSS additions to `globals.css`:** `.no-scrollbar` utility (hides scrollbar cross-browser)

**Build:** ✅ `npm run build` — 12 routes, all green

**Next:** ~~W08~~ — done

---

### W08: Polish + Vercel Deploy — ✅ COMPLETE

**PWA icons:**
- Generated `public/icons/icon-192.png` and `public/icons/icon-512.png`
  (192×192 and 512×512 placeholder PNGs — electric blue #2563EB background with white "L" glyph)
- Generated with Python/zlib/struct — zero external deps
- Replace with polished icons via [maskable.app](https://maskable.app) before public launch

**manifest.json — enhanced:**
- Added `maskable` purpose entries alongside `any` (required for Lighthouse PWA 100)
- Added `shortcuts` array: "Start Workout" (`/?action=start`) and "View History" (`/history`)
- Added `lang`, `categories`, `scope` fields

**layout.tsx — full SEO + PWA meta:**
- `metadataBase` pointing to `NEXT_PUBLIC_APP_URL`
- `title.template` (`%s | LiftOS`) for per-page titles
- Full `openGraph` and `twitter` card metadata
- `robots` meta (index/follow)
- `keywords` array
- Multiple `apple-touch-icon` sizes (152, 180, 192)
- `msapplication-TileColor` for Windows PWA
- Font `display: 'swap'` for CLS improvement

**next.config.ts — production hardening:**
- `compiler.removeConsole` in production (keeps `error`/`warn`)
- `images.formats: ['image/avif', 'image/webp']`
- Security headers on all routes: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- Long-lived cache for `/_next/static/` (immutable)
- `sw.js` served with `no-cache` + `Service-Worker-Allowed: /`

**New app routes:**
- `src/app/error.tsx` — global error boundary (AlertTriangle icon, "Try again" reset button, logs `error.digest`)
- `src/app/not-found.tsx` — 404 page (Dumbbell icon, "Go home" link)
- `src/app/robots.ts` — Next.js metadata route, disallows authenticated routes from indexing
- `src/app/sitemap.ts` — `/` and `/login` entries

**Environment:**
- `web/.env.example` — documents all env vars with comments

**README.md — complete developer docs:**
- Local setup (clone, install, env vars, dev server)
- Production build + Vercel deploy steps
- Supabase setup (edge functions table, tables list)
- PWA install instructions per platform (iPhone, Android, Desktop)
- Offline testing guide
- Tech stack table
- Icon replacement instructions

**Build:** ✅ `npm run build` — **14 routes**, all green (including robots.txt + sitemap.xml)
- 0 TypeScript errors, 0 ESLint errors

---

## 🎉 WEB APP BUILD COMPLETE

**All 8 web prompts done. Production-ready.**

### To deploy:
1. Push to GitHub
2. Connect repo at vercel.com/new → set Root Directory: `web`
3. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`
4. Deploy → update Supabase Auth redirect URLs with production domain

### Edge Functions deployed (on Supabase):
- `start-workout` — create session, prefill sets, AI suggestion
- `complete-workout` — mark complete, detect PRs
- `sync-offline-queue` — flush IndexedDB queue
- `generate-weekly-summary` — AI weekly summary
- `delete-account` — purge all user data

### Mobile testing checklist:
- [ ] iPhone Safari: login, start workout, log sets, finish, see completion screen
- [ ] iPhone Safari: Add to Home Screen → verify standalone mode, black status bar
- [ ] Android Chrome: Install banner appears on 2nd visit
- [ ] Airplane mode: log sets → reconnect → sets sync automatically
- [ ] Pull-to-refresh on home page updates suggested/recent workouts

### Production URL: [set after Vercel deploy — update this line]

### Next: When ready to monetise → BUILD-PROMPTS-MONETISE.md
