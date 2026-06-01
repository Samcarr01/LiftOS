import { redirect } from 'next/navigation';

/**
 * The bottom-nav "Log" tab points at /history, but /log is a natural URL for
 * users to type, share, or bookmark. Redirect it to the real history route
 * instead of 404ing.
 */
export default function LogRedirectPage() {
  redirect('/history');
}
