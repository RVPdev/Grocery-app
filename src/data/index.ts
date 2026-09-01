import type { RecipeRepository } from './store/recipeRepository';
import { createRecipeRepository } from './store/recipeRepository';
import { expoFileIO, userDataDirectory } from './store/expoFileIO';

export type { RecipeRepository } from './store/recipeRepository';
export { createRecipeRepository } from './store/recipeRepository';
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
