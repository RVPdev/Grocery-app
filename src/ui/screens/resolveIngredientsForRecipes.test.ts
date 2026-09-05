import { resolveIngredientsForRecipes } from './resolveIngredientsForRecipes';
import { oats, onion, porridge } from '../../domain/testing/fixtures';
import type { Recipe } from '../../domain/recipes/types';
import type { Ingredient } from '../../domain/ingredients/types';

const soup: Recipe = {
  id: 'recipe-2', name: 'Soup', servings: 4,
  ingredients: [
    { ingredientId: oats.id, quantity: { grams: 100, input: { amount: 100, unit: { kind: 'mass', symbol: 'g' } } } },
    { ingredientId: onion.id, quantity: { grams: 220, input: { amount: 220, unit: { kind: 'mass', symbol: 'g' } } } },
  ],
  steps: ['Simmer everything.'],
};

function fakeResolve(available: Ingredient[]): (id: string) => Promise<Ingredient | null> {
  const byId = new Map(available.map((i) => [i.id, i]));
  return async (id) => byId.get(id) ?? null;
}

describe('resolveIngredientsForRecipes', () => {
  it('resolves every distinct ingredient across multiple recipes', async () => {
    const map = await resolveIngredientsForRecipes(fakeResolve([oats, onion]), [porridge, soup]);
    expect(map.get(oats.id)).toEqual(oats);
    expect(map.get(onion.id)).toEqual(onion);
    expect(map.size).toBe(2);
  });

  it('does not call resolve twice for an ingredient shared by two recipes', async () => {
    const calls: string[] = [];
    const resolve = async (id: string) => {
      calls.push(id);
      return id === oats.id ? oats : null;
    };
    await resolveIngredientsForRecipes(resolve, [porridge, { ...porridge, id: 'recipe-3' }]);
    expect(calls).toEqual([oats.id]);
  });

  it('omits an id that fails to resolve, rather than throwing', async () => {
    const map = await resolveIngredientsForRecipes(fakeResolve([]), [porridge]);
    expect(map.size).toBe(0);
  });

  it('returns an empty map for no recipes', async () => {
    const map = await resolveIngredientsForRecipes(fakeResolve([oats]), []);
    expect(map.size).toBe(0);
  });
});
