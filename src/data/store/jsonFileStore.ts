import type { Recipe } from '../../domain/recipes/types';
import type { MealPlan } from '../../domain/plan/types';
import type { Ingredient, Portion } from '../../domain/ingredients/types';
import type { FileIO } from './fileIO';

export type UserData = {
  recipes: Recipe[];
  mealPlan: MealPlan;
  userIngredients: Ingredient[];
  learnedPortions: Record<string, Portion[]>;
};

function emptyUserData(): UserData {
  return {
    recipes: [],
    mealPlan: { id: 'default', name: 'This Week', meals: [] },
    userIngredients: [],
    learnedPortions: {},
  };
}

function userDataPath(dir: string): string {
  return `${dir}/user-data.json`;
}

function tempPath(dir: string): string {
  return `${dir}/user-data.json.tmp`;
}

export async function readUserData(io: FileIO, dir: string): Promise<UserData> {
  const path = userDataPath(dir);
  if (!(await io.exists(path))) {
    return emptyUserData();
  }
  const content = await io.readText(path);
  return { ...emptyUserData(), ...JSON.parse(content) } as UserData;
}

export async function writeUserData(io: FileIO, dir: string, data: UserData): Promise<void> {
  const tmp = tempPath(dir);
  await io.writeText(tmp, JSON.stringify(data));
  await io.move(tmp, userDataPath(dir));
}
