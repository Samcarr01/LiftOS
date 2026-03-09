/**
 * sync-queue — typed interface over the local SQLite offline_queue table.
 *
 * QueuedMutation is the app-layer type. The DB stores it serialised as JSON.
 * All public functions are safe to call from any context; they no-op on error.
 */
import {
  queueInsert,
  queueGetPending,
  queueMarkSyncing,
  queueMarkSynced,
  queueMarkFailed,
  queueGetSize,
  queueClearSynced,
  queueClearAll,
  queueGetFailedCount,
} from './local-db';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueuedMutation {
  /** UUID — used as idempotency key on the server (client_id) */
  id: string;
  table: 'set_entries' | 'workout_sessions' | 'session_exercises';
  operation: 'insert' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: string; // ISO
  retries: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  errorMsg: string | null;
  nextRetryAt: string | null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a mutation. No-op if the same id is already queued (INSERT OR IGNORE).
 */
export async function addToQueue(
  mutation: Pick<QueuedMutation, 'id' | 'table' | 'operation' | 'data' | 'timestamp'>,
): Promise<void> {
  try {
    await queueInsert({
      id: mutation.id,
      table_name: mutation.table,
      operation: mutation.operation,
      data: JSON.stringify(mutation.data),
      timestamp: mutation.timestamp,
    });
  } catch (err) {
    console.warn('[sync-queue] addToQueue error:', err);
  }
}

/** Load pending mutations ready to sync (respects backoff). Max 100. */
export async function getPendingMutations(): Promise<QueuedMutation[]> {
  try {
    const rows = await queueGetPending(100);
    return rows.map((r) => ({
      id: r.id,
      table: r.table_name as QueuedMutation['table'],
      operation: r.operation as QueuedMutation['operation'],
      data: JSON.parse(r.data) as Record<string, unknown>,
      timestamp: r.timestamp,
      retries: r.retries,
      status: r.status as QueuedMutation['status'],
      errorMsg: r.error_msg,
      nextRetryAt: r.next_retry_at,
    }));
  } catch (err) {
    console.warn('[sync-queue] getPendingMutations error:', err);
    return [];
  }
}

/** Mark a batch of mutations as successfully synced. */
export async function markSynced(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    await queueMarkSynced(ids);
  } catch (err) {
    console.warn('[sync-queue] markSynced error:', err);
  }
}

/** Mark one mutation as syncing (prevents double-send). */
export async function markSyncing(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    await queueMarkSyncing(ids);
  } catch (err) {
    console.warn('[sync-queue] markSyncing error:', err);
  }
}

/** Record a failure; applies exponential backoff. Marks failed after 5 retries. */
export async function recordFailure(id: string, error: string, currentRetries: number): Promise<void> {
  try {
    await queueMarkFailed(id, error, currentRetries + 1);
  } catch (err) {
    console.warn('[sync-queue] recordFailure error:', err);
  }
}

/** Number of pending + syncing mutations. */
export async function getQueueSize(): Promise<number> {
  try {
    return await queueGetSize();
  } catch {
    return 0;
  }
}

/** Remove all synced entries (housekeeping). */
export async function clearSynced(): Promise<void> {
  try {
    await queueClearSynced();
  } catch (err) {
    console.warn('[sync-queue] clearSynced error:', err);
  }
}

/** Clear ALL local data from both offline tables (logout / account delete). */
export async function clearAllLocalData(): Promise<void> {
  try {
    await queueClearAll();
  } catch (err) {
    console.warn('[sync-queue] clearAllLocalData error:', err);
  }
}

/** Count permanently failed mutations (for UI indicator). */
export async function getFailedCount(): Promise<number> {
  try {
    return await queueGetFailedCount();
  } catch {
    return 0;
  }
}
