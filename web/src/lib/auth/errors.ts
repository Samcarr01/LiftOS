import type { AuthError } from '@supabase/supabase-js';

/**
 * Maps Supabase auth errors to friendly, user-facing messages.
 *
 * Raw auth/DB errors must never reach the UI (e.g. "Database error querying
 * schema"). Known cases get a specific message; everything else — especially
 * 5xx / unexpected failures — collapses to a generic line, with the raw error
 * logged to the console for debugging.
 */

const GENERIC_MESSAGE = 'Something went wrong — please try again.';

/** Known auth error codes/messages → friendly copy. */
function friendlyFor(error: AuthError): string | null {
  const code = error.code ?? '';
  const message = error.message?.toLowerCase() ?? '';
  const status = error.status ?? 0;

  // Server / database failures — never expose these.
  if (
    status >= 500 ||
    code === 'unexpected_failure' ||
    message.includes('database error') ||
    message.includes('querying schema')
  ) {
    return GENERIC_MESSAGE;
  }

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Please confirm your email before signing in. Check your inbox.';
  }
  if (code === 'user_already_exists' || message.includes('already registered')) {
    return 'An account with this email already exists. Try signing in.';
  }
  if (code === 'weak_password' || message.includes('password should be')) {
    return 'Password is too weak — use at least 6 characters.';
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (code === 'validation_failed' || message.includes('invalid email') || message.includes('unable to validate email')) {
    return 'Please enter a valid email address.';
  }

  return null;
}

/**
 * Converts a Supabase `AuthError | null` into a friendly message string, or
 * `null` when there was no error. Unrecognised errors are logged and reduced
 * to a generic message.
 */
export function mapAuthError(error: AuthError | null): string | null {
  if (!error) return null;

  const friendly = friendlyFor(error);
  if (friendly) return friendly;

  // Unknown error — log the raw detail for debugging, show generic to user.
  console.error('[auth] unmapped error:', error);
  return GENERIC_MESSAGE;
}
