import type { Ingredient, Nutrition } from '../ingredients/types';
import { ok, err, type Result } from '../result';
import type { Recipe } from './types';

const EMPTY: Nutrition = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export function calculateMacros(
  recipe: Recipe,
  ingredients: ReadonlyMap<string, Ingredient>,
): Result<{ total: Nutrition; perServing: Nutrition }> {
  if (!Number.isFinite(recipe.servings) || recipe.servings <= 0) {
    return err({ code: 'INVALID_AMOUNT', amount: recipe.servings });
  }

  const total: Nutrition = { ...EMPTY };

  for (const item of recipe.ingredients) {
    const ingredient = ingredients.get(item.ingredientId);
    if (!ingredient) {
      return err({ code: 'INGREDIENT_NOT_FOUND', ingredientId: item.ingredientId });
    }
    const factor = item.quantity.grams / 100;
    const n = ingredient.nutritionPer100g;
    total.kcal += n.kcal * factor;
    total.proteinG += n.proteinG * factor;
    total.carbsG += n.carbsG * factor;
    total.fatG += n.fatG * factor;
  }

  const perServing: Nutrition = {
    kcal: total.kcal / recipe.servings,
    proteinG: total.proteinG / recipe.servings,
    carbsG: total.carbsG / recipe.servings,
    fatG: total.fatG / recipe.servings,
  };

  return ok({ total, perServing });
}
