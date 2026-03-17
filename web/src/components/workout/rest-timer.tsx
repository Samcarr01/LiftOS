'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useActiveWorkoutStore } from '@/store/active-workout-store';

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
  const stopTimer = useActiveWorkoutStore((s) => s.stopRestTimer);

  // Tick counter forces re-render every second
  const [, setTick] = useState(0);
  const firedRef    = useRef(false);

  useEffect(() => {
    if (!restTimer.isRunning) {
      firedRef.current = false;
      return;
    }

    firedRef.current = false;
    const id = setInterval(() => {
      setTick((n) => n + 1);

      if (!restTimer.startedAt) return;
      const elapsed   = Math.floor((Date.now() - restTimer.startedAt) / 1000);
      const remaining = restTimer.duration - elapsed;

      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        playBeep();
        navigator.vibrate?.(200);
        setTimeout(() => stopTimer(), 1500);
      }
    }, 500); // 500ms tick for smooth countdown

    return () => clearInterval(id);
  }, [restTimer.isRunning, restTimer.startedAt, restTimer.duration, stopTimer]);

  if (!restTimer.isRunning || !restTimer.startedAt) return null;

  const elapsed   = Math.floor((Date.now() - restTimer.startedAt) / 1000);
  const remaining = Math.max(0, restTimer.duration - elapsed);
  const progress  = restTimer.duration > 0 ? remaining / restTimer.duration : 0;

  const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
  const secs = (remaining % 60).toString().padStart(2, '0');

  const barColor =
    progress > 0.5  ? 'bg-emerald-500' :
    progress > 0.25 ? 'bg-yellow-500'  :
                      'bg-red-500';

  return (
    <div className="fixed bottom-16 left-4 right-4 z-40 md:bottom-6 md:left-auto md:right-6 md:w-72">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        {/* Progress bar */}
        <div className="h-1 w-full bg-muted">
          <div
            className={`h-1 ${barColor}`}
            style={{ width: `${progress * 100}%`, transition: 'width 0.5s linear' }}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 text-2xl font-bold tabular-nums">{mins}:{secs}</span>
          <span className="text-xs text-muted-foreground">Rest</span>
          <button
            onClick={stopTimer}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-muted/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
