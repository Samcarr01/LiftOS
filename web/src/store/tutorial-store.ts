'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TutorialStore {
  hasSeenTutorial: boolean;
  markTutorialSeen: () => void;
  resetTutorial: () => void;
}

export const useTutorialStore = create<TutorialStore>()(
  persist(
    (set) => ({
      hasSeenTutorial: false,
      markTutorialSeen: () => set({ hasSeenTutorial: true }),
      resetTutorial: () => set({ hasSeenTutorial: false }),
    }),
    { name: 'liftos-tutorial' }
  )
);
