import type { Recipe } from '../../domain/recipes/types';
import type { MealPlan } from '../../domain/plan/types';
import type { Ingredient, Portion } from '../../domain/ingredients/types';
import type { FileIO } from './fileIO';

// Every repository's read-modify-write sequence against user-data.json must
// run inside this lock. Two repositories can otherwise both read the same
// snapshot and each write back a version missing the other's change (a lost
// update) — or both write the shared user-data.json.tmp path at once and
// corrupt it. Chaining every operation onto one promise guarantees only one
// read-modify-write sequence is ever in flight, regardless of which
// repository triggered it.
let writeQueue: Promise<unknown> = Promise.resolve();

export function withUserDataLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  // Keep the chain alive even if `operation` rejected — swallow here so a
  // failed write doesn't permanently wedge every write after it.
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

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
