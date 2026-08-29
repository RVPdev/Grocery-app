import type { Unit } from '../units/types';

export type Nutrition = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type Portion = {
  label: string;
  unit: Unit;
  gramsPerUnit: number;
};

export type Ingredient = {
  id: string;
  name: string;
  nutritionPer100g: Nutrition;
  portions: Portion[];
  source: 'usda' | 'user';
};
