/**
 * Offline module barrel.
 * Import from '@/lib/offline' for all offline-first helpers.
 */
export { addToQueue, processQueue, getQueueSize, clearSynced, cancelQueuedSetEntry } from './sync-queue';
export type { SetEntryKey } from './sync-queue';
export { startSyncManager } from './sync-manager';
export type { QueuedMutation } from './indexed-db';

import { addToQueue, cancelQueuedSetEntry } from './sync-queue';
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

/**
 * Remove a set from the server, offline-first. The mirror of `logSetEntry`.
 *
 * Two halves, and both are needed. Cancelling withdraws writes that have not
 * left the device yet, so a set deleted while offline is never sent at all.
 * Queuing the delete then covers the set that *did* sync — the row exists on
 * the server and only a delete will remove it.
 *
 * The order matters: cancel first, so the delete is not itself withdrawn.
 * `sync-offline-queue` applies mutations concurrently, so a queued delete and a
 * queued insert for the same key must never coexist — which is exactly why
 * `addSet` never re-issues a persisted index.
 */
export async function deleteSetEntry(
  set: Pick<SetEntry, 'sessionExerciseId' | 'setIndex'>,
): Promise<void> {
  await cancelQueuedSetEntry(set);
  await addToQueue({
    table:     'set_entries',
    operation: 'delete',
    data: {
      session_exercise_id: set.sessionExerciseId,
      set_index:           set.setIndex,
    },
    timestamp: new Date().toISOString(),
  });
}
