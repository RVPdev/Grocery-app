import type { MealPlan } from '../../domain/plan/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData, withUserDataLock } from './jsonFileStore';

export interface PlanRepository {
  get(): Promise<MealPlan>;
  save(plan: MealPlan): Promise<void>;
}

export function createPlanRepository(io: FileIO, dir: string): PlanRepository {
  return {
    async get() {
      const data = await readUserData(io, dir);
      return data.mealPlan;
    },
    save(plan: MealPlan) {
      return withUserDataLock(async () => {
        const data = await readUserData(io, dir);
        await writeUserData(io, dir, { ...data, mealPlan: plan });
      });
    },
  };
}
