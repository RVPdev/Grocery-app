import type { Ingredient } from '../ingredients/types';
import type { Quantity } from '../units/types';
import type { Recipe } from '../recipes/types';

export const oats: Ingredient = {
  id: 'usda:169705',
  name: 'Oats, rolled',
  nutritionPer100g: { kcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
  portions: [{ label: 'cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 }],
  source: 'usda',
};

export const onion: Ingredient = {
  id: 'usda:170000',
  name: 'Onion, raw',
  nutritionPer100g: { kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1 },
  portions: [{ label: 'medium', unit: { kind: 'count', label: 'medium' }, gramsPerUnit: 110 }],
  source: 'usda',
};

// Deliberately has NO portions — used to test the NO_PORTION_DATA path.
export const water: Ingredient = {
  id: 'usda:174158',
  name: 'Water',
  nutritionPer100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  portions: [],
  source: 'usda',
};

export const grams = (n: number): Quantity => ({
  grams: n,
  input: { amount: n, unit: { kind: 'mass', symbol: 'g' } },
});

export const porridge: Recipe = {
  id: 'recipe-1',
  name: 'Porridge',
  servings: 2,
  ingredients: [{ ingredientId: oats.id, quantity: grams(200) }],
  steps: ['Combine and simmer.'],
};
