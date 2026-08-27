/**
 * Workout Complete — the summary stats and the XP card as seen on a 375px phone
 *
 * Run with: npx tsx src/components/workout/__tests__/completion-summary-layout.spec.ts
 *
 * Three screenshot-confirmed defects on `app/workout/complete/page.tsx`, all of
 * them about what the splash *says* rather than what it computes. The XP maths,
 * the workout writes and the PR data are out of scope and are pinned here only
 * so a later layout edit can't quietly move them:
 *
 *   1. The Volume stat wrapped "kg" onto a second line. Three cards share a
 *      375px row — roughly 78px of content each — and the old markup emitted
 *      the unit as a plain text node (`{` `${suffix}`}`) at the same 24px size
 *      as the numeral, so the line broke at the space. Duration and Sets, both
 *      shorter, did not. The numeral and its unit are one unbreakable line now,
 *      with the unit a size down; the two unsuffixed cards keep 24px, because
 *      the fix was never allowed to shrink the whole row.
 *
 *   2. The XP card named the lifter's rank twice — a "Titan L14" chip at the
 *      left end of the bar and a "Titan · Level 14" caption under it. One
 *      identity line survives; the bar's own labels now describe only the XP
 *      distance to the next level.
 *
 *   3. A tier-icon badge floated at the fill's leading edge with nothing to say
 *      what it meant. It is gone. The current position is the fill's own edge,
 *      stated in words above the bar and exposed as `role="progressbar"` with
 *      an XP-scaled `aria-valuenow` / `aria-valuetext`.
 *
 * Like the Cycle 2 set-row suite, this reads layout primitives out of the
 * source rather than measuring a render: the regressions are expressible in
 * exactly those primitives, and a jsdom-free `npx tsx` run keeps the suite in
 * the same shape as every other spec in this tree.
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

function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

// ── Source under contract ────────────────────────────────────────────────────

const PAGE = join(__dirname, '..', '..', '..', 'app', 'workout', 'complete', 'page.tsx');
const page = readFileSync(PAGE, 'utf8');

function region(from: string, to: string): string {
  const start = page.indexOf(from);
  assert(start !== -1, `Expected to find ${JSON.stringify(from)} — an anchor this contract reads`);
  const end = page.indexOf(to, start);
  assert(end !== -1, `Expected to find ${JSON.stringify(to)} after ${JSON.stringify(from)}`);
  return page.slice(start, end);
}

const statCard = region('function StatCard(', 'function PrCard(');
const xpSlider = region('function XpSlider(', 'function XpBreakdownRow(');

/** The one line that renders a stat's numeral, ending where its label begins. */
const statValueLine = (() => {
  const fontDisplay = statCard.indexOf('font-display');
  assert(fontDisplay !== -1, 'StatCard should still render its numeral with font-display');
  const open = statCard.lastIndexOf('<span', fontDisplay);
  const label = statCard.indexOf('{label}', fontDisplay);
  assert(open !== -1 && label !== -1, 'StatCard should render a value span above its label span');
  return statCard.slice(open, label);
})();

/** The progress bar element: from its own `<div` to the breakdown toggle. */
const progressBar = (() => {
  const role = xpSlider.indexOf('role="progressbar"');
  assert(role !== -1, 'The XP bar should expose role="progressbar"');
  const open = xpSlider.lastIndexOf('<div', role);
  const end = xpSlider.indexOf('<button', role);
  assert(end !== -1, 'The breakdown toggle should still follow the bar');
  return xpSlider.slice(open, end);
})();

console.log('\nRunning Workout Complete summary layout contract...\n');

// ── 1. Volume keeps its unit on the numeral's line ───────────────────────────

console.log('Summary stats');

check('the Volume card still carries kg as a unit, not as part of its label', () => {
  assert(
    page.includes('<StatCard label="Volume" value={Math.round(summary.total_volume_kg)} suffix="kg" />'),
    'Volume should still render the rounded session volume with a "kg" suffix',
  );
  assert(count(page, '<StatCard') === 3, 'The strip is still exactly three cards: Duration, Sets, Volume');
});

check('the numeral and its unit can never break across two lines', () => {
  assert(
    statValueLine.includes('whitespace-nowrap'),
    'The value line must declare whitespace-nowrap — the wrap this fix removes happened at the space before "kg"',
  );
  assert(
    !statValueLine.includes('` ${suffix}`') && !statValueLine.includes("' ' + suffix"),
    'The unit must not be a space-prefixed text node again — that is the exact markup that wrapped',
  );
});

check('the unit sits inside the value line, beside the numeral', () => {
  const numeral = statValueLine.indexOf('<AnimatedNumber');
  const unit = statValueLine.indexOf('{suffix}');
  assert(numeral !== -1, 'The numeral is still an AnimatedNumber');
  assert(unit !== -1, 'The unit is still rendered');
  assert(unit > numeral, 'The unit follows the numeral inside the same line box');
  assert(
    statValueLine.includes('items-baseline'),
    'Numeral and unit share a baseline — a differently sized unit reads as attached to the number, not floating',
  );
});

