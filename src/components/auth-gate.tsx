/**
 * AuthGate — redirect wrapper for authenticated routes.
 *
 * Usage: wrap the (tabs) layout with this component.
 * Redirects to /(auth)/login when session is absent.
 * Shows a loading screen while the session is being restored.
 */

import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '@/store/auth-store';

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#a3e635" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#09090b',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
