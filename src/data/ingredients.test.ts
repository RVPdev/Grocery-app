import { resolveIngredient, searchAllIngredients, type IngredientSources } from './ingredients';
import type { Ingredient, Portion } from '../domain/ingredients/types';

const oats: Ingredient = {
  id: 'usda:1001', name: 'Oats, raw',
  nutritionPer100g: { kcal: 389, proteinG: 17, carbsG: 66, fatG: 7 },
  portions: [{ label: '1 medium', unit: { kind: 'count', label: 'medium' }, gramsPerUnit: 40 }],
  source: 'usda',
};

const granola: Ingredient = {
  id: 'user:1', name: 'Oat granola',
  nutritionPer100g: { kcal: 450, proteinG: 10, carbsG: 60, fatG: 18 },
  portions: [], source: 'user',
};

const learnedCup: Portion = { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 90 };

function fakeSources(overrides: Partial<IngredientSources> = {}): IngredientSources {
  return {
    getUsdaIngredient: async (id) => (id === oats.id ? oats : null),
    searchUsdaIngredients: async () => [oats],
    getUserIngredients: async () => [granola],
    getLearnedPortionsFor: async () => [],
    ...overrides,
  };
}

describe('resolveIngredient', () => {
  it('resolves a usda: id from the USDA source', async () => {
    const result = await resolveIngredient(fakeSources(), 'usda:1001');
    expect(result).toEqual(oats);
  });

  it('resolves a user id from the user-ingredients source', async () => {
    const result = await resolveIngredient(fakeSources(), 'user:1');
    expect(result).toEqual(granola);
  });

  it('returns null for a usda: id the USDA source does not know', async () => {
    const result = await resolveIngredient(fakeSources({ getUsdaIngredient: async () => null }), 'usda:9999');
    expect(result).toBeNull();
  });

  it('returns null for a user id not present in user ingredients', async () => {
    const result = await resolveIngredient(fakeSources(), 'user:missing');
    expect(result).toBeNull();
  });

  it('merges learned portions onto a usda: ingredient without mutating the base', async () => {
    const sources = fakeSources({ getLearnedPortionsFor: async (id) => (id === 'usda:1001' ? [learnedCup] : []) });
    const result = await resolveIngredient(sources, 'usda:1001');
    expect(result?.portions).toEqual([oats.portions[0], learnedCup]);
    expect(oats.portions).toHaveLength(1); // base object untouched
  });

  it('merges learned portions onto a user ingredient', async () => {
    const sources = fakeSources({ getLearnedPortionsFor: async (id) => (id === 'user:1' ? [learnedCup] : []) });
    const result = await resolveIngredient(sources, 'user:1');
    expect(result?.portions).toEqual([learnedCup]);
  });
});

describe('searchAllIngredients', () => {
  it('combines USDA results with matching user ingredients', async () => {
    const results = await searchAllIngredients(fakeSources(), 'oat');
    expect(results).toEqual([oats, granola]);
  });

  it('filters user ingredients by a case-insensitive name match', async () => {
    const results = await searchAllIngredients(fakeSources(), 'GRANOLA');
    expect(results.map((i) => i.id)).toEqual(['usda:1001', 'user:1']);
  });

  it('excludes a user ingredient that does not match the query', async () => {
    const sources = fakeSources({ getUserIngredients: async () => [{ ...granola, name: 'Pickled onions' }] });
    const results = await searchAllIngredients(sources, 'granola');
    expect(results).toEqual([oats]);
  });
});
