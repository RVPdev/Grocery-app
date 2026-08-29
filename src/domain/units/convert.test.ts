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
