import { Stack } from 'expo-router/stack';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { RecipeProvider } from '../src/ui/context/RecipeContext';
import { IngredientProvider } from '../src/ui/context/IngredientContext';
import { DraftRecipeProvider } from '../src/ui/context/DraftRecipeContext';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <RecipeProvider>
        <IngredientProvider>
          <DraftRecipeProvider>
            <Stack />
          </DraftRecipeProvider>
        </IngredientProvider>
      </RecipeProvider>
    </ErrorBoundary>
  );
}
