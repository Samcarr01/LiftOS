/**
 * local-db — expo-sqlite v15 wrapper.
 *
 * Tables:
 *   offline_queue     — persisted write queue (survives kill/restart)
 *   local_set_entries — local mirror of set_entries for fast offline reads
 *
 * All methods are async. Call `initLocalDb()` once at app startup.
 */
import * as SQLite from 'expo-sqlite';

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS offline_queue (
    id           TEXT PRIMARY KEY,
    table_name   TEXT NOT NULL,
    operation    TEXT NOT NULL,
    data         TEXT NOT NULL,
    timestamp    TEXT NOT NULL,
    retries      INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'pending',
    error_msg    TEXT,
    next_retry_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_queue_status_retry
    ON offline_queue(status, next_retry_at);

  CREATE TABLE IF NOT EXISTS local_set_entries (
    local_id            TEXT PRIMARY KEY,
    session_exercise_id TEXT NOT NULL,
    set_index           INTEGER NOT NULL,
    values_json         TEXT NOT NULL,
    set_type            TEXT NOT NULL DEFAULT 'working',
    is_completed        INTEGER NOT NULL DEFAULT 0,
    notes               TEXT,
    logged_at           TEXT,
    is_pending_sync     INTEGER NOT NULL DEFAULT 1,
    UNIQUE(session_exercise_id, set_index)
  );

  CREATE INDEX IF NOT EXISTS idx_local_sets_session
    ON local_set_entries(session_exercise_id);
`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueueRow {
  id: string;
  table_name: string;
  operation: string;
  data: string; // JSON string
  timestamp: string;
  retries: number;
  status: string;
  error_msg: string | null;
  next_retry_at: string | null;
}

export interface LocalSetEntryRow {
  local_id: string;
  session_exercise_id: string;
  set_index: number;
  values_json: string;
  set_type: string;
  is_completed: number;
  notes: string | null;
  logged_at: string | null;
  is_pending_sync: number;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('liftos.db');
  await _db.execAsync(SCHEMA);
  return _db;
}

/** Must be called once at app startup (in _layout.tsx). */
export async function initLocalDb(): Promise<void> {
  await getDb();
}

// ── Offline queue operations ──────────────────────────────────────────────────

export async function queueInsert(row: Omit<QueueRow, 'retries' | 'status' | 'error_msg' | 'next_retry_at'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO offline_queue
       (id, table_name, operation, data, timestamp, retries, status)
     VALUES (?, ?, ?, ?, ?, 0, 'pending')`,
    [row.id, row.table_name, row.operation, row.data, row.timestamp],
  );
}

export async function queueGetPending(limit = 100): Promise<QueueRow[]> {
  const db = await getDb();
  return db.getAllAsync<QueueRow>(
    `SELECT * FROM offline_queue
     WHERE status = 'pending'
       AND retries < 5
       AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
     ORDER BY timestamp ASC
     LIMIT ?`,
    [limit],
  );
}

export async function queueMarkSyncing(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE offline_queue SET status = 'syncing' WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function queueMarkSynced(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE offline_queue SET status = 'synced' WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function queueMarkFailed(id: string, errorMsg: string, retries: number): Promise<void> {
  const db = await getDb();
  const status = retries >= 5 ? 'failed' : 'pending';
  // Exponential backoff: 2^retries seconds
  const backoffMs = Math.pow(2, retries) * 1000;
  const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
  await db.runAsync(
    `UPDATE offline_queue
     SET status = ?, retries = ?, error_msg = ?, next_retry_at = ?
     WHERE id = ?`,
    [status, retries, errorMsg, status === 'pending' ? nextRetryAt : null, id],
  );
}

export async function queueGetSize(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM offline_queue WHERE status IN ('pending', 'syncing')`,
  );
  return row?.count ?? 0;
}

export async function queueClearSynced(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM offline_queue WHERE status = 'synced'`);
}

// ── Local set_entries operations ──────────────────────────────────────────────

export async function localSetUpsert(entry: LocalSetEntryRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO local_set_entries
       (local_id, session_exercise_id, set_index, values_json, set_type,
        is_completed, notes, logged_at, is_pending_sync)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_exercise_id, set_index)
     DO UPDATE SET
       values_json     = excluded.values_json,
       set_type        = excluded.set_type,
       is_completed    = excluded.is_completed,
       notes           = excluded.notes,
       logged_at       = excluded.logged_at,
       is_pending_sync = excluded.is_pending_sync`,
    [
      entry.local_id,
      entry.session_exercise_id,
      entry.set_index,
      entry.values_json,
      entry.set_type,
      entry.is_completed,
      entry.notes,
      entry.logged_at,
      entry.is_pending_sync,
    ],
  );
}

export async function localSetGetBySession(sessionExerciseId: string): Promise<LocalSetEntryRow[]> {
  const db = await getDb();
  return db.getAllAsync<LocalSetEntryRow>(
    `SELECT * FROM local_set_entries WHERE session_exercise_id = ? ORDER BY set_index ASC`,
    [sessionExerciseId],
  );
}

/** Clear ALL rows from both offline tables (called on logout / account delete). */
export async function queueClearAll(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM offline_queue`);
  await db.runAsync(`DELETE FROM local_set_entries`);
}

/** Count permanently failed mutations (for profile indicator). */
export async function queueGetFailedCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM offline_queue WHERE status = 'failed'`,
  );
  return row?.count ?? 0;
}

export async function localSetMarkSynced(sessionExerciseId: string, setIndex: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE local_set_entries SET is_pending_sync = 0
     WHERE session_exercise_id = ? AND set_index = ?`,
    [sessionExerciseId, setIndex],
  );
}
