'use client';

import { create } from 'zustand';

export interface CompletionPR {
  exercise_id:   string;
  exercise_name: string;
  record_type:   'best_weight' | 'best_reps_at_weight' | 'best_e1rm' | 'best_volume';
  record_value:  number;
}

export interface CompletionSummary {
  exercise_count:   number;
  total_sets:       number;
  total_volume_kg:  number;
  duration_seconds: number;
}

export interface CompletionResult {
  sessionId:    string;
  summary:      CompletionSummary;
  newPrs:       CompletionPR[];
  exerciseNames: string[];  // names of exercises in this workout (for display)
}

interface CompletionStore {
  result: CompletionResult | null;
  setResult: (r: CompletionResult) => void;
  clearResult: () => void;
}

const STORAGE_KEY = 'liftos_completion_result';

export const useCompletionStore = create<CompletionStore>()((set) => ({
  result:      null,
  setResult:   (r) => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(r)); } catch {}
    set({ result: r });
  },
  clearResult: () => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    set({ result: null });
  },
}));

/** Recover result from sessionStorage if Zustand store was reset during navigation */
export function recoverCompletionResult(): CompletionResult | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CompletionResult;
  } catch {
    return null;
  }
}
