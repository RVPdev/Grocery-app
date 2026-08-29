import { toGrams } from './convert';
import { oats } from '../testing/fixtures';

describe('toGrams — mass', () => {
  it('converts kilograms to grams', () => {
    const r = toGrams(2, { kind: 'mass', symbol: 'kg' }, oats);
    expect(r).toEqual({ ok: true, value: 2000 });
  });

  it('passes grams through unchanged', () => {
    const r = toGrams(150, { kind: 'mass', symbol: 'g' }, oats);
    expect(r).toEqual({ ok: true, value: 150 });
  });

  it('converts pounds using the exact definition', () => {
    const r = toGrams(1, { kind: 'mass', symbol: 'lb' }, oats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(453.59237, 5);
  });

  it('rejects a negative amount', () => {
    const r = toGrams(-5, { kind: 'mass', symbol: 'g' }, oats);
    expect(r).toEqual({ ok: false, error: { code: 'INVALID_AMOUNT', amount: -5 } });
  });
});

describe('toGrams — volume', () => {
  it('uses the ingredient\'s own cup weight', () => {
    // oats: 1 cup = 80 g
    const r = toGrams(2, { kind: 'volume', symbol: 'cup' }, oats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(160, 6);
  });

  it('converts a volume unit the ingredient has no portion for', () => {
    // 4 tbsp = 0.25 cup; 0.25 x 80 g = 20 g
    const r = toGrams(4, { kind: 'volume', symbol: 'tbsp' }, oats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(20, 6);
  });

  it('reports NO_PORTION_DATA when the ingredient has no volume portion', () => {
    const { water } = require('../testing/fixtures');
    const unit = { kind: 'volume', symbol: 'cup' } as const;
    const r = toGrams(1, unit, water);
    expect(r).toEqual({
      ok: false,
      error: { code: 'NO_PORTION_DATA', ingredientId: water.id, unit },
    });
  });
});
