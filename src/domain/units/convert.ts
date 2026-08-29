import type { Ingredient } from '../ingredients/types';
import { ok, err, type Result } from '../result';
import type { MassSymbol, Unit, VolumeSymbol } from './types';

const MASS_TO_GRAMS: Record<MassSymbol, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

const VOLUME_TO_ML: Record<VolumeSymbol, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892159375,
  tbsp: 14.78676478125,
  floz: 29.5735295625,
  cup: 236.5882365,
};

export function toGrams(
  amount: number,
  unit: Unit,
  ingredient: Ingredient,
): Result<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return err({ code: 'INVALID_AMOUNT', amount });
  }

  if (unit.kind === 'mass') {
    return ok(amount * MASS_TO_GRAMS[unit.symbol]);
  }

  if (unit.kind === 'volume') {
    const portion = ingredient.portions.find((p) => p.unit.kind === 'volume');
    if (!portion || portion.unit.kind !== 'volume') {
      return err({ code: 'NO_PORTION_DATA', ingredientId: ingredient.id, unit });
    }
    const requestedMl = amount * VOLUME_TO_ML[unit.symbol];
    const portionMl = VOLUME_TO_ML[portion.unit.symbol];
    return ok((requestedMl / portionMl) * portion.gramsPerUnit);
  }

  return err({ code: 'NO_PORTION_DATA', ingredientId: ingredient.id, unit });
}
