import type { Ingredient } from '../../domain/ingredients/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData } from './jsonFileStore';

export interface UserIngredientRepository {
  getAll(): Promise<Ingredient[]>;
  save(ingredient: Ingredient): Promise<void>;
}

export function createUserIngredientRepository(io: FileIO, dir: string): UserIngredientRepository {
  return {
    async getAll() {
      const data = await readUserData(io, dir);
      return data.userIngredients;
    },
    async save(ingredient: Ingredient) {
      const data = await readUserData(io, dir);
      const others = data.userIngredients.filter((i) => i.id !== ingredient.id);
      await writeUserData(io, dir, { ...data, userIngredients: [...others, ingredient] });
    },
  };
}
