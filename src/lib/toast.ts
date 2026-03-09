/**
 * Minimal toast/alert utility.
 * Shows native Alert for now; swap for a proper toast library (e.g. burnt)
 * during the polish prompt without changing call sites.
 */

import { Alert } from 'react-native';

export function showError(message: string, title = 'Error'): void {
  Alert.alert(title, message, [{ text: 'OK' }]);
}

export function showInfo(message: string, title = 'Info'): void {
  Alert.alert(title, message, [{ text: 'OK' }]);
}

/** Map Supabase auth error codes to friendly messages */
export function authErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Something went wrong. Please try again.';

  const msg = (error as { message?: string }).message ?? '';

  if (msg.includes('Invalid login credentials')) return 'Incorrect email or password.';
  if (msg.includes('Email not confirmed'))
    return 'Please verify your email before signing in.';
  if (msg.includes('User already registered'))
    return 'An account with this email already exists. Try signing in.';
  if (msg.includes('Password should be at least'))
    return 'Password must be at least 6 characters.';
  if (msg.includes('rate limit') || msg.includes('too many'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Network error. Check your connection and try again.';

  return msg || 'Something went wrong. Please try again.';
}
