/**
 * Training context vocabulary — Cut-Aware Progression v1, §2.2.
 *
 * These describe *context*, never a recorded fact. Nothing in this module is an
 * input to the observation layer (`@/lib/workout/observation`); phase and
 * readiness enter at interpretation and prescription only.
 */

/** The user's current training phase. Applied at prescription time (§4). */
export type TrainingPhase = 'build' | 'maintain' | 'cut';

/** Optional per-session readiness. `null` means "never asked" — not "bad day" (§3). */
export type Readiness = 'high' | 'normal' | 'low' | 'very_low';
