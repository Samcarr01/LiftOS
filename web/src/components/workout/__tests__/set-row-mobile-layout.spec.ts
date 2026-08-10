/**
 * Cycle 2 rollback — the set row is one compact line on a 375px phone
 *
 * Run with: npx tsx src/components/workout/__tests__/set-row-mobile-layout.spec.ts
 *
 * Plan: .hermes/plans/2026-08-09_220224-cycle-2-mobile-logging-loop.md Task 3,
 * superseded on the layout question by Sam's rejection of the Cycle 2 phone UI.
 *
 * Cycle 2 answered "the row is tight at 375px" by letting the row wrap: the
 * flex line got `flex-wrap`, the field group got a basis wide enough to force
 * itself onto a second line, and the Last column got `flex-1` so it ate what
 * was left of the first one. Each set became two stacked bands. Reviewed on a
 * phone, that is the wrong trade — a lifter scans four or five sets at a glance
 * between reps, and doubling the height of every one of them costs more than
 * the few pixels it bought the numeric controls.
 *
 * So the contract inverts. The row is one compact, non-wrapping line again, and
 * the elements shrink to fit rather than the row growing to hold them. What
 * survives the rollback unchanged is everything that was never about density:
 * DOM order, Last as a readout, 44px touch targets, and no sideways scrolling.
 *
 * This suite reads layout primitives out of the source rather than measuring a
 * render, because the regression is expressible in exactly those primitives —
 * which classes the row and its three regions are allowed to declare:
 *
 *   1. semantic order stays set chip → Last → editable fields → Complete;
 *   2. every control the thumb lands on is at least 44px;
 *   3. Last is render-only — never a control competing for the same space;
 *   4. the row is a single line: no wrap, no column, at any breakpoint;
 *   5. the field group shares the line — it never reserves a full-width row;
 *   6. Last is a compact reservation, not a flexible share of the line;
 *   7. nothing declares a width that would make the row scroll sideways.
 *
 * Out of scope: RestTimer behaviour and the numpad draft rule, both of which
 * Cycle 2 got right and neither of which this rollback touches. Also the
 * optional final-set RIR line, which is a deliberate second row.
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

/** The narrowest phone the plan requires, and Tailwind's 4px spacing step. */
const VIEWPORT = 375;
const STEP = 4;
const TOUCH_TARGET = 44;

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

/** `flex-1` as its own unprefixed class — the layout the phone actually gets. */
function hasBaseClass(classes: string, token: string): boolean {
  return new RegExp(`(?:^|\\s)${token}(?:\\s|$)`).test(classes);
}

/** The same class at any breakpoint: `flex-wrap`, `sm:flex-wrap`, `md:flex-wrap`. */
function variantsOf(classes: string, token: string): string[] {
  const pattern = new RegExp(`(?:^|\\s)((?:[a-z0-9-]+:)*${token})(?:\\s|$)`, 'g');
  return [...classes.matchAll(pattern)].map((m) => m[1]);
}

/**
 * A class that makes an element claim a whole line to itself: `w-full`,
 * `basis-full`, or a basis computed off 100% like `basis-[calc(100%_-_3.25rem)]`.
 */
function fullWidthClaims(classes: string): string[] {
  const pattern = /(?:^|\s)((?:[a-z0-9-]+:)*(?:w-full|basis-full|basis-\[[^\]]*100%[^\]]*\]))(?:\s|$)/g;
  return [...classes.matchAll(pattern)].map((m) => m[1]);
}

// ── The measured row ─────────────────────────────────────────────────────────

const chipAnchor = index(setRow, 'onClick={cycleType}');
const fieldsAnchor = index(setRow, '{fields.map(');
const numericAnchor = index(setRow, '<NumericInput');
const completeAnchor = index(setRow, 'onClick={onComplete}');
const lastAnchor = setRow.indexOf('</button>', chipAnchor);

const outerClasses = classesBefore(setRow, chipAnchor, 2);
const rowClasses = classesBefore(setRow, chipAnchor, 1);
const chipClasses = classesAfter(setRow, chipAnchor);
const fieldsClasses = classesBefore(setRow, fieldsAnchor, 1);
const fieldColumnClasses = classesAfter(setRow, index(setRow, 'key={field.key}'));
const lastColumnClasses = classesAfter(setRow, lastAnchor);
const completeClasses = classesAfter(setRow, completeAnchor);

/** Everything between the set-type chip and the editable fields is the Last column. */
const lastColumn = setRow.slice(lastAnchor, fieldsAnchor);

