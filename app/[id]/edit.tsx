import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RecipeEditScreen } from '../../src/ui/screens/RecipeEditScreen';
import { useDraftRecipe, type DraftIngredientLine } from '../../src/ui/context/DraftRecipeContext';
import { useRecipes } from '../../src/ui/context/RecipeContext';
import { useIngredients } from '../../src/ui/context/IngredientContext';

export default function EditRecipeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recipes } = useRecipes();
  const { resolve } = useIngredients();
  const { startEditing } = useDraftRecipe();
  const [ready, setReady] = useState(false);
  const recipe = recipes.find((r) => r.id === id);

  useEffect(() => {
    if (!recipe) return;
    let cancelled = false;
    (async () => {
      const lines: DraftIngredientLine[] = [];
      for (const item of recipe.ingredients) {
        const resolved = await resolve(item.ingredientId);
        lines.push({ ingredientId: item.ingredientId, ingredientName: resolved?.name ?? item.ingredientId, quantity: item.quantity });
      }
      if (!cancelled) {
        startEditing(recipe, lines);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipe?.id]);

  if (!ready) return null;
  return <RecipeEditScreen />;
}
