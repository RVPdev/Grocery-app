import { join } from 'node:path';
import { loadSrLegacyFoods } from './loadSrLegacyFoods';

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'mini-dataset');

describe('loadSrLegacyFoods', () => {
  it('loads every base-ingredient food as an Ingredient with usda: id prefix', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients).toHaveLength(3);
    expect(ingredients.map((i) => i.id)).toEqual(['usda:1001', 'usda:1002', 'usda:1004']);
    expect(ingredients.map((i) => i.source)).toEqual(['usda', 'usda', 'usda']);
  });

  it('excludes a food in a non-ingredient category (e.g. Fast Foods)', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients.find((i) => i.id === 'usda:1003')).toBeUndefined();
  });

  it('excludes a cooked-form duplicate when a matching raw entry exists', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients.find((i) => i.id === 'usda:1005')).toBeUndefined();
    expect(ingredients.find((i) => i.id === 'usda:1004')).toBeDefined();
  });

  it('excludes a finished product like a cookie', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients.find((i) => i.id === 'usda:1006')).toBeUndefined();
  });

  it('excludes a manually curated non-ingredient like canned soup', () => {
    const ingredients = loadSrLegacyFoods(FIXTURE_DIR);
    expect(ingredients.find((i) => i.id === 'usda:168027')).toBeUndefined();
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
