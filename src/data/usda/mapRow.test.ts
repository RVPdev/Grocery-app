import { assembleIngredient, buildSearchQuery, mapPortionRow } from './mapRow';
import type { IngredientRow, PortionRow } from './mapRow';

describe('mapPortionRow', () => {
  it('reconstructs a mass unit', () => {
    const row: PortionRow = {
      ingredient_id: 'usda:1', label: '1 oz', unit_kind: 'mass', unit_symbol: 'oz', unit_label: null, grams_per_unit: 28.35,
    };
    expect(mapPortionRow(row)).toEqual({
      label: '1 oz', unit: { kind: 'mass', symbol: 'oz' }, gramsPerUnit: 28.35,
    });
  });

  it('reconstructs a volume unit', () => {
    const row: PortionRow = {
      ingredient_id: 'usda:1', label: '1 cup', unit_kind: 'volume', unit_symbol: 'cup', unit_label: null, grams_per_unit: 80,
    };
    expect(mapPortionRow(row)).toEqual({
      label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80,
    });
  });

  it('reconstructs a count unit', () => {
    const row: PortionRow = {
      ingredient_id: 'usda:2', label: '1 medium', unit_kind: 'count', unit_symbol: null, unit_label: '1 medium', grams_per_unit: 110,
    };
    expect(mapPortionRow(row)).toEqual({
      label: '1 medium', unit: { kind: 'count', label: '1 medium' }, gramsPerUnit: 110,
    });
  });
});

describe('assembleIngredient', () => {
  it('combines an ingredient row with its portion rows', () => {
    const ingredientRow: IngredientRow = {
      id: 'usda:1', name: 'Oats, rolled', kcal: 389, protein_g: 16.9, carbs_g: 66.3, fat_g: 6.9,
    };
    const portionRows: PortionRow[] = [
      { ingredient_id: 'usda:1', label: '1 cup', unit_kind: 'volume', unit_symbol: 'cup', unit_label: null, grams_per_unit: 80 },
    ];
    expect(assembleIngredient(ingredientRow, portionRows)).toEqual({
      id: 'usda:1',
      name: 'Oats, rolled',
      nutritionPer100g: { kcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
      portions: [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 }],
      source: 'usda',
    });
  });

  it('returns an empty portions array when there are none', () => {
    const ingredientRow: IngredientRow = {
      id: 'usda:3', name: 'Water', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    };
    expect(assembleIngredient(ingredientRow, []).portions).toEqual([]);
  });
});

describe('buildSearchQuery', () => {
  it('wraps the search term in wildcards and matches case-insensitively', () => {
    expect(buildSearchQuery('oat')).toEqual({
      sql: 'SELECT * FROM ingredients WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 25',
      params: ['%oat%'],
    });
  });
});
