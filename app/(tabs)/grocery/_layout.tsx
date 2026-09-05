import { Stack } from 'expo-router/stack';

export default function GroceryStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Grocery List' }} />
    </Stack>
  );
}
