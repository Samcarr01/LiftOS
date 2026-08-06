/**
 * Layer 1 — Observation. Cut-Aware Progression v1, §2.1.
 *
 * Raw, objective facts about what was logged. Nothing in this module knows what
 * a training phase, a readiness tag, a bodyweight or a confidence score is —
 * `buildSessionObservations` takes exactly three parameters and there is nowhere
 * to put one. 80×8 → 80×7 is recorded as a drop no matter how the lifter felt.
 *
 * Pure and deterministic: no imports with runtime side effects, no network, no
 * clock. Interpretation happens in `./interpretation`; prescription happens in
 * `./guided-progression`.
 */

import type { SetType, SetValues } from '@/types/app';
import type { TrackingSchema } from '@/types/tracking';
import type { TrackingSetLike } from './formatting';

// ── Types ────────────────────────────────────────────────────────────────────

/** Set types that count as progression evidence. Warmup/drop/failure never do. */
const PROGRESSION_SET_TYPES = new Set<string>(['working', 'top']);

const KNOWN_SET_TYPES = new Set<string>(['warmup', 'working', 'top', 'drop', 'failure']);

export interface RepRange {
  min: number;
  max: number;
}

/** Reps in reserve on a set. `3` means "3 or more". Recorded, never judged here. */
export type Rir = 0 | 1 | 2 | 3;

/**
 * Input set. Widens the engine's existing `TrackingSetLike` with the optional
 * `rir` column only, so every existing fixture and history row stays valid input.
 */
export interface ObservationSet extends TrackingSetLike {
  rir?: Rir | number | null;
}

export interface ObservationSession {
  sessionId: string;
  completedAt: string;
  sets: ObservationSet[];
}

export interface SetObservation {
  setIndex: number;
  setType: SetType;
  isCompleted: boolean;
  values: SetValues;
  /** weight | added_weight | height, per schema. 0 when the schema carries no load. */
  load: number;
  reps: number;
  /** Epley. 0 unless the schema is load+reps. */
  e1rm: number;
  volumeKg: number;
}

