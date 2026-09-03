import type { Recipe } from '../../domain/recipes/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData } from './jsonFileStore';

export interface RecipeRepository {
  getAll(): Promise<Recipe[]>;
  save(recipe: Recipe): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createRecipeRepository(io: FileIO, dir: string): RecipeRepository {
  return {
    async getAll() {
      const data = await readUserData(io, dir);
      return data.recipes;
    },
    async save(recipe: Recipe) {
      const data = await readUserData(io, dir);
      const others = data.recipes.filter((r) => r.id !== recipe.id);
      await writeUserData(io, dir, { ...data, recipes: [...others, recipe] });
    },
    async delete(id: string) {
      const data = await readUserData(io, dir);
      const remaining = data.recipes.filter((r) => r.id !== id);
      await writeUserData(io, dir, { ...data, recipes: remaining });
    },
  };
}
