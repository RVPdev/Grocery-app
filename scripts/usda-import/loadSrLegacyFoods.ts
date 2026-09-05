import { join } from 'node:path';
import type { Ingredient } from '../../src/domain/ingredients/types';
import { parseCsvFile } from './parseCsv.ts';
import { buildNutrientIdMap, extractNutrition } from './extractNutrition.ts';
import { assemblePortions } from './assemblePortions.ts';
import { excludeNonIngredientCategories } from './excludeNonIngredientCategories.ts';
import { excludeCookedDuplicates } from './excludeCookedDuplicates.ts';
import { excludeFinishedProducts } from './excludeFinishedProducts.ts';
import { excludeManuallyCuratedNonIngredients } from './excludeManuallyCuratedNonIngredients.ts';
import type { FoodCategoryRow, FoodNutrientRow, FoodPortionRow, FoodRow, NutrientRow } from './types';

export function loadSrLegacyFoods(dataDir: string): Ingredient[] {
  const allFoods = parseCsvFile<FoodRow>(join(dataDir, 'food.csv'));
  const categories = parseCsvFile<FoodCategoryRow>(join(dataDir, 'food_category.csv'));
  const nutrients = parseCsvFile<NutrientRow>(join(dataDir, 'nutrient.csv'));
  const foodNutrients = parseCsvFile<FoodNutrientRow>(join(dataDir, 'food_nutrient.csv'));
  const foodPortions = parseCsvFile<FoodPortionRow>(join(dataDir, 'food_portion.csv'));

  const foods = excludeManuallyCuratedNonIngredients(
    excludeFinishedProducts(
      excludeCookedDuplicates(excludeNonIngredientCategories(allFoods, categories)),
    ),
  );

  const nutrientIdMap = buildNutrientIdMap(nutrients);
  const foodNutrientsByFood = groupBy(foodNutrients, (row) => row.fdc_id);
  const foodPortionsByFood = groupBy(foodPortions, (row) => row.fdc_id);

  return foods.map((food) => ({
    id: `usda:${food.fdc_id}`,
    name: food.description,
    nutritionPer100g: extractNutrition(foodNutrientsByFood.get(food.fdc_id) ?? [], nutrientIdMap),
    portions: assemblePortions(foodPortionsByFood.get(food.fdc_id) ?? []),
    source: 'usda' as const,
  }));
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}
