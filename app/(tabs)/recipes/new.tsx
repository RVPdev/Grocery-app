import { useEffect } from 'react';
import { RecipeEditScreen } from '../../../src/ui/screens/RecipeEditScreen';
import { useDraftRecipe } from '../../../src/ui/context/DraftRecipeContext';

export default function NewRecipeRoute() {
  const { startNew } = useDraftRecipe();
  useEffect(() => {
    startNew();
  }, []);
  return <RecipeEditScreen />;
}
