import type { Ingredient } from '../../src/domain/ingredients/types';

export type CoverageReport = {
  total: number;
  withAnyPortion: number;
  // Ingredients with a portion the app can actually use as input: `toGrams`'s
  // mass branch never reads a portion (it uses a fixed conversion table), so
  // a mass-only portion is functionally identical to having none. Only
  // volume and count portions help a caller avoid NO_PORTION_DATA.
  withUsablePortion: number;
  withVolumePortion: number;
};

export function analyzeCoverage(ingredients: Ingredient[]): CoverageReport {
  let withAnyPortion = 0;
  let withUsablePortion = 0;
  let withVolumePortion = 0;

  for (const ingredient of ingredients) {
    if (ingredient.portions.length > 0) withAnyPortion += 1;
    if (ingredient.portions.some((p) => p.unit.kind === 'volume' || p.unit.kind === 'count')) {
      withUsablePortion += 1;
    }
    if (ingredient.portions.some((p) => p.unit.kind === 'volume')) withVolumePortion += 1;
  }

  return { total: ingredients.length, withAnyPortion, withUsablePortion, withVolumePortion };
}
