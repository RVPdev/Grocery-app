import type { Unit } from './units/types';

export type AppError =
  | { code: 'NO_PORTION_DATA'; ingredientId: string; unit: Unit }
  | { code: 'INGREDIENT_NOT_FOUND'; ingredientId: string }
  | { code: 'RECIPE_NOT_FOUND'; recipeId: string }
  | { code: 'INVALID_AMOUNT'; amount: number };

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
