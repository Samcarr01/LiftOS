/**
 * Cycle 2 — Task 3: the set row fits a 375px phone
 *
 * Run with: npx tsx src/components/workout/__tests__/set-row-mobile-layout.spec.ts
 *
 * Plan: .hermes/plans/2026-08-09_220224-cycle-2-mobile-logging-loop.md Task 3.
 *
 * A set row is one non-wrapping flex line holding four things: the set-type
 * chip, the Last readout, one editable control per tracking field, and the
 * complete tick. Three of those declare a width they refuse to give up
 * (`shrink-0`, `min-w-[…]`), so on a 375px screen the only element left to
 * absorb the shortfall is the pair of numeric controls — the two things the
 * lifter has to hit.
 *
 * This suite states the layout as arithmetic, because that is the failure: the
 * row's minimum intrinsic width against the width a 375px viewport actually
 * leaves it. Every input to that sum is read out of the source rather than
 * hardcoded here, so the contract tracks the components instead of a snapshot
 * of them. The measured chain, for a standard weight × reps exercise:
 *
 *   375  viewport
 *   −2×  .page-content horizontal padding      (globals.css)
 *   −2×  premium-card horizontal padding       (exercise-card.tsx)
 *   −2×  set row horizontal padding            (set-row.tsx)
 *   =    the width the row has to lay out in
 *
 * Four properties, all at 375px:
 *   1. semantic order stays set chip → Last → editable fields → Complete;
 *   2. every control the thumb lands on is at least 44px;
 *   3. Last is render-only — never a control competing for the same space;
 *   4. the row either fits that width or wraps, rather than overflowing.
 *
 * Out of scope by the plan's own constraint (no RIR changes): the optional
 * final-set RIR line, which is a second row and not part of this contract.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Assertion helpers (same plain style as the Cycle 1/2/3 suites) ───────────

const failures: string[] = [];

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
const setRow = readFileSync(join(COMPONENTS, 'set-row.tsx'), 'utf8');
const numericInput = readFileSync(join(COMPONENTS, 'numeric-input.tsx'), 'utf8');
const exerciseCard = readFileSync(join(COMPONENTS, 'exercise-card.tsx'), 'utf8');
const globalsCss = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8');

/** The narrowest phone the plan requires, and Tailwind's 4px spacing step. */
const VIEWPORT = 375;
const STEP = 4;
const TOUCH_TARGET = 44;
/** A standard weight × reps exercise — the schema the plan names. */
const FIELD_COUNT = 2;

function index(source: string, anchor: string): number {
  const at = source.indexOf(anchor);
  assert(at !== -1, `Expected to find ${JSON.stringify(anchor)} — the layout anchor this contract reads`);
  return at;
}

