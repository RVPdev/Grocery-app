import type { Quantity } from '../units/types';

export type RecipeIngredient = {
  ingredientId: string;
  quantity: Quantity;
};

export type Recipe = {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
};
