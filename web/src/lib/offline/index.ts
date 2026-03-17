/**
 * Offline module barrel.
 * Import from '@/lib/offline' for all offline-first helpers.
 */
export { addToQueue, processQueue, getQueueSize, clearSynced } from './sync-queue';
export { startSyncManager } from './sync-manager';
export type { QueuedMutation } from './indexed-db';

import { addToQueue } from './sync-queue';
import type { SetEntry } from '@/types/app';

/**
 * Write a set to the offline sync queue (IndexedDB).
 * Call fire-and-forget after completeSet() so the data survives a crash/close.
 *
 * The server uses upsert on (session_exercise_id, set_index), so duplicate
 * calls for the same set are idempotent.
 */
export async function logSetEntry(set: SetEntry): Promise<void> {
  await addToQueue({
    table:     'set_entries',
    operation: 'insert',
    data: {
      session_exercise_id: set.sessionExerciseId,
      set_index:           set.setIndex,
      values:              set.values,
      set_type:            set.setType,
      is_completed:        set.isCompleted,
      notes:               set.notes,
    },
    timestamp: set.loggedAt || new Date().toISOString(),
  });
}
