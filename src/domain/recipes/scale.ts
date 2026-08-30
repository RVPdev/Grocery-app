import { ok, err, type Result } from '../result';
import type { Recipe } from './types';

export function scaleRecipe(recipe: Recipe, desiredServings: number): Result<Recipe> {
  if (!Number.isFinite(desiredServings) || desiredServings <= 0) {
    return err({ code: 'INVALID_AMOUNT', amount: desiredServings });
  }
  if (!Number.isFinite(recipe.servings) || recipe.servings <= 0) {
    return err({ code: 'INVALID_AMOUNT', amount: recipe.servings });
  }

  const factor = desiredServings / recipe.servings;

  return ok({
    ...recipe,
    servings: desiredServings,
    ingredients: recipe.ingredients.map((item) => ({
      ...item,
      quantity: {
        grams: item.quantity.grams * factor,
        input: {
          ...item.quantity.input,
          amount: item.quantity.input.amount * factor,
        },
      },
    })),
  });
}
