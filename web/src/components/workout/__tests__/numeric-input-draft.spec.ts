/**
 * Cycle 2 — Task 2: a typed numpad draft is committed only by an explicit confirm
 *
 * Run with: npx tsx src/components/workout/__tests__/numeric-input-draft.spec.ts
 *
 * Plan: .hermes/plans/2026-08-09_220224-cycle-2-mobile-logging-loop.md Task 2.
 *
 * The mobile numpad holds what the lifter is typing in local `str` state and
 * has exactly one exit that means anything: the check key. Every other way out
 * — the backdrop, and (once they exist) a Cancel control and the Escape key —
 * must leave the saved set value exactly as it was. There is no third outcome:
 * a dismissal never half-commits, and a confirm always commits, including the
 * deliberate commit of a blank.
 *
 * That rule is a pure function of (saved value, draft string, how the pad was
 * closed), so this suite states it as one: `resolveNumpadDraft`. Keeping it out
 * of the component is what makes "backdrop preserved 30" assertable at all —
 * the alternative is asserting against a portal, a touch and a store.
 *
 * The seam this suite requires:
 *
 *   export function resolveNumpadDraft(input: {
 *     savedValue: number | '';
 *     draft: string;
 *     action: 'confirm' | 'cancel' | 'backdrop' | 'escape';
 *   }): { value: number | ''; committed: boolean }
 *
 * `value` is what the set should hold afterwards and `committed` says whether
 * the pad changed anything — so a caller can stay silent on a dismissal rather
 * than writing the old value back over a store that may have moved on.
 *
 * The four plan cases, plus the wiring that has to exist around them:
 *   1. 30, type 32.5, confirm            → 32.5
 *   2. 30, type 32.5, backdrop/Cancel/Esc → 30
 *   3. blank, type a draft, dismiss      → blank
 *   4. blank/invalid + confirm           → blank, and only then
 */

// ── The module under contract ────────────────────────────────────────────────

import * as NumericInputModule from '../numeric-input';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type NumpadAction = 'confirm' | 'cancel' | 'backdrop' | 'escape';
type NumpadDraftInput = { savedValue: number | ''; draft: string; action: NumpadAction };
type NumpadDraftResult = { value: number | ''; committed: boolean };
type ResolveNumpadDraft = (input: NumpadDraftInput) => NumpadDraftResult;

/** Read through an index so an absent seam is a stated failure, not a load error. */
const resolveNumpadDraft = (NumericInputModule as unknown as Record<string, unknown>)
  .resolveNumpadDraft as ResolveNumpadDraft | undefined;

const DISMISSALS: NumpadAction[] = ['backdrop', 'cancel', 'escape'];

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

