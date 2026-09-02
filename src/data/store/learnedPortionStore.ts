import type { Portion } from '../../domain/ingredients/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData } from './jsonFileStore';

export interface LearnedPortionStore {
  getFor(ingredientId: string): Promise<Portion[]>;
  add(ingredientId: string, portion: Portion): Promise<void>;
}

export function createLearnedPortionStore(io: FileIO, dir: string): LearnedPortionStore {
  return {
    async getFor(ingredientId: string) {
      const data = await readUserData(io, dir);
      return data.learnedPortions[ingredientId] ?? [];
    },
    async add(ingredientId: string, portion: Portion) {
      const data = await readUserData(io, dir);
      const existing = data.learnedPortions[ingredientId] ?? [];
      await writeUserData(io, dir, {
        ...data,
        learnedPortions: { ...data.learnedPortions, [ingredientId]: [...existing, portion] },
      });
    },
  };
}
