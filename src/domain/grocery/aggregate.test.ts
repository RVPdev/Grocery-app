import { buildGroceryList } from './aggregate';
import { oats, onion, porridge, grams } from '../testing/fixtures';
import type { Ingredient } from '../ingredients/types';
import type { Recipe } from '../recipes/types';

const soup: Recipe = {
  id: 'recipe-2',
  name: 'Soup',
  servings: 4,
  ingredients: [
    { ingredientId: oats.id, quantity: grams(100) },
    { ingredientId: onion.id, quantity: grams(220) },
  ],
  steps: ['Simmer everything.'],
};

const recipes = new Map<string, Recipe>([
  [porridge.id, porridge],
  [soup.id, soup],
]);
const ingredients = new Map<string, Ingredient>([
  [oats.id, oats],
  [onion.id, onion],
]);

const plan = {
  id: 'plan-1',
  name: 'Week 1',
  meals: [
    { recipeId: porridge.id, servings: 2 }, // factor 1   -> 200 g oats
    { recipeId: soup.id, servings: 2 },     // factor 0.5 -> 50 g oats, 110 g onion
  ],
};

describe('buildGroceryList', () => {
  it('merges the same ingredient across different recipes', () => {
    const r = buildGroceryList(plan, recipes, ingredients);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const oatLine = r.value.lines.find((l) => l.ingredientId === oats.id);
    expect(oatLine!.totalGrams).toBeCloseTo(250, 6);
  });

  it('scales each recipe to its planned servings', () => {
    const r = buildGroceryList(plan, recipes, ingredients);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const onionLine = r.value.lines.find((l) => l.ingredientId === onion.id);
    expect(onionLine!.totalGrams).toBeCloseTo(110, 6);
  });

  it('formats each line for display', () => {
    const r = buildGroceryList(plan, recipes, ingredients);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const oatLine = r.value.lines.find((l) => l.ingredientId === oats.id);
    expect(oatLine!.display).toBe('250 g');
  });

  it('sorts lines by ingredient name for a stable shopping order', () => {
    const r = buildGroceryList(plan, recipes, ingredients);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lines.map((l) => l.name)).toEqual(['Oats, rolled', 'Onion, raw']);
  });

  it('reports RECIPE_NOT_FOUND when a planned recipe was deleted', () => {
    const brokenPlan = { ...plan, meals: [{ recipeId: 'ghost', servings: 1 }] };
    const r = buildGroceryList(brokenPlan, recipes, ingredients);
    expect(r).toEqual({
      ok: false,
      error: { code: 'RECIPE_NOT_FOUND', recipeId: 'ghost' },
    });
  });

  it('reports INGREDIENT_NOT_FOUND when an ingredient is missing', () => {
    const partial = new Map<string, Ingredient>([[oats.id, oats]]);
    const r = buildGroceryList(plan, recipes, partial);
    expect(r).toEqual({
      ok: false,
      error: { code: 'INGREDIENT_NOT_FOUND', ingredientId: onion.id },
    });
  });

  it('returns an empty list for an empty plan', () => {
    const r = buildGroceryList({ ...plan, meals: [] }, recipes, ingredients);
    expect(r).toEqual({ ok: true, value: { lines: [] } });
  });
});