function assertEqual<T>(actual: T, expected: T, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${expectedStr}\n  actual:   ${actualStr}`);
  }
}

function resolve(input: NumpadDraftInput): NumpadDraftResult {
  return (resolveNumpadDraft as ResolveNumpadDraft)(input);
}

// ── Source of the component that must use the seam ───────────────────────────

const source = readFileSync(join(__dirname, '..', 'numeric-input.tsx'), 'utf8');

/** The `MobileNumpad` body only — the desktop input has its own typing model. */
function mobileNumpadBody(): string {
  const start = source.indexOf('function MobileNumpad(');
  assert(start !== -1, 'numeric-input.tsx still defines MobileNumpad');
  const end = source.indexOf('// ── Main component', start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** Span of a parenthesised expression starting at the `(` following `anchor`. */
function balancedSpan(text: string, anchor: string): { start: number; end: number } {
  const at = text.indexOf(anchor);
  assert(at !== -1, `Expected to find ${JSON.stringify(anchor)} in MobileNumpad`);
  const start = text.indexOf('(', at + anchor.length - 1);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return { start, end: i };
    }
  }
  throw new Error(`Unbalanced parentheses after ${JSON.stringify(anchor)}`);
}

console.log('Running mobile numpad draft (Cycle 2) contract...\n');

// ── P0: the seam ─────────────────────────────────────────────────────────────
check('P0: numeric-input exports a pure draft resolver', () => {
  assert(
    typeof resolveNumpadDraft === 'function',
    'numeric-input.tsx exports resolveNumpadDraft({ savedValue, draft, action }) → { value, committed }. ' +
      'Draft resolution has to be callable without a portal for "the backdrop did not change the set" to be provable.',
  );
});

const DRAFT_CASES: Array<[string, () => void]> = [
  // ── Case 1: the only committing path ───────────────────────────────────────
  ['P1: a confirmed draft replaces the saved value', () => {
    assertEqual(
      resolve({ savedValue: 30, draft: '32.5', action: 'confirm' }),
      { value: 32.5, committed: true },
      'Typing 32.5 over a saved 30 and pressing check saves 32.5',
    );
    assertEqual(
      resolve({ savedValue: '', draft: '85', action: 'confirm' }),
      { value: 85, committed: true },
      'A first value typed into a blank set is saved on confirm',
    );
    assertEqual(
      resolve({ savedValue: 30, draft: '30', action: 'confirm' }),
      { value: 30, committed: true },
      'Confirming the value that was already there is still a confirm, not a no-op dismissal',
    );
    assertEqual(
      resolve({ savedValue: 30, draft: '0', action: 'confirm' }),
      { value: 0, committed: true },
      'A deliberate 0 is a value — bodyweight work is logged this way',
    );
  }],

  // ── Case 2: every dismissal preserves what was saved ───────────────────────
  ['P2: backdrop, Cancel and Escape leave the saved value untouched', () => {
    for (const action of DISMISSALS) {
      assertEqual(
        resolve({ savedValue: 30, draft: '32.5', action }),
        { value: 30, committed: false },
        `Closing by ${action} after typing 32.5 leaves the saved 30 alone`,
      );
      assertEqual(
        resolve({ savedValue: 30, draft: '', action }),
        { value: 30, committed: false },
        `Closing by ${action} after clearing the pad does not erase the saved 30 — only confirm can blank a set`,
      );
      assertEqual(
        resolve({ savedValue: 82.5, draft: '8', action }),
        { value: 82.5, committed: false },
        `Closing by ${action} mid-number does not save the half-typed 8`,
      );
    }
  }],

  // ── Case 3: a blank set dismissed stays blank ──────────────────────────────
  ['P3: a draft over a blank set is discarded, not saved as 0', () => {
    for (const action of DISMISSALS) {
      assertEqual(
        resolve({ savedValue: '', draft: '100', action }),
        { value: '', committed: false },
        `Closing by ${action} leaves an untouched set blank — never 0, which reads as a logged value`,
      );
    }
  }],

  // ── Case 4: blank is only ever an explicit answer ──────────────────────────
  ['P4: confirming nothing blanks the value, and nothing else does', () => {
    for (const draft of ['', '.', '-', 'abc']) {
      assertEqual(
        resolve({ savedValue: 30, draft, action: 'confirm' }),
        { value: '', committed: true },
        `Confirming ${JSON.stringify(draft)} clears the set — the lifter asked for that explicitly`,
      );
    }
    assertEqual(
      resolve({ savedValue: 30, draft: '-5', action: 'confirm' }),
      { value: '', committed: true },
      'A negative weight is not a value; confirming one clears rather than saves it',
    );
    for (const action of DISMISSALS) {
      assertEqual(
        resolve({ savedValue: 30, draft: 'abc', action }),
        { value: 30, committed: false },
        `An unusable draft dismissed by ${action} changes nothing at all`,
      );
    }
  }],

  // ── The resolver is a function of its input and nothing else ───────────────
  ['P5: resolution is pure — same input, same answer, no mutation', () => {
    const input: NumpadDraftInput = { savedValue: 30, draft: '32.5', action: 'backdrop' };
    const first = resolve(input);
    const second = resolve(input);
    assertEqual(first, second, 'Resolving the same dismissal twice gives the same answer');
    assertEqual(
      input,
      { savedValue: 30, draft: '32.5', action: 'backdrop' },
      'Resolving does not mutate the input it was handed',
    );
  }],
];

if (typeof resolveNumpadDraft === 'function') {
  for (const [name, body] of DRAFT_CASES) check(name, body);
} else {
  console.log(`  · blocked on P0 — ${DRAFT_CASES.length} draft-resolution cases cannot run:`);
  for (const [name] of DRAFT_CASES) console.log(`      ${name}`);
}

// ── The component has to actually use that rule ──────────────────────────────

check('P6: the numpad never writes the value while the lifter is typing', () => {
  const body = mobileNumpadBody();
  const confirmSpan = balancedSpan(body, 'const confirm = useCallback(');

  const writes = [...body.matchAll(/onChange\(/g)].map((match) => match.index ?? -1);
  assert(writes.length > 0, 'MobileNumpad still calls onChange somewhere — the check key has to commit');
  for (const at of writes) {
    assert(
      at > confirmSpan.start && at < confirmSpan.end,
      'Every onChange call sits inside the confirm callback. Digits, ± steps and backspace move local draft ' +
        'state only, so nothing reaches the store until the lifter presses check.',
    );
  }
});

check('P7: the numpad has an explicit cancel path, and the backdrop uses it', () => {
  const body = mobileNumpadBody();
  assert(
    /\bonCancel\b/.test(body) || /const cancel\b/.test(body),
    'MobileNumpad has a named cancel path (an onCancel prop or a cancel handler) distinct from the commit path — ' +
      'dismissing and saving must not be the same call',
  );
  assert(
    !/onClick=\{onClose\}/.test(body),
    'No control dismisses the pad by calling onClose directly. The backdrop routes through the cancel path, ' +
      'so "tapped away" is a decision the component takes deliberately rather than a bare unmount.',
  );
});

check('P8: an accessible Cancel control exists', () => {
  const body = mobileNumpadBody();
  assert(
    /aria-label=["']Cancel["']/.test(body) || />\s*Cancel\s*</.test(body),
    'The numpad offers a labelled Cancel control. A backdrop tap is not discoverable, and it is the only ' +
      'way to abandon a typed draft with one thumb.',
  );
});

check('P9: Escape closes without committing', () => {
  const body = mobileNumpadBody();
  assert(
    /['"]Escape['"]/.test(body) && /keydown/.test(body),
    'MobileNumpad handles the Escape key through a keydown listener — the pad is a modal overlay, and Escape ' +
      'must resolve as a dismissal, never as a commit',
  );
});

check('P10: the desktop input keeps its live-typing model', () => {
  assert(
    /function DesktopInput\(/.test(source) && /onChange\(/.test(source.slice(source.indexOf('function DesktopInput('), source.indexOf('// ── Mobile numpad'))),
    'DesktopInput still writes as the user types — the draft/confirm contract is the mobile pad\'s alone, ' +
      'and Cycle 2 does not change keyboard entry',
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\n❌ ${failures.length} numpad draft contract(s) failing:\n`);
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exitCode = 1;
} else {
  console.log('\n✅ All mobile numpad draft (Cycle 2) contracts passed!');
  console.log('Coverage verified:');
  console.log('  ✓ Confirm is the only path that changes a saved set value');
  console.log('  ✓ Backdrop, Cancel and Escape preserve the previous value, including a blank one');
  console.log('  ✓ Blank is committed only when the lifter explicitly confirms it');
  console.log('  ✓ Typing, stepping and backspacing never reach the store');
  console.log('  ✓ A labelled Cancel control and an Escape handler exist; desktop typing is unchanged');
}
