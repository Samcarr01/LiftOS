import { redirect } from 'next/navigation';

/**
 * The change-password screen lives at /profile/password. Redirect the
 * commonly-typed /profile/change-password URL there so it never 404s.
 */
export default function ChangePasswordRedirect() {
  redirect('/profile/password');
}
