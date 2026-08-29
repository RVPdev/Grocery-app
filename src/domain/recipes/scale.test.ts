import { scaleRecipe } from './scale';
import { porridge } from '../testing/fixtures';

describe('scaleRecipe', () => {
  it('multiplies ingredient grams by the serving ratio', () => {
    // porridge serves 2 with 200 g oats; scaled to 3 servings -> 300 g
    const r = scaleRecipe(porridge, 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.ingredients[0].quantity.grams).toBeCloseTo(300, 6);
  });

  it('records the new serving count', () => {
    const r = scaleRecipe(porridge, 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.servings).toBe(3);
  });

  it('does not mutate the original recipe', () => {
    scaleRecipe(porridge, 3);
    expect(porridge.ingredients[0].quantity.grams).toBe(200);
    expect(porridge.servings).toBe(2);
  });

  it('rejects zero or negative servings', () => {
    expect(scaleRecipe(porridge, 0)).toEqual({
      ok: false,
      error: { code: 'INVALID_AMOUNT', amount: 0 },
    });
  });
});
