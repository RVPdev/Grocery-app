import { assemblePortions } from './assemblePortions';
import type { FoodPortionRow } from './types';

describe('assemblePortions', () => {
  it('converts a cup portion into grams-per-one-unit', () => {
    // 1 cup weighs 80 g -> gramsPerUnit is 80 / 1
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '1', measure_unit_id: '9999', portion_description: '1 cup', modifier: '', gram_weight: '80' },
    ];
    expect(assemblePortions(rows)).toEqual([
      { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 },
    ]);
  });

  it('divides gram_weight by amount when amount is not 1', () => {
    // 3 tsp weighs 12 g total -> 4 g per tsp
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '3', measure_unit_id: '9999', portion_description: '3 tsp', modifier: '', gram_weight: '12' },
    ];
    expect(assemblePortions(rows)[0].gramsPerUnit).toBeCloseTo(4, 6);
  });

  it('prefers portion_description as the label, falling back to modifier', () => {
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '1', measure_unit_id: '9999', portion_description: '', modifier: '1 medium', gram_weight: '110' },
    ];
    expect(assemblePortions(rows)[0].label).toBe('1 medium');
  });

  it('produces a count unit when the text has no recognisable mass or volume word', () => {
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '1', measure_unit_id: '9999', portion_description: '1 medium', modifier: '', gram_weight: '110' },
    ];
    expect(assemblePortions(rows)[0].unit).toEqual({ kind: 'count', label: '1 medium' });
  });

  it('skips a portion with no descriptive text at all', () => {
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '1', measure_unit_id: '9999', portion_description: '', modifier: '', gram_weight: '50' },
    ];
    expect(assemblePortions(rows)).toEqual([]);
  });

  it('skips a portion with a zero or invalid amount', () => {
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '0', measure_unit_id: '9999', portion_description: '1 cup', modifier: '', gram_weight: '50' },
    ];
    expect(assemblePortions(rows)).toEqual([]);
  });

  it('skips a portion with a zero or invalid gram_weight', () => {
    const rows: FoodPortionRow[] = [
      { fdc_id: '1', amount: '1', measure_unit_id: '9999', portion_description: '1 cup', modifier: '', gram_weight: '0' },
    ];
    expect(assemblePortions(rows)).toEqual([]);
  });
});
