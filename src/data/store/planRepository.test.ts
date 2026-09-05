import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlanRepository } from './planRepository';
import { writeUserData } from './jsonFileStore';
import type { FileIO } from './fileIO';
import type { MealPlan } from '../../domain/plan/types';
import type { Recipe } from '../../domain/recipes/types';

const nodeFileIO: FileIO = {
  async exists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
  readText: (path) => fs.readFile(path, 'utf-8'),
  writeText: (path, content) => fs.writeFile(path, content, 'utf-8'),
  move: (from, to) => fs.rename(from, to),
};

const porridge: Recipe = {
  id: 'recipe-1', name: 'Porridge', servings: 2,
  ingredients: [{ ingredientId: 'usda:1001', quantity: { grams: 200, input: { amount: 200, unit: { kind: 'mass', symbol: 'g' } } } }],
  steps: ['Combine and simmer.'],
};

describe('createPlanRepository', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plan-repo-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the default empty plan before anything is saved', async () => {
    const repo = createPlanRepository(nodeFileIO, dir);
    expect(await repo.get()).toEqual({ id: 'default', name: 'This Week', meals: [] });
  });

  it('save then get returns the saved plan', async () => {
    const repo = createPlanRepository(nodeFileIO, dir);
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 3 }] };
    await repo.save(plan);
    expect(await repo.get()).toEqual(plan);
  });

  it('a second save overwrites rather than merging with the first', async () => {
    const repo = createPlanRepository(nodeFileIO, dir);
    await repo.save({ id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 1 }] });
    const second: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-2', servings: 4 }] };
    await repo.save(second);
    expect(await repo.get()).toEqual(second);
  });

  it('saving a plan preserves already-stored recipes, user ingredients, and learned portions', async () => {
    await writeUserData(nodeFileIO, dir, {
      recipes: [porridge],
      mealPlan: { id: 'default', name: 'This Week', meals: [] },
      userIngredients: [{ id: 'user:1', name: 'Custom', nutritionPer100g: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 }, portions: [], source: 'user' }],
      learnedPortions: { 'usda:1': [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 100 }] },
    });
    const repo = createPlanRepository(nodeFileIO, dir);
    await repo.save({ id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 2 }] });

    const raw = JSON.parse(await nodeFileIO.readText(`${dir}/user-data.json`));
    expect(raw.recipes).toEqual([porridge]);
    expect(raw.userIngredients).toHaveLength(1);
    expect(raw.learnedPortions).toEqual({ 'usda:1': [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 100 }] });
  });

  it('update reads the current plan, applies the transform, persists and returns the result atomically', async () => {
    const repo = createPlanRepository(nodeFileIO, dir);
    await repo.save({ id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 2 }] });

    const returned = await repo.update((plan) => ({
      ...plan,
      meals: [...plan.meals, { recipeId: 'recipe-2', servings: 3 }],
    }));

    const expected: MealPlan = {
      id: 'default', name: 'This Week',
      meals: [{ recipeId: 'recipe-1', servings: 2 }, { recipeId: 'recipe-2', servings: 3 }],
    };
    expect(returned).toEqual(expected);
    expect(await repo.get()).toEqual(expected);
  });
});
