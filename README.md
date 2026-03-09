# LiftOS — Progressive Overload Gym Tracker

Zero-friction workout logging with auto-prefilled last-session values, AI-driven progression targets, and full offline support.

**Stack:** React Native (Expo) · Supabase · Claude Haiku / OpenAI GPT-5 · TypeScript

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [Environment Variables](#environment-variables)
4. [Local Development](#local-development)
5. [Supabase Setup](#supabase-setup)
6. [Edge Functions](#edge-functions)
7. [Build & Deploy (EAS)](#build--deploy-eas)
8. [Screens & Features](#screens--features)
9. [Analytics Events](#analytics-events)
10. [Production Checklist](#production-checklist)

---

## Project Overview

| Module | Description |
|--------|-------------|
| **Auth** | Apple Sign-In, Google OAuth, email/password via Supabase Auth |
| **Templates** | Create/edit workout templates with exercises and set targets |
| **Active Workout** | Real-time set logging with prefilled last-session values |
| **AI Suggestions** | Per-exercise progressive overload targets (Claude Haiku + rule-based fallback) |
| **Plateau Detection** | Server-side e1RM analysis flags stalls ≥4 sessions |
| **History** | Full session history with per-session drill-down |
| **Progress** | PR tracking, muscle group charts, weekly AI summaries |
| **Home Dashboard** | Suggested workout, pinned templates, recent sessions |
| **Profile** | Unit toggle (kg/lb), data export, account deletion |
| **Offline** | SQLite queue syncs in background; UI never waits on network |

---

## Prerequisites

- Node.js ≥ 20
- [Expo CLI](https://docs.expo.dev/get-started/installation/): `npm install -g expo-cli`
- [EAS CLI](https://docs.expo.dev/eas/): `npm install -g eas-cli`
- [Supabase CLI](https://supabase.com/docs/guides/cli): `brew install supabase/tap/supabase`
- Xcode (iOS) or Android Studio (Android)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (safe to bundle) |
| `SUPABASE_PROJECT_REF` | CLI only | 20-char project ref |
| `SUPABASE_ACCESS_TOKEN` | CLI only | Personal access token |
| `SUPABASE_DB_PASSWORD` | CLI only | Database password |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Never expose to client |
| `ANTHROPIC_API_KEY` | Edge Functions | Claude Haiku for AI suggestions |
| `OPENAI_API_KEY` | Edge Functions | GPT-5 for weekly summaries |
| `EXPO_PUBLIC_POSTHOG_KEY` | Optional | PostHog analytics key |
| `EXPO_PUBLIC_POSTHOG_HOST` | Optional | PostHog host (default: app.posthog.com) |
| `EXPO_PUBLIC_SENTRY_DSN` | Optional | Sentry DSN for crash reporting |
| `EAS_PROJECT_ID` | EAS Build | Fill in after `eas init` |

> ⚠️ Never commit `.env` to git. `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS — treat it like a root password.

---

## Local Development

```bash
# Install dependencies
npm install

# Start Expo dev server
npm start          # or: npx expo start

# iOS simulator
npm run ios

# Android emulator
npm run android

# TypeScript check
npx tsc --noEmit
```

### Install optional packages (for full production features)

```bash
# Sentry crash reporting
npx expo install @sentry/react-native

# Then uncomment the Sentry plugin in app.config.ts and src/lib/sentry.ts will auto-activate
```

---

## Supabase Setup

### New Project

1. Create a project at [supabase.com](https://supabase.com)
2. Copy the project URL and anon key into `.env`
3. Link the CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### Apply Migrations

All 11 tables are created via migrations in `supabase/migrations/`:

```bash
supabase db push
```

### Verify Tables & RLS

All tables have RLS enabled. Verify via Supabase dashboard or SQL:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
-- All rows should show rowsecurity = true
```

### Verify RLS Policies

Every table enforces `auth.uid() = user_id`. Test with the SQL editor:

```sql
-- Should return only rows for the authenticated user
SELECT * FROM workout_templates;
```

### Auth Providers

Enable in **Supabase Dashboard → Authentication → Providers**:
- Email (with email confirmation)
- Apple (requires Apple Developer account)
- Google (requires Google Cloud OAuth credentials)

### Apple Sign-In Deep Link

Add to Supabase Auth redirect URLs:
```
liftos://auth/callback
```

---

## Edge Functions

All 6 Edge Functions are deployed to project `bourwlahxdqaotvwrvce`:

| Function | JWT | Description |
|----------|-----|-------------|
| `start-workout` | Required | Initialises session, prefills sets, fetches AI suggestions |
| `complete-workout` | Required | Finalises session, detects PRs, updates snapshots |
| `sync-offline-queue` | Required | Processes queued mutations from offline clients |
| `generate-ai-suggestion` | Manual | Progressive overload targets + plateau detection |
| `generate-weekly-summary` | Required | Weekly stats + GPT-5 insight, cached in DB |
| `delete-account` | Manual | Full data purge + auth record deletion |

### Deploy (after code changes)

```bash
supabase functions deploy start-workout
supabase functions deploy complete-workout
supabase functions deploy sync-offline-queue
supabase functions deploy generate-ai-suggestion
supabase functions deploy generate-weekly-summary
supabase functions deploy delete-account
```

### Set Edge Function Secrets

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

---

## Build & Deploy (EAS)

### First-time EAS setup

```bash
eas login
eas init          # Generates projectId — update EAS_PROJECT_ID in .env and eas.json
```

### Development build (with dev client)

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

### Preview build (internal distribution)

```bash
eas build --profile preview --platform all
```

### Production build + submit

```bash
# Build
eas build --profile production --platform all

# Submit to App Store / Play Store
eas submit --platform ios
eas submit --platform android
```

### OTA Updates (EAS Update)

```bash
# Push a JS-only update without a full build
eas update --branch production --message "Fix: ..."
```

---

## Screens & Features

### Navigation Structure

```
app/
  (auth)/        ← login, reset password
  (tabs)/
    index.tsx    ← Home Dashboard
    templates/   ← Template list + editor + exercise picker
    history/     ← Session history list + detail
    progress/    ← Progress charts + weekly summary
    profile.tsx  ← Profile & settings
  workout/       ← Active workout (full-screen, no tab bar)
  workout-complete.tsx ← Post-workout summary + PRs
```

### Total screens: 11

| Screen | Route |
|--------|-------|
| Login | `(auth)/login` |
| Home Dashboard | `(tabs)/` |
| Templates | `(tabs)/templates` |
| Template Editor | `(tabs)/templates/[id]` |
| Exercise Selector | `(tabs)/templates/exercise-selector` |
| Exercise Creator | `(tabs)/templates/exercise-creator` |
| History | `(tabs)/history` |
| Session Detail | `(tabs)/history/[id]` |
| Progress | `(tabs)/progress` |
| Weekly Summary | `(tabs)/progress/weekly` |
| Active Workout | `workout/` |
| Workout Complete | `workout-complete` |
| Profile | `(tabs)/profile` |

---

## Analytics Events

Tracked via `src/lib/analytics.ts` (PostHog REST API, no SDK required):

| Event | When fired | Key properties |
|-------|-----------|----------------|
| `workout_started` | After `start-workout` call succeeds | `template_id`, `exercise_count` |
| `set_logged` | When user marks a set complete | `exercise_id`, `set_type`, `volume_kg` |
| `workout_completed` | After `complete-workout` call | `duration_seconds`, `total_sets`, `total_volume_kg`, `is_offline` |
| `pr_achieved` | For each new PR in `complete-workout` response | `exercise_name`, `record_type`, `record_value` |
| `suggestion_accepted` | User taps "Accept" on AI banner | `exercise_id` |
| `suggestion_dismissed` | User taps dismiss on AI banner | `exercise_id` |
| `exercise_created` | After new exercise saved | `muscle_groups`, `tracking_mode` |
| `template_created` | After new template inserted | `template_id` |

---

## Production Checklist

### Before first launch

- [ ] All 6 Edge Functions deployed and ACTIVE (verified via Supabase MCP)
- [ ] All 11 tables created with RLS enabled (verified via SQL)
- [ ] `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` secrets set on Edge Functions
- [ ] Apple Sign-In configured in Supabase Auth + Apple Developer Console
- [ ] Google OAuth configured in Supabase Auth + Google Cloud Console
- [ ] Sentry DSN added to `EXPO_PUBLIC_SENTRY_DSN` (after installing `@sentry/react-native`)
- [ ] PostHog key added to `EXPO_PUBLIC_POSTHOG_KEY`
- [ ] EAS project initialised (`eas init`), `EAS_PROJECT_ID` populated
- [ ] Production Supabase project created (separate from dev)
- [ ] `.env` committed to `.gitignore` (never commit secrets)
- [ ] App Store Connect app record created (iOS)
- [ ] Google Play Console app created (Android)
- [ ] Privacy Policy URL added to app store listings
- [ ] `eas.json` `submit.production` fields filled in

### Separate staging environment

1. Create a second Supabase project for staging
2. Apply all migrations: `supabase db push --project-ref STAGING_REF`
3. Deploy Edge Functions to staging project
4. Create a `staging` EAS build profile pointing to the staging Supabase URL
5. Use staging for TestFlight / internal track distribution

---

## Project files

```
LiftOS/
├── app/                     # Expo Router screens
├── src/
│   ├── components/          # Reusable UI components
│   ├── hooks/               # React hooks (data, auth, workout)
│   ├── lib/                 # Utilities (supabase, analytics, sentry, export, offline)
│   ├── screens/             # Full-page screen components
│   ├── store/               # Zustand state stores
│   └── types/               # TypeScript types
├── supabase/
│   ├── functions/           # 6 Edge Functions (Deno)
│   └── migrations/          # SQL migrations (11 tables)
├── assets/images/           # App icons, splash screen
├── app.config.ts            # Dynamic Expo config (reads env vars)
├── eas.json                 # EAS build profiles
├── CLAUDE.md                # AI context — project overview
├── PROGRESS.md              # Build log — all 18 prompts
└── BUILD-PROMPTS-APP.md     # Sequential build prompts
```