check('only the suffixed card steps down; Duration and Sets keep 24px', () => {
  assert(
    statValueLine.includes("hasSuffix ? 'text-xl' : 'text-2xl'"),
    'The size step must be conditional on the suffix — the brief forbids shrinking every summary card',
  );
  assert(
    /\{suffix\}<\/span>/.test(statValueLine) && statValueLine.includes('text-xs'),
    'The unit itself renders a size below the numeral so a five-digit volume still fits ~78px',
  );
  assert(
    statValueLine.includes('leading-8'),
    'A fixed line box keeps the three labels on one horizontal line despite the smaller numeral',
  );
});

// ── 2. One tier/level identity ───────────────────────────────────────────────

console.log('\nXP card identity');

const identity = region('Tier + level identity', '{/* Progress Bar');

check('the rank is named exactly once', () => {
  assert(
    count(identity, '{postTier.name}') === 1,
    `The visible identity line should render the tier name once, not ${count(identity, '{postTier.name}')} times`,
  );
  assert(
    count(xpSlider, '{preTier.name}') === 0,
    'The pre-session tier chip is gone — it duplicated the same "Titan" the caption already said',
  );
  assert(
    count(identity, '{postLevel.level}') === 1,
    'The level number belongs to that one identity line only',
  );
  assert(
    !xpSlider.includes('L{preLevel.level}'),
    'The abbreviated "L14" bar-end chip is gone with it',
  );
});

check('the identity survives with its tier icon and its tier-up flag', () => {
  assert(identity.includes('{postTier.name} · Level {postLevel.level}'), 'One line still names tier and level together');
  assert(identity.includes('<Icon '), 'The tier icon stays — as an explained chip beside the name');
  assert(identity.includes('tierChanged &&'), 'A tier-up is still called out');
});

check('the XP total earned this session is untouched', () => {
  assert(
    xpSlider.includes('+<AnimatedNumber value={sessionXp} />'),
    'The "+N XP earned this session" counter must survive the identity cleanup',
  );
  assert(
    page.includes('const sessionXp = post.total - pre.total;'),
    'Session XP is still the difference of the two canonical totals',
  );
  assert(count(page, 'computeXp(') === 2, 'Both computeXp calls stay — no XP maths was touched');
  assert(
    page.includes('levelFromXp(pre.total)') && page.includes('levelFromXp(post.total)'),
    'Levels are still derived from the canonical totals',
  );
});

// ── 3. An unambiguous, accessible current position ───────────────────────────

console.log('\nXP progress bar');

check('the unexplained badge overlay is gone', () => {
  assert(
    !xpSlider.includes('translateX(calc('),
    'No element is positioned along the bar any more — that floating badge was the ambiguity',
  );

});

check('the current position is stated in words above the bar', () => {
  const labels = region('Progress Bar — the fill', '<div\n          role="progressbar"');
  assert(
    labels.includes('{postLevel.xpIntoLevel.toLocaleString()} / {levelSpan.toLocaleString()} XP'),
    'The bar says how much of this level is filled',
  );
  assert(
    labels.includes('{postLevel.xpForNextLevel.toLocaleString()} XP to Level {postLevel.level + 1}'),
    'And what is left to the next level — the label the marker never carried',
  );
});

check('the bar reports the same progress to assistive tech', () => {
  assert(progressBar.includes('aria-valuemin={0}'), 'aria-valuemin is the floor of the level');
  assert(progressBar.includes('aria-valuemax={levelSpan}'), 'aria-valuemax is the span of the level');
  assert(progressBar.includes('aria-valuenow={postLevel.xpIntoLevel}'), 'aria-valuenow is the XP into the level');
  assert(progressBar.includes('aria-valuetext='), 'aria-valuetext spells the same sentence the labels show');
  assert(progressBar.includes('aria-label='), 'The bar names which level it is measuring');
  assert(
    xpSlider.includes('const levelSpan = Math.max(1, postLevel.xpAtNextLevel - postLevel.xpAtLevel);'),
    'The span comes from the level state, so aria-valuemax can never be 0',
  );
});

check('the fill still draws the real progress', () => {
  assert(
    xpSlider.includes('const progressPct = postLevel.progressPct;'),
    'Progress is still the level state`s own fraction — unrounded, uncomputed here',
  );
  assert(
    progressBar.includes('transform: `scaleX(${Math.max(0.02, progressPct)})`'),
    'The post-session fill is unchanged',
  );
  assert(
    xpSlider.includes('postLevel.level === preLevel.level ? preLevel.progressPct : 0'),
    'The before-fill is scoped to the current level: after a level-up the session started at that level`s floor, so a pre-fill drawn on the old level`s scale would overhang the current one',
  );
});

// ── Result ───────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.log(`\n✗ ${failures.length} contract(s) failed:\n`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log('\n✓ Workout Complete summary layout contract holds');
