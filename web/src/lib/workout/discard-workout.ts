/**
 * Discarding a workout, without losing one.
 *
 * The local workout is the only copy of every set logged since the last
 * successful sync. `supabase.delete()` resolves with `{ error }` rather than
 * rejecting, so an RLS denial, an offline device or a 500 all look like success
 * to a bare `await` — and clearing local state on that path destroys data while
 * leaving the session on the server.
 *
 * So the order is fixed: confirm the server row is gone, *then* clear and
 * navigate. Anything else retains the workout and says so.
 *
 * The in-flight latch lives here rather than in `useState` because React state
 * lags a double tap; the thing that must not fire twice is the thing that owns
 * the latch. Callers still disable the button off `isPending()` — that is
 * cosmetics, this is the guarantee.
 */

export type DiscardWorkoutDeps = {
  sessionId: string;
  /** Resolves with Supabase's `{ error }`, or rejects. Both are handled. */
  deleteSession: (sessionId: string) => Promise<{ error?: unknown } | void>;
  clearWorkout: () => void;
  navigateHome: () => void;
  onError: (message: string) => void;
};

export type DiscardWorkoutResult = {
  /** True only when the server row is really gone. False keeps the dialog open. */
  discarded: boolean;
  error: string | null;
};

export interface WorkoutDiscarder {
  isPending(): boolean;
  discard(): Promise<DiscardWorkoutResult>;
}

const FALLBACK_MESSAGE = "Couldn't discard this workout. It's still saved — try again.";

function messageFor(cause: unknown): string {
  if (typeof cause === 'string' && cause.trim()) return cause;
  if (cause && typeof cause === 'object') {
    const { message } = cause as { message?: unknown };
    if (typeof message === 'string' && message.trim()) return message;
  }
  return FALLBACK_MESSAGE;
}

export function createWorkoutDiscarder(deps: DiscardWorkoutDeps): WorkoutDiscarder {
  let inFlight: Promise<DiscardWorkoutResult> | null = null;

  async function run(): Promise<DiscardWorkoutResult> {
    let outcome: { error?: unknown } | void;
    try {
      outcome = await deps.deleteSession(deps.sessionId);
    } catch (err) {
      const message = messageFor(err);
      deps.onError(message);
      return { discarded: false, error: message };
    }

    const failure = outcome && typeof outcome === 'object' ? outcome.error : null;
    if (failure) {
      const message = messageFor(failure);
      deps.onError(message);
      return { discarded: false, error: message };
    }

    deps.clearWorkout();
    deps.navigateHome();
    return { discarded: true, error: null };
  }

  return {
    isPending: () => inFlight !== null,

    discard() {
      // A second tap joins the first attempt rather than starting another one:
      // one delete, one clear, one navigation. The latch releases either way, so
      // a failed discard leaves a usable button behind.
      if (inFlight) return inFlight;
      inFlight = run().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
