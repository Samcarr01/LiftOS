import { Stack } from 'expo-router';

export default function ProgressLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="weekly" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
