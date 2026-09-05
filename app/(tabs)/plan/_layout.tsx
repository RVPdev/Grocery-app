import { Stack } from 'expo-router/stack';

export default function PlanStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Plan' }} />
    </Stack>
  );
}
