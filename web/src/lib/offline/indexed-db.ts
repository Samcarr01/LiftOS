/**
 * Dexie IndexedDB database for LiftOS offline persistence.
 *
 * Schema v1:
 *   syncQueue — pending mutations waiting to sync to Supabase
 *
 * Survives browser close/reopen. Max queue: 1000 mutations.
 */
import Dexie, { type Table } from 'dexie';

export interface QueuedMutation {
  /** UUID — also used as client_id for server-side idempotency */
  id:          string;
  table:       'set_entries' | 'workout_sessions' | 'session_exercises';
  operation:   'insert' | 'update' | 'delete';
  data:        Record<string, unknown>;
  /** ISO timestamp of when the user performed the action (client clock) */
  timestamp:   string;
  retries:     number;
  /** Date.now() value after which this item is eligible for retry */
  nextRetryAt: number;
  status:      'pending' | 'synced' | 'failed';
}

class LiftOSDB extends Dexie {
  syncQueue!: Table<QueuedMutation, string>;

  constructor() {
    super('liftos-v1');
    this.version(1).stores({
      // Primary key: id (string UUID). Indexed columns: status, nextRetryAt
      syncQueue: 'id, status, nextRetryAt',
    });
  }
}

/** Singleton DB instance — created on first import */
export const db = new LiftOSDB();
