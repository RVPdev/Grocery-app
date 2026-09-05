import type { Ingredient } from '../../domain/ingredients/types';
import type { Recipe } from '../../domain/recipes/types';

// Resolves every distinct ingredient referenced across a set of recipes into
// one combined map, keyed by ingredientId. Shared by PlanScreen (per-meal
// macros) and GroceryScreen (buildGroceryList's ingredients argument) so the
// USDA + user + learned-portion resolution loop (IngredientContext's
// `resolve`) isn't duplicated in each screen.
export async function resolveIngredientsForRecipes(
  resolve: (id: string) => Promise<Ingredient | null>,
  recipes: Recipe[],
): Promise<Map<string, Ingredient>> {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    for (const item of recipe.ingredients) {
      ids.add(item.ingredientId);
    }
  }

  const map = new Map<string, Ingredient>();
  for (const id of ids) {
    const resolved = await resolve(id);
    if (resolved) map.set(id, resolved);
  }
  return map;
}