/** Every quoted string inside a `{...}` expression, joined — handles cn(...). */
function classesInBraces(source: string, openBrace: number): string {
  let depth = 0;
  let end = source.length;
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const span = source.slice(openBrace, end);
  return [...span.matchAll(/['"`]([^'"`]*)['"`]/g)].map((m) => m[1]).join(' ');
}

/** The class list of the `className=` at `at`, whether a string or a cn(...). */
function classesAt(source: string, at: number): string {
  const rest = source.slice(at + 'className='.length);
  if (rest.startsWith('"')) return rest.slice(1, rest.indexOf('"', 1));
  if (rest.startsWith('{')) return classesInBraces(source, at + 'className='.length);
  throw new Error(`Unrecognised className form at offset ${at}`);
}

/** The `back`-th `className=` at or before `before` (1 = nearest). */
function classesBefore(source: string, before: number, back = 1): string {
  const positions = [...source.slice(0, before).matchAll(/className=/g)].map((m) => m.index ?? -1);
  const at = positions[positions.length - back];
  assert(at !== undefined && at >= 0, `Expected ${back} enclosing className(s) before offset ${before}`);
  return classesAt(source, at);
}

/** The first `className=` at or after `after`. */
function classesAfter(source: string, after: number): string {
  const at = source.indexOf('className=', after);
  assert(at !== -1, `Expected a className after offset ${after}`);
  return classesAt(source, at);
}

function tailwindPx(raw: string): number {
  return raw.endsWith('px') ? parseFloat(raw) : parseFloat(raw) * STEP;
}

/**
 * Tailwind tokens are read out of both class strings and raw JSX, so the
 * boundaries are "not part of a longer token" rather than whitespace — a
 * `min-w-[60px]` sitting against its opening quote still counts.
 */
function sizeTokens(source: string, axis: 'w' | 'h'): number[] {
  const pattern = new RegExp(`(?<![\\w-])(?:min-)?${axis}-(?:\\[(\\d+(?:\\.\\d+)?)px\\]|(\\d+(?:\\.\\d+)?))(?![\\w-])`, 'g');
  return [...source.matchAll(pattern)].map((m) => tailwindPx(m[1] ? `${m[1]}px` : m[2]));
}

/** The widest floor a class list declares: fixed w-*, min-w-* or min-w-[Npx]. */
function widthFloorPx(classes: string): number {
  const found = sizeTokens(classes, 'w');
  return found.length > 0 ? Math.max(...found) : 0;
}

function heightPx(classes: string): number {
  const found = sizeTokens(classes, 'h');
  return found.length > 0 ? Math.max(...found) : 0;
}

function gapPx(classes: string): number {
  const found = classes.match(/(?<![\w-])gap(?:-x)?-(\d+(?:\.\d+)?)(?![\w-])/);
  return found ? tailwindPx(found[1]) : 0;
}

function paddingXPx(classes: string, label: string): number {
  const found = classes.match(/(?<![\w-])px-(\d+(?:\.\d+)?)(?![\w-])/);
  assert(found !== null, `${label} still declares horizontal padding this contract can measure`);
  return tailwindPx(found![1]);
}

// ── The measured row ─────────────────────────────────────────────────────────

const chipAnchor = index(setRow, 'onClick={cycleType}');
const fieldsAnchor = index(setRow, '{fields.map(');
const numericAnchor = index(setRow, '<NumericInput');
const completeAnchor = index(setRow, 'onClick={onComplete}');

const outerClasses = classesBefore(setRow, chipAnchor, 2);
const rowClasses = classesBefore(setRow, chipAnchor, 1);
const chipClasses = classesAfter(setRow, chipAnchor);
const fieldsClasses = classesBefore(setRow, fieldsAnchor, 1);
const fieldColumnClasses = classesAfter(setRow, index(setRow, 'key={field.key}'));
const completeClasses = classesAfter(setRow, completeAnchor);

/** Everything between the set-type chip and the editable fields is the Last column. */
const lastColumn = setRow.slice(setRow.indexOf('</button>', chipAnchor), fieldsAnchor);

/** The control a thumb actually hits on a phone: the numpad trigger. */
const numpadTriggerAnchor = index(numericInput, 'onClick={() => setNumpadOpen(true)}');
const numpadTriggerClasses = classesAfter(numericInput, numpadTriggerAnchor);

console.log('Running set row mobile layout (Cycle 2) contract...\n');

// ── P1: order the row is read in ─────────────────────────────────────────────
check('P1: semantic order is set chip → Last → editable fields → Complete', () => {
  const order = [
    ['set type / number', chipAnchor],
    ['Last', index(setRow, 'Last</p>')],
    ['editable fields', numericAnchor],
    ['Complete', completeAnchor],
  ] as const;

  for (let i = 1; i < order.length; i++) {
    assert(
      order[i][1] > order[i - 1][1],
      `${order[i][0]} still comes after ${order[i - 1][0]} in the DOM. Narrow-screen layout may wrap or stack the ` +
        'row, but it must not reorder it — screen readers and tab order follow the source, not the grid.',
    );
  }
});

// ── P2: reachable controls ───────────────────────────────────────────────────
check('P2: every control in the row is at least 44px', () => {
  for (const [label, classes] of [
    ['the set-type chip', chipClasses],
    ['the complete tick', completeClasses],
    ['the numeric field control', numpadTriggerClasses],
  ] as const) {
    const height = heightPx(classes);
    assert(
      height >= TOUCH_TARGET,
      `${label} is ${height}px tall; a one-handed tap target is at least ${TOUCH_TARGET}px (found: "${classes.trim()}")`,
    );
  }
});

// ── P3: Last is a readout, not a control ─────────────────────────────────────
check('P3: Last is display-only', () => {
  for (const control of ['<button', '<input', 'onClick=', 'NumericInput', 'contentEditable']) {
    assert(
      !lastColumn.includes(control),
      `The Last column contains no ${control} — last session's numbers are reference, and making them tappable ` +
        'would put a second control where the editable fields need the width',
    );
  }
  assert(/formatLast\(/.test(lastColumn), 'The Last column still renders formatLast(...) — the readout itself is unchanged');
});

// ── P4: the fields share what is left, equally ───────────────────────────────
check('P4: the editable fields get equal, shrinkable width', () => {
  assert(
    /(?:^|\s)flex-1(?:\s|$)/.test(fieldColumnClasses),
    `Each field column takes an equal share of the row (found: "${fieldColumnClasses.trim()}")`,
  );
  assert(
    /(?:^|\s)min-w-0(?:\s|$)/.test(fieldColumnClasses),
    'Each field column may shrink below its content width rather than pushing the row wider',
  );
});

// ── P5: the arithmetic — does the row fit a 375px phone? ─────────────────────
check('P5: at 375px the row fits, or wraps rather than overflowing', () => {
  const pagePadding = paddingXPx(
    globalsCss.match(/\.page-content\s*\{([^}]*)\}/)?.[1] ?? '',
    '.page-content',
  );
  const cardPadding = paddingXPx(
    exerciseCard.match(/premium-card[^"'`]*/)?.[0] ?? '',
    'The exercise card',
  );
  const rowPadding = paddingXPx(outerClasses, 'The set row');

  const available = VIEWPORT - 2 * pagePadding - 2 * cardPadding - 2 * rowPadding;

  const rowGap = gapPx(rowClasses);
  const fieldGap = gapPx(fieldsClasses);
  const chipWidth = widthFloorPx(chipClasses);
  const lastWidth = widthFloorPx(lastColumn);
  const completeWidth = widthFloorPx(completeClasses);
  const controlWidth = widthFloorPx(numpadTriggerClasses);

  const fieldsWidth = FIELD_COUNT * controlWidth + (FIELD_COUNT - 1) * fieldGap;
  const demanded = chipWidth + lastWidth + fieldsWidth + completeWidth + 3 * rowGap;

  const wraps = /(?:^|\s)flex-wrap(?:\s|$)/.test(rowClasses)
    || /(?:^|\s)flex-col(?:\s|$)/.test(rowClasses)
    || /max-\[\d+px\]:/.test(rowClasses)
    || /max-\[\d+px\]:/.test(lastColumn);

  const breakdown =
    `\n      viewport ${VIEWPORT} − page ${2 * pagePadding} − card ${2 * cardPadding} − row ${2 * rowPadding} = ${available}px available` +
    `\n      chip ${chipWidth} + Last ${lastWidth} + fields ${fieldsWidth} (${FIELD_COUNT} × ${controlWidth} + ${fieldGap}) + complete ${completeWidth} + gaps ${3 * rowGap} = ${demanded}px demanded`;

  assert(
    wraps || demanded <= available,
    `The row demands ${demanded}px of a ${available}px line and declares no narrow-screen wrap or stack, so ` +
      `${demanded - available}px comes out of the numeric controls — the two elements the lifter has to hit.${breakdown}`,
  );
});

// ── P6: no desktop regression, and nothing forces a scrollbar ────────────────
check('P6: the row never declares a fixed width wider than the phone', () => {
  const rowWidth = widthFloorPx(rowClasses);
  assert(
    rowWidth === 0 || rowWidth <= VIEWPORT,
    `The row itself declares no fixed width (found ${rowWidth}px) — horizontal scrolling is never the answer on a phone`,
  );
  assert(
    !/overflow-x-(?:auto|scroll)/.test(rowClasses) && !/overflow-x-(?:auto|scroll)/.test(outerClasses),
    'The set row does not become horizontally scrollable — a lifter mid-set should not have to pan to reach the tick',
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\n❌ ${failures.length} set row layout contract(s) failing:\n`);
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exitCode = 1;
} else {
  console.log('\n✅ All set row mobile layout (Cycle 2) contracts passed!');
  console.log('Coverage verified:');
  console.log('  ✓ Semantic order survives whatever the narrow layout does visually');
  console.log('  ✓ Chip, numeric control and complete tick are all ≥44px');
  console.log('  ✓ Last stays a readout, never a control');
  console.log('  ✓ The editable fields share equal, shrinkable width');
  console.log('  ✓ At 375px the row fits its line or wraps — it never overflows or scrolls sideways');
}
