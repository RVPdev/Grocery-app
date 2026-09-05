import type { RecipeRepository } from './store/recipeRepository';
import { createRecipeRepository } from './store/recipeRepository';
import { expoFileIO, userDataDirectory } from './store/expoFileIO';
import { createUserIngredientRepository, type UserIngredientRepository } from './store/userIngredientRepository';
import { createLearnedPortionStore, type LearnedPortionStore } from './store/learnedPortionStore';
import { createPlanRepository, type PlanRepository } from './store/planRepository';
import {
  resolveIngredient as resolveIngredientWithSources,
  searchAllIngredients as searchAllIngredientsWithSources,
  type IngredientSources,
} from './ingredients';
import { searchIngredients, getIngredientById } from './usda/database';

export type { RecipeRepository } from './store/recipeRepository';
export { createRecipeRepository } from './store/recipeRepository';
export type { PlanRepository } from './store/planRepository';
export { createPlanRepository } from './store/planRepository';
export { expoFileIO, userDataDirectory } from './store/expoFileIO';
export type { FileIO } from './store/fileIO';
export { searchIngredients, getIngredientById } from './usda/database';

// Convenience constructor wiring the Expo-backed FileIO to the app's real
// document storage directory, so a caller (e.g. Plan 3's UI) can get a
// working RecipeRepository without needing to know that expo-file-system's
// documentDirectory lives under the '/legacy' subpath.
export function createDefaultRecipeRepository(): RecipeRepository {
  return createRecipeRepository(expoFileIO, userDataDirectory);
}

export function createDefaultPlanRepository(): PlanRepository {
  return createPlanRepository(expoFileIO, userDataDirectory);
}

export type { UserIngredientRepository } from './store/userIngredientRepository';
export { createUserIngredientRepository } from './store/userIngredientRepository';
export type { LearnedPortionStore } from './store/learnedPortionStore';
export { createLearnedPortionStore } from './store/learnedPortionStore';
export type { IngredientSources } from './ingredients';

export function createDefaultUserIngredientRepository(): UserIngredientRepository {
  return createUserIngredientRepository(expoFileIO, userDataDirectory);
}

export function createDefaultLearnedPortionStore(): LearnedPortionStore {
  return createLearnedPortionStore(expoFileIO, userDataDirectory);
}

const defaultUserIngredientRepository = createDefaultUserIngredientRepository();
const defaultLearnedPortionStore = createDefaultLearnedPortionStore();

export const defaultIngredientSources: IngredientSources = {
  getUsdaIngredient: getIngredientById,
  searchUsdaIngredients: searchIngredients,
  getUserIngredients: () => defaultUserIngredientRepository.getAll(),
  getLearnedPortionsFor: (id) => defaultLearnedPortionStore.getFor(id),
};

// Bound convenience functions — the ones UI code should import.
export async function resolveIngredient(id: string) {
  return resolveIngredientWithSources(defaultIngredientSources, id);
}

export async function searchAllIngredients(query: string) {
  return searchAllIngredientsWithSources(defaultIngredientSources, query);
}
