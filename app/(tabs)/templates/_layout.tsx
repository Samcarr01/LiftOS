import { Stack } from 'expo-router';

export default function TemplatesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen
        name="exercise-selector"
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="exercise-creator"
        options={{ presentation: 'modal' }}
      />
    </Stack>
  );
}
