import { calculateMacros } from './macros';
import { oats, onion, porridge, grams } from '../testing/fixtures';
import type { Ingredient } from '../ingredients/types';

const lookup = new Map<string, Ingredient>([[oats.id, oats]]);

describe('calculateMacros', () => {
  it('sums macros across ingredients', () => {
    // 200 g of oats = 2 x the per-100g values
    const r = calculateMacros(porridge, lookup);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total.kcal).toBeCloseTo(778, 6);
      expect(r.value.total.proteinG).toBeCloseTo(33.8, 6);
    }
  });

  it('divides by servings for the per-serving figure', () => {
    const r = calculateMacros(porridge, lookup);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.perServing.kcal).toBeCloseTo(389, 6);
  });

  it('reports INGREDIENT_NOT_FOUND when a referenced ingredient is missing', () => {
    const broken = {
      ...porridge,
      ingredients: [{ ingredientId: onion.id, quantity: grams(50) }],
    };
    const r = calculateMacros(broken, lookup);
    expect(r).toEqual({
      ok: false,
      error: { code: 'INGREDIENT_NOT_FOUND', ingredientId: onion.id },
    });
  });

  it('rejects a recipe with zero servings', () => {
    const r = calculateMacros({ ...porridge, servings: 0 }, lookup);
    expect(r).toEqual({ ok: false, error: { code: 'INVALID_AMOUNT', amount: 0 } });
  });
});
