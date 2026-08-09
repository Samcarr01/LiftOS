/**
 * Cycle 1 — Data safety — RED — a deleted set's queued write must not replay
 *
 * Run with: npx tsx src/lib/offline/__tests__/queued-set-write-cancellation.spec.ts
 *
 * Contract (approved, part 1, second half):
 *   A completed set is queued for offline sync by its persisted key
 *   (session_exercise_id, set_index). If the user deletes that set before it
 *   syncs, its queued write must not later replay.
 *
 * What is wrong today
 * -------------------
 * `logSetEntry` (src/lib/offline/index.ts) pushes an insert into the Dexie
 * queue the moment a set is completed. `processQueue` then retries that row
 * forever — literally forever: `backoffMutation` caps at five minutes and
 * never gives up, and `processQueue` even resurrects rows that were parked as
 * `failed`.
 *
 * Nothing removes a queued row when the set it describes is deleted.
 * `deleteSet` in the store drops the set from local state and that is the end
 * of it. So: complete a set on a flaky connection, notice it was a mistake,
 * delete it — and the next time the queue drains, the server upserts the set
 * back into the workout. The lifter deleted a set and it reappeared, with no
 * local trace of where it came from. On the workout page there is not even a
 * failed-sync surface to explain it.
 *
 * The wished-for surface
 * ----------------------
 * The mirror of `logSetEntry`, keyed the same way the server is:
 *
 *   // @/lib/offline
 *   cancelQueuedSetEntry(set: Pick<SetEntry, 'sessionExerciseId' | 'setIndex'>): Promise<void>
 *
 * Keyed by the persisted pair, not by queue row id, because a set can have
 * been enqueued more than once (complete → un-complete → complete) and every
 * one of those rows will replay. GREEN also has to wire it into the delete
 * path so `deleteSet` and `cancelQueuedSetEntry` happen together — the store
 * is synchronous and the queue is not, so the call belongs beside `deleteSet`
 * at the two call sites that already pair `completeSet` with `logSetEntry`
 * (exercise-card.tsx, superset-card.tsx).
 *
 * This suite reaches the real `@/lib/offline` module. Only Dexie's storage is
 * substituted — `db.syncQueue` is swapped for an in-memory table, because
 * IndexedDB does not exist under plain node. Everything above that line
 * (`addToQueue`, `logSetEntry`, the queue shape, the persisted key) is the
 * production code.
 *
 * Q1 exists to prove that substitution works before anything is claimed about
 * the missing capability, so the first failure is a contract failure and not a
 * harness failure.
 */

// `addToQueue` and `processQueue` both bail out on `typeof window === 'undefined'`.
// Checked at call time, so defining it here is enough; nothing reads a property.
global.window = {} as unknown as Window & typeof globalThis;

import * as offline from '@/lib/offline';
import { logSetEntry } from '@/lib/offline';
import { db, type QueuedMutation } from '@/lib/offline/indexed-db';
import type { SetEntry } from '@/types/app';

// ── Assertion helpers (same plain style as the sibling suites) ────────────────

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
  }
}

// ── In-memory stand-in for db.syncQueue ──────────────────────────────────────
// Enough of Dexie's Table/Collection surface that production code can drive it
// unchanged. Deliberately generous: the cancellation this suite is waiting for
// does not exist yet, so it is not yet known which of these it will reach for.

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type Row = QueuedMutation;
type Predicate = (row: Row) => boolean;

class FakeCollection {
  constructor(
    private readonly table: FakeTable,
    private readonly predicate: Predicate,
    private readonly cap: number = Infinity,
  ) {}

  private matched(): Row[] {
    const rows = this.table.rows.filter(this.predicate);
    return this.cap === Infinity ? rows : rows.slice(0, this.cap);
  }

  filter(fn: Predicate): FakeCollection {
    return new FakeCollection(this.table, (row) => this.predicate(row) && fn(row), this.cap);
  }

  and(fn: Predicate): FakeCollection {
    return this.filter(fn);
  }

  limit(n: number): FakeCollection {
    return new FakeCollection(this.table, this.predicate, n);
  }

  async toArray(): Promise<Row[]> {
    return this.matched().map(clone);
  }

  async count(): Promise<number> {
    return this.matched().length;
  }

  async first(): Promise<Row | undefined> {
    const [row] = this.matched();
    return row ? clone(row) : undefined;
  }

