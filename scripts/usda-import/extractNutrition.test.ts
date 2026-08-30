import { buildNutrientIdMap, extractNutrition } from './extractNutrition';
import type { NutrientRow, FoodNutrientRow } from './types';

const nutrients: NutrientRow[] = [
  { id: '1008', name: 'Energy', unit_name: 'KCAL', nutrient_nbr: '208' },
  { id: '1003', name: 'Protein', unit_name: 'G', nutrient_nbr: '203' },
  { id: '1004', name: 'Total lipid (fat)', unit_name: 'G', nutrient_nbr: '204' },
  { id: '1005', name: 'Carbohydrate, by difference', unit_name: 'G', nutrient_nbr: '205' },
  { id: '1087', name: 'Calcium, Ca', unit_name: 'MG', nutrient_nbr: '301' },
];

describe('buildNutrientIdMap', () => {
  it('maps only the four macro nutrient ids we care about', () => {
    const map = buildNutrientIdMap(nutrients);
    expect(map.get('1008')).toBe('kcal');
    expect(map.get('1003')).toBe('proteinG');
    expect(map.get('1004')).toBe('fatG');
    expect(map.get('1005')).toBe('carbsG');
    expect(map.has('1087')).toBe(false);
  });
});

describe('extractNutrition', () => {
  const nutrientIdMap = buildNutrientIdMap(nutrients);

  it('extracts all four macros for a food', () => {
    const rows: FoodNutrientRow[] = [
      { fdc_id: '1', nutrient_id: '1008', amount: '389' },
      { fdc_id: '1', nutrient_id: '1003', amount: '16.9' },
      { fdc_id: '1', nutrient_id: '1004', amount: '6.9' },
      { fdc_id: '1', nutrient_id: '1005', amount: '66.3' },
      { fdc_id: '1', nutrient_id: '1087', amount: '54' },
    ];
    expect(extractNutrition(rows, nutrientIdMap)).toEqual({
      kcal: 389, proteinG: 16.9, fatG: 6.9, carbsG: 66.3,
    });
  });

  it('defaults missing macros to zero', () => {
    const rows: FoodNutrientRow[] = [{ fdc_id: '1', nutrient_id: '1008', amount: '52' }];
    expect(extractNutrition(rows, nutrientIdMap)).toEqual({
      kcal: 52, proteinG: 0, fatG: 0, carbsG: 0,
    });
  });
});
