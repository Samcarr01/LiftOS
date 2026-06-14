import { redirect } from 'next/navigation';

/**
 * The coaching report now lives in the Progress hub's "Overview" tab.
 * Redirect the old /progress/weekly URL so existing links/bookmarks survive.
 */
export default function WeeklyRedirect() {
  redirect('/progress');
}