/** The control a thumb actually hits on a phone: the numpad trigger. */
const numpadTriggerAnchor = index(numericInput, 'onClick={() => setNumpadOpen(true)}');
const numpadTriggerClasses = classesAfter(numericInput, numpadTriggerAnchor);

console.log('Running set row compact mobile layout contract...\n');

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
      `${order[i][0]} still comes after ${order[i - 1][0]} in the DOM. Compacting the row must not reorder it — ` +
        'screen readers and tab order follow the source, not the visual density.',
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

// ── P4: one line, at every width ─────────────────────────────────────────────
check('P4: the row is a single compact line — it never wraps or stacks', () => {
  for (const token of ['flex-wrap', 'flex-wrap-reverse', 'flex-col', 'flex-col-reverse']) {
    const found = variantsOf(rowClasses, token);
    assert(
      found.length === 0,
      `The set row declares ${found.join(', ')}. A wrapped or stacked row turns every set into two bands and ` +
        `doubles the height of the exercise card on a ${VIEWPORT}px phone — the density regression this rolls back. ` +
        `The row is one flex line and its contents shrink to fit (found: "${rowClasses.trim()}")`,
    );
  }

  const gatedNowrap = variantsOf(rowClasses, 'flex-nowrap').filter((token) => token.includes(':'));
  assert(
    gatedNowrap.length === 0,
    `The single-line layout is gated behind ${gatedNowrap.join(', ')}, which means the phone gets the wrapped ` +
      'layout and only a wider screen gets the compact one. Compact is the base case, not the enhancement.',
  );
});

// ── P5: the field group shares the line ──────────────────────────────────────
check('P5: the editable fields share the line rather than reserving a row', () => {
  const claims = fullWidthClaims(fieldsClasses);
  assert(
    claims.length === 0,
    `The field group declares ${claims.join(', ')}, which reserves a line of its own and pushes the fields below ` +
      `the chip and Last. On a ${VIEWPORT}px phone the fields sit beside them (found: "${fieldsClasses.trim()}")`,
  );
  assert(
    hasBaseClass(fieldsClasses, 'flex-1'),
    `The field group takes the line's remaining space as an unprefixed flex-1 — not a breakpoint-gated one, or ` +
      `the phone falls back to whatever basis is left (found: "${fieldsClasses.trim()}")`,
  );
  assert(
    hasBaseClass(fieldsClasses, 'min-w-0'),
    `The field group may shrink below its content width rather than pushing the row wider ` +
      `(found: "${fieldsClasses.trim()}")`,
  );
});

// ── P6: Last stays a compact reservation ─────────────────────────────────────
check('P6: Last takes a fixed compact slot, not a flexible share of the line', () => {
  assert(
    !hasBaseClass(lastColumnClasses, 'flex-1') && !hasBaseClass(lastColumnClasses, 'grow'),
    `The Last column grows to fill the line (found: "${lastColumnClasses.trim()}"). Once the row stops wrapping, ` +
      'every pixel Last takes comes straight out of the two numeric controls the lifter has to hit — it is a ' +
      'reference readout and gets a fixed slot.',
  );
  assert(
    fullWidthClaims(lastColumnClasses).length === 0,
    `The Last column claims a full-width row (found: "${lastColumnClasses.trim()}")`,
  );
});

// ── P7: the fields divide what is left, equally ──────────────────────────────
check('P7: each field column gets an equal, shrinkable share', () => {
  assert(
    hasBaseClass(fieldColumnClasses, 'flex-1'),
    `Each field column takes an equal share of the field group (found: "${fieldColumnClasses.trim()}")`,
  );
  assert(
    hasBaseClass(fieldColumnClasses, 'min-w-0'),
    'Each field column may shrink below its content width rather than pushing the row wider',
  );
});

// ── P8: nothing forces a scrollbar ───────────────────────────────────────────
check('P8: the row never declares a fixed width wider than the phone', () => {
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
  console.log('\n✅ All set row compact mobile layout contracts passed!');
  console.log('Coverage verified:');
  console.log('  ✓ Semantic order is unchanged by the compact layout');
  console.log('  ✓ Chip, numeric control and complete tick are all ≥44px');
  console.log('  ✓ Last stays a readout, never a control, in a fixed compact slot');
  console.log('  ✓ The row is one non-wrapping line at every width');
  console.log('  ✓ The field group shares that line and divides it equally');
  console.log('  ✓ Nothing declares a width that would scroll the row sideways');
}
