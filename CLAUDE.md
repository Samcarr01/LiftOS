# LiftOS – Progressive Overload Gym Tracker

A personal gym tracker built for lifters who want zero-friction logging, auto-prefilled last-session values, and AI-driven progression targets. Log a set in under 2 seconds, see what you did last time, and know what to do next.

## Aha Moment
User taps Start → workout opens with sets already prefilled → logs first set in seconds → sees a target to beat next time.

## Modules
- **Database** – see [Claude-db.md](Claude-db.md)
- **Auth** – see [Claude-auth.md](Claude-auth.md)
- **API & Edge Functions** – see [Claude-api.md](Claude-api.md)
- **UI Screens** – see [Claude-ui.md](Claude-ui.md)
- **AI Engine** – see [Claude-ai.md](Claude-ai.md)
- **Offline & Sync** – see [Claude-offline.md](Claude-offline.md)
- **Billing** – see [Claude-billing.md](Claude-billing.md)

## Build Prompts
- Sequential execution prompts – see [BUILD-PROMPTS.md](BUILD-PROMPTS.md)

## Global Constraints
1. **All data is per-user. Strict RLS on every table: `auth.uid() = user_id`**
2. **Offline-first: UI never waits on network to accept input**
3. **Prefilled sets from last session are the core UX differentiator**
4. **AI suggestions must be bounded, explainable, and cached**
5. **No hardcoded secrets. All keys via env vars**
6. *Each `.md` module stays under 50 KB*
7. *Store canonical units (kg, seconds, metres) and convert in UI*
8. *Mobile-first design. Every interaction optimised for one-handed use*

## Tech Stack
- **Mobile:** React Native (Expo) – iOS + Android
- **Backend:** Supabase (Postgres + Auth + RLS + Edge Functions)
- **AI:** Claude Haiku via Edge Functions (strict JSON output)
- **Marketing/Web:** Next.js on Vercel
- **Charts:** react-native-chart-kit or Victory Native
- **Crash reporting:** Sentry
- **Analytics:** PostHog or Mixpanel (events: start_workout, set_logged, suggestion_applied)

## Metadata
```json
{
  "projectName": "LiftOS",
  "version": "1.0.0-mvp",
  "stack": "React Native (Expo) + Supabase + Claude Haiku + Vercel",
  "environments": ["local", "staging", "prod"],
  "platforms": ["ios", "android", "web-marketing"]
}
```

## Non-Goals (MVP)
- Apple Watch integration
- Voice logging
- Social feed / following
- Full program periodisation (blocks/mesocycles)
- Nutrition tracking
- Coach/team multi-tenancy
