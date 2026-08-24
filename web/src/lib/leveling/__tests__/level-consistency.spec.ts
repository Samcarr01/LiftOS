/**
 * Materialised level consistency regression
 *
 * Run with: npx tsx src/lib/leveling/__tests__/level-consistency.spec.ts
 *
 * Contract from Sam Carr: when the canonical XP total earns Titan, Home must
 * never show a stale lower persisted level such as Obsidian.
 */

import { resolveLevelFromStoredProgress, xpForLevel } from '../xp';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

console.log('Running materialised level consistency regression...');

{
  const result = resolveLevelFromStoredProgress({
    xpTotal: xpForLevel(14),
    xpLevel: 12,
  });

  assertEqual(result.level, 14, 'Canonical XP total must override a stale stored level');
  assertEqual(result.tier.id, 'titan', 'Level 14 must render Titan on every surface');
}

console.log('✓ Home and Levels resolve the same Titan state from canonical XP');