  async primaryKeys(): Promise<string[]> {
    return this.matched().map((row) => row.id);
  }

  async keys(): Promise<string[]> {
    return this.primaryKeys();
  }

  async each(fn: (row: Row) => void): Promise<void> {
    for (const row of this.matched()) fn(clone(row));
  }

  async sortBy(key: keyof Row): Promise<Row[]> {
    return this.matched()
      .map(clone)
      .sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0));
  }

  async delete(): Promise<number> {
    const doomed = new Set(this.matched().map((row) => row.id));
    const before = this.table.rows.length;
    this.table.rows = this.table.rows.filter((row) => !doomed.has(row.id));
    return before - this.table.rows.length;
  }

  async modify(changes: Partial<Row> | ((row: Row) => void)): Promise<number> {
    const targets = new Set(this.matched().map((row) => row.id));
    let n = 0;
    this.table.rows = this.table.rows.map((row) => {
      if (!targets.has(row.id)) return row;
      n += 1;
      if (typeof changes === 'function') {
        const draft = clone(row);
        changes(draft);
        return draft;
      }
      return { ...row, ...changes };
    });
    return n;
  }
}

class FakeTable {
  rows: Row[] = [];

  async add(row: Row): Promise<string> {
    this.rows.push(clone(row));
    return row.id;
  }

  async bulkAdd(rows: Row[]): Promise<string[]> {
    for (const row of rows) await this.add(row);
    return rows.map((row) => row.id);
  }

  async put(row: Row): Promise<string> {
    const at = this.rows.findIndex((r) => r.id === row.id);
    if (at === -1) this.rows.push(clone(row));
    else this.rows[at] = clone(row);
    return row.id;
  }

  async get(id: string): Promise<Row | undefined> {
    const row = this.rows.find((r) => r.id === id);
    return row ? clone(row) : undefined;
  }

  async update(id: string, changes: Partial<Row>): Promise<number> {
    const at = this.rows.findIndex((r) => r.id === id);
    if (at === -1) return 0;
    this.rows[at] = { ...this.rows[at], ...changes };
    return 1;
  }

  async delete(id: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const doomed = new Set(ids);
    this.rows = this.rows.filter((row) => !doomed.has(row.id));
  }

  async toArray(): Promise<Row[]> {
    return this.rows.map(clone);
  }

  async count(): Promise<number> {
    return this.rows.length;
  }

  async clear(): Promise<void> {
    this.rows = [];
  }

  toCollection(): FakeCollection {
    return new FakeCollection(this, () => true);
  }

  filter(fn: Predicate): FakeCollection {
    return new FakeCollection(this, fn);
  }

  where(field: string | Record<string, unknown>) {
    if (typeof field === 'object') {
      const entries = Object.entries(field);
      return new FakeCollection(this, (row) =>
        entries.every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value),
      );
    }
    const read = (row: Row) => (row as unknown as Record<string, unknown>)[field];
    return {
      equals: (value: unknown) => new FakeCollection(this, (row) => read(row) === value),
      notEqual: (value: unknown) => new FakeCollection(this, (row) => read(row) !== value),
      anyOf: (...values: unknown[]) => {
        const wanted = new Set(values.length === 1 && Array.isArray(values[0]) ? values[0] : values);
        return new FakeCollection(this, (row) => wanted.has(read(row)));
      },
      noneOf: (...values: unknown[]) => {
        const wanted = new Set(values.length === 1 && Array.isArray(values[0]) ? values[0] : values);
        return new FakeCollection(this, (row) => !wanted.has(read(row)));
      },
      above: (value: number) => new FakeCollection(this, (row) => (read(row) as number) > value),
      aboveOrEqual: (value: number) => new FakeCollection(this, (row) => (read(row) as number) >= value),
      below: (value: number) => new FakeCollection(this, (row) => (read(row) as number) < value),
      belowOrEqual: (value: number) => new FakeCollection(this, (row) => (read(row) as number) <= value),
    };
  }
}

