/**
 * Sync manager — browser singleton that auto-processes the offline queue.
 *
 * Triggers:
 *   - window 'online' event (device reconnects)
 *   - document 'visibilitychange' → visible (tab switches back)
 *   - startSyncManager() call on app mount
 *
 * Constraints:
 *   - Never runs during SSR (typeof window check)
 *   - Processing lock prevents concurrent runs
 *   - Errors are caught and logged — never crash the app
 */
import { processQueue } from './sync-queue';

let started    = false;
let processing = false;

async function processIfOnline(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine)                return;
  if (document.visibilityState === 'hidden') return;
  if (processing)                        return;

  processing = true;
  try {
    // Keep processing until the queue is empty (handles > 100 items)
    let hasMore = true;
    let passes  = 0;
    while (hasMore && passes < 10) {
      hasMore = !(await processQueue());
      passes++;
    }
  } catch (err) {
    console.warn('[LiftOS offline] Sync error:', err);
  } finally {
    processing = false;
  }
}

/** Start the sync manager. Safe to call multiple times — only initialises once. */
export function startSyncManager(): void {
  if (typeof window === 'undefined') return;
  if (started) return;
  started = true;

  window.addEventListener('online', () => void processIfOnline());

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void processIfOnline();
  });

  // Periodic sync every 30s — picks up backed-off items whose timers have expired
  setInterval(() => void processIfOnline(), 30_000);

  // Attempt sync immediately in case there are items from a previous session
  void processIfOnline();
}
