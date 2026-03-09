/**
 * Lightweight offline queue for set_entries mutations.
 *
 * Strategy: operations are queued in-memory and flushed to Supabase
 * when connectivity is restored. For persistence across app restarts,
 * a future build step will migrate this to SQLite / WatermelonDB.
 *
 * See Claude-offline.md for full specification.
 */

export type QueueOperation =
  | { type: 'INSERT_SET'; payload: Record<string, unknown> }
  | { type: 'UPDATE_SET'; payload: { id: string; values: Record<string, unknown> } }
  | { type: 'COMPLETE_WORKOUT'; payload: { sessionId: string } };

interface QueuedItem {
  id: string;
  operation: QueueOperation;
  createdAt: number;
  retries: number;
}

class OfflineQueue {
  private queue: QueuedItem[] = [];
  private flushing = false;

  enqueue(operation: QueueOperation): void {
    const item: QueuedItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      operation,
      createdAt: Date.now(),
      retries: 0,
    };
    this.queue.push(item);
  }

  get length(): number {
    return this.queue.length;
  }

  /** Flush all queued operations. Pass a flush fn from the store layer. */
  async flush(
    flushFn: (item: QueuedItem) => Promise<void>,
    maxRetries = 3
  ): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    const remaining: QueuedItem[] = [];

    for (const item of this.queue) {
      try {
        await flushFn(item);
      } catch {
        if (item.retries < maxRetries) {
          remaining.push({ ...item, retries: item.retries + 1 });
        }
        // Permanently failed items are dropped after maxRetries
      }
    }

    this.queue = remaining;
    this.flushing = false;
  }

  drain(): QueuedItem[] {
    const items = [...this.queue];
    this.queue = [];
    return items;
  }
}

export const offlineQueue = new OfflineQueue();
