# LiftOS Web - Jank Audit & Fix Plan

**Target:** `web/` (Next.js 16.1.6 · React 19.2.3 · Tailwind 4 · Supabase)
**Audited at commit:** `430c6e3` (2026-08-10)
**Audience:** an AI coding agent with write access to the repo.
**Owner's report:** *"taps feel slow, page transitions feel dead, flashes/jumps/pop-in, scroll stutter, takes ages to load, pages seem to have different themes."*

---

## 1. The diagnosis in one paragraph

LiftOS is a **client-side-rendered app wearing an App Router costume**. 21 of 25 pages are `'use client'`, every one of them fetches its own data in `useEffect` after hydration, there is **not a single `loading.tsx` in the entire app**, and nothing is cached - so every navigation is: dead screen → JS chunk → hydrate → Supabase round-trip → skeleton → content. On top of that, `.page-shell` has `overflow-x: hidden`, which silently turns it into a scroll container and **breaks the workout screen's sticky header outright** (verified in Chromium, §3.1). And 46 design-system classes exist in `globals.css` while pages hand-roll their own surfaces 334 times, with the entire Progress tab rendering in a **different colour palette** (stock Tailwind zinc/amber/lime hex codes instead of the app's oklch tokens). None of this is a "missing `memo`" problem. It is four structural problems wearing five hundred cosmetic disguises.

**The good news:** the offline-first core is genuinely well built. `completeSet` is a synchronous store write, `logSetEntry` correctly fire-and-forgets into a Dexie queue, the six home queries are properly parallel, recharts is properly code-split, and TypeScript compiles clean with zero errors. The foundations are sound. The presentation layer on top of them is what feels 80% done.

---

## 2. Why the previous audits didn't fix it

Read this before you start. It is the most important section.

Previous passes found *symptoms* and fixed them individually - a `memo` here, a `will-change` there. That cannot work, because:

1. **Every symptom the owner named traces back to one of four root causes.** Fixing 40 leaf-level items without touching the four roots leaves the app feeling identical. The four roots are: (A) no Suspense boundaries anywhere, (B) no data cache, (C) `overflow-x: hidden` breaking the scroll/sticky model, (D) a design system that exists but is bypassed.
2. **Some past "fixes" made things worse.** `will-change` was added to ~20 elements for animations whose keyframes *don't exist* (§6.4). `-webkit-tap-highlight-color: transparent` was set globally, deleting the platform's own tap feedback without replacing it (§4.1). Both were plausible optimisations that net out negative.
3. **The design system was built and then abandoned mid-migration.** `globals.css` contains a complete, coherent token set. 16 of its 46 classes have zero call sites. The app is not missing a design system - it is ignoring the one it has. Every "make it look more consistent" pass that added new classes made this worse.

**Therefore: work in the phase order given below.** Phases 0–2 change how the app *behaves*; Phase 3 changes how it *looks*. Do not reorder. Do not cherry-pick cosmetic items first.

---

## 3. Ground rules for the fixing agent

- **Line numbers are against commit `430c6e3`.** Every finding quotes the actual code. **Match the quoted code, not the line number** - if they disagree, trust the quote and search for it.
- **One phase per branch/PR.** These phases are independently shippable and independently revertable. Do not combine them.
- **After every phase:** `npx tsc --noEmit` (currently clean - keep it clean) and `npm run build`. Both must pass before moving on.
- **Do not add dependencies** except where a fix explicitly names one (only F2.2 does, and it offers a zero-dependency alternative).
- **Do not redesign anything.** Every canonical choice in Phase 3 is *the pattern the codebase already uses most often*. Your job is convergence, not taste.
- **Where a fix says "delete", delete.** ~500 lines of unused shadcn components and 16 dead CSS classes are actively harmful - they are what future agents copy from.
- **Do not "fix" anything in §8 (Already correct).** Several past passes have broken working code there.

---

# PHASE 0 - Three verified bugs

Small diffs, disproportionate payoff. Do these first; they are self-contained and each is provably broken today.

## F0.1 - `overflow-x: hidden` breaks sticky positioning and iOS scroll momentum

**Severity: Critical** · `src/app/globals.css:153`, `:156`, `:168`

```css
/* globals.css:152-161 */
body { @apply bg-background text-foreground overflow-x-hidden; }
html { @apply font-sans overflow-x-hidden;
       overscroll-behavior: none; ... }
/* globals.css:167-169 */
.page-shell { @apply relative overflow-x-hidden; }
```

Per CSS Overflow §3, when one axis is `hidden` and the other is `visible`, **the `visible` axis computes to `auto`** - the element becomes a scroll container.

**Verified in headless Chromium** (390×800 viewport, exact CSS above):

| Setup | `.page-shell` computed `overflow-y` | `body` computed `overflow-y` | Sticky header after scrolling 600px |
|---|---|---|---|
| Current (`overflow-x: hidden`) | `auto` | `auto` | **`top: -600px` - scrolled clean off screen** |
| With `overflow-x: clip` | `visible` | `visible` | `top: 0` - sticks correctly |

Two consequences:

1. **The workout screen's sticky header does not stick.** `src/app/workout/[id]/page.tsx:138` declares `sticky top-0`, but its nearest scrollport is now `.page-shell`, which has `height: auto` and therefore never scrolls. The header - carrying the exercise name, elapsed time and set progress - scrolls away during every workout. This is a headline feature silently not working.
2. **`body` is a nested scroll container.** On iOS Safari this drops the page off the viewport's fast scroll path: the address bar won't collapse, rubber-banding is lost, and momentum goes jerky. This is a direct, complete explanation for *"scrolling isn't buttery"*.

**Fix** - `overflow: clip` clips overflow **without** creating a scroll container (Safari 16+, Chrome 90+, universal on the target devices):

```css
/* globals.css:152-161 */
  body {
    @apply bg-background text-foreground;
    overflow-x: clip;
  }
  html {
    @apply font-sans;
    overflow-x: clip;
    overscroll-behavior-y: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    scrollbar-gutter: stable;
  }
```
```css
/* globals.css:167-169 */
  .page-shell {
    @apply relative;
    overflow-x: clip;
  }
```

**Verify:** open `/workout/<id>` on a phone (or 390px viewport), scroll down. The header must stay pinned. Confirm `getComputedStyle(document.body).overflowY === 'visible'` in the console.

---

## F0.2 - `-webkit-tap-highlight-color: transparent` with nothing to replace it

**Severity: Critical** · `src/app/globals.css:158` + ~12 call sites

`globals.css:158` sets `-webkit-tap-highlight-color: transparent` on `html`. That property **inherits**, so it removes the platform tap flash from every tappable element in the app. Nothing was added to replace it, so most controls now have *zero* touch feedback.

The worst case is the most-tapped control in the app - the set-completion tick:

```tsx
/* src/components/workout/set-row.tsx:170-182 */
<button type="button" onClick={onComplete}
  className={cn(
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors duration-150',
    set.isCompleted
      ? 'border-[oklch(0.72_0.19_155/0.25)] bg-[oklch(0.72_0.19_155)] text-white'
      : 'border-white/10 text-muted-foreground active:bg-primary/10 hover:border-primary/35 ...',
  )}>
```

The only press feedback is `active:bg-primary/10` - orange at **10% alpha on a near-black card** - and `transition-colors duration-150` applies to `:active` too, so that invisible change *fades in over 150 ms*. On a phone in a gym you tap, nothing happens, you tap again, and the set toggles back off. **This is the single clearest source of "taps feel slow".**

Controls with `hover:` styling and **no `:active` state at all** (all get zero touch feedback, and on iOS the `hover:` style latches after tap and reads as "stuck"):

| file:line | Control |
|---|---|
| `components/workout/exercise-card.tsx:268-275` | **Add Set** |
| `components/workout/exercise-card.tsx:259-266` | Remove set (−) |
| `components/workout/exercise-card.tsx:277-284` | Notes |
| `components/workout/exercise-card.tsx:184-190` | Dismiss suggestion (×) |
| `components/workout/superset-card.tsx:227-235` | **Add Round** |
| `components/workout/superset-card.tsx:218-225` | Remove round |
| `components/workout/set-row.tsx:195-210`, `:213-220` | RIR chips, Clear RIR |
| `components/workout/readiness-strip.tsx:39-54`, `:62-77` | Skip, readiness chips |
| `components/workout/rest-timer.tsx:84-89` | Stop rest |
| `components/workout/finish-dialog.tsx:247-253` | Keep Logging |

Also: `touch-action: manipulation` is declared on `html` (`globals.css:159`) but **`touch-action` does not inherit** - every button computes `auto`, so the browser waits to rule out a pan before committing to a click and applying `:active`.

**Fix - add one utility and apply it.** In `globals.css` under `@layer components`:

```css
  .tappable {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition: background-color 150ms, border-color 150ms, color 150ms;
  }
  .tappable:active {
    transform: scale(0.96);
    background-color: rgba(255, 255, 255, 0.14);
    transition: none;              /* press feedback must NEVER be animated */
  }
```

And in `@layer base`:

```css
  button, [role="button"], a, label, summary, input, select, textarea {
    touch-action: manipulation;
  }
```

Then add `tappable` to every control in the table above. For the tick specifically (`set-row.tsx:170-182`), make the press unmistakable:

```tsx
  className={cn(
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border',
    'transition-[background-color,border-color] duration-150',
    'active:scale-[0.88] active:transition-none [touch-action:manipulation]',
    set.isCompleted
      ? 'border-[oklch(0.72_0.19_155/0.25)] bg-[oklch(0.72_0.19_155)] text-white'
      : 'border-white/20 text-muted-foreground active:bg-primary/35 active:border-primary hover:border-primary/35 hover:bg-primary/10 hover:text-foreground',
  )}
```

Also change `components/ui/button.tsx:9` from `active:translate-y-px` under `transition-all` (a 1px move animated over 150 ms - imperceptible) to `active:scale-[0.97] active:transition-none`, and split `transition-all` into `transition-[color,background-color,border-color,box-shadow]`.

**Verify:** on a real phone, every tap produces a visible response within one frame.

---

## F0.3 - Haptics never fire on iPhone

**Severity: High** · `exercise-card.tsx:53`, `superset-card.tsx:63`, `rest-timer.tsx:48`

All three haptic call sites use `navigator.vibrate?.(...)`. **iOS Safari does not implement the Vibration API** - `navigator.vibrate` is `undefined` and the optional chain silently no-ops. On iPhone, logging a set is completely silent and completely still. Combined with F0.2 that is a genuinely dead-feeling tap.

Both set-logging calls also fire *after* `completeSet`, i.e. after a synchronous `localStorage` write (see F1.3).

**Fix** - create `src/lib/haptics.ts`:

```ts
type Pattern = 'tap' | 'success' | 'warn';
const PATTERNS: Record<Pattern, number | number[]> = { tap: 12, success: [18, 40, 28], warn: 200 };

let iosSwitch: HTMLInputElement | null = null;

export function haptic(kind: Pattern = 'tap') {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(PATTERNS[kind]);
    return;
  }
  // iOS: a <input type="checkbox" switch> toggled inside a user gesture emits the
  // system selection haptic. It is the only web haptic Safari exposes.
  if (typeof document === 'undefined') return;
  if (!iosSwitch) {
    iosSwitch = document.createElement('input');
    iosSwitch.type = 'checkbox';
    iosSwitch.setAttribute('switch', '');
    iosSwitch.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:0;height:0';
    document.body.appendChild(iosSwitch);
  }
  iosSwitch.checked = !iosSwitch.checked;
}
```

