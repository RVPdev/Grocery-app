import { Stack } from 'expo-router/stack';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <Stack />
    </ErrorBoundary>
  );
}
