/** Lightweight date formatters — no date-fns dependency needed. */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** "Mar 16, 2026" */
export function formatLongDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "March 2026" — used for history month group headers */
export function formatMonthGroup(dateStr: string): string {
  const d = new Date(dateStr);
  return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Mar 16" */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "3/16" — compact for chart x-axis labels */
export function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Lightweight relative date formatter — no date-fns dependency needed. */
export function formatDistanceToNow(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}
