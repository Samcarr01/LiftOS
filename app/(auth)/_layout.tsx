import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/store/auth-store';

/**
 * Auth group layout.
 * - While session is being restored: render nothing (splash is still showing).
 * - Already authenticated: redirect straight to the main app.
 * - Not authenticated: show the auth Stack (login, reset).
 */
export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return null;

  if (isAuthenticated) return <Redirect href="/(tabs)" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="reset" />
    </Stack>
  );
}
