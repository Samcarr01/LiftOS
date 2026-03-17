# Claude-web – PWA Web App Architecture

This module defines the conversion from React Native (Expo) to a Next.js Progressive Web App. The Supabase backend (DB, Edge Functions, RLS, Auth) remains unchanged.

## Why PWA
- No Apple Developer account needed
- Works on iPhone Safari, Android Chrome, and desktop browsers
- "Add to Home Screen" gives native-like experience on mobile
- Single codebase for all platforms
- Deploy to Vercel with zero config

## Tech Stack (Web)
- **Next.js 14+** (App Router, TypeScript)
- **Tailwind CSS** + **shadcn/ui** for components
- **Supabase JS Client** (same backend, web auth flow)
- **next-pwa** or **Serwist** for Service Worker / PWA support
- **IndexedDB** (via idb or Dexie.js) for offline storage (replaces WatermelonDB/SQLite)
- **Zustand** for state management (same patterns, just web)
- **Recharts** for progress charts
- **Vercel** for deployment

## What Changes

### Auth
- **Supabase Auth UI** or custom form (same providers: Google, email/password)
- **Drop Apple Sign-In** (requires Apple Developer account; replace with Google + Email)
- Tokens stored via Supabase's built-in cookie/localStorage session handling
- No more expo-secure-store

### Offline Storage
- **IndexedDB** via Dexie.js (replaces WatermelonDB/SQLite)
- **Service Worker** for caching app shell and API responses
- Same sync queue pattern, just using IndexedDB instead of SQLite
- `navigator.onLine` + `online`/`offline` events (replaces NetInfo)

### UI
- Tailwind + shadcn/ui (replaces React Native Paper / NativeWind)
- Touch-optimised CSS (large tap targets, mobile viewport)
- Bottom navigation bar (fixed, mobile-style) on small screens
- Sidebar navigation on desktop
- Same screen layouts, rebuilt with HTML/CSS
- `next/dynamic` for code splitting heavy components (charts)

### PWA Manifest
```json
{
  "name": "LiftOS",
  "short_name": "LiftOS",
  "description": "Zero-friction gym tracker with AI progression",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0F172A",
  "theme_color": "#2563EB",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### What Stays the Same
- **All Supabase tables, RLS, indexes** — zero changes
- **All Edge Functions** (start-workout, complete-workout, generate-ai-suggestion, detect-plateau, generate-weekly-summary, sync-offline-queue) — zero changes
- **Zod schemas** — copy directly, same validation logic
- **AI engine** (OpenAI GPT-5 via Edge Functions) — zero changes
- **Business logic** (prefill, PR detection, plateau, weekly summary) — zero changes

## Folder Structure
```
liftos-web/
├── public/
│   ├── manifest.json
│   ├── sw.js (generated)
│   └── icons/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout + auth gate
│   │   ├── page.tsx            # Home dashboard
│   │   ├── login/page.tsx
│   │   ├── workout/
│   │   │   ├── [id]/page.tsx   # Active workout
│   │   │   └── complete/page.tsx
│   │   ├── templates/
│   │   │   ├── page.tsx        # Template list
│   │   │   └── [id]/page.tsx   # Template editor
│   │   ├── history/
│   │   │   ├── page.tsx        # History list
│   │   │   └── [id]/page.tsx   # Session detail
│   │   ├── progress/page.tsx
│   │   └── profile/page.tsx
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── workout/            # Active workout components
│   │   ├── progress/           # Chart components
│   │   └── layout/             # Navigation, offline indicator
│   ├── hooks/                  # Same hook patterns
│   ├── store/                  # Zustand stores
│   ├── lib/
│   │   ├── supabase.ts         # Browser client
│   │   ├── validation.ts       # Zod schemas (copied)
│   │   ├── offline/            # IndexedDB + sync queue
│   │   └── ai/                 # Rule-based fallback (copied)
│   └── types/                  # Copied from RN app
├── next.config.js
├── tailwind.config.ts
└── package.json
```

## Mobile UX on Web
- **Viewport meta:** `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`
- **Touch targets:** min 44×44px via Tailwind (`min-h-11 min-w-11`)
- **Bottom nav:** fixed bottom bar on mobile (`md:hidden`), sidebar on desktop (`hidden md:flex`)
- **Pull-to-refresh:** CSS overscroll-behavior + custom implementation
- **Haptics:** `navigator.vibrate()` for set completion (where supported)
- **Numpad:** custom number input component (HTML input type="number" is inconsistent across browsers; build a custom numpad modal)
- **Add to Home Screen:** prompt on second visit with install banner

## Performance Targets
- **Lighthouse PWA score: 100**
- **Lighthouse Performance: > 90**
- **First Contentful Paint: < 1.5s**
- **Time to Interactive: < 3s**
- **Offline-capable: full workout logging without network**