export interface SessionObservation {
  sessionId: string;
  completedAt: string;
  /** Completed working/top sets — or every completed set when none qualify. */
  workingSets: SetObservation[];
  topLoad: number;
  repVector: number[];
  avgReps: number;
  bestE1rm: number;
  totalVolumeKg: number;
  completedWorkingSetCount: number;
  /** Rows present, completed or not — the denominator for volume tolerance. */
  plannedWorkingSetCount: number;
  allSetsAtCeiling: boolean;
  hasRepDropoff: boolean;
  /** RIR of the final *completed* working/top set. `null` = never logged. */
  finalWorkingSetRir: Rir | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function epley(load: number, reps: number): number {
  if (load <= 0 || reps <= 0) return 0;
  if (reps <= 1) return load;
  return load * (1 + reps / 30);
}

function numericValue(values: SetValues, key: string): number {
  const raw = values[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

/**
 * `null` = the row carries a set type this engine does not recognise. Such a row
 * is not evidence of anything and is dropped, never relabelled as working.
 * A missing set type still defaults to `working`, matching `getProgressionSets()`
 * (`set.set_type ?? 'working'`).
 */
function normalizeSetType(setType: string | undefined): SetType | null {
  if (setType === undefined) return 'working';
  return KNOWN_SET_TYPES.has(setType) ? (setType as SetType) : null;
}

function normalizeRir(rir: ObservationSet['rir']): Rir | null {
  if (typeof rir !== 'number' || !Number.isInteger(rir) || rir < 0 || rir > 3) return null;
  return rir as Rir;
}

/** A row counts as logged work only if it carries at least one tracked value. */
function hasTrackedValue(values: SetValues, schema: TrackingSchema): boolean {
  return schema.fields.some((field) => {
    const raw = values[field.key];
    if (typeof raw === 'number') return raw > 0;
    if (typeof raw === 'string') return raw.trim().length > 0;
    return false;
  });
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

// ── Observation ──────────────────────────────────────────────────────────────

/**
 * Record what happened. Sessions are returned in input order (newest first, per
 * `load-history.ts`), one observation each.
 *
 * The three-parameter signature is the boundary: there is no context argument,
 * and adding one would break `observation.spec.ts` immediately.
 */
export function buildSessionObservations(
  sessions: ObservationSession[],
  schema: TrackingSchema,
  repRange: RepRange,
): SessionObservation[] {
  return sessions.map((session) => observeSession(session, schema, repRange));
}

function observeSession(
  session: ObservationSession,
  schema: TrackingSchema,
  repRange: RepRange,
): SessionObservation {
  const keys = new Set(schema.fields.map((field) => field.key));
  const hasReps = keys.has('reps');

  // Same load-key priority as the engine's analyzeSession: added_weight wins for
  // bodyweight movements, height for jump-style tracking, weight otherwise.
  const loadKey = keys.has('added_weight')
    ? 'added_weight'
    : keys.has('height')
      ? 'height'
      : keys.has('weight')
        ? 'weight'
        : null;

  // Only true load carries kg volume and an e1RM. Height and lap counts do not.
  const carriesKg = loadKey === 'weight' || loadKey === 'added_weight';

  interface Row {
    set: ObservationSet;
    /** Position in the input array — the tie-break for rows sharing a set_index. */
    inputOrder: number;
    setIndex: number;
    setType: SetType;
  }

  const rows: Row[] = [];
  session.sets.forEach((set, index) => {
    const setType = normalizeSetType(typeof set.set_type === 'string' ? set.set_type : undefined);
    if (setType === null) return; // unrecognised type — not evidence, not a working set
    rows.push({ set, inputOrder: index, setIndex: set.set_index ?? index, setType });
  });

  // `set_index` is the logical order the session was performed in. Array order is
  // whatever the query happened to return, so every derived fact below — the rep
  // vector, the drop-off flag, the final working set's RIR — sorts first.
  rows.sort((a, b) => (a.setIndex === b.setIndex ? a.inputOrder - b.inputOrder : a.setIndex - b.setIndex));

  const qualifyingRows = rows.filter((row) => PROGRESSION_SET_TYPES.has(row.setType));

  // Same order of operations as the engine's `getProgressionSets()`: filter to
  // completed rows first, then to working/top, and fall back to *all completed*
  // rows only when no completed working/top row exists. An open working row
  // therefore never suppresses the work that was actually finished.
  const completedRows = rows.filter(
    (row) => row.set.is_completed !== false && hasTrackedValue(row.set.values, schema),
  );
  const qualifyingCompleted = completedRows.filter((row) => PROGRESSION_SET_TYPES.has(row.setType));
  const observedRows = qualifyingCompleted.length > 0 ? qualifyingCompleted : completedRows;

  // Planned rows are the qualifying rows — completed or not — so an unlogged
  // working set still counts toward the volume-tolerance denominator. Under the
  // fallback there is no planned-but-open notion, so the observed rows stand.
  const plannedRows = qualifyingCompleted.length > 0 ? qualifyingRows : observedRows;

  const workingSets: SetObservation[] = observedRows.map((row) => {
    const load = loadKey ? numericValue(row.set.values, loadKey) : 0;
    const reps = hasReps ? numericValue(row.set.values, 'reps') : 0;

    return {
      setIndex: row.setIndex,
      setType: row.setType,
      isCompleted: true,
      values: row.set.values,
      load,
      reps,
      e1rm: carriesKg && hasReps ? epley(load, reps) : 0,
      volumeKg: carriesKg ? load * reps : 0,
    };
  });

  const repVector = hasReps ? workingSets.map((set) => set.reps) : [];
  const finalCompletedRow = observedRows[observedRows.length - 1];

  return {
    sessionId: session.sessionId,
    completedAt: session.completedAt,
    workingSets,
    topLoad: workingSets.length > 0 ? Math.max(...workingSets.map((set) => set.load)) : 0,
    repVector,
    avgReps: mean(repVector),
    bestE1rm: workingSets.length > 0 ? Math.max(...workingSets.map((set) => set.e1rm)) : 0,
    totalVolumeKg: workingSets.reduce((total, set) => total + set.volumeKg, 0),
    completedWorkingSetCount: workingSets.length,
    plannedWorkingSetCount: plannedRows.length,
    allSetsAtCeiling:
      repVector.length > 0 && repRange.max > 0 && repVector.every((reps) => reps >= repRange.max),
    hasRepDropoff: repVector.length >= 2 && repVector[repVector.length - 1] < repVector[0],
    finalWorkingSetRir: finalCompletedRow ? normalizeRir(finalCompletedRow.set.rir) : null,
  };
}
