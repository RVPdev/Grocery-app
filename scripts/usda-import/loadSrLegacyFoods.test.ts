import { join } from 'node:path';
import { loadSrLegacyFoods } from './loadSrLegacyFoods';

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'mini-dataset');

describe('loadSrLegacyFoods', () => {
  it('loads every food as an Ingredient with usda: id prefix', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients).toHaveLength(2);
    expect(ingredients.map((i) => i.id)).toEqual(['usda:1001', 'usda:1002']);
    expect(ingredients.map((i) => i.source)).toEqual(['usda', 'usda']);
  });

  it('carries the food description as the name', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients[0].name).toBe('Oats, rolled');
  });

  it('extracts nutrition per 100g', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients[0].nutritionPer100g).toEqual({
      kcal: 389, proteinG: 16.9, fatG: 6.9, carbsG: 66.3,
    });
  });

  it('assembles a usable portion from free text', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients[0].portions).toEqual([
      { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 },
    ]);
  });

  it('drops a portion row with no descriptive text', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients[1].portions).toEqual([]);
  });
});
