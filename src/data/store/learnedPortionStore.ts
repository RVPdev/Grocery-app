import type { Portion } from '../../domain/ingredients/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData, withUserDataLock } from './jsonFileStore';

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
    add(ingredientId: string, portion: Portion) {
      return withUserDataLock(async () => {
        const data = await readUserData(io, dir);
        const existing = data.learnedPortions[ingredientId] ?? [];
        await writeUserData(io, dir, {
          ...data,
          learnedPortions: { ...data.learnedPortions, [ingredientId]: [...existing, portion] },
        });
      });
    },
  };
}
