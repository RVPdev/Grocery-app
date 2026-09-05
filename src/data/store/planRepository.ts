import type { MealPlan } from '../../domain/plan/types';
import type { FileIO } from './fileIO';
import { readUserData, writeUserData, withUserDataLock } from './jsonFileStore';

export interface PlanRepository {
  get(): Promise<MealPlan>;
  save(plan: MealPlan): Promise<void>;
  update(mutate: (plan: MealPlan) => MealPlan): Promise<MealPlan>;
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
    update(mutate: (plan: MealPlan) => MealPlan) {
      return withUserDataLock(async () => {
        const data = await readUserData(io, dir);
        const nextPlan = mutate(data.mealPlan);
        await writeUserData(io, dir, { ...data, mealPlan: nextPlan });
        return nextPlan;
      });
    },
  };
}
