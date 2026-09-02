import { Stack } from 'expo-router/stack';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { RecipeProvider } from '../src/ui/context/RecipeContext';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <RecipeProvider>
        <Stack />
      </RecipeProvider>
    </ErrorBoundary>
  );
}
