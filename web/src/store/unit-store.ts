'use client';

/**
 * Unit preference store — persists to localStorage and syncs to DB on change.
 * All other components read `unit` and use `formatWeight` for display.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UnitStore {
  unit: 'kg' | 'lb';
  setUnit: (unit: 'kg' | 'lb') => void;
  /** Convert a stored kg value to the display unit */
  toDisplay: (kg: number) => number;
  /** Format a stored kg value as "X kg" or "X lb" */
  formatWeight: (kg: number) => string;
}

const KG_TO_LB = 2.20462;

export const useUnitStore = create<UnitStore>()(
  persist(
    (set, get) => ({
      unit: 'kg',

      setUnit: (unit) => set({ unit }),

      toDisplay: (kg) => {
        if (get().unit === 'lb') return Math.round(kg * KG_TO_LB * 10) / 10;
        return kg;
      },

      formatWeight: (kg) => {
        const { unit, toDisplay } = get();
        return `${toDisplay(kg)} ${unit}`;
      },
    }),
    { name: 'liftos-unit' }
  )
);