Call `haptic('success')` as the **first statement** of `handleComplete` in `exercise-card.tsx:51` and `superset-card.tsx:61` (before `completeSet`), and add `haptic('tap')` to `numeric-input.tsx` `confirm` (`:143`) and `addChar` (`:126`), and to `cycleType` (`set-row.tsx:103`).

**Verify:** on an iPhone, completing a set produces a physical tick.

---

# PHASE 1 - Make it respond

Everything in this phase is about the gap between a tap and the first pixel that changes.

## F1.1 - Zero `loading.tsx` in the app: the router has nothing to show, so it shows the old page

**Severity: Critical - this is the root cause of "page transitions feel dead"**

`find src/app -name "loading.tsx"` → **0 results.** `find src/app -name "error.tsx"` → 1 (root only). `Suspense` appears once in the entire tree (`login/page.tsx:255`, wrapping `useSearchParams` - not for navigation).

With no `loading.tsx` there is **no Suspense boundary in any route segment**, so Next's router keeps the *old page fully painted and interactive* until the destination's RSC payload and JS chunk have both resolved. Nothing on screen changes. That is literally "the screen just sits there."

**It also kills prefetch for every dynamic route.** Per `node_modules/next/dist/client/app-dir/link.d.ts:102-106`, dynamic routes get *"partial prefetch to the nearest segment with a `loading.js`"*. `/workout/[id]`, `/templates/[id]`, `/history/[id]`, `/exercises/[id]` have no `loading.js` anywhere above them - so there is nothing to prefetch *to*, and the app's deep routes (the ones you reach by tapping a workout, a session, an exercise) are simultaneously the slowest **and** the only ones with no prefetch at all.

What the user actually sees in the first 300 ms after tapping, today:

| Route | First 300 ms |
|---|---|
| `/workout/[id]` | **Nothing**, then a bare spinner on a blank `100dvh` (`page.tsx:118-124`) |
| `/templates/[id]` (737 lines) | **Nothing** until the chunk lands, then a full-screen spinner (`:621`) |
| `/profile` (655 lines) | **Nothing**, then the header with empty user fields |
| `/history/[id]` | **Nothing**, then literal `"Loading..."` text (`:200`) |
| `/exercises/[id]` | **Nothing**, then a good skeleton |
| `/workout/complete` | **Nothing** - `if (!result) return null` (`:332`) renders an empty page |
| `/templates` | Header, then one centred spinner (`:359`) - no list shape |
| `/levels` | Nothing, then a 128px spinner standing in for ~1300px of content |

**Fix - create these files.** They are server components; `Skeleton` (`src/components/ui/skeleton.tsx`) has no `'use client'` so it imports fine.

`src/app/(app)/loading.tsx` - the route-group baseline:
```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function AppLoading() {
  return (
    <div className="page-shell">
      <div className="page-content space-y-5 py-5 md:py-7">
        <div className="page-header">
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
        <Skeleton className="h-[88px] w-full rounded-2xl" />
        <Skeleton className="h-[72px] w-full rounded-2xl" />
        <Skeleton className="h-[72px] w-full rounded-2xl" />
        <Skeleton className="h-[72px] w-full rounded-2xl" />
      </div>
    </div>
  );
}
```

`src/app/(app)/history/loading.tsx` - mirrors `history/page.tsx:93-99`, but with the **corrected** row height from F5.1 (`h-[90px]`, not `h-14`):
```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function HistoryLoading() {
  return (
    <div className="page-shell">
      <div className="page-content space-y-5 py-5 md:py-7">
        <div className="page-header"><h1 className="page-header-title">Log</h1></div>
        <div className="space-y-2">
          {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-[90px] w-full rounded-2xl" />)}
        </div>
      </div>
    </div>
  );
}
```

`src/app/(app)/templates/loading.tsx` - row shapes, not a spinner:
```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function TemplatesLoading() {
  return (
    <div className="page-shell">
      <div className="page-content space-y-5 py-5 md:py-7">
        <div className="page-header">
          <h1 className="page-header-title">Workouts</h1>
          <Skeleton className="h-9 w-20 rounded-2xl" />
        </div>
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="space-y-2">
          {[0,1,2,3,4,5].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      </div>
    </div>
  );
}
```

Also create, on the same pattern: `(app)/history/[id]/loading.tsx`, `(app)/exercises/[id]/loading.tsx` (copy the JSX already inside `exercises/[id]/page.tsx:81-97` verbatim - it is the best skeleton in the app), `(app)/templates/[id]/loading.tsx`, `(app)/progress/loading.tsx`, `(app)/profile/loading.tsx`, and **`app/workout/[id]/loading.tsx`** (highest stakes - currently a bare spinner on a blank screen).

**Also add `src/app/(app)/error.tsx`** so a page error stops nuking the nav shell. Today the only `error.tsx` is at the root, above `(app)/layout.tsx`, so a Supabase hiccup on `/progress` unmounts `SidebarNav`, `BottomNav` and `PwaInstallBanner` and the whole app vanishes:

```tsx
'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[AppError]', error); }, [error]);
  return (
    <div className="page-shell">
      <div className="page-content flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <p className="text-card-title">Couldn&apos;t load this screen</p>
          <p className="mt-1 text-sm text-muted-foreground">Your data is safe. Try again, or use the nav below.</p>
        </div>
        <button onClick={reset} className="premium-button tappable"><RefreshCw className="h-4 w-4" />Try again</button>
      </div>
    </div>
  );
}
```

**Verify:** throttle to Slow 4G in DevTools and tap each nav item. Something must appear within one frame, every time.

---

## F1.2 - The bottom-nav tab doesn't highlight until the navigation completes

**Severity: Critical**

```tsx
/* src/components/layout/bottom-nav.tsx:12, 20 */
const pathname = usePathname();
const isActive = isNavItemActive(href, pathname);
```

`usePathname()` reads the **committed** router state. Next runs `<Link>` navigation inside a React transition, so the pathname does not change until the destination segment is ready. The `transition-colors duration-150` at `:27` then fires *after* the whole navigation, so it reads as a stutter rather than a response.

Net effect: you tap "Progress", your finger lifts, the tab stays orange on "Home", and the screen is unchanged. **Zero acknowledgment that the tap registered.** `sidebar-nav.tsx:12,26` has the identical defect.

Both `useLinkStatus` and `<Link onNavigate>` are confirmed present in this exact Next install (`node_modules/next/dist/client/link.d.ts:104`, `.../app-dir/link.d.ts:170`).

**Fix - part 1**, create `src/components/layout/nav-pending.tsx`:
```tsx
'use client';

import { useLinkStatus } from 'next/link';

/** Must be rendered as a DESCENDANT of the <Link> it reports on. */
export function NavPendingDot({ className = '' }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span aria-hidden
      className={`absolute inset-x-3 bottom-0.5 h-[2px] animate-pulse rounded-full bg-primary ${className}`} />
  );
}
```

**Fix - part 2**, replace `src/components/layout/bottom-nav.tsx`. The optimistic `useState` is set in an event handler, so it commits at high priority and paints on the next frame even while the navigation transition is still pending:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, Dumbbell, TrendingUp, ClockArrowUp, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNavItemActive, NAV_ITEMS } from './nav-items';
import { NavPendingDot } from './nav-pending';

const ICONS = { Home, Dumbbell, TrendingUp, ClockArrowUp, User } as const;

