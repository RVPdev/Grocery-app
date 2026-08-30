import { analyzeCoverage } from './analyzeCoverage';
import type { Ingredient } from '../../src/domain/ingredients/types';

const withVolume: Ingredient = {
  id: 'usda:1', name: 'Oats', source: 'usda',
  nutritionPer100g: { kcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
  portions: [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 }],
};

const withCountOnly: Ingredient = {
  id: 'usda:2', name: 'Onion', source: 'usda',
  nutritionPer100g: { kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1 },
  portions: [{ label: '1 medium', unit: { kind: 'count', label: '1 medium' }, gramsPerUnit: 110 }],
};

const withNoPortions: Ingredient = {
  id: 'usda:3', name: 'Water', source: 'usda',
  nutritionPer100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  portions: [],
};

describe('analyzeCoverage', () => {
  it('counts totals, any-portion coverage, and volume-portion coverage separately', () => {
    const report = analyzeCoverage([withVolume, withCountOnly, withNoPortions]);
    expect(report).toEqual({ total: 3, withAnyPortion: 2, withVolumePortion: 1 });
  });

  it('returns zeros for an empty ingredient list', () => {
    expect(analyzeCoverage([])).toEqual({ total: 0, withAnyPortion: 0, withVolumePortion: 0 });
  });
});
