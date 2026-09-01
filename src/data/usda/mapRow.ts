import type { Ingredient, Portion } from '../../domain/ingredients/types';
import type { MassSymbol, Unit, VolumeSymbol } from '../../domain/units/types';

export type IngredientRow = {
  id: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type PortionRow = {
  ingredient_id: string;
  label: string;
  unit_kind: string;
  unit_symbol: string | null;
  unit_label: string | null;
  grams_per_unit: number;
};

function mapUnit(row: PortionRow): Unit {
  switch (row.unit_kind) {
    case 'mass':
      return { kind: 'mass', symbol: row.unit_symbol as MassSymbol };
    case 'volume':
      return { kind: 'volume', symbol: row.unit_symbol as VolumeSymbol };
    case 'count':
      return { kind: 'count', label: row.unit_label as string };
    default:
      // Our own import script (Task 7) is the only writer of this database.
      // Reaching this means the bundled asset is corrupted — a genuine
      // emergency, not an expected failure, so it throws rather than
      // returning a Result.
      throw new Error(`Corrupted USDA database: unknown unit_kind "${row.unit_kind}"`);
  }
}

export function mapPortionRow(row: PortionRow): Portion {
  return { label: row.label, unit: mapUnit(row), gramsPerUnit: row.grams_per_unit };
}

export function assembleIngredient(ingredientRow: IngredientRow, portionRows: PortionRow[]): Ingredient {
  return {
    id: ingredientRow.id,
    name: ingredientRow.name,
    nutritionPer100g: {
      kcal: ingredientRow.kcal,
      proteinG: ingredientRow.protein_g,
      carbsG: ingredientRow.carbs_g,
      fatG: ingredientRow.fat_g,
    },
    portions: portionRows.map(mapPortionRow),
    source: 'usda',
  };
}

export function buildSearchQuery(term: string): { sql: string; params: unknown[] } {
  return {
    sql: 'SELECT * FROM ingredients WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 25',
    params: [`%${term}%`],
  };
}
