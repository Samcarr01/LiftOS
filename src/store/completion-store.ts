/**
 * completion-store — holds the result of a completed workout.
 * Written by use-complete-workout, read by workout-complete screen.
 * Cleared after the user dismisses the completion screen.
 */
import { create } from 'zustand';
import type { WorkoutSessionRow } from '@/types/database';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PRRecord {
  exerciseId: string;
  exerciseName: string;
  recordType: 'best_weight' | 'best_reps_at_weight' | 'best_e1rm';
  recordValue: number;
  previousValue: number | null;
}

export interface CompletionSummary {
  exerciseCount: number;
  totalSets: number;
  totalVolumeKg: number;
  durationSeconds: number;
  /** True when completed while offline — PRs not yet confirmed */
  isOffline?: boolean;
}

export interface CompletionResult {
  session: WorkoutSessionRow;
  newPRs: PRRecord[];
  summary: CompletionSummary;
}

interface CompletionStore {
  result: CompletionResult | null;
  setResult: (result: CompletionResult) => void;
  clear: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCompletionStore = create<CompletionStore>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  clear: () => set({ result: null }),
}));
