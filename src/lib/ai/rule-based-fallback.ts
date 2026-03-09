/**
 * Rule-based AI suggestion fallback.
 *
 * Used when:
 *  - The app is offline and no cached suggestion exists
 *  - The exercise has < 2 sessions of history
 *  - The Edge Function is unreachable
 *
 * Produces the same AISuggestionData shape as the server, so the
 * AI banner renders identically regardless of source.
 *
 * Logic (mirrors Claude-ai.md rule-based spec):
 *  - All sets completed + reps ≥ target  → +2.5 kg, same reps
 *  - All sets completed (under target)   → same weight, +1 rep
 *  - Incomplete session                  → repeat last session
 *  - No history                          → generic starter suggestion
 */

import type { AISuggestionData, LastPerformanceSet } from '@/types/app';

const WEIGHT_INCREMENT = 2.5; // kg — smallest standard plate increment
const MAX_REP_INC      = 2;   // never suggest more than +2 reps

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a rule-based suggestion from `last_performance_snapshots.sets_data`.
 *
 * @param lastSets - Sets from the most recent session, or null if no history.
 * @returns A valid AISuggestionData object (always succeeds).
 */
export function computeRuleBasedSuggestion(
  lastSets: LastPerformanceSet[] | null,
): AISuggestionData {
  // ── No history ──────────────────────────────────────────────────────────────
  if (!lastSets || lastSets.length === 0) {
    return {
      primary: {
        reps:      8,
        rationale: 'No previous data. Start with a comfortable weight for 3 sets of 8 reps.',
      },
      alternative:  null,
      plateau_flag: false,
    };
  }

  // Only working and top sets count
  const workingSets = lastSets.filter(
    (s) => s.set_type === 'working' || s.set_type === 'top',
  );

  if (workingSets.length === 0) {
    return {
      primary:      { rationale: 'Match your last session performance.' },
      alternative:  null,
      plateau_flag: false,
    };
  }

  // ── Detect exercise type ────────────────────────────────────────────────────
  const hasWeight = workingSets.some(
    (s) => typeof s.values.weight === 'number' && (s.values.weight as number) > 0,
  );

  if (!hasWeight) {
    return bodyweightSuggestion(workingSets);
  }

  return weightRepsSuggestion(workingSets);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bodyweightSuggestion(
  workingSets: LastPerformanceSet[],
): AISuggestionData {
  const maxReps = Math.max(
    ...workingSets.map((s) => Number(s.values.reps ?? 0)),
    0,
  );

  return {
    primary: {
      reps:      maxReps + 1,
      rationale: `You hit ${maxReps} reps last session. Aim for ${maxReps + 1}.`,
    },
    alternative: {
      reps:      maxReps,
      rationale: 'Maintain your reps with tighter form.',
    },
    plateau_flag: false,
  };
}

function weightRepsSuggestion(
  workingSets: LastPerformanceSet[],
): AISuggestionData {
  // Best weight across working sets
  const bestWeight = Math.max(
    ...workingSets.map((s) => Number(s.values.weight ?? 0)),
    0,
  );
  const topSet  = workingSets.find((s) => Number(s.values.weight) === bestWeight);
  const lastReps = Number(topSet?.values.reps ?? 0);

  // We don't have full-session completion info from last_performance_snapshots,
  // so we default to the "all completed" path (most common happy case).
  // The server-side function uses full session data for a more accurate decision.
  const nextWeight = roundToPlate(bestWeight + WEIGHT_INCREMENT);
  const nextReps   = Math.min(lastReps + 1, lastReps + MAX_REP_INC);

  return {
    primary: {
      weight:    nextWeight,
      reps:      lastReps,
      rationale: `Last session: ${bestWeight}kg × ${lastReps}. Try ${nextWeight}kg for progressive overload.`,
    },
    alternative: {
      weight:    bestWeight,
      reps:      nextReps,
      rationale: `Or stay at ${bestWeight}kg and aim for ${nextReps} reps.`,
    },
    plateau_flag: false,
  };
}

/** Round to nearest 0.25 kg (smallest meaningful plate increment) */
function roundToPlate(kg: number): number {
  return Math.round(kg * 4) / 4;
}
