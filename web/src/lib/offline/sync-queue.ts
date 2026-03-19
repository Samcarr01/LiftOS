/**
 * Sync queue operations for offline-first mutation persistence.
 *
 * Flow:
 *   1. User action → addToQueue() → IndexedDB (instant, no network)
 *   2. processQueue() → sync-offline-queue Edge Function (batched)
 *   3. On success: delete from queue
 *   4. On failure: exponential backoff (1s → 2s → 4s → 8s → 16s)
 *   5. After 5 retries: mark as 'failed'
 */
import { db, type QueuedMutation } from './indexed-db';
import { createClient } from '@/lib/supabase/client';
import { invokeAuthedFunction } from '@/lib/supabase/invoke-authed-function';

const MAX_RETRIES  = 5;
const MAX_QUEUE    = 1000;
const BATCH_SIZE   = 100;

type NewMutation = Pick<QueuedMutation, 'table' | 'operation' | 'data' | 'timestamp'>;

// ── Queue writes ──────────────────────────────────────────────────────────────

export async function addToQueue(mutation: NewMutation): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const count = await db.syncQueue.where('status').equals('pending').count();
    if (count >= MAX_QUEUE) {
      console.warn('[LiftOS offline] Queue full — mutation dropped');
      return;
    }
    await db.syncQueue.add({
      id:          crypto.randomUUID(),
      ...mutation,
      retries:     0,
      nextRetryAt: 0,        // 0 = eligible immediately
      status:      'pending',
    });
  } catch (err) {
    console.error('[LiftOS offline] addToQueue failed:', err);
  }
}

export async function getQueueSize(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  return db.syncQueue.where('status').anyOf(['pending', 'failed']).count();
}

export async function clearSynced(): Promise<void> {
  if (typeof window === 'undefined') return;
  await db.syncQueue.where('status').equals('synced').delete();
}

export async function retryFailed(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const failed = await db.syncQueue.where('status').equals('failed').toArray();
  await Promise.all(
    failed.map((m) =>
      db.syncQueue.update(m.id, { status: 'pending', retries: 0, nextRetryAt: 0 }),
    ),
  );
  return failed.length;
}

export async function clearFailed(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const count = await db.syncQueue.where('status').equals('failed').count();
  await db.syncQueue.where('status').equals('failed').delete();
  return count;
}

// ── Backoff helper ────────────────────────────────────────────────────────────

async function backoffMutation(m: QueuedMutation): Promise<void> {
  const retries   = m.retries + 1;
  // 1s, 2s, 4s, 8s, 16s (capped)
  const backoffMs = Math.min(Math.pow(2, retries - 1) * 1000, 16_000);
  await db.syncQueue.update(m.id, {
    retries,
    nextRetryAt: Date.now() + backoffMs,
    status:      retries >= MAX_RETRIES ? 'failed' : 'pending',
  });
}

// ── Queue processor ───────────────────────────────────────────────────────────

/**
 * Send pending mutations to the sync-offline-queue Edge Function.
 * Returns true if all pending items in this batch were successfully processed.
 */
export async function processQueue(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const now     = Date.now();
  const pending = await db.syncQueue
    .where('status')
    .equals('pending')
    .filter((m) => m.nextRetryAt <= now)
    .limit(BATCH_SIZE)
    .toArray();

  if (pending.length === 0) return true;

  const supabase = createClient();
  const mutations = pending.map((m) => ({
    table:      m.table,
    operation:  m.operation,
    data:       m.data,
    client_id:  m.id,
    timestamp:  m.timestamp,
  }));

  let responseData: { results?: Array<{ client_id: string; status: string }> } | null = null;
  let invokeErr: unknown = null;

  try {
    const { data, error } = await invokeAuthedFunction<{
      results?: Array<{ client_id: string; status: string }>;
    }>(
      supabase,
      'sync-offline-queue',
      { mutations },
    );
    responseData = data;
    invokeErr    = error;
  } catch (err) {
    invokeErr = err;
  }

  if (invokeErr) {
    // Network-level failure — backoff all pending items
    await Promise.all(pending.map(backoffMutation));
    return false;
  }

  const results   = responseData?.results ?? [];
  const resultMap = new Map(results.map((r) => [r.client_id, r.status]));

  await Promise.all(
    pending.map(async (m) => {
      const status = resultMap.get(m.id);
      if (!status || status === 'success' || status === 'duplicate') {
        // Success or de-duplicated — remove from queue
        await db.syncQueue.delete(m.id);
      } else {
        await backoffMutation(m);
      }
    }),
  );

  // If more items remain, caller (sync-manager) will invoke again on next tick
  return true;
}
