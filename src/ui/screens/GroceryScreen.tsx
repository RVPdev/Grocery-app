import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePlan } from '../context/PlanContext';
import { useRecipes } from '../context/RecipeContext';
import { useIngredients } from '../context/IngredientContext';
import { resolveIngredientsForRecipes } from './resolveIngredientsForRecipes';
import { buildGroceryList } from '../../domain/grocery/aggregate';
import type { GroceryList } from '../../domain/grocery/types';
import type { AppError } from '../../domain/result';
import type { Recipe } from '../../domain/recipes/types';

function errorMessage(error: AppError): string {
  switch (error.code) {
    case 'RECIPE_NOT_FOUND':
      return 'A planned recipe was deleted. Remove it from your plan to see the grocery list.';
    case 'INGREDIENT_NOT_FOUND':
      return 'An ingredient was removed from a planned recipe. Fix that recipe to see the grocery list.';
    default:
      return 'Unable to build the grocery list.';
  }
}

export function GroceryScreen() {
  const { plan, loading: planLoading } = usePlan();
  const { recipes, loading: recipesLoading } = useRecipes();
  const { resolve } = useIngredients();
  const [list, setList] = useState<GroceryList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (planLoading || recipesLoading) return;
    let cancelled = false;
    (async () => {
      const recipesById = new Map(recipes.map((r) => [r.id, r]));
      const plannedRecipes = plan.meals
        .map((meal) => recipesById.get(meal.recipeId))
        .filter((r): r is Recipe => r !== undefined);
      const ingredientMap = await resolveIngredientsForRecipes(resolve, plannedRecipes);
      const result = buildGroceryList(plan, recipesById, ingredientMap);
      if (cancelled) return;
      if (result.ok) {
        setList(result.value);
        setError(null);
      } else {
        setList(null);
        setError(errorMessage(result.error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, recipes, planLoading, recipesLoading]);

  if (planLoading || recipesLoading || (!list && !error)) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text>{error}</Text>
      </View>
    );
  }

  if (list!.lines.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No meals planned yet — add some on the Plan tab.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {list!.lines.map((line) => (
        <View key={line.ingredientId} style={styles.row}>
          <Text style={styles.rowTitle}>{line.name}</Text>
          <Text style={styles.rowSubtitle}>{line.display}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc',
  },
  rowTitle: { fontSize: 16 },
  rowSubtitle: { fontSize: 14, color: '#666' },
});
