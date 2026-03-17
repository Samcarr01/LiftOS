# LiftOS – Web PWA

Zero-friction gym tracker with AI-driven progression. Log a set in under 2 seconds.
Built with **Next.js 16 App Router**, **Supabase**, **Zustand**, and **Serwist** (offline PWA).

## Features

- **Log a set in < 2s** — tap weight, tap reps, tap ✓
- **Auto-prefilled** from your last session
- **AI suggestions** — knows when to add weight
- **Offline-first** — works in airplane mode, syncs when reconnected
- **PWA** — install on iPhone home screen, runs like a native app
- **Progress charts** — Top Set, Est. 1RM, Volume over time

---

## Local Development

### Prerequisites
- Node.js 20+
- A Supabase project (see [SUPABASE SETUP](#supabase-setup) below)

### 1. Clone & install

```bash
git clone <repo-url>
cd web
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Note: Service worker is **disabled in dev** to prevent caching stale code.
> To test offline / PWA behaviour, use `npm run build && npm start`.

---

## Production Build

```bash
npm run build   # Next.js + Serwist service worker
npm start       # Serve locally on port 3000
```

Build output shows route sizes. Target: Home < 100kB JS.

---

## Vercel Deployment

### One-time setup

1. Push to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → import repo
3. Set **Root Directory** to `web`
4. Add environment variables in Vercel dashboard:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | From Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL, e.g. `https://liftos.vercel.app` |

5. Deploy → auto-deploys on every push to `main`

### After first deploy

Update Supabase Auth redirect URLs:
- Supabase Dashboard → Authentication → URL Configuration
- Add your Vercel URL to **Redirect URLs**: `https://your-app.vercel.app/auth/callback`
- Add it to **Site URL** as well

---

## Supabase Setup

This app uses an existing Supabase project (shared with the React Native app).

### Edge Functions deployed

| Function | Trigger |
|---|---|
| `start-workout` | User taps Start — creates session, prefills sets, fetches AI suggestion |
| `complete-workout` | User taps Finish — marks session complete, detects PRs |
| `sync-offline-queue` | Background sync — flushes IndexedDB queue to Supabase |
| `generate-weekly-summary` | On-demand from Progress screen |
| `delete-account` | Profile → Delete Account — purges all user data |

### Database tables (RLS enabled on all)

`users`, `exercises`, `workout_templates`, `template_exercises`,
`workout_sessions`, `session_exercises`, `set_entries`,
`last_performance_snapshots`, `personal_records`, `ai_suggestions`, `weekly_summaries`

---

## PWA — Install on Device

### iPhone (iOS Safari)

1. Open the app in Safari
2. Tap the **Share** button (box with arrow pointing up)
3. Scroll down → **Add to Home Screen**
4. Tap **Add**

The app installs with a black status bar and full-screen layout (no Safari chrome).

> iOS Safari does **not** support `beforeinstallprompt` — the install banner in the
> app only shows on Android Chrome. On iOS, guide users to the Share sheet manually.

### Android (Chrome)

1. Open the app in Chrome
2. Chrome shows an **"Add to Home Screen"** banner automatically, OR
3. Tap the app's built-in **"Install"** banner that appears on second visit
4. Or: Chrome menu → **Add to Home Screen**

### Desktop (Chrome / Edge)

1. Look for the install icon in the address bar (computer + arrow icon)
2. Click it → **Install**

---

## Offline Support

- All set logging writes to **IndexedDB** immediately (never blocks on network)
- A background sync manager flushes the queue to Supabase when reconnected
- Exercises, templates, and last-performance data are cached via Service Worker
- Auth and Edge Function calls are always **network-only** (never cached)

**To test offline:**
1. Start a workout
2. Enable airplane mode
3. Log all your sets — they're saved to IndexedDB instantly
4. Re-enable internet
5. The app auto-syncs within seconds

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| State | Zustand v5 (with persist) |
| Backend | Supabase (Postgres + Auth + Edge Functions) |
| Offline | Dexie v4 (IndexedDB) + Serwist v9 (Service Worker) |
| Charts | Recharts v3 (dynamic import, no SSR) |
| AI | OpenAI GPT via Supabase Edge Functions |
| Deploy | Vercel |

---

## Replacing Placeholder Icons

The icons in `public/icons/` are auto-generated placeholders (blue square with "L").
To replace them with proper icons:

1. Create a 512×512 PNG with your design
2. Use a PWA icon generator (e.g. [maskable.app](https://maskable.app)) to generate all sizes
3. Replace `public/icons/icon-192.png` and `public/icons/icon-512.png`
4. Ensure the 512px version has safe-zone padding for maskable icons

---

## What's Next

When ready to add paid features → see `BUILD-PROMPTS-MONETISE.md` in the repo root.
