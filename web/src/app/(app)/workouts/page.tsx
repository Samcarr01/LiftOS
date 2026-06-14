import { redirect } from 'next/navigation';

/**
 * The nav and all copy say "Workouts", but the route is still /templates.
 * Redirect /workouts → /templates so shared links and bookmarks don't 404.
 */
export default function WorkoutsRedirect() {
  redirect('/templates');
}
