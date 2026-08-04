/**
 * Pure sorting/prefill helpers extracted from use-start-workout hook.
 * No React/Next.js dependencies — safe to import from tsx tests.
 */

import type { LastPerformanceSet, PrefilledSet } from '@/types/app';

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : -Infinity;
  }
  return -Infinity;
}

/** Set types the progression engine issues per_set_targets for. Mirrors PROGRESSION_SET_TYPES. */
const QUALIFYING_SET_TYPES = new Set(['working', 'top']);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SortedLastPerformance {
  /** Sorted array of last performance sets (heaviest-first). Null if no data. */
  sorted: LastPerformanceSet[] | null;
  /**
   * For each working/top set in sorted order, the original qualifying-set index.
   * Empty when no sorting was performed. Used to reorder per_set_targets.
   */
  originalQualifyingOrder: number[];
}

// ── Prefilled-set builder ─────────────────────────────────────────────────────

export function buildPrefilledSets(
  count: number,
  lastPerformance: LastPerformanceSet[] | null,
): PrefilledSet[] {
  return Array.from({ length: count }, (_, index) => {
    const lastSet = lastPerformance?.find((s) => s.set_index === index);
    return {
      setIndex: index,
      values: lastSet?.values ?? {},
      setType: (lastSet?.set_type as PrefilledSet['setType']) ?? 'working',
    };
  });
}

// ── Heaviest-first sort ───────────────────────────────────────────────────────

export function sortLastPerformanceForPrefill(
  sets: LastPerformanceSet[] | null,
  heaviestFirst: boolean,
): SortedLastPerformance {
  if (!sets || !heaviestFirst || sets.length < 2) {
    return { sorted: sets, originalQualifyingOrder: [] };
  }

  const sample = sets.find((s) => Object.keys(s.values).length > 0);
  if (!sample) {
    return { sorted: sets, originalQualifyingOrder: [] };
  }

  const weightKey: 'weight' | 'added_weight' | null =
    'weight' in sample.values ? 'weight'
    : 'added_weight' in sample.values ? 'added_weight'
    : null;
  if (!weightKey) {
    return { sorted: sets, originalQualifyingOrder: [] };
  }

  const repsKey = 'reps' in sample.values ? 'reps' : null;

  const warmups = sets.filter((s) => s.set_type === 'warmup');
  const allNonWarmup = sets.filter((s) => s.set_type !== 'warmup');

  // Map each original set_index to its qualifying-set index.
  // Only working/top sets receive per_set_targets, so drop/failure are skipped.
  const qualifyingIndexBySetIndex = new Map<number, number>();
  allNonWarmup.forEach((s) => {
    if (QUALIFYING_SET_TYPES.has(s.set_type)) {
      qualifyingIndexBySetIndex.set(s.set_index, qualifyingIndexBySetIndex.size);
    }
  });

  const sortedNonWarmup = [...allNonWarmup].sort((a, b) => {
    const diff = num(b.values[weightKey]) - num(a.values[weightKey]);
    if (diff !== 0) return diff;
    if (repsKey) return num(b.values[repsKey]) - num(a.values[repsKey]);
    return 0;
  });

  // For each sorted qualifying entry, record its original qualifying-set index.
  // Non-qualifying entries (drop, failure, etc.) are excluded from the remapping
  // so originalQualifyingOrder.length always matches per_set_targets.length.
  const originalQualifyingOrder = sortedNonWarmup
    .filter((s) => QUALIFYING_SET_TYPES.has(s.set_type))
    .map((s) => qualifyingIndexBySetIndex.get(s.set_index) ?? 0);

  const sorted = [...warmups, ...sortedNonWarmup].map((s, i) => ({
    ...s,
    set_index: i,
  }));

  return { sorted, originalQualifyingOrder };
}
