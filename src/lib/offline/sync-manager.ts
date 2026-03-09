/**
 * sync-manager — orchestrates background sync between local queue and server.
 *
 * Triggers:
 *   • App returns to foreground (AppState)
 *   • Network transitions offline → online (NetInfo)
 *   • Manual call to triggerSync()
 *
 * Behaviour:
 *   • Sends pending mutations to sync-offline-queue Edge Function in 100-item batches
 *   • Per-item exponential backoff (1s, 2s, 4s, 8s, 16s) tracked in the DB
 *   • Global semaphore prevents concurrent sync runs
 *   • Clears synced records after each successful batch
 */
import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { supabase } from '@/lib/supabase';
import {
  getPendingMutations,
  markSyncing,
  markSynced,
  recordFailure,
  clearSynced,
  type QueuedMutation,
} from './sync-queue';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SyncResult {
  client_id: string;
  status: 'success' | 'duplicate' | 'error';
  message?: string;
}

interface EdgeFunctionResponse {
  results: SyncResult[];
}

// ── State ─────────────────────────────────────────────────────────────────────

let isSyncing = false;
let isOnline = false;
let appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
let netInfoUnsub: (() => void) | null = null;

// ── Core sync ─────────────────────────────────────────────────────────────────

async function runSync(): Promise<void> {
  if (isSyncing || !isOnline) return;
  isSyncing = true;

  try {
    const pending = await getPendingMutations(); // max 100
    if (!pending.length) return;

    // Mark as syncing to prevent double-send
    await markSyncing(pending.map((m) => m.id));

    // Send batch to Edge Function
    const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>(
      'sync-offline-queue',
      {
        body: {
          mutations: pending.map((m) => ({
            client_id: m.id,
            table: m.table,
            operation: m.operation,
            data: m.data,
            timestamp: m.timestamp,
          })),
        },
      },
    );

    if (error) {
      // Network-level failure — put all back to pending with backoff
      await Promise.all(
        pending.map((m) =>
          recordFailure(m.id, error.message ?? 'Network error', m.retries),
        ),
      );
      return;
    }

    const results: SyncResult[] = data?.results ?? [];
    const succeededIds: string[] = [];
    const failedItems: { mutation: QueuedMutation; message: string }[] = [];

    // Map results back to mutations
    const resultMap = new Map(results.map((r) => [r.client_id, r]));
    for (const mutation of pending) {
      const result = resultMap.get(mutation.id);
      if (!result || result.status === 'success' || result.status === 'duplicate') {
        succeededIds.push(mutation.id);
      } else {
        failedItems.push({ mutation, message: result.message ?? 'Server error' });
      }
    }

    if (succeededIds.length) {
      await markSynced(succeededIds);
    }
    for (const { mutation, message } of failedItems) {
      await recordFailure(mutation.id, message, mutation.retries);
    }

    // Housekeeping: remove synced entries
    await clearSynced();

    // If there are more pending, schedule another run
    const remaining = await getPendingMutations();
    if (remaining.length > 0) {
      setTimeout(() => { void runSync(); }, 500);
    }
  } catch (err) {
    console.warn('[sync-manager] runSync error:', err);
  } finally {
    isSyncing = false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Call once at app startup (in _layout.tsx). */
export function startSyncManager(): void {
  // Check current network state
  void NetInfo.fetch().then((state: NetInfoState) => {
    isOnline = state.isConnected ?? false;
    if (isOnline) void runSync();
  });

  // Listen for network changes
  netInfoUnsub = NetInfo.addEventListener((state: NetInfoState) => {
    const wasOffline = !isOnline;
    isOnline = state.isConnected ?? false;
    if (wasOffline && isOnline) {
      // Came back online — sync immediately
      void runSync();
    }
  });

  // Sync when app returns to foreground
  appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      void runSync();
    }
  });
}

/** Tear down listeners (useful for testing). */
export function stopSyncManager(): void {
  netInfoUnsub?.();
  appStateSub?.remove();
  netInfoUnsub = null;
  appStateSub = null;
}

/** Manually trigger a sync attempt (non-blocking). */
export function triggerSync(): void {
  void runSync();
}

/** Whether the device currently has connectivity. */
export function getIsOnline(): boolean {
  return isOnline;
}
