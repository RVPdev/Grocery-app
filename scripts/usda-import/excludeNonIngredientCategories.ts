import type { FoodCategoryRow, FoodRow } from './types';

// Verified 2026-09-04 against the real SR Legacy food_category.csv (28
// categories, 2018-04 download): these 4 are the only categories whose
// foods are prepared dishes/products rather than base recipe ingredients
// (e.g. "Fast foods, cheeseburger", "Babyfood, apple yogurt dessert,
// strained"). Every other category — including mixed ones like "Soups,
// Sauces, and Gravies" — is left alone; splitting those further needs
// finer-grained rules than a category filter can give.
const EXCLUDED_CATEGORY_CODES = new Set([
  '0300', // Baby Foods
  '2100', // Fast Foods
  '2200', // Meals, Entrees, and Side Dishes
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