export function BottomNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => { setPendingHref(null); }, [pathname]);

  const activePath = pendingHref ?? pathname;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
      <div className="relative mx-auto flex h-14 max-w-md items-center justify-around overflow-hidden rounded-2xl border border-white/[0.12] bg-[oklch(0.10_0.012_260/0.92)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const Icon = ICONS[icon];
          const isActive = isNavItemActive(href, activePath);
          return (
            <Link key={href} href={href} aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              onNavigate={() => setPendingHref(href)}
              className={cn(
                'tappable relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                isActive ? 'text-primary-bright' : 'text-muted-foreground active:text-foreground',
              )}>
              <Icon className="h-[22px] w-[22px]" />
              <span className={cn('text-[11px] leading-none', isActive ? 'font-semibold' : 'font-medium')}>{label}</span>
              <NavPendingDot />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

> Note the `bg-white/[0.06] backdrop-blur-2xl saturate-150` has been replaced with an opaque `bg-[oklch(0.10_0.012_260/0.92)]`. That is F4.2 - a fixed 40px backdrop-blur bar parked over scrolling content is the single most expensive thing on every screen. On a true-black app the two are visually near-identical.

Apply the same `pendingHref` + `onNavigate` + `NavPendingDot` treatment to `src/components/layout/sidebar-nav.tsx:11-47`.

**Verify:** tap a nav item on a throttled connection. The tab must light up instantly, before the page changes.

---

## F1.3 - Every store mutation blocks the main thread on a synchronous `localStorage` write

**Severity: High** · `src/store/active-workout-store.ts:148-152`, `:466-474`

Zustand's persist middleware wraps `set` so the write happens *inside* the mutation, before React schedules a render (`node_modules/zustand/esm/middleware.mjs:356-367`), and `LAZY_LOCAL_STORAGE.setItem` (`:150`) is a blocking `localStorage.setItem`.

Trace one tap of the tick (`exercise-card.tsx:51-70`):
```ts
completeSet(exerciseIndex, setId);   // ← JSON.stringify entire workout + blocking disk write #1
navigator.vibrate?.(50);
...
if (completedSet.isCompleted && restSeconds > 0) {
  startRestTimer(restSeconds);       // ← stringify + blocking disk write #2
}
```

The persisted blob is the *whole* workout: every exercise, full `tracking_schema`, `lastPerformanceSets`, and every `aiSuggestion` including prose `reason` and `per_set_targets` - roughly 25–60 KB for an 8-exercise session, serialised and written **twice per tap**. On a mid-range Android that is 2–6 ms each, spiking well past 15 ms under memory pressure. `startRestTimer` re-serialises the entire workout even though `restTimer` isn't in `partialize` - pure waste.

**Fix** - coalesce writes into idle time. Durability is already guaranteed by the Dexie queue (`logSetEntry`); this `localStorage` copy is only crash-resume state, so a 400 ms deferral costs nothing.

```ts
// active-workout-store.ts - replace LAZY_LOCAL_STORAGE
let pending: Record<string, string> = {};
let flushHandle: number | null = null;

function flush() {
  flushHandle = null;
  for (const [k, v] of Object.entries(pending)) globalThis.localStorage?.setItem(k, v);
  pending = {};
}

const LAZY_LOCAL_STORAGE: StateStorage = {
  getItem: (name) => globalThis.localStorage?.getItem(name) ?? null,
  setItem: (name, value) => {
    pending[name] = value;
    if (flushHandle !== null) return;
    flushHandle = (globalThis.requestIdleCallback ?? setTimeout)(flush, { timeout: 400 } as never) as unknown as number;
  },
  removeItem: (name) => { delete pending[name]; globalThis.localStorage?.removeItem(name); },
};
```

Add `visibilitychange` and `pagehide` listeners that call `flush()` so nothing is lost when the PWA is backgrounded.

---

## F1.4 - `NumericInput` renders a dead `readOnly` box until hydration, then reflows the whole set list

**Severity: High** · `src/components/workout/numeric-input.tsx:266-300`

```tsx
const [isMobile, setIsMobile]   = useState(false);
const [mounted,  setMounted]    = useState(false);
useEffect(() => { setMounted(true); setIsMobile(window.matchMedia('(pointer: coarse)').matches); }, []);

if (!mounted) {
  return <input type="text" inputMode="decimal" value={...} readOnly placeholder=" - "
    className="h-9 w-20 rounded-lg border border-input bg-card px-2 text-center text-base font-medium" />;
}
```

Two failures:

1. **Dead-tap window.** Until the mount effect flushes, every weight/reps field is a `readOnly` input with **no `onClick` at all**. Taps in that window are silently discarded. On a resumed workout the page is fully painted (values restored from `localStorage`) and *looks* interactive while it isn't.
2. **Mass reflow.** The pre-mount box is `h-9 w-20` (36×80). Post-mount mobile is `min-h-[44px] min-w-[60px]` (44×60); post-mount desktop is a three-element group ~156px wide. On a workout with 5 exercises × 4 sets × 2 fields = **40 fields all reflowing at once**, on the app's most-used screen, right as the user reaches for an input.

**Fix - decide the branch in CSS, not JS state**, so the correct control is present in the first paint with zero mismatch and zero reflow. Add to `globals.css`:
```css
@custom-variant pointer-coarse (@media (pointer: coarse));
```
Then render both branches and let the media query pick:
```tsx
export function NumericInput({ value, onChange, field, disabled }: NumericInputProps) {
  const [numpadOpen, setNumpadOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setNumpadOpen(true)}
        aria-label={getInputLabel(field)}
        className={cn(
          'tappable hidden pointer-coarse:flex min-h-[44px] min-w-[60px] items-center justify-center',
          'rounded-xl border border-border bg-card px-3 text-sm font-semibold',
          disabled && 'opacity-50',
        )}>
        {/* ...unchanged content... */}
      </button>
      <span className="pointer-coarse:hidden">
        <DesktopInput value={value} onChange={onChange} field={field} disabled={disabled} />
      </span>
      {numpadOpen && <MobileNumpad /* ...unchanged... */ />}
    </>
  );
}
```
`mounted` and `matchMedia` disappear entirely. Also wrap `DesktopInput`'s group in `min-h-[44px] items-center` so both branches agree on height.

---

## F1.5 - The whole workout page re-renders every second, and rebuilds its timer on every set

**Severity: High** · `src/app/workout/[id]/page.tsx:85-99`, `:170`, `superset-card.tsx:41`

```tsx
const [elapsed, setElapsed] = useState('0:00');
useEffect(() => {
  if (!workout) return;
  const startedAt = new Date(workout.session.started_at).getTime();
  function tick() { ... setElapsed(...); }
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, [workout]);          // ← the entire workout object
```

`completeSet`/`updateSet`/`addSet` all return a **new** `workout` object, so this effect's dependency changes on every set interaction: `clearInterval` → `setInterval` → immediate `tick()` → `setElapsed` → **a second full page render** on top of the one the store already triggered. Two full tree walks per tap.

And once per second, unconditionally, `setElapsed` re-renders `WorkoutPage`, which re-runs `groupExercises(workout.exercises)` inline in JSX with no `useMemo` (`:170`), producing fresh arrays - and `SupersetCard` (`superset-card.tsx:41`) is **not memoised at all**, so every superset and every `SetRow` and `NumericInput` inside it re-renders, every second, for the whole session.

**Fix - three edits:**

1. Extract the clock into a leaf so its 1 Hz `setState` re-renders three DOM nodes instead of the exercise list:
```tsx
function ElapsedClock({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState('0:00');
  useEffect(() => {
    const t0 = new Date(startedAt).getTime();
    const tick = () => { /* …same body… */ setElapsed(next); };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="numeric">{elapsed}</span>;
}
// :149 →  <ElapsedClock startedAt={workout.session.started_at} />
```
2. `:170` → `const groups = useMemo(() => groupExercises(workout?.exercises ?? []), [workout?.exercises]);`
3. `superset-card.tsx:41` → `export const SupersetCard = memo(function SupersetCard({ ... }) {`

Also change `:109` (`beforeunload`) from `[workout]` to `[workout !== null]`.

---

## F1.6 - `memo` on `SetRow` never engages, because four fresh closures are created per row per render

**Severity: Medium (but a multiplier on everything else)** · `exercise-card.tsx:239-252`, `superset-card.tsx:197-204`

```tsx
<SetRow key={set.id} set={set} /* … */
  onUpdate={(patch) => handleUpdate(set.id, patch)}      // new fn every render
  onComplete={() => handleComplete(set.id)}              // new fn every render
  onDelete={() => deleteSet(exerciseIndex, set.id)}      // new fn every render
  onRirChange={(rir) => setSetRir(exerciseIndex, set.id, rir)}  // new fn every render
/>
```

`SetRow` is `memo`'d (`set-row.tsx:89`) and the underlying `useCallback`s at `exercise-card.tsx:70/77/79` are stable - but they are re-wrapped in fresh arrows at the call site, so the shallow compare fails on all four props. **Completing set 1 re-renders every `SetRow` and every `NumericInput` in that exercise.** It also defeats `SetRow`'s own `useCallback`s (`cycleType` `:103-107`, `handleValueChange` `:109-111`), which both list `onUpdate` in their deps.

**Fix - pass the id down and keep the handlers stable:**
```tsx
// set-row.tsx prop signature
onUpdate:     (setId: string, patch: {...}) => void;
onComplete:   (setId: string) => void;
onDelete:     (setId: string) => void;
onRirChange?: (setId: string, rir: number | null) => void;

// inside SetRow
const cycleType = useCallback(() => {
  const i = SET_TYPE_CYCLE.indexOf(set.setType);
  onUpdate(set.id, { setType: SET_TYPE_CYCLE[(i + 1) % SET_TYPE_CYCLE.length] });
}, [set.id, set.setType, onUpdate]);
```
```tsx
// exercise-card.tsx - every prop now referentially stable
<SetRow key={set.id} set={set} setNumber={index + 1}
  lastValues={lastPerformanceSets?.[index] ?? null} fields={fields} aiTarget={aiTarget}
  onUpdate={handleUpdate} onComplete={handleComplete}
  onDelete={handleDeleteSet} onRirChange={handleRirChange}
  showRir={set.id === rirSetId} />
```
Wrap `deleteSet` and `setSetRir` in `useCallback`s taking `(setId, …)`. Apply the identical change to `superset-card.tsx:197-204`.

Also gate `FinishDialog` so a closed dialog costs nothing - it currently subscribes to the whole workout object (`finish-dialog.tsx:84`) and re-renders on every set:
```tsx
export function FinishDialog({ open, onClose }: FinishDialogProps) {
  if (!open) return null;                    // gate BEFORE any store read
  return <FinishDialogBody onClose={onClose} />;
}
```

---

## F1.7 - Every drill-down is a `router.push` from a `<button>`: no prefetch, no anchor

**Severity: High** · 13 call sites

`grep -rn "prefetch" src` returns **zero matches**. The most-tapped controls in the app are buttons, not links, so they lose viewport prefetch, hover prefetch, long-press "open in new tab", middle-click, and the browser's own anchor affordances:

| file:line | Target |
|---|---|
| `(app)/history/page.tsx:129` | **every log row** |
| `(app)/templates/page.tsx:237` | **every workout row** |
| `(app)/page.tsx:121` | resume banner → live workout |
| `(app)/page.tsx:478` | recent-activity row |
| `(app)/page.tsx:433`, `:454`, `:507` | create workout |
| `(app)/exercises/page.tsx:72`, `:153` | new / edit exercise |
| `(app)/exercises/[id]/page.tsx:181`, `:389` | start workout, session row |
| `(app)/profile/page.tsx:547`, `:581` | password, help |

**Fix** - convert to `<Link>`. E.g. `history/page.tsx:22-56`:
```tsx
import Link from 'next/link';

function SessionRow({ session }: { session: HistorySessionSummary }) {
  return (
    <Link href={`/history/${session.id}`} className="action-card tappable flex items-center gap-3 w-full text-left">
      {/* …unchanged children… */}
    </Link>
  );
}
```
Same for `(app)/page.tsx:476-497`, `:120-127`, `exercises/page.tsx:152-158`, and make `LinkRow` in `profile/page.tsx:544,577` render a `next/link` when given `href`.

`templates/page.tsx:233-253` must stay a `<button>` (it carries the long-press handler from `useLongPress`). Prefetch it manually:
```tsx
useEffect(() => { router.prefetch(`/templates/${template.id}`); }, [router, template.id]);
```

**Also fix `src/app/(app)/history/page.tsx:110`** - the only raw internal anchor in the codebase:
```tsx
<a href="/" className="premium-button mt-1">Start Your First Workout</a>
```
This forces a **full page reload**: the whole PWA tears down and boots from scratch - fonts, service worker, `AuthGate` re-init, every store rehydrate. It is the first thing a brand-new user sees in the Log tab. Change to `<Link href="/">`.

---

## F1.8 - `window.history.replaceState({}, …)` wipes Next's router state

**Severity: High** · `(app)/templates/page.tsx:290`, `(app)/page.tsx:242`

Next stores its router tree inside `window.history.state` (keys `__NA` and `__PRIVATE_NEXTJS_INTERNALS_TREE`). Passing `{}` replaces them with an empty object. This runs on `/templates?create=1` - where **every** "Create workout" button in the app sends the user - so the history entry loses its router state and pressing Back can fall back to a hard document load.

**Fix:**
```tsx
window.history.replaceState(window.history.state, '', '/templates');   // templates/page.tsx:290
window.history.replaceState(window.history.state, '', '/');            // page.tsx:242
```
Cleaner: `router.replace('/templates', { scroll: false })`.

---

## F1.9 - Smaller interaction wins

| ID | file:line | Problem | Fix |
|---|---|---|---|
| F1.9a | `workout/[id]/page.tsx:126-129` | `router.replace('/')` called **during render** - React 19 warns, can double-fire under StrictMode, and `return null` paints a blank screen | Fold into the existing effect at `:111-116`; delete `:126-129` |
| F1.9b | `finish-dialog.tsx:128` | Unconditional `await supabase.auth.refreshSession()` (150–400 ms) before every save | Only refresh when actually near expiry: read `getSession()` (local, no network) and refresh only if `expires_at - Date.now() < 120_000` |
| F1.9c | `numeric-input.tsx:164-170` | Tapping a weight field mounts a full-width `backdrop-blur-2xl` portal whose *source* is the already-blurred workout screen - 40–120 ms hitch on the app's second-most-repeated interaction | Replace `bg-white/[0.10] backdrop-blur-2xl` with opaque `bg-[oklch(0.16_0.015_260)]`. The numpad covers the screen anyway; the blur communicates nothing |
| F1.9d | `exercise-selector.tsx:34` | Opening a workout fires a full `select('*') from exercises` because the selector is mounted unconditionally in the page tree (`workout/[id]/page.tsx:193`) | Add an `enabled` option to `useExercises` and pass `{ enabled: open }` |
| F1.9e | `use-start-workout.ts:190→262` | Start Workout awaits **N+3 round-trips** plus N synchronous `buildGuidedSuggestion` calls before navigating - 1.5–4 s behind a 16px spinner | Navigate on the write branch alone: `hydrateWorkout({ session, exercises: skeletonExercises })` → `router.push(...)` → then `void readBranch.then(ctx => store.applyPrefillAndSuggestions(...))`. Lifter sees their exercise list in ~250 ms; "Last" column and targets fill in a beat later. Add `router.prefetch()` right after the session insert |

---

# PHASE 2 - Make it load

## F2.1 - Middleware makes two sequential Supabase network calls before any HTML is sent

**Severity: Critical** · `src/middleware.ts:37`, `:66-70`, `:85-89` - **verified by reading the file**

```ts
// :37 - getUser() is ALWAYS a network fetch, never a local decode
const { data } = await supabase.auth.getUser();
```
```ts
// :66-70 - a second, strictly sequential round-trip (needs user.id)
const { data: userRow } = await supabase
  .from('users').select('onboarding_completed').eq('id', user.id).single();
```

TTFB on **every navigation** is therefore `≥ 2 × RTT(server→Supabase) + render` before HTML streaming even begins. If the Next server and Supabase project are in different regions, that alone is 200–800 ms of dead time.

**Amplification:** the matcher at `:88` excludes only static assets. It does **not** exclude RSC payload or prefetch requests - and `BottomNav` is `fixed` so all 5 nav links are permanently in the viewport and prefetch on sight. That is **10 extra Supabase round-trips per page view**, fired exactly while the home queries are in flight.

**Fix - three parts:**

1. Replace the network call with local JWT verification. `getClaims()` (present in auth-js 2.99.1) fetches the JWKS **once**, caches it, and verifies with `crypto.subtle.verify` - zero network per request:
```ts
const { data: claimsData } = await supabase.auth.getClaims();
const user = claimsData?.claims ? { id: claimsData.claims.sub } : null;
```
   ⚠️ Requires migrating the Supabase project to asymmetric JWT signing keys (Dashboard → Settings → JWT Keys → migrate to ECC/RSA). With legacy HS256 it silently falls back to `getUser()`, so **confirm the migration landed** before claiming this fix.

2. Kill the second round-trip. `onboarding_completed` never changes after onboarding - either add it to the JWT via a Supabase custom access token hook and read `claims.onboarding_completed` for free, or set a `liftos-onboarded=1` cookie at the end of `/onboarding` and check `request.cookies.get(...)`.

3. Skip auth entirely for prefetch/RSC traffic (pages are already guarded by RLS and by the document request):
```ts
export const config = {
  matcher: [{
    source: '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    missing: [
      { type: 'header', key: 'next-router-prefetch' },
      { type: 'header', key: 'RSC' },
    ],
  }],
};
```

**Note:** the build also warns `The "middleware" file convention is deprecated. Please use "proxy" instead.` Worth doing in the same PR.

---

## F2.2 - No cache layer: every navigation and every tab focus refetches everything

**Severity: Critical**

Every hook is the same shape - component-local `useState(null)` + `useEffect` → fetch. State dies on unmount. **Navigating Home → History → Home refires all 6 home queries and repaints skeletons, every time, forever.** Nothing in `src/store/*` caches server data (verified: `auth-store` holds user/session, the other four hold UI state only).

Worse, Home and History both bolt on a **visibilitychange full refetch**:
```ts
// (app)/page.tsx:246-253 (same pattern at history/page.tsx:63-72)
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') void refresh();
}
```
and `refresh` sets `loading = true` unconditionally (`use-home-data.ts:193`), so **switching to another app and back collapses the entire home page to skeletons** and replays the staggered reveal animation.

**Fix (a) - SWR, ~4 KB gz, hooks keep their signatures:**
```ts
import useSWR from 'swr';

export function useHomeData() {
  const { data, isLoading, mutate } = useSWR('home', fetchHomeData, {
    revalidateOnFocus: false,     // deletes the visibilitychange effect
    keepPreviousData: true,       // no skeleton flash on re-navigation
    dedupingInterval: 30_000,
  });
  return { data: data ?? null, loading: isLoading && !data, refresh: mutate };
}
```
Then delete `(app)/page.tsx:246-253` and `history/page.tsx:63-72` entirely.

**Fix (b) - zero new dependencies**, if you'd rather not add SWR. Add a silent-refresh flag and a module-level cache:
```ts
let cached: HomeData | null = null;

export function useHomeData() {
  const [data, setData] = useState<HomeData | null>(cached);
  const [loading, setLoading] = useState(cached === null);
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent && cached === null) setLoading(true);
    try { const r = await fetchHomeData(); cached = r; setData(r); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load({ silent: cached !== null }); }, [load]);
  return { data, loading: loading && data === null, refresh: () => load({ silent: true }) };
}
```
Apply the same pattern to `use-history.ts` and `use-templates.ts`. This also fixes back-navigation losing scroll position (the page currently renders at zero height on remount, so there is nothing to restore to).

---

## F2.3 - Home fires 8 queries for 3 cards, two of them unbounded all-time table scans

**Severity: High** · `src/hooks/use-home-data.ts:41-95`, `(app)/page.tsx:157`, `:504-508`

Two queries have **no `limit()` and no date bound whatsoever**:
```ts
// use-home-data.ts:83-94
supabase.from('workout_sessions').select('id, started_at, is_light_session')
  .not('completed_at', 'is', null).order('started_at', { ascending: true }),
supabase.from('personal_records').select('session_id'),
```
These grow forever. A two-year user with 300 sessions and 800 PRs pulls **1,100 rows on every home mount, every back-navigation and every tab focus** - to render one level chip.

Plus:
- `limit(10)` on recent sessions (`:72`) but only **3 are rendered** (`page.tsx:475`), and the join pulls a `tracking_schema` JSON blob per exercise that is parsed and thrown away (`:163-167`) - `primaryResult` stays `null` forever, `volume_kg` is hardcoded `0`.
- `StartWorkoutSheet` is **always mounted** (`page.tsx:504-508`) and calls `useTemplates()` (`:157`), so templates are fetched **three times** on `/` - once by `use-home-data` and twice more by `useTemplates` - for a sheet the user hasn't opened.

**Fix:**
1. Materialise XP. Add `xp_total`, `xp_level`, `session_count` to `users`, maintained by the trigger that already completes sessions / writes PRs. Home reads them from the existing `users` query at `:49`. **2 queries → 0.**
2. `:72` `limit(10)` → `limit(3)`; drop `tracking_schema` from the join.
3. Gate the sheet: `{sheetOpen && <StartWorkoutSheet open … />}`, or pass `data.pinned`/`data.suggested` in as props and delete `useTemplates()` from `page.tsx:157`.

**Home: 8 queries → 3.**

---

## F2.4 - `useTemplates` waits on auth, does 2 sequential queries, and refetches on every tab focus

**Severity: High** · `src/hooks/use-templates.ts:29-31`, `:38`, `:42-62`, `:76`, `:180`

```ts
const user = useAuthStore((s) => s.user);
...
const fetchTemplates = useCallback(async (): Promise<void> => {
  if (!user) return;                          // ← blocks until getSession() resolves
```

Three compounding problems:
- **Auth gate adds a waterfall.** `user` is null until `auth-store.initialize()`'s `getSession()` resolves. RLS already scopes these rows, so the gate buys nothing and costs a round-trip of latency.
- **Two sequential queries** (`:42-48` then `:57-62`), the second pulling one row per `template_exercise` across all templates purely to count them client-side. No `.limit()` on either.
- **Refetch storm.** Deps are `[user, supabase]` (`:76`), and `user` is a **fresh object identity** on every auth event (`auth-store.ts:81-83`). supabase-js registers its own `visibilitychange` listener and fires `SIGNED_IN`/`TOKEN_REFRESHED` on every tab focus - so both queries re-run on every focus, on every page that mounts this hook.

**Fix:**
```ts
const fetchTemplates = useCallback(async () => {
  const { data } = await supabase
    .from('workout_templates')
    .select('*, template_exercises(count)')          // 2 queries → 1
    .order('is_pinned', { ascending: false })
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(50);
  setTemplates((data ?? []).map(t => ({ ...t, exercise_count: t.template_exercises?.[0]?.count ?? 0 })));
}, []);                                              // ← empty deps kills the storm
```
(The aggregate join is the same one `use-home-data.ts:53` already uses.)

---

## F2.5 - Starting a workout issues one unbounded all-time query per exercise

**Severity: High** · `use-start-workout.ts:121-124`, `lib/workout/load-history.ts:127-148`

```ts
Promise.all(exerciseIds.map(async (exerciseId) => ([
  exerciseId, await loadHistorySessions(supabase, exerciseId),
] as const))),
```
One request **per exercise** - an 8-exercise template fires 8 concurrent queries. Each has **no `.limit()`, no `.order()`, no date cutoff**: it pulls *every set of every session ever recorded* for that exercise, then throws almost all of it away (`buildGuidedSuggestion` reads the most recent handful).

**Fix - one bounded query for all exercises:**
```ts
const { data } = await supabase
  .from('session_exercises')
  .select(`session_id, exercise_id,
           workout_sessions!inner ( completed_at, is_light_session, readiness, phase_at_session ),
           set_entries ( set_index, values, set_type, is_completed, logged_at, rir )`)
  .in('exercise_id', exerciseIds)                              // N queries → 1
  .not('workout_sessions.completed_at', 'is', null)
  .gte('workout_sessions.completed_at', sixMonthsAgo)          // bound the window
  .order('workout_sessions(completed_at)', { ascending: false })
  .limit(20 * exerciseIds.length);
```
Group by `exercise_id` in `mapHistoryRows`.

---

## F2.6 - The service worker intercepts every Supabase read and its offline fallback can never fire

**Severity: High** · `src/app/sw.ts:14-41`

The doc comment at `:14-19` claims *"Supabase API calls are NOT intercepted"*. **They are.** `runtimeCaching: defaultCache` (`:32`) ends with a catch-all cross-origin `NetworkFirst` rule with no `method` field, which defaults to `GET` - so **every Supabase PostgREST GET is intercepted**, cloned, written into Cache Storage with per-request IndexedDB expiration bookkeeping, into a **32-entry** cache that thrashes constantly.

*(Also a correctness/security issue: the cache key ignores the `Authorization` header, so a second user signing in on the same device can be served the first user's cached rows for up to an hour.)*

The `/offline` fallback (`:33-40`) is **dead code**: `PrecacheFallbackPlugin` resolves via `matchPrecache('/offline')`, but the precache manifest contains only webpack client assets and `public/` files. `/offline` is a Next route, never a webpack asset, so `matchPrecache` returns `undefined` and the fallback never fires.

And hashed immutable chunks are cached `CacheFirst` with `maxEntries: 64, maxAgeSeconds: 86400`, directly contradicting the `max-age=31536000, immutable` header in `next.config.ts` - repeat visitors re-download JS daily.

**Fix - rewrite `src/app/sw.ts:27-41`:**
```ts
import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, CacheFirst, ExpirationPlugin, Serwist } from "serwist";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 1. Genuinely bypass Supabase - what the doc comment already claims.
    { matcher: ({ url }) => url.hostname.endsWith('.supabase.co'), handler: new NetworkOnly() },
    // 2. Honour the immutable header on hashed chunks.
    { matcher: /\/_next\/static\//i,
      handler: new CacheFirst({ cacheName: 'next-static',
        plugins: [new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: 31536000 })] }) },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: '/offline.html', matcher: ({ request }) => request.destination === 'document' }],
  },
});
```
Create a **static `public/offline.html`** - public files *are* precached, so the fallback will actually resolve.

---

## F2.7 - Fonts: 10 files preloaded at top priority, 4 of them provably unused

**Severity: Medium** · `src/app/layout.tsx:9-27`

Barlow and Barlow Condensed have no variable axes (per Next's own font metadata), so next/font emits **one static woff2 per weight**: Barlow 5 + Barlow Condensed 4 + Geist Mono 1 = **10 files**, each with a `<link rel="preload" as="font">` in `<head>` - the browser's highest fetch priority, ahead of the JS that is the only thing that can render anything.

| Family | Loaded | Actually used |
|---|---|---|
| Barlow | 300, 400, 500, 600, 700 | `font-light` appears **0 times** → 300 is dead |
| Barlow Condensed | 400, 500, 600, 700 | `.font-display` pairs only with `font-bold` (69×) and `font-semibold` (9×) → 400 and 500 dead |
| **Geist Mono** | 1 variable file | **2 spans in the entire app**: `error.tsx:30` and `profile/page.tsx:600` (a version string) |

**Fix - 10 files → 4:**
```ts
const barlow = Barlow({ variable: '--font-barlow', subsets: ['latin'], display: 'swap',
  weight: ['400', '600', '700'] });
const barlowCondensed = Barlow_Condensed({ variable: '--font-barlow-condensed', subsets: ['latin'],
  display: 'swap', weight: ['700'], preload: false });
```
**Keep Geist Mono only if** you adopt the `.numeric` utility in F5.5 (which routes all live-updating digits through it and earns the download). Otherwise delete it and set `--font-mono: ui-monospace, SFMono-Regular, Menlo, monospace`.

Also tighten `next.config.ts:41` - `font-src 'self' https://fonts.gstatic.com` - to `font-src 'self'`. next/font self-hosts into `/_next/static/media`; the gstatic entry is never used.

---

## F2.8 - Dexie (96 KB) is in the shared bundle for every authenticated page

**Severity: Medium** · `(app)/layout.tsx:10` → `providers/sync-manager-boot.tsx:4` → `lib/offline/index.ts:5-8`

**Verified from the production build:** Dexie compiles into chunk `3019-*.js`, **96 KB raw / 29 KB gzipped**. The import chain is `SyncManagerBoot` → `@/lib/offline` (a barrel) → `sync-queue` → `indexed-db` → `Dexie`, and `indexed-db.ts:38` constructs `new LiftOSDB()` **at module-eval time**. So `/`, `/progress`, `/history` and `/profile` all pay for it - and open an IndexedDB connection - despite never queuing an offline mutation.

**Fix - defer past first paint, and import the module directly rather than the barrel:**
```tsx
'use client';
import { useEffect } from 'react';

export function SyncManagerBoot() {
  useEffect(() => {
    const idle = 'requestIdleCallback' in window ? requestIdleCallback : setTimeout;
    idle(() => { void import('@/lib/offline/sync-manager').then(m => m.startSyncManager()); });
  }, []);
  return null;
}
```

Same treatment for two other interaction-only statics: `canvas-confetti` (`workout/complete/page.tsx:9` → `await import()` at the call site) and `react-easy-crop` (`ui/avatar-uploader.tsx:4` → `dynamic(() => import('react-easy-crop'), { ssr: false })`, ~600 KB unpacked, currently loaded with `/profile`).

---

## F2.9 - `.page-reveal` holds content invisible for up to 490 ms *after* the data arrives

**Severity: Medium (perceived load)** · `globals.css:424-431`, `:489-497`

```css
.page-reveal { animation: fade-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) both; }
.delay-1 { animation-delay: 0.06s; } .delay-2 { 0.12s; } .delay-3 { 0.18s; } .delay-4 { 0.24s; }
```
`animation-fill-mode: both` includes `backwards`, so a `.delay-4` element is pinned at `opacity: 0` for 240 ms and then takes 250 ms to fade - **490 ms after the data has already arrived**. Home's "Recent activity" (`page.tsx:469`) uses `delay-4`. And because these elements mount when `loading` flips false, the whole stagger **replays on every refetch** - every back-navigation and every tab focus.

**Fix:** once `loading.tsx` exists (F1.1), the reveal is redundant for navigation. Drop the `delay-*` classes from the data-dependent sections (`page.tsx:329,355,368,402,442,469`) and keep the reveal only on static chrome. Also add the reduced-motion guard, which is currently missing everywhere:
```css
@media (prefers-reduced-motion: reduce) {
  .page-reveal { animation: none; }
  .delay-1, .delay-2, .delay-3, .delay-4 { animation-delay: 0s; }
}
```

---

# PHASE 3 - Make it one app

> **This is the phase that answers "pages seem to have different themes."** It is not a redesign. Every canonical choice below is the pattern the codebase already uses most often.

## The finding in one table

`globals.css` defines a complete design system - 46 component classes, 40 colour tokens, a radius scale. **16 of those 46 classes have zero call sites**, and the pages that don't use them re-implement the same surfaces by hand:

| Measure | Count | Verified |
|---|---|---|
| `border-white/*` hardcoded classes | **152** across **15 distinct values** | ✅ grep |
| `bg-white/*` hardcoded classes | **148** across **13 distinct values** | ✅ grep |
| `*-[oklch(…)]` arbitrary classes | 117 across 31 values | code read |
| Raw hex colours in JS strings | 42 (invisible to `bg-[#…]` greps - this is why past audits missed them) | ✅ grep |
| `ui/*` components with **zero importers** | **6 of 14** (`card`, `button`, `badge`, `dropdown-menu`, `separator`, `tabs`) ≈ 500 LOC | ✅ grep |
| Distinct card recipes | 9 (+ a 10th for modals) | code read |
| Distinct blur radii for "frosted glass" | 9 | ✅ 29 `backdrop-blur*` in tsx + 14 `backdrop-filter` in css |
| Distinct `<h1>` treatments | 6 | code read |
| Distinct radius values in use | 18 | code read |

## F3.1 - 🔴 The Progress tab renders in a different palette. Fix this first.

**Severity: Critical (this is almost certainly what the owner is seeing)** · verified by grep

All five chart components use **stock Tailwind v3 hex codes**, not the app's oklch tokens:

```tsx
/* components/progress/e1rm-chart.tsx:28-55 - identical shape in all 5 files */
tick={{ fontSize: 10, fill: '#a1a1aa' }}          // zinc-400, not --muted-foreground
contentStyle={{ background: '#1c1c2e',           // not --popover
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',             // not in the radius scale at all
                color: '#e4e4e7' }}              // zinc-200, not --foreground
stroke="#f59e0b"                                 // amber-500, not --chart-1
```

| Chart | Series colour | Hex | Should be |
|---|---|---|---|
| `e1rm-chart.tsx:53,55` | amber-500 | `#f59e0b` | `--chart-1` `oklch(0.75 0.18 55)` |
| `top-set-chart.tsx:53,55` | lime-500 | `#84cc16` | `--chart-2` `oklch(0.72 0.19 155)` |
| `volume-chart.tsx:50` | sky-400 | `#38bdf8` | `--chart-3` |
| `muscle-split-chart.tsx:15-25` | 10 ad-hoc oklch literals | - | `--chart-1..5` + 5 new tokens |

**`--chart-1` … `--chart-5` are defined twice in `globals.css` (L71–75 and L132–136), mapped into `@theme inline` (L21–25), and used by not one single chart.** The Progress tab literally renders a different grey ramp and a different tooltip surface than every other screen in the app.

**Fix - mechanical, ~40 replacements across 5 files:**

| Replace | With |
|---|---|
| `fill: '#a1a1aa'`, `color: '#a1a1aa'` (13×) | `'var(--muted-foreground)'` |
| `color: '#e4e4e7'` (10×) | `'var(--foreground)'` |
| `background: '#1c1c2e'` (5×) | `'var(--popover)'` |
| `border: '1px solid rgba(255,255,255,0.1)'` (5×) | `'1px solid var(--border)'` |
| `borderRadius: '8px'` (5×) | `'var(--radius-md)'` |
| `stroke: 'rgba(255,255,255,0.08)'` (4×) | `'var(--border)'` |
| `stroke="#f59e0b"` / `#84cc16` / `#38bdf8` | `'var(--chart-1)'` / `'var(--chart-2)'` / `'var(--chart-3)'` |
| `COLORS[]` in `muscle-split-chart.tsx:15-25` | `--chart-1..5` + add `--chart-6..10` |

While you're in these files, apply F4.5 (memo + `isAnimationActive={false}`) in the same pass.

## F3.2 - Modals are a flat black slab floating over a frosted-glass app

**Severity: High** · `ui/dialog.tsx:56`, `ui/sheet.tsx:56`

```tsx
// dialog.tsx:56 - bg-background is oklch(0 0 0): pure black, fully opaque, no blur, ring not border
"… rounded-2xl bg-background p-5 text-sm ring-1 ring-foreground/10 …"
```
Meanwhile `.content-card` is `rgba(255,255,255,0.06)` + `blur(20px) saturate(150%)` + a real border. And `dialog.tsx:105` then reverts to the glass idiom for its footer (`border-t border-white/[0.08] bg-white/[0.04]`) - so a single dialog contains **both** systems.

**Fix:** `dialog.tsx:56` and `sheet.tsx:56` → `border border-white/[0.12] bg-[rgba(255,255,255,0.06)] backdrop-blur-[20px] saturate-150`.

## F3.3 - Four different background treatments across the app

**Severity: High**

`.page-shell::before` (`globals.css:171-181`) paints three radial washes at 0.06/0.04/0.03 alpha. **18 files get it. Six pages don't:**

| Page | Background today |
|---|---|
| `(auth)/login/page.tsx:231` | a *different* 2-stop gradient at **0.18/0.12 alpha - 3× brighter** |
| `workout/complete/page.tsx:372` | a *third*, one-stop gradient |
| `onboarding/page.tsx`, `offline/page.tsx`, `error.tsx`, `not-found.tsx` | **flat `oklch(0 0 0)`** - no gradient at all |

Walking Home → Start Workout → Complete → Onboarding, the background changes character four times. **That is the "different themes" feeling, literally.**

**Fix:** wrap all six in `page-shell`, and **delete `login/page.tsx:231`** and `workout/complete/page.tsx:372`'s bespoke gradients.

## F3.4 - Introduce `PageShell` and migrate 15 pages

**Severity: High**

`.page-header` is used by **5 of 22 pages**. The other 17 hand-roll header markup, producing **six different `<h1>` treatments** for the same role: `page-header-title` (30px), `text-2xl`, `text-xl`, `text-lg`, `text-base`, and `text-xl` *without* `font-display` (wrong font family entirely - `error.tsx:25`, `not-found.tsx:12`). There are also **six page-padding values** and **three max-widths**.

The `.text-page-title` class exists in `globals.css:358` for exactly this and has **0 uses**.

**Fix - create `src/components/layout/page-shell.tsx`:**
```tsx
export function PageShell({ title, action, back, children, className }: {
  title?: string; action?: React.ReactNode; back?: string | (() => void);
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className="page-shell">
      <div className={cn('page-content space-y-5 py-5 md:py-7', className)}>
        {(title || back || action) && (
          <div className="page-header">
            <div className="flex min-w-0 items-center gap-3">
              {back && (typeof back === 'string' ? <BackButton href={back} /> : <BackButton onClick={back} />)}
              {title && <h1 className="page-header-title truncate">{title}</h1>}
            </div>
            {action}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
```
Chosen because `page-shell`+`page-content` is 18/17 uses, `py-5 md:py-7` is 12 pages vs 2 for `py-6 md:py-8`, and `.page-header` is the only shared header primitive.

**Migrate:** `(app)/page.tsx:276-293`, `help:96-107`, `levels:73-85`, `profile/training:261-271`, `profile/password:51-60`, `history/[id]:192-207`, `exercises/[id]:82,105,121`, `exercises/new:36-43`, `exercises/[id]/edit:55-61`, `templates/[id]:627-638`, `workout/complete:371`, `onboarding:181`, `offline:7`, `not-found:6`, `error:19`, `login:230`.

**Also - pixel bug at `workout/[id]/page.tsx:138`:**
```tsx
<header className="sticky top-0 z-30 -mx-4 -mt-4 … px-4 …">
```
The parent `.page-content` is `px-5` (`globals.css:184`). `-mx-4` is 1rem, `px-5` is 1.25rem - so the sticky header is inset **4px on each side** instead of bleeding full-width, and its contents sit 4px left of everything else on the page. Change to `-mx-5 … px-5`.

## F3.5 - Activate the five dead `.state-*` classes

**Severity: High**

`globals.css` defines `.state-active`, `.state-success`, `.state-achievement`, `.state-warning`, `.state-destructive` (L392–421). **All five have zero call sites.** Meanwhile the codebase hand-writes exactly that pattern 117 times, with drifting alphas:

```tsx
superset-card.tsx      'border-[oklch(0.72_0.19_155/0.20)] bg-[oklch(0.72_0.19_155/0.12)]'
set-row.tsx:177        'border-[oklch(0.72_0.19_155/0.25)] bg-[oklch(0.72_0.19_155)]'
exercise-card.tsx:98   'border-[oklch(0.72_0.19_155/0.25)] bg-[oklch(0.72_0.19_155/0.08)]'
templates/[id]:639     'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
```
Four alphas and two colour systems for "success", while the canonical class sits unused.

And `sidebar-nav.tsx:34`'s `bg-[oklch(0.75_0.18_55/0.15)] text-[oklch(0.80_0.16_55)]` is **character-for-character identical** to `.state-active`.

**Fix - replace by pattern:**

| Current pattern | ~Count | → |
|---|---:|---|
| `bg-[oklch(0.75_0.18_55/0.15)] text-[oklch(0.80_0.16_55)]` | 12 | `state-active` |
| `*-[oklch(0.72_0.19_155/…)]` + `text-[oklch(0.78_0.17_155)]` | 20 | `state-success` |
| `*-[oklch(0.80_0.16_85/…)]` + `text-[oklch(0.85_0.15_85)]` | 7 | `state-achievement` |
| `*-[oklch(0.75_0.16_60/…)]` + `text-[oklch(0.82_0.15_60)]` | 10 | `state-warning` |
| `bg-[oklch(0.65_0.20_25)]`, `bg-red-500/90`, `bg-red-500/10` | 14 | `state-destructive` / `bg-destructive` |

Also move `muscle-group-badge.tsx:4-16` (13 stock Tailwind palette pairs) and `exercises/[id]/page.tsx:135-141` off the Tailwind palette onto `--chart-*` / `--state-*` tokens.

## F3.6 - `--destructive-foreground` is used but never defined

**Severity: Medium** · **verified: 0 definitions in `globals.css`, 2 uses in tsx**

`profile/page.tsx:100` and `:129` (the Delete Account confirm button) use `text-destructive-foreground`. The token is not in `:root`, not in `.dark`, and not mapped in `@theme inline` - Tailwind v4 emits no rule, so the button has **no explicit text colour**.

**Fix:**
```css
/* in .dark */         --destructive-foreground: oklch(0.98 0 0);
/* in @theme inline */ --color-destructive-foreground: var(--destructive-foreground);
```

There are also **three different reds for "delete"** across four recipes: `bg-red-500/90` (4 copy-pasted files), `bg-destructive`, and `bg-[oklch(0.65_0.20_25)]` - which is a *lighter shade than the token it's imitating*. Consolidate onto a new `.destructive-button` = `.premium-button` + `background: var(--destructive)` + `color: var(--destructive-foreground)`.

## F3.7 - Sonner renders in light mode on a light-mode OS

**Severity: Medium** · **verified: `ThemeProvider` appears 0 times in `src/`**

```tsx
// components/ui/sonner.tsx:3,8,12
import { useTheme } from "next-themes"
const { theme = "system" } = useTheme()
theme={theme as ToasterProps["theme"]}
```
`next-themes` is installed but **no `ThemeProvider` is mounted anywhere**, so `useTheme()` falls back to its stub, `theme` is `undefined`, the destructuring default fires, and Sonner runs as `"system"` - resolving from `prefers-color-scheme`. Meanwhile `layout.tsx:96` hardcodes `<html className="dark">`.

**On a device set to light mode, toasts render light-on-white over a pure-black app.**

**Fix:** `sonner.tsx` → `theme="dark"`, delete the `next-themes` import, and remove `next-themes` from `package.json`. (`suppressHydrationWarning` on `<html>` is also vestigial - it exists to silence next-themes' pre-hydration DOM mutation, which never happens here. There is no FOUC risk; the class is a static server-rendered string.)

## F3.8 - Inputs: 6 heights, 3 radii, and two mutually exclusive fills

**Severity: Medium**

`components/ui/input.tsx:12` ships `h-8 … rounded-lg border-input bg-transparent`. **All 6 call sites override height, radius, border colour and background** - plus there are **20 raw `<input>` elements** that skip the component entirely. Result: heights of 32/36/40/44/48px, three radii, and `bg-black/15` (7 sites) vs `bg-white/[0.06]` (10 sites).

*A black-filled input on one screen and a white-filled input on the next is exactly a "different theme" perception.*

**Fix:** change the `input.tsx:12` base to `h-11 w-full rounded-xl border border-border bg-[rgba(255,255,255,0.06)] px-3 text-sm`, then **remove every `className` override** at the 6 `<Input>` sites and convert the 20 raw `<input>`s to use it.

## F3.9 - Radius scale is silently doubled, so nothing communicates hierarchy

**Severity: Medium** · `globals.css:42-48`

With `--radius: 1rem`, every step is ~2× the Tailwind default: `sm` 9.6px, `md` 12.8px, `lg` 16px, `xl` 22.4px, `2xl` 28.8px. `rounded-xl` and `rounded-2xl` differ by only 6.4px, so they read as identical - which is why authors pick semi-randomly (`templates/page.tsx:129` uses `rounded-2xl` for a text input, `templates/[id]:421` uses `rounded-xl` for the same kind of input, `profile/training:353` uses `rounded-lg`).

Side effects: `ui/input.tsx:12` at `h-8 rounded-lg` is a capsule (which is *why* every call site overrides it), and `Skeleton`'s default `rounded-md` (12.8px) never matches the 28.8px cards it stands in for, so all 27 call sites override it.

**Fix - give the scale visible separation while keeping the app's signature 28.8px surface:**
```css
--radius: 1rem;                            /* unchanged */
--radius-sm:  calc(var(--radius) * 0.375); /*  6px - micro (heatmap cells) */
--radius-md:  calc(var(--radius) * 0.625); /* 10px - badges, chips */
--radius-lg:  calc(var(--radius) * 0.75);  /* 12px - inputs, small buttons */
--radius-xl:  calc(var(--radius) * 1.0);   /* 16px - controls, list rows, icon buttons */
--radius-2xl: calc(var(--radius) * 1.8);   /* 28.8px - surfaces/cards (UNCHANGED) */
```
Drop `--radius-3xl` / `--radius-4xl` (2 and 1 uses). Then apply four values only: `rounded-2xl` for every card/panel/sheet/nav; `rounded-xl` for every button/input/icon-button/list row; `rounded-md` for badges; `rounded-full` for avatars/dots/tracks. Replace `rounded-[28px]` ×6 → `rounded-2xl`, `rounded-3xl` ×2 → `rounded-2xl`, `rounded-[3px]` → `rounded-sm`.

## F3.10 - Converge the surfaces and delete the dead code

**Severity: Medium**

`.content-card` (40 uses) is canon. `.premium-card`, `.elevated-surface` and `.glass-panel` are **byte-identical in appearance** - five class names for one card. Nine further hand-rolled recipes exist at 0.03/0.04/0.06/0.10 fill and 0.06/0.10/0.12 border.

**Convert:**

| File:line | Current | → |
|---|---|---|
| `progress/overview-tab.tsx:157,170,176,189` | `rounded-2xl border-white/[0.06] bg-white/[0.03] p-4` | `content-card p-4` |
| `onboarding/page.tsx:381,529,544,550,556,566,572` | `rounded-2xl border-white/10 bg-white/[0.04] px-4 py-3` | `content-card px-4 py-3` |
| `workout/complete/page.tsx:120,408,477` | `rounded-2xl border-white/[0.10] bg-white/[0.06] backdrop-blur-2xl px-4 py-4` | `content-card px-4 py-4` |
| `login/page.tsx:88` | 0.10-fill recipe + inline `boxShadow` | `content-card px-6 py-7 sm:px-8` (drop the `style` prop) |
| `pwa-install-banner.tsx:28`, `pwa-update-banner.tsx:12` | same 0.10-fill recipe | `content-card px-4 py-3` |
| `tutorial/getting-started-tutorial.tsx:208` | `rounded-2xl border-white/8 bg-white/[0.03] px-6 py-6` | `content-card px-6 py-6` |
| `levels/page.tsx:191,199` | `rounded-2xl border-white/[0.06] bg-white/[0.03]` | `content-card` / `action-card` |

**Delete outright:**
- `src/components/ui/card.tsx`, `button.tsx`, `badge.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `tabs.tsx` - **0 importers each** (verified), ~500 LOC. *(Exception: if you adopt `tabs.tsx` for the Progress segmented control at `progress/page.tsx:31-46`, keep it.)*
- From `globals.css`: `.glass-panel`, `.section-shell`, `.section-heading`, `.status-pill`, `.text-page-title`, `.text-section-heading`, `.text-body`, `.state-*` **only if not adopted in F3.5** (adopt them instead), `.glow-primary/-accent/-amber`, `.pt-safe`/`.pb-safe`/`.mb-safe`/`.min-h-safe-top`, the duplicate `.no-scrollbar`, keyframes `tier-sparkle-drift`/`tier-orbit`/`tier-nebula-glow`/`tier-conic-rotate`/`tier-apex-flare`, and the entire `:root` light block (L51–85, 28 tokens, self-documented as unused at L52).
- `pwa-update-banner.tsx` is **never imported anywhere** - either mount it in `(app)/layout.tsx` or delete it.

**One blur value:** `blur(20px) saturate(150%)`. Remove all `backdrop-blur-sm` (7), `backdrop-blur` (4) and `backdrop-blur-2xl` (12) in favour of surfaces carrying `.content-card` - subject to Phase 4, which removes most of them entirely.

---

# PHASE 4 - Make it smooth

## F4.1 - `backdrop-filter` on every card class is the primary cause of non-buttery scroll

**Severity: Critical** · `globals.css:197-260` - **verified: 14 `backdrop-filter` declarations in CSS, 29 `backdrop-blur*` classes in TSX**

Five of the six surface classes carry a live blur - `.content-card` (40 uses), `.action-card` (10), `.stat-card` (12), `.premium-card`, `.elevated-surface` - all `blur(20px) saturate(150%)`. And what they blur is a **`position: fixed`** three-layer radial gradient (`.page-shell::before`, `globals.css:171-181`).

`backdrop-filter` cannot be hoisted to the compositor as a static texture - it samples whatever is painted behind it. Because the backdrop is fixed and the cards scroll over it, **every card's sample region changes on every scroll frame**. A workout page with 8 exercises = 8 blur passes per frame before a single pixel of text is drawn. `/history` with 100 loaded sessions = 100 (`SessionRow` is `.action-card`). iOS GPUs fall off a cliff at roughly 6–8 concurrent blur regions.

**Fix - swap the blur for a static translucent fill on everything that scrolls.** On a true-black app with a 3–6% alpha gradient behind it, the two are visually near-identical:
```css
.content-card {
  @apply rounded-2xl border border-white/[0.12] px-5 py-5;
  background: rgba(255, 255, 255, 0.07);   /* was 0.06 + blur */
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 24px -4px rgba(0,0,0,0.3);
}
```
Repeat for `.action-card`, `.stat-card`, `.premium-card`, `.elevated-surface`. To keep the frosted look where it costs nothing:
```css
@media (min-width: 768px) and (hover: hover) {
  .content-card, .action-card { backdrop-filter: blur(20px) saturate(150%); }
}
```

**Also delete the nested blur** at `exercise-card.tsx:150` - that AI-suggestion panel is `backdrop-blur-2xl` (40px) *inside* a `.premium-card` that is already `blur(20px)`. Nested backdrop filters force the browser to rasterise the parent's blurred output to an intermediate surface and then run a second, wider blur over it. It cannot be batched: 2N passes per frame instead of N. The panel already paints its own gradient, border and inset shadow - the blur contributes nothing.

## F4.2 - Two or three fixed 40px-blur bars parked over the scroll surface

**Severity: Critical** · `bottom-nav.tsx:16`, `rest-timer.tsx:71-72`, `pwa-install-banner.tsx:28`, `workout/[id]/page.tsx:138`

A fixed blurred element over scrolling content is the textbook worst case: the element never moves, but its backdrop changes every frame, so the blur is invalidated and recomputed 60×/s - plus `saturate(150%)` is a second filter function in the same chain. `BottomNav` is always mounted on mobile, so **this is a fixed per-frame tax on every single screen**. During rest periods the timer stacks a second one directly above it; with the PWA banner that's three.

**Fix:** opaque fills. `bottom-nav.tsx:16` (already covered in F1.2's replacement), `rest-timer.tsx:72`, `pwa-install-banner.tsx:28`, `pwa-update-banner.tsx:12` → `bg-[oklch(0.10_0.012_260/0.92)]`. Same for the sticky workout header at `workout/[id]/page.tsx:138`.

## F4.3 - The rest timer animates `width` continuously, right when you're logging the next set

**Severity: High** · `rest-timer.tsx:38-51`, `:74-79`

```tsx
const id = setInterval(() => { setTick((n) => n + 1); ... }, 500);
...
<div className={`h-1 ${barColor}`} style={{ width: `${progress * 100}%`, transition: 'width 0.5s linear' }} />
```
`width` is a layout-triggering property. Every 500 ms a new width is committed and interpolated over 500 ms - **continuous layout + paint for the entire rest period** (60–180 s). And the parent is `backdrop-blur-2xl` (`:72`), so each of those frames also re-runs a 40px blur.

The rest timer is started automatically by `handleComplete` - so this runs during *exactly* the window in which the lifter taps weight/reps for the next set. **This is why "taps feel slow" and not "the app is slow".**

**Fix - composite-only bar, 1 Hz tick, no blur:**
```tsx
<div className="h-1 w-full bg-muted">
  <div className={`h-1 w-full origin-left ${barColor}`}
       style={{ transform: `scaleX(${progress})`, transition: 'transform 1s linear', willChange: 'transform' }} />
</div>
```
Change `:51` from `500` to `1000` (the readout is `mm:ss` - a 500 ms tick renders the same string half the time). Better still: drive the whole bar with one CSS animation started at `startRestTimer` and delete the `setTick` loop entirely.

## F4.4 - Non-composited animations: full inventory

**Severity: High**

| file:line | Animated property | Trigger | Verdict |
|---|---|---|---|
| `workout/[id]/page.tsx:156-161` | `transition-all` + `width` + `boxShadow` | every set completion, inside the blurred sticky header | **layout + paint + blur re-raster** |
| `rest-timer.tsx:77` | `width` | continuous during rest | layout (F4.3) |
| `home/level-chip.tsx:69-74` | `transition-[width]` + `boxShadow` | on load | layout |
| `workout/complete/page.tsx:142`, `:150-155` | `transition-all` + `width` + `boxShadow` | on load | layout + paint |
| `workout/complete/page.tsx:160-161` | `transition-all` + **`left`** | on load | layout |
| `globals.css:545-547` `tier-glow-shift` | `box-shadow` | **`infinite`** | paint every frame |
| `globals.css:550-553` `tier-bg-cycle` | `background-position` | **`infinite`** | paint every frame |
| `globals.css:556-559` `tier-bg-hue-cycle` | `background-position` + `filter` | **`infinite`** | paint + filter every frame |
| `globals.css:614-617` `tier-name-reveal` | `letter-spacing` + `filter: blur` | one-shot | layout + blur |
| `ui/sheet.tsx:57` | bare `transition` (includes `backdrop-filter`, `box-shadow`, `filter`) | every sheet open | animates backdrop-filter |

**Fix** - the highest-frequency offender first (`workout/[id]/page.tsx:154-163`):
```tsx
<div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
  <div className="h-full w-full origin-left rounded-full transition-transform duration-300 ease-out"
       style={{ transform: `scaleX(${totalSets > 0 ? savedSets / totalSets : 0})`,
                background: 'linear-gradient(90deg, oklch(0.75 0.18 55), oklch(0.72 0.19 155))' }} />
</div>
```
Drop the conditional `boxShadow` at `:160`. Apply the same `scaleX` treatment at `level-chip.tsx:69` and `workout/complete/page.tsx:142,150`; at `:160` replace `left: calc(…)` with `transform: translateX(…)`.

For the infinite paint-driven keyframes, replace `box-shadow` animation with an opacity-animated pseudo-element carrying a *static* shadow; for `tier-bg-cycle`, animate `transform: translateX()` on an oversized gradient inside `overflow: hidden`. `sheet.tsx:57` → `transition-[opacity,transform]`. `tier-name-reveal` → drop `letter-spacing` and `filter: blur`, keep `translateY` + `opacity`.

> The rest of the keyframe library (`fade-up`, `tier-pulse`, `tier-breathe`, `tier-sweep-x`, `tier-rotate`, `bounce-once`, …) is correctly transform/opacity-only. **That part is well done - leave it alone.**

## F4.5 - Charts: animation on by default, data rebuilt every render, nothing memoised

**Severity: High** · all 5 files in `components/progress/`

Every chart recreates its `data` array, `margin`, tick, tooltip and formatter objects on every render, and none is wrapped in `memo`. They therefore re-render on completely unrelated state:
- `exercises-tab.tsx:85` - **typing in the search box** re-renders all three charts (the search only filters a `<select>`)
- `overview-tab.tsx:233` - `setCopied(true/false)` for a 2-second "Copied!" toast re-renders both charts
- `progress/page.tsx:50` - the tab switch **unmounts** the whole tab, so every switch remounts all charts and replays recharts' default **1500 ms** mount animation, which animates SVG path `d` attributes on the main thread

**Fix - three edits per chart file:** hoist every literal object to module scope, wrap the data map in `useMemo`, wrap the component in `memo`, and set `isAnimationActive={false}` on `<Line>` / `<Bar>` / `<Area>` / `<Pie>`. Plus keep both tabs mounted:
```tsx
// progress/page.tsx:50
<div className={tab === 'overview'  ? '' : 'hidden'}><OverviewTab /></div>
<div className={tab === 'exercises' ? '' : 'hidden'}><ExercisesTab /></div>
```

## F4.6 - `/levels` renders 14 blurred cards × ~4 infinite animations each

**Severity: High** · `(app)/levels/page.tsx:285-299`, `lib/leveling/tier-visuals.tsx`

`tier-visuals.tsx` contains 53 `animation:` declarations, **11 permanent `willChange`** (verified), 11 conic-gradients, 11 CSS masks and 12 `filter: blur()`s across 1172 lines. Every tier's effects render **regardless of lock state** - the comment at `levels/page.tsx:283-284` says so explicitly. Add 13 `.action-card` blur regions and you have ~50 promoted compositor layers on one scrolling page. Once a phone exhausts its layer budget the compositor evicts textures and re-rasterises every frame - the failure mode is "everything suddenly chugs."

**Fix:**
```tsx
// levels/page.tsx:296 - only animate the tier the user is actually at
{state === 'current' && <TierCardEffects tier={tier} />}
```
Pass a `static` flag into `TierIcon` for the other 12. Combined with F4.1 this takes `/levels` from ~50 animated layers to ~4.

## F4.7 - `will-change` on ~20 elements for animations whose keyframes don't exist

**Severity: Medium** · **verified**

Five keyframe names referenced by `tier-visuals.tsx` are **defined nowhere in `globals.css`**:

| Referenced | Defined in globals.css | Used in tier-visuals |
|---|---|---|
| `tier-nebula-hue` | **0** | 1 |
| `tier-nebula-drift` | **0** | 1 (× 10 particles) |
| `tier-lensing-pulse` | **0** | 1 |
| `tier-solar-flare` | **0** | 1 |
| `tier-corona-ray` | **0** | 1 (× 8 rays) |

So roughly 20 elements carry `will-change` and a permanent compositor layer **for an animation that never runs**. `willChange: 'transform, box-shadow'` at `:732` is worse - `box-shadow` is not compositable, so the hint buys nothing and just pins a layer alive.

**Fix:** delete all 11 `willChange` declarations (transform/opacity keyframes are auto-promoted by every engine), and either define the five missing keyframes or delete the dead effect branches (`tier-visuals.tsx:606-631, 693-703, 725-770`) - they currently render DOM, box-shadows, conic gradients and masks for **zero visual output**.

## F4.8 - Unbounded lists rendered in full

**Severity: Medium**

| List | file:line | Cap | Worst case |
|---|---|---|---|
| History sessions | `history/page.tsx:125-131` | `PAGE_SIZE = 20`, `loadMore` appends with no ceiling | **unbounded** - 15 taps = 300 `.action-card` rows |
| Exercise library | `exercises/page.tsx:120-169` | `use-exercises.ts:48` is `.select('*')`, no limit | up to PostgREST's 1000 |
| Exercise picker sheet | `exercise-selector.tsx:186-202` | same hook | same |
| Templates | `templates/page.tsx:398` | `.select('*')`, no limit | unbounded |

**Fix:** F4.1 removes the per-row blur, which is the acute part. Then add:
```css
.list-virtual > * { content-visibility: auto; contain-intrinsic-size: auto 90px; }
```
to the wrappers at `history/page.tsx:124` and `exercises/page.tsx:119`. Add `.limit(200)` at `use-exercises.ts:48` and make search server-side (`.ilike('name', '%'+q+'%')`). **Debounce the searches** - `exercises/page.tsx:85`, `exercise-selector.tsx:138` and `exercises-tab.tsx:85` all re-filter the whole array and re-render every row on every keystroke with no memoised row component; reuse the debounce pattern that already exists at `templates/page.tsx:37-46`.

## F4.9 - `@dnd-kit`: blurred rows translate during reorder

**Severity: Medium** · `templates/[id]/page.tsx:81-95`

The author already spotted backdrop-blur as a drag cost and disabled it - but **only for the row being dragged** (`:86`). `.elevated-surface` is `backdrop-filter: blur(20px)`, and during a reorder dnd-kit applies `transform: translate3d(...)` with a 200 ms transition to **every other row**. A translating element with a live backdrop-filter must re-sample and re-blur on every frame - that's the expensive case, and it's the N−1 rows that aren't excluded.

**Fix:** drop the blur from the row entirely (`:95`), which makes the drag-time hack unnecessary. Memoise the style object, and hoist the inline closures at `:683-687` so the `memo` at `:70` actually holds.

---

# PHASE 5 - Stop the pop-in

## F5.1 - Skeleton/content dimension mismatches

**Severity: High** - every mismatch is a visible jump when data lands.

| Location | Skeleton | Real content | Δ |
|---|---|---|---|
| `exercises-tab.tsx:139` | `h-48` = 192px | 3 charts = **644px** | **+452** |
| `overview-tab.tsx:246-250` | ~522px | full coaching report ≈ 800–1400px | **+300 to +900** |
| `overview-tab.tsx:29` (muscle split) | `h-[200px]` | 180 + 16 + legend 124 = **320px** on mobile | **+120** |
| `history/page.tsx:96` | `h-14` = 56px ×5 | `SessionRow` = **90px** | **+34/row, +170** |
| `history/[id]:229-231` | 64/160/160 | 204 / 304 per block | **+140, +144** |
| `exercises-tab.tsx:163-175` | `h-16` = 64px ×3 | `.stat-card` = **98px** | **+34 each** |
| `exercises-tab.tsx:14,18,22` and `exercises/[id]:33,37,41` | `h-52` = 208px | `height={180}` | **−28 each** |
| `(app)/page.tsx:361-366` (templates) | 188px | 154 / 282 / 356 / 516 / 358 depending on branch | **−34 to +328** |
| `(app)/page.tsx:352-358` (heatmap) | `h-[180px]` | **290px** (or `null` if no data) | **+110 or −180** |

**Fix pattern:** build skeletons from the *same container classes* as the content, not raw pixel heights. Corrected values: history rows `h-[90px]`; stat cards `h-[98px]`; `dynamic()` chart loaders `h-[180px]` (not `h-52`); ExercisesTab charts `<Skeleton className="h-[204px]" />` ×3 in a `space-y-4`.

Also `chart-empty-state.tsx:7` is `h-40` (160px) while the charts it replaces are 180px - a 20px shift ×3 charts on the most common data path (any exercise with <2 logged sessions). Change to `h-[180px]`.

## F5.2 - Skeletons that collapse to nothing

**Severity: High** · `(app)/page.tsx:314-324`, `:352-358`

```tsx
{loading ? <Skeleton className="h-[88px] rounded-2xl" />
 : (data?.xpSessions?.length ?? 0) > 0 ? <LevelChip … /> : null}
```
A user with zero completed sessions gets `88px skeleton → 0px`, plus the `space-y-6` gap vanishes - **a 112px collapse**. The heatmap does the same for **180px**.

**Fix:** hoist the emptiness check *above* the loading check so an empty state never shows a skeleton it can't fill.

## F5.3 - Pages that render nothing (or the wrong data) while loading

**Severity: High**

| Page | file:line | Today |
|---|---|---|
| **Workout complete** | `workout/complete/page.tsx:332` | `if (!result) return null` - **a blank screen on the highest-emotion page in the app** |
| **Training prefs** | `profile/training/page.tsx:270` | A 16px spinner beside the h1 while the form shows **wrong defaults** (`weeklyTarget=4`, `experience='intermediate'`) which then silently swap to the user's real values |
| **Profile** | `profile/page.tsx:210-238` | **Six independent async flips, zero skeletons** - queue banner (+65px), Training Stage (+250px), name/avatar, counts, install row (+66px), member-since (+20px), each shifting the page |
| **Levels** | `levels/page.tsx:87-90` | 128px spinner standing in for ~1300px |

**Fix:** structural skeletons sized to real content for all four. `profile/page.tsx` should collapse queries 1–4 into one `Promise.all` behind a single loading flag, mirroring `useHomeData`. `profile/training` must gate the inputs rather than show incorrect values.

Also reserve space for `XpSlider` (`workout/complete/page.tsx:404`, 196px) - the Done button at `:444` currently moves under the user's thumb when it appears:
```tsx
{xpData ? <XpSlider data={xpData} /> : <div className="mt-6 h-[196px] w-full max-w-sm" aria-hidden />}
```

## F5.4 - Progress tab triple-flip

**Severity: Medium** · `use-progress.ts:190-204`

```ts
const [loading, setLoading] = useState(false);   // ← starts FALSE
useEffect(() => { ... setLoading(true); ...
```
So selecting an exercise produces **three sequential layouts**: `ChartEmptyState` (160px) → `Skeleton` (192px) → charts (644px).

`useExerciseList()` returns **no loading flag at all** - `exercises.length === 0` is the proxy, so a user with zero exercises sees a **permanently pulsing skeleton**. `usePersonalRecords()` likewise.

**Fix:** `useState(true)` for `useProgress.loading` (and reset to `true` at the top of the effect before any early return); add real `loading` flags to `useExerciseList` and `usePersonalRecords`.

## F5.5 - Live-updating numbers jitter

**Severity: Medium**

`tabular-nums` is declared at several sites, but on `.font-display` elements it is **inert** - the Google Fonts release of Barlow does not expose a `tnum` OpenType feature. So it fails exactly where it's needed: `levels/page.tsx:220`, `exercise-card.tsx:196`, `workout/complete/page.tsx:124,479`, `profile/training/page.tsx:314`.

Genuinely jittering: the workout elapsed timer (`workout/[id]/page.tsx:149`, no `tabular-nums`, string grows `0:00 → 10:00 → 1:00:00`), the home resume banner (`page.tsx:114-116`), and the animated XP counter (`complete/page.tsx:125`, counting `0 → 1,240` over 700 ms and re-laying out ~40 times).

**Fix - add a `.numeric` utility and route live digits through the mono face you already load:**
```css
.numeric {
  font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}
```
Apply to `rest-timer.tsx:82`, `workout/[id]/page.tsx:149`, `(app)/page.tsx:114`, `complete/page.tsx:124,479`, `exercise-card.tsx:196`. For animated counters also pin the width: `<span className="numeric inline-block min-w-[4ch] text-right">`. **This is the decision that justifies keeping Geist Mono in F2.7.**

## F5.6 - Smaller pop-in fixes

| ID | file:line | Problem | Fix |
|---|---|---|---|
| F5.6a | `rest-timer.tsx:58` | `Date.now()` read **in the render body**, outside any effect or memo - React 19 can re-render without a state change and get a different value each pass | Move `remaining` into the `setTick` state |
| F5.6b | `layout/offline-indicator.tsx:31-39` | `fixed inset-x-0 top-0` with **no safe-area padding** while the root sets `viewportFit: 'cover'` - the 36px bar renders *under* the Dynamic Island and *over* the page title | Add `pt-[max(0.5rem,env(safe-area-inset-top))] pb-2` |
| F5.6c | `ui/avatar-uploader.tsx:185-192` | `cacheControl: '0'` **plus** a permanent `?v=<timestamp>` - the avatar re-fetches from network on every page that renders it, forever | `cacheControl: '31536000'` (the `?v=` already busts on change) |
| F5.6d | `(app)/page.tsx:294-305` | Avatar `<img>` has no `decoding`/`onError`; a broken avatar leaves an empty orange circle where the initial used to be | Add `width={40} height={40} decoding="async"` + `onError` fallback to the initial (as `avatar-uploader.tsx:240` already does) |
| F5.6e | `overview-tab.tsx:241-242` | `error`/`aiError` `<p>` elements insert **above** everything with no reserved space | Render into a fixed-height `role="alert"` slot, or use the already-mounted sonner toaster |
| F5.6f | `(app)/page.tsx:55,97` | `ResumeWorkoutBanner` inserts **154px** at position 2 after persist rehydration | Read `useActiveWorkoutStore.persist.hasHydrated()` as the `useState` initial value |
| F5.6g | `templates/page.tsx:286` | `if (typeof window === 'undefined') return;` **inside a `useEffect`** - effects never run on the server | Delete the line |
| F5.6h | `muscle-split-chart.tsx:37` | Legend unbounded; mobile height is 320px against a 200px reservation | `min-h-[320px] sm:min-h-[228px]` on the wrapper + matching skeleton |

---

# 6. Already correct - do NOT "fix" these

Past passes have broken working code here. Leave all of it alone.

- **The offline-first write path.** `completeSet` (`active-workout-store.ts:413-431`) is synchronous, `logSetEntry` is correctly `void`-ed into a Dexie queue, `addToQueue` never touches the network, and `MobileNumpad` keeps its draft in local state so keystrokes never reach the store. `CLAUDE.md` constraint #2 is intact. **The set-logging path does not await the network.** Every fix in this report is presentation-layer.
- **recharts is properly code-split.** All five chart components are behind `next/dynamic` with `ssr: false` and skeleton fallbacks. No static recharts import exists anywhere.
- **lucide-react barrel imports are fine.** 44 files import named icons, but `lucide-react` and `recharts` are both in Next's default `optimizePackageImports` list - they tree-shake automatically.
- **`@dnd-kit` is correctly scoped** to `templates/[id]` only, in its own route chunk.
- **The Supabase browser client is a proper singleton** (`lib/supabase/client.ts:4-14`) - no per-render construction.
- **`use-home-data`'s six queries are genuinely parallel.** The problem is their *count* and *bounds*, not their concurrency.
- **Font fallback metrics are already handled.** `adjustFontFallback` defaults to `true` for `next/font/google`, so Next emits metric-adjusted local fallbacks and line-box heights do not change when the webfont lands. **Do not add `adjustFontFallback` - it's already on.**
- **All five `ResponsiveContainer`s have explicit heights.** No unbounded-height chart CLS exists.
- **`scrollbar-gutter: stable`** on `html` correctly prevents scrollbar-appearance shift. Keep it when applying F0.1.
- **The rest timer's `mm:ss` readout does not jitter** - both fields are zero-padded and the span is `flex-1`. Its *progress bar* is the problem (F4.3), not the digits.
- **`AnimatedNumber`** (`complete/page.tsx:71-89`) correctly honours `prefers-reduced-motion` and is a self-contained leaf.
- **There are zero `scroll` listeners, zero `IntersectionObserver`s and zero non-passive listeners** in `src/`. Nothing to fix.
- **Bundle size is not the load problem.** Measured from a real production build: **114 KB gz shared baseline, largest route chunk 11.7 KB gz.** That is unremarkable for Next 16 + React 19. The load problem is round-trips and architecture (F2.1–F2.6), not payload. Do not spend time on bundle golf.

---

# 7. Suggested PR sequence

| PR | Contents | Effort | What the owner will feel |
|---|---|---|---|
| **1** | F0.1, F0.2, F0.3 | ~2 h | Scrolling goes buttery; the workout header sticks; taps acknowledge instantly; the phone buzzes |
| **2** | F1.1, F1.2, F1.7, F1.8 | ~4 h | Navigation stops feeling broken - every tap paints something within a frame |
| **3** | F1.3–F1.6, F1.9 | ~4 h | The logging loop becomes snappy |
| **4** | F2.1, F2.2 | ~4 h + a Supabase JWT key migration | The app stops "taking ages"; back-navigation becomes instant |
| **5** | F2.3–F2.9 | ~4 h | Cold load and tab-focus stop refetching the world |
| **6** | F4.1–F4.4 | ~3 h | Frame rate on scroll and during rest periods |
| **7** | **F3.1, F3.2, F3.3** | ~3 h | 🔴 **"Different themes" largely disappears** - do this one early if the owner cares most about look |
| **8** | F3.4–F3.10 | ~8 h | The app reads as one product |
| **9** | F4.5–F4.9, F5.* | ~6 h | Charts, lists, and the last of the pop-in |

> If the owner's top complaint is the *look* rather than the *feel*, promote PR 7 to run right after PR 1. It is independent of everything else.

# 8. Definition of done

Test on a real phone, throttled to Slow 4G, with a populated account:

- [ ] `npx tsc --noEmit` clean and `npm run build` passing after every PR
- [ ] Scroll the workout screen - the header stays pinned, scrolling is smooth, the iOS address bar collapses normally
- [ ] Tap the set tick - visible response within one frame, plus a haptic on iPhone
- [ ] Tap each bottom-nav item - the tab highlights instantly, and content (skeleton or real) appears within one frame
- [ ] Navigate Home → History → Home - the second Home render shows content immediately, no skeleton flash
- [ ] Switch to another app and back - the page does **not** collapse to skeletons
- [ ] Walk Home → Templates → Progress → Profile → Levels - the background, page title size, card fill and border are identical on every screen
- [ ] Open the Progress tab - chart greys, tooltips and series colours match the rest of the app
- [ ] Set the OS to light mode - toasts still render dark
- [ ] Record a DevTools performance trace while scrolling `/history` with 100+ sessions - no frames over 16 ms

---

*Audit performed against commit `430c6e3`. TypeScript compiles clean; the production build succeeds. Findings marked "verified" were confirmed by direct execution - a headless-Chromium repro for the sticky/overflow bug, a real production build for the bundle and Dexie figures, and greps for the colour, dead-code and keyframe counts. All other findings are from direct code reading and quote the code they describe.*
