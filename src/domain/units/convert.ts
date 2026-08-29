import type { Ingredient } from '../ingredients/types';
import { ok, err, type Result } from '../result';
import type { MassSymbol, Unit } from './types';

const MASS_TO_GRAMS: Record<MassSymbol, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
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

  return err({ code: 'NO_PORTION_DATA', ingredientId: ingredient.id, unit });
}
