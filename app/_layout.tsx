import { Stack } from 'expo-router/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { RecipeProvider } from '../src/ui/context/RecipeContext';
import { IngredientProvider } from '../src/ui/context/IngredientContext';
import { DraftRecipeProvider } from '../src/ui/context/DraftRecipeContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <RecipeProvider>
          <IngredientProvider>
            <DraftRecipeProvider>
              <Stack />
            </DraftRecipeProvider>
          </IngredientProvider>
        </RecipeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
