/**
 * offline barrel — re-exports and integration helpers.
 *
 * logSetEntry(set): writes a completed/updated set to:
 *   1. local_set_entries (SQLite mirror)
 *   2. offline_queue (for server sync)
 *   then triggers a background sync attempt.
 */
export { initLocalDb, localSetMarkSynced, saveActiveWorkoutState, loadActiveWorkoutState, clearActiveWorkoutState } from './local-db';
export { addToQueue, getQueueSize, clearSynced, clearAllLocalData, getFailedCount } from './sync-queue';
export { startSyncManager, stopSyncManager, triggerSync, getIsOnline } from './sync-manager';

import { localSetUpsert } from './local-db';
import { addToQueue } from './sync-queue';
import { triggerSync } from './sync-manager';
import type { SetEntry } from '@/types';

/**
 * Persists a set entry to the local DB and enqueues it for server sync.
 * Fire-and-forget — the UI never awaits this.
 *
 * Operation type is chosen dynamically:
 *   - 'insert' for new sets that haven't been completed yet
 *   - 'update' for edits to completed sets
 * The server handles both via upsert on (session_exercise_id, set_index).
 */
export async function logSetEntry(set: SetEntry): Promise<void> {
  const now = set.loggedAt || new Date().toISOString();

  // 1. Mirror to local SQLite
  await localSetUpsert({
    local_id: set.id,
    session_exercise_id: set.sessionExerciseId,
    set_index: set.setIndex,
    values_json: JSON.stringify(set.values),
    set_type: set.setType,
    is_completed: set.isCompleted ? 1 : 0,
    notes: set.notes,
    logged_at: now,
    is_pending_sync: 1,
  });

  // 2. Enqueue for server sync
  // Use 'update' for edits to completed sets, 'insert' for new sets
  const operation = set.isCompleted ? 'update' : 'insert' as const;
  await addToQueue({
    id: set.id,
    table: 'set_entries',
    operation,
    data: {
      session_exercise_id: set.sessionExerciseId,
      set_index: set.setIndex,
      values: set.values,
      set_type: set.setType,
      is_completed: set.isCompleted,
      notes: set.notes,
      logged_at: now,
    },
    timestamp: now,
  });

  // 3. Attempt background sync (non-blocking)
  triggerSync();
}

/**
 * Enqueue a deletion mutation for a set and remove it from the local mirror.
 * Called when the user deletes a set during an active workout.
 */
export async function deleteSetEntry(
  sessionExerciseId: string,
  setIndex: number,
): Promise<void> {
  const now = new Date().toISOString();
  const deleteId = `del_${sessionExerciseId}_${setIndex}_${Date.now()}`;

  // 1. Enqueue deletion for server sync
  await addToQueue({
    id: deleteId,
    table: 'set_entries',
    operation: 'delete',
    data: {
      session_exercise_id: sessionExerciseId,
      set_index: setIndex,
    },
    timestamp: now,
  });

  // 2. Attempt background sync (non-blocking)
  triggerSync();
}
