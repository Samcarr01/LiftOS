/**
 * Locked-tier motion regression
 *
 * Run with: npx tsx src/lib/leveling/__tests__/tier-motion.spec.tsx
 *
 * Contract from Sam Carr: on the Levels ladder the current tier animates but
 * future locked tiers rendered completely dead. The cause was markup-level —
 * the ladder passed `static` to <TierIcon /> for every non-current row, which
 * stripped every effect layer, so there was no animation for the device to
 * fail to composite in the first place.
 *
 * This locks in three things:
 *   1. `upcoming` maps to `subtle`, never `none`.
 *   2. Every tier renders at least one looping animation in `subtle` mode, and
 *      that animation survives into the actual markup (not just the tree).
 *   3. `subtle` stays cheap — no blur, no animated filters, no blend modes, no
 *      card-wide sweep bands — and ships the `-webkit-mask` iOS Safari needs to
 *      paint a conic ring as a ring rather than a static filled disc.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { TIERS } from '../xp';
import { TierIcon, tierMotionForState, type TierMotion } from '../tier-visuals';

let failures = 0;

function check(condition: boolean, message: string) {
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  check(actual === expected, `${message}\n      Expected: ${expected}\n      Actual:   ${actual}`);
}

function markup(tierId: string, motion: TierMotion): string {
  const tier = TIERS.find((t) => t.id === tierId);
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);
  return renderToStaticMarkup(<TierIcon tier={tier} size={48} motion={motion} />);
}

/** Count of looping CSS animations declared anywhere in the rendered markup. */
function loopingAnimations(html: string): number {
  return (html.match(/animation:[^;&"]*infinite/g) ?? []).length;
}

console.log('Running locked-tier motion regression...');

// ── 1. Ladder state → motion level ───────────────────────────────────────────
{
  assertEqual(tierMotionForState('current'), 'full', 'Current tier keeps the full effect stack');
  assertEqual(tierMotionForState('upcoming'), 'subtle', 'Upcoming (locked) tiers keep ambient motion');
  assertEqual(tierMotionForState('passed'), 'none', 'Passed tiers stay static');

  check(
    tierMotionForState('upcoming') !== 'none',
    'A locked tier must never be reduced to a fully static marker',
  );
}

// ── 2. Every tier is animation-capable while locked ──────────────────────────
{
  const lockedMotion = tierMotionForState('upcoming');

  for (const tier of TIERS) {
    const html = markup(tier.id, lockedMotion);
    check(
      loopingAnimations(html) >= 1,
      `${tier.name} renders no looping animation while locked — the row would be visibly dead`,
    );
    check(
      html.includes(`oklch(`),
      `${tier.name} ambient layer lost its tier colour`,
    );
  }
}

// ── 3. Locked motion stays cheap, and paints on iOS Safari ───────────────────
{
  const lockedMotion = tierMotionForState('upcoming');

  for (const tier of TIERS) {
    const html = markup(tier.id, lockedMotion);
    check(!html.includes('blur('),          `${tier.name} locked row must not pay for a blur filter`);
    check(!html.includes('hue-rotate'),     `${tier.name} locked row must not animate a filter`);
    check(!html.includes('mix-blend'),      `${tier.name} locked row must not use a blend mode`);
    check(!html.includes('tier-sweep-x'),   `${tier.name} locked row must not run a card-wide sweep`);

    // A conic ring without the prefixed mask renders as a filled disc on iOS
    // Safari: still "animating", but no longer readable as motion.
    if (html.includes('-mask:') || html.includes('mask:')) {
      check(
        html.includes('-webkit-mask'),
        `${tier.name} masks an ambient layer without -webkit-mask — iOS Safari would paint a static disc`,
      );
    }
  }
}

// ── 4. Current-tier motion is unchanged ──────────────────────────────────────
{
  // Titan is the reported case: it animated before and must still animate.
  const titanFull = markup('titan', tierMotionForState('current'));
  check(loopingAnimations(titanFull) >= 2, 'Titan lost its full-stack current-tier animation');
  check(titanFull.includes('tier-glow-shift'), 'Titan lost its current-tier glow-shift bubble');

  // The ambient layer is exactly one looping animation, and never more than the
  // current-tier stack — so `subtle` can't quietly become the new maximum.
  for (const tier of TIERS) {
    const full   = loopingAnimations(markup(tier.id, 'full'));
    const subtle = loopingAnimations(markup(tier.id, tierMotionForState('upcoming')));

    assertEqual(subtle, 1, `${tier.name}: a locked row must run exactly one ambient animation`);
    if (full === 0) continue; // bronze ships no full-stack motion by design
    check(
      full >= subtle,
      `${tier.name}: the locked ambient layer is no longer subtler than the current-tier stack`,
    );
  }

  assertEqual(loopingAnimations(markup('titan', 'none')), 0, 'motion="none" must render a truly static marker');
}

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
}

console.log('✓ Locked tiers keep subtle, tier-specific, iOS-paintable motion');
