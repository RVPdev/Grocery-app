import type { FoodCategoryRow, FoodRow } from './types';

// Verified 2026-09-04 against the real SR Legacy food_category.csv (28
// categories, 2018-04 download): these are the categories that are
// overwhelmingly prepared dishes/products rather than base recipe
// ingredients (e.g. "Fast foods, cheeseburger", "Snacks, potato chips,
// plain", "Cereals ready-to-eat, ..."). Categories that genuinely mix
// ingredients and finished products — Sweets, Baked Products, Dairy and Egg
// Products, Sausages and Luncheon Meats — can't be excluded wholesale; see
// excludeFinishedProducts.ts for the item-level filter that handles those.
const EXCLUDED_CATEGORY_CODES = new Set([
  '0300', // Baby Foods
  '0800', // Breakfast Cereals
  '2100', // Fast Foods
  '2200', // Meals, Entrees, and Side Dishes
  '2500', // Snacks
  '3600', // Restaurant Foods
]);

export function excludeNonIngredientCategories(
  foods: FoodRow[],
  categories: FoodCategoryRow[],
): FoodRow[] {
  const codeById = new Map(categories.map((category) => [category.id, category.code]));
  return foods.filter((food) => {
    const code = codeById.get(food.food_category_id);
    return code === undefined || !EXCLUDED_CATEGORY_CODES.has(code);
  });
}
