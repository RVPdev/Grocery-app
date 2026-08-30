import type { Nutrition } from '../../src/domain/ingredients/types';
import type { FoodNutrientRow, NutrientRow } from './types';

const NUTRIENT_NBR: Record<keyof Nutrition, string> = {
  kcal: '208',
  proteinG: '203',
  fatG: '204',
  carbsG: '205',
};

export function buildNutrientIdMap(nutrients: NutrientRow[]): Map<string, keyof Nutrition> {
  const map = new Map<string, keyof Nutrition>();
  for (const nutrient of nutrients) {
    for (const [field, nbr] of Object.entries(NUTRIENT_NBR) as [keyof Nutrition, string][]) {
      if (nutrient.nutrient_nbr === nbr) {
        map.set(nutrient.id, field);
      }
    }
  }
  return map;
}

export function extractNutrition(
  foodNutrientRows: FoodNutrientRow[],
  nutrientIdMap: Map<string, keyof Nutrition>,
): Nutrition {
  const result: Nutrition = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const row of foodNutrientRows) {
    const field = nutrientIdMap.get(row.nutrient_id);
    if (field) {
      result[field] = parseFloat(row.amount) || 0;
    }
  }
  return result;
}
