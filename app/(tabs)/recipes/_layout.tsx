import { Stack } from 'expo-router/stack';

export default function RecipesStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Recipes' }} />
      <Stack.Screen name="new" options={{ title: 'New Recipe' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Recipe' }} />
    </Stack>
  );
}
