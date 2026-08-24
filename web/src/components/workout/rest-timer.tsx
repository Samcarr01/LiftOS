'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { haptic } from '@/lib/haptics';

function playBeep() {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
    setTimeout(() => void ctx.close(), 1000);
  } catch { /* AudioContext unavailable */ }
}

export function RestTimer() {
  const restTimer = useActiveWorkoutStore((s) => s.restTimer);

  if (!restTimer.isRunning || !restTimer.startedAt) return null;

  return <RestTimerOverlay key={restTimer.startedAt} />;
}

function RestTimerOverlay() {
  const restTimer = useActiveWorkoutStore((s) => s.restTimer);
  const stopTimer = useActiveWorkoutStore((s) => s.stopRestTimer);

  // The overlay remounts per rest period, so this starts at the full duration.
  // Keep the time-derived value in state: React may render without a timer tick.
  const [remaining, setRemaining] = useState(restTimer.duration);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!restTimer.isRunning) {
      firedRef.current = false;
      return;
    }

    firedRef.current = false;
    const tick = () => {
      const currentTime = Date.now();

      if (!restTimer.startedAt) return;
      const elapsed   = Math.floor((currentTime - restTimer.startedAt) / 1000);
      const nextRemaining = Math.max(0, restTimer.duration - elapsed);
      setRemaining(nextRemaining);

      if (nextRemaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        playBeep();
        haptic('warn');
        setTimeout(() => stopTimer(), 1500);
      }
    };

    tick();
    const id = setInterval(tick, 1000); // 1Hz tick matches the mm:ss readout

    return () => clearInterval(id);
  }, [restTimer.isRunning, restTimer.startedAt, restTimer.duration, stopTimer]);

  if (!restTimer.isRunning || !restTimer.startedAt) return null;

  const progress  = restTimer.duration > 0 ? remaining / restTimer.duration : 0;

  const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
  const secs = (remaining % 60).toString().padStart(2, '0');

  const barColor =
    progress > 0.5  ? 'bg-[oklch(0.72_0.19_155)]' :
    progress > 0.25 ? 'bg-yellow-500'  :
                      'bg-red-500';

  return (
    <div className="fixed bottom-16 left-4 right-4 z-40 md:bottom-6 md:left-auto md:right-6 md:w-72">
      <div className="overflow-hidden rounded-2xl border border-white/[0.10] bg-[oklch(0.10_0.012_260/0.92)] shadow-xl">
        {/* Progress bar */}
        <div className="h-1 w-full bg-muted">
          <div
            className={`h-1 w-full origin-left ${barColor}`}
            style={{ transform: `scaleX(${progress})`, transition: 'transform 1s linear', willChange: 'transform' }}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <span className="numeric flex-1 text-2xl font-bold">{mins}:{secs}</span>
          <span className="text-sm text-muted-foreground">Rest</span>
          <button
            onClick={stopTimer}
            className="tappable flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-muted-foreground hover:bg-muted/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
