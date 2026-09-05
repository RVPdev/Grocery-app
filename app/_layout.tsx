import { Stack } from 'expo-router/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { RecipeProvider } from '../src/ui/context/RecipeContext';
import { IngredientProvider } from '../src/ui/context/IngredientContext';
import { DraftRecipeProvider } from '../src/ui/context/DraftRecipeContext';
import { PlanProvider } from '../src/ui/context/PlanContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <RecipeProvider>
          <IngredientProvider>
            <PlanProvider>
              <DraftRecipeProvider>
                <Stack>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="add-ingredient" options={{ title: 'Add Ingredient' }} />
                </Stack>
              </DraftRecipeProvider>
            </PlanProvider>
          </IngredientProvider>
        </RecipeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
