import type { Ingredient } from '../ingredients/types';
import type { MealPlan } from '../plan/types';
import type { Recipe } from '../recipes/types';
import { scaleRecipe } from '../recipes/scale';
import { ok, err, type Result } from '../result';
import { formatGrams } from '../units/format';
import type { GroceryLine, GroceryList } from './types';

export function buildGroceryList(
  plan: MealPlan,
  recipes: ReadonlyMap<string, Recipe>,
  ingredients: ReadonlyMap<string, Ingredient>,
): Result<GroceryList> {
  const totals = new Map<string, number>();

  for (const meal of plan.meals) {
    const recipe = recipes.get(meal.recipeId);
    if (!recipe) {
      return err({ code: 'RECIPE_NOT_FOUND', recipeId: meal.recipeId });
    }

    const scaled = scaleRecipe(recipe, meal.servings);
    if (!scaled.ok) {
      return scaled;
    }

    for (const item of scaled.value.ingredients) {
      const running = totals.get(item.ingredientId) ?? 0;
      totals.set(item.ingredientId, running + item.quantity.grams);
    }
  }

  const lines: GroceryLine[] = [];
  for (const [ingredientId, totalGrams] of totals) {
    const ingredient = ingredients.get(ingredientId);
    if (!ingredient) {
      return err({ code: 'INGREDIENT_NOT_FOUND', ingredientId });
    }
    lines.push({
      ingredientId,
      name: ingredient.name,
      totalGrams,
      display: formatGrams(totalGrams),
    });
  }

  lines.sort((a, b) => a.name.localeCompare(b.name));
  return ok({ lines });
}