/** Swap in a clean queue. Dexie's own table is never opened under node. */
function freshQueue(): FakeTable {
  const table = new FakeTable();
  (db as unknown as Record<string, unknown>).syncQueue = table;
  return table;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function completedSet(sessionExerciseId: string, setIndex: number, weight: number): SetEntry {
  return {
    id: `local_${sessionExerciseId}_${setIndex}`,
    sessionExerciseId,
    setIndex,
    values: { weight, reps: 5 },
    setType: 'working',
    isCompleted: true,
    rir: null,
    notes: null,
    loggedAt: `2026-08-09T10:0${setIndex}:00.000Z`,
  };
}

/** The persisted key of a queued row, which is what the server upserts on. */
function keyOf(row: QueuedMutation): string {
  const data = row.data as { session_exercise_id?: unknown; set_index?: unknown };
  return `${String(data.session_exercise_id)}#${String(data.set_index)}`;
}

function keysIn(table: FakeTable): string[] {
  return table.rows.filter((row) => row.table === 'set_entries').map(keyOf).sort();
}

/**
 * The rows `processQueue` would pick up on its next pass — its own selection,
 * restated: pending, and past its backoff. This is what "will replay" means.
 */
function replayableKeys(table: FakeTable, now = Date.now()): string[] {
  return table.rows
    .filter((row) => row.status === 'pending' && row.nextRetryAt <= now && row.table === 'set_entries')
    .map(keyOf)
    .sort();
}

// ── The wished-for capability ────────────────────────────────────────────────

type CancelQueuedSetEntry = (set: Pick<SetEntry, 'sessionExerciseId' | 'setIndex'>) => Promise<unknown>;

function cancelQueuedSetEntry(): CancelQueuedSetEntry {
  const fn = (offline as unknown as Record<string, unknown>).cancelQueuedSetEntry;
  assert(
    typeof fn === 'function',
    '@/lib/offline exports cancelQueuedSetEntry(set) — the mirror of logSetEntry(set). A completed set is ' +
      'queued by (session_exercise_id, set_index) and retried forever; deleting the set has to withdraw that ' +
      'write, or the queue upserts a deleted set back into the workout on the next drain',
  );
  return fn as CancelQueuedSetEntry;
}

async function main() {
  console.log('Running Queued set-write cancellation (Cycle 1 data safety) tests...\n');

  // ── Q1: the harness is real before anything is claimed about the contract ──
  {
    console.log('Q1: logSetEntry queues a set_entries insert under its persisted key');

    const queue = freshQueue();
    await logSetEntry(completedSet('se_bench', 2, 100));

    assertEqual(queue.rows.length, 1, 'One row was queued — the in-memory table is really receiving writes');
    const [row] = queue.rows;
    assertEqual(row.table, 'set_entries', 'It is a set_entries mutation');
    assertEqual(row.operation, 'insert', 'It is an insert');
    assertEqual(row.status, 'pending', 'It is pending, so processQueue will send it');
    assertEqual(keyOf(row), 'se_bench#2', 'It carries the persisted key the server upserts on');
    assertEqual(replayableKeys(queue), ['se_bench#2'], 'It is eligible to replay right now');

    console.log('  ✓ the real logSetEntry drives the substituted table');
  }

  // ── Q2: deleting a set withdraws exactly that set's queued write ───────────
  {
    console.log('Q2: cancelling a set removes its queued write and nothing else');

    const queue = freshQueue();
    await logSetEntry(completedSet('se_bench', 0, 80));
    await logSetEntry(completedSet('se_bench', 1, 90));
    await logSetEntry(completedSet('se_bench', 2, 100));
    assertEqual(keysIn(queue), ['se_bench#0', 'se_bench#1', 'se_bench#2'], 'Precondition: three queued sets');

    await cancelQueuedSetEntry()({ sessionExerciseId: 'se_bench', setIndex: 1 });

    assertEqual(
      keysIn(queue),
      ['se_bench#0', 'se_bench#2'],
      'The deleted set\'s write is gone; its neighbours are untouched',
    );
    assertEqual(
      replayableKeys(queue),
      ['se_bench#0', 'se_bench#2'],
      'The next processQueue pass cannot resurrect the deleted set',
    );

    console.log('  ✓ one key withdrawn, two left to sync');
  }

  // ── Q3: the key is the pair, not the index ────────────────────────────────
  {
    console.log('Q3: an identical set_index on a different exercise is not collateral damage');

    const queue = freshQueue();
    await logSetEntry(completedSet('se_bench', 1, 90));
    await logSetEntry(completedSet('se_squat', 1, 140));
    await logSetEntry(completedSet('se_row', 1, 70));

    await cancelQueuedSetEntry()({ sessionExerciseId: 'se_squat', setIndex: 1 });

    assertEqual(
      keysIn(queue),
      ['se_bench#1', 'se_row#1'],
      'Cancellation matches (session_exercise_id, set_index) as a pair — set_index alone is not a key',
    );

    console.log('  ✓ only the named exercise lost its row');
  }

  // ── Q4: every queued copy goes, including one already backing off ─────────
  {
    console.log('Q4: duplicate and retrying writes for the same set are all withdrawn');

    const queue = freshQueue();

    // complete → un-complete → complete enqueues the same key more than once.
    await logSetEntry(completedSet('se_bench', 3, 105));
    await logSetEntry(completedSet('se_bench', 3, 107));

    // A row that already failed once and is parked behind a backoff. It has not
    // replayed yet, which is exactly why it is dangerous: `processQueue` will
    // pick it up the moment the timer expires, long after the set was deleted.
    queue.rows.push({
      id: 'queued_retrying',
      table: 'set_entries',
      operation: 'insert',
      data: { session_exercise_id: 'se_bench', set_index: 3, values: { weight: 105, reps: 5 } },
      timestamp: '2026-08-09T10:03:00.000Z',
      retries: 4,
      nextRetryAt: Date.now() + 5 * 60 * 1000,
      status: 'pending',
    });

    assertEqual(keysIn(queue).length, 3, 'Precondition: three queued writes for one set');

    await cancelQueuedSetEntry()({ sessionExerciseId: 'se_bench', setIndex: 3 });

    assertEqual(
      keysIn(queue),
      [],
      'Every queued copy of the key is withdrawn — one survivor is enough to restore the deleted set',
    );
    assert(
      !queue.rows.some((row) => row.id === 'queued_retrying'),
      'A backed-off row is withdrawn too — it has not replayed yet, so it is still a pending resurrection',
    );

    console.log('  ✓ duplicates and the backed-off retry are all gone');
  }

  // ── Q5: nothing outside set_entries is touched ────────────────────────────
  {
    console.log('Q5: cancelling a set write leaves other tables\' mutations alone');

    const queue = freshQueue();
    await logSetEntry(completedSet('se_bench', 0, 80));
    queue.rows.push({
      id: 'queued_session',
      table: 'workout_sessions',
      operation: 'update',
      data: { id: 'ws_1', session_exercise_id: 'se_bench', set_index: 0, notes: 'felt strong' },
      timestamp: '2026-08-09T10:10:00.000Z',
      retries: 0,
      nextRetryAt: 0,
      status: 'pending',
    });

    await cancelQueuedSetEntry()({ sessionExerciseId: 'se_bench', setIndex: 0 });

    assert(
      queue.rows.some((row) => row.id === 'queued_session'),
      'A workout_sessions mutation that happens to carry the same fields is not a set write and must survive',
    );
    assertEqual(keysIn(queue), [], 'The set_entries write for that key is gone');

    console.log('  ✓ scoped to set_entries');
  }

  // ── Q6: cancelling something that was never queued is a no-op ─────────────
  {
    console.log('Q6: cancelling a set with nothing queued neither throws nor disturbs the queue');

    const queue = freshQueue();
    await logSetEntry(completedSet('se_bench', 0, 80));
    const before = keysIn(queue);

    // The overwhelmingly common case: the set was never completed, or it already
    // synced and was deleted from the queue. Deleting it must stay silent.
    await cancelQueuedSetEntry()({ sessionExerciseId: 'se_bench', setIndex: 9 });
    await cancelQueuedSetEntry()({ sessionExerciseId: 'se_unknown', setIndex: 0 });

    assertEqual(keysIn(queue), before, 'The queue is unchanged');

    console.log('  ✓ silent no-op, queue intact');
  }

  console.log('\n✅ All Queued set-write cancellation (Cycle 1 data safety) tests passed!');
  console.log('Coverage verified:');
  console.log('  ✓ logSetEntry queues under (session_exercise_id, set_index) and is replayable');
  console.log('  ✓ Cancelling a set withdraws its write and leaves its neighbours queued');
  console.log('  ✓ The key is the pair — a shared set_index on another exercise survives');
  console.log('  ✓ Duplicate enqueues and a backed-off retry are all withdrawn');
  console.log('  ✓ Mutations for other tables are never touched');
  console.log('  ✓ Cancelling an unqueued set is a silent no-op');
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}`);
  process.exit(1);
});
