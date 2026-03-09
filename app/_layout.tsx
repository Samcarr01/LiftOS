import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth-store';
import { initLocalDb, startSyncManager } from '@/lib/offline';
import { OfflineIndicator } from '@/components/offline-indicator';
import { initSentry, setSentryUser } from '@/lib/sentry';
import { identifyUser, resetIdentity } from '@/lib/analytics';

// Initialise crash reporting as early as possible
initSentry();

// Keep splash visible until auth state is resolved
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Bootstrap Supabase auth: restores session from SecureStore, subscribes to
  // onAuthStateChange, and keeps the Zustand store in sync.
  useAuth();

  const { isLoading, user } = useAuthStore();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  // Keep Sentry + analytics identity in sync with auth state
  useEffect(() => {
    if (user?.id) {
      setSentryUser(user.id);
      identifyUser(user.id);
    } else {
      setSentryUser(null);
      resetIdentity();
    }
  }, [user?.id]);

  // Initialise offline layer once on mount
  useEffect(() => {
    void initLocalDb().then(() => startSyncManager());
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <OfflineIndicator />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen
          name="workout"
          options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
        />
        <Stack.Screen
          name="workout-complete"
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
