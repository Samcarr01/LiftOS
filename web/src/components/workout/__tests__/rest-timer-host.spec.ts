/**
 * Cycle 2 — Task 1: the rest timer has exactly one host
 *
 * Run with: npx tsx src/components/workout/__tests__/rest-timer-host.spec.ts
 *
 * Plan: .hermes/plans/2026-08-09_220224-cycle-2-mobile-logging-loop.md Task 1.
 *
 * `RestTimer` already exists, already reads `restTimer` off the store, already
 * beeps, vibrates and stops itself — and `ExerciseCard`/`SupersetCard` already
 * call `startRestTimer(restSeconds)` when a set is ticked off. The one thing
 * missing is a host: nothing in the route tree renders `<RestTimer />`, so the
 * countdown a lifter is told to wait for is never on screen.
 *
 * This is a *route-host* contract, so it reads the route's source rather than
 * rendering it. What matters here is structural and is not observable from a
 * single render: where the element is mounted, and how many of it exist. A
 * timer mounted inside the exercise map would produce one fixed-position
 * countdown per exercise, all reading the same single store timer — visually
 * stacked duplicates that a "does it render" test would happily pass.
 *
 * Four properties:
 *
 *   1. The active-workout route imports `RestTimer`.
 *   2. It mounts it exactly once.
 *   3. That mount is outside the repeated exercise/superset rows.
 *   4. No per-exercise or per-set component mounts one of its own.
 *
 * Plus a regression guard on what Cycle 2 must not disturb: the timer stays
 * bottom-positioned (never a top-of-screen mobile notification), keeps its stop
 * control, and the completion path still starts it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Assertion helpers (same plain style as the Cycle 1/2/3 suites) ───────────

const failures: string[] = [];

/** Run one named contract; record rather than throw, so one run shows every gap. */
function check(name: string, body: () => void) {
  try {
    body();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}\n      ${message}`);
    console.log(`  ✗ ${name}\n      ${message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Source under contract ────────────────────────────────────────────────────

const COMPONENTS = join(__dirname, '..');
const APP = join(__dirname, '..', '..', '..', 'app');

function read(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Could not read ${path} — run this suite from the web/ directory`);
  }
}

const pagePath = join(APP, 'workout', '[id]', 'page.tsx');
const page = read(pagePath);
const restTimer = read(join(COMPONENTS, 'rest-timer.tsx'));
const exerciseCard = read(join(COMPONENTS, 'exercise-card.tsx'));
const supersetCard = read(join(COMPONENTS, 'superset-card.tsx'));
const setRow = read(join(COMPONENTS, 'set-row.tsx'));

function countMounts(source: string): number {
  return source.match(/<RestTimer[\s/>]/g)?.length ?? 0;
}

/**
 * The source span of the exercise map callback — from the `(` that opens
 * `.map(` to its matching `)`. Anything mounted inside this span is rendered
 * once per exercise group, which is exactly what a single global timer must
 * not be.
 */
function exerciseMapSpan(source: string): { start: number; end: number } {
  const anchor = source.indexOf('groupExercises(workout.exercises).map(');
  assert(anchor !== -1, 'The route still renders its exercises through groupExercises(...).map(...)');

  const start = source.indexOf('(', anchor + 'groupExercises(workout.exercises).map'.length - 1);
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return { start, end: i };
    }
  }
  throw new Error('Could not find the end of the exercise map callback');
}

console.log('Running rest timer host (Cycle 2) contract...\n');

// ── P1: the route imports the timer ──────────────────────────────────────────
check('P1: the active-workout route imports RestTimer', () => {
  assert(
    /import\s*\{[^}]*\bRestTimer\b[^}]*\}\s*from\s*['"](?:@\/components\/workout\/rest-timer|\.{1,2}\/(?:components\/workout\/)?rest-timer)['"]/.test(page),
    'app/workout/[id]/page.tsx imports RestTimer from the existing component — the countdown is reused, not rebuilt',
  );
});

// ── P2: exactly one of it ────────────────────────────────────────────────────
check('P2: the route mounts RestTimer exactly once', () => {
  const mounts = countMounts(page);
  assert(
    mounts === 1,
    `app/workout/[id]/page.tsx mounts <RestTimer /> exactly once — found ${mounts}. ` +
      'Zero means an active rest is invisible; more than one means duplicate fixed-position ' +
      'countdowns stacked on top of each other, all driven by the same store timer.',
  );
});

// ── P3: mounted outside the repeated rows ────────────────────────────────────
check('P3: the mount is outside the repeated exercise/superset rows', () => {
  const mountIndex = page.search(/<RestTimer[\s/>]/);
  assert(mountIndex !== -1, 'The route mounts <RestTimer /> somewhere (see P2)');

  const { start, end } = exerciseMapSpan(page);
  assert(
    mountIndex < start || mountIndex > end,
    'The single <RestTimer /> is mounted at the page level, not inside groupExercises(...).map(...) — ' +
      'one timer for the session, not one per exercise',
  );
});

// ── P4: no per-exercise or per-set component grows its own ───────────────────
check('P4: no repeated child component mounts a timer of its own', () => {
  for (const [name, source] of [
    ['exercise-card.tsx', exerciseCard],
    ['superset-card.tsx', supersetCard],
    ['set-row.tsx', setRow],
  ] as const) {
    assert(
      countMounts(source) === 0,
      `${name} renders once per exercise or per set, so it must never mount <RestTimer /> — it starts the timer through the store instead`,
    );
  }
});

// ── P5: the released timer behaviour Cycle 2 must not disturb ────────────────
check('P5: the timer stays bottom-positioned, stoppable, and store-driven', () => {
  const container = restTimer.match(/className="(fixed[^"]*)"/)?.[1];
  assert(container !== undefined, 'RestTimer still positions itself with a fixed container');
  assert(
    /\bbottom-\d/.test(container!) && !/(^|\s)top-\d/.test(container!),
    `RestTimer stays anchored to the bottom of the viewport — mobile feedback is never placed at the top (found: "${container}")`,
  );
  assert(/onClick=\{stopTimer\}/.test(restTimer), 'RestTimer keeps its close control wired to stopRestTimer');
  assert(/navigator\.vibrate/.test(restTimer) && /playBeep\(\)/.test(restTimer), 'RestTimer keeps its beep and vibration on expiry');
  assert(
    /startRestTimer\(restSeconds\)/.test(exerciseCard) && /startRestTimer\(restSeconds\)/.test(supersetCard),
    'Completing a set still starts the shared store timer — the host only renders it',
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\n❌ ${failures.length} rest timer host contract(s) failing:\n`);
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exitCode = 1;
} else {
  console.log('\n✅ All rest timer host (Cycle 2) contracts passed!');
  console.log('Coverage verified:');
  console.log('  ✓ The active-workout route imports the existing RestTimer');
  console.log('  ✓ It mounts exactly one, so an active rest is visible exactly once');
  console.log('  ✓ The mount sits outside the repeated exercise/superset rows');
  console.log('  ✓ No per-exercise or per-set component mounts a competing timer');
  console.log('  ✓ Bottom position, stop control, beep/vibration and store start path are untouched');
}
