/**
 * Shared utility helpers.
 * All weight is stored in kg (canonical unit); convert here for display.
 */

/** Convert kg to lb */
export function kgToLb(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

/** Convert lb to kg (round to nearest 0.5 kg plate) */
export function lbToKg(lb: number): number {
  return Math.round(lb / 2.20462 * 2) / 2;
}

/** Format weight for display, respecting user's unit preference */
export function formatWeight(kg: number, unit: 'kg' | 'lb'): string {
  if (unit === 'lb') {
    return `${kgToLb(kg)} lb`;
  }
  return `${kg} kg`;
}

/** Format duration in seconds to mm:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** ISO date string → "Mon 3 Mar" */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Estimated 1-rep max (Epley formula) */
export function calcE1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/** Format a long date: "Thursday, 6 March 2026" */
export function formatLongDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Format just the time: "14:35" */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** "March 2026" — for section headers */
export function formatMonthHeader(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** "Today", "Yesterday", weekday within 7 days, then short date */
export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return formatShortDate(iso);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Generate a stable local UUID-like ID for offline records */
export function localId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
