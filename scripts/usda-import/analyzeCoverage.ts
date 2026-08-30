import type { Ingredient } from '../../src/domain/ingredients/types';

export type CoverageReport = {
  total: number;
  withAnyPortion: number;
  withVolumePortion: number;
};

export function analyzeCoverage(ingredients: Ingredient[]): CoverageReport {
  let withAnyPortion = 0;
  let withVolumePortion = 0;

  for (const ingredient of ingredients) {
    if (ingredient.portions.length > 0) withAnyPortion += 1;
    if (ingredient.portions.some((p) => p.unit.kind === 'volume')) withVolumePortion += 1;
  }

  return { total: ingredients.length, withAnyPortion, withVolumePortion };
}
