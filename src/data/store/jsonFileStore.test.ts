import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readUserData, writeUserData, withUserDataLock } from './jsonFileStore';
import type { FileIO } from './fileIO';
import type { Recipe } from '../../domain/recipes/types';
import type { MealPlan } from '../../domain/plan/types';
import type { Ingredient, Portion } from '../../domain/ingredients/types';
import { createRecipeRepository } from './recipeRepository';
import { createUserIngredientRepository } from './userIngredientRepository';

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

describe('jsonFileStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'user-data-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty store when no file exists yet', async () => {
    expect(await readUserData(nodeFileIO, dir)).toEqual({
      recipes: [],
      mealPlan: { id: 'default', name: 'This Week', meals: [] },
      userIngredients: [],
      learnedPortions: {},
    });
  });

  it('returns a fresh object on each empty-store read, not a shared reference', async () => {
    const first = await readUserData(nodeFileIO, dir);
    const second = await readUserData(nodeFileIO, dir);
    expect(first).not.toBe(second);
    expect(first.recipes).not.toBe(second.recipes);
    expect(first.mealPlan).not.toBe(second.mealPlan);
    expect(first.mealPlan.meals).not.toBe(second.mealPlan.meals);
    expect(first.userIngredients).not.toBe(second.userIngredients);
    expect(first.learnedPortions).not.toBe(second.learnedPortions);
  });

  it('round-trips a write through a read', async () => {
    await writeUserData(nodeFileIO, dir, { recipes: [porridge], mealPlan: { id: 'default', name: 'This Week', meals: [] }, userIngredients: [], learnedPortions: {} });
    expect(await readUserData(nodeFileIO, dir)).toEqual({ recipes: [porridge], mealPlan: { id: 'default', name: 'This Week', meals: [] }, userIngredients: [], learnedPortions: {} });
  });

  it('overwrites the previous contents on a second write, not appends', async () => {
    await writeUserData(nodeFileIO, dir, { recipes: [porridge], mealPlan: { id: 'default', name: 'This Week', meals: [] }, userIngredients: [], learnedPortions: {} });
    await writeUserData(nodeFileIO, dir, { recipes: [], mealPlan: { id: 'default', name: 'This Week', meals: [] }, userIngredients: [], learnedPortions: {} });
    expect(await readUserData(nodeFileIO, dir)).toEqual({ recipes: [], mealPlan: { id: 'default', name: 'This Week', meals: [] }, userIngredients: [], learnedPortions: {} });
  });

  it('leaves no leftover temp file after a write', async () => {
    await writeUserData(nodeFileIO, dir, { recipes: [porridge], mealPlan: { id: 'default', name: 'This Week', meals: [] }, userIngredients: [], learnedPortions: {} });
    const entries = await fs.readdir(dir);
    expect(entries).toEqual(['user-data.json']);
  });

  it('round-trips meal plan, user ingredients, and learned portions', async () => {
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-1', servings: 2 }] };
    const userIngredient: Ingredient = {
      id: 'user:abc', name: 'Homemade granola', nutritionPer100g: { kcal: 450, proteinG: 10, carbsG: 60, fatG: 18 },
      portions: [], source: 'user',
    };
    const learnedPortion: Portion = { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 90 };
    await writeUserData(nodeFileIO, dir, {
      recipes: [], mealPlan: plan, userIngredients: [userIngredient],
      learnedPortions: { 'usda:1001': [learnedPortion] },
    });
    const result = await readUserData(nodeFileIO, dir);
    expect(result.mealPlan).toEqual(plan);
    expect(result.userIngredients).toEqual([userIngredient]);
    expect(result.learnedPortions).toEqual({ 'usda:1001': [learnedPortion] });
  });

  it('defaults fields missing from a file written under an older schema', async () => {
    await fs.writeFile(join(dir, 'user-data.json'), JSON.stringify({ recipes: [porridge] }), 'utf-8');
    expect(await readUserData(nodeFileIO, dir)).toEqual({
      recipes: [porridge],
      mealPlan: { id: 'default', name: 'This Week', meals: [] },
      userIngredients: [],
      learnedPortions: {},
    });
  });
});

describe('withUserDataLock', () => {
  it('does not start a second operation until the first one resolves', async () => {
    const order: string[] = [];
    let resolveFirst: () => void;

    const first = withUserDataLock(async () => {
      order.push('first-start');
      await new Promise<void>((resolve) => { resolveFirst = resolve; });
      order.push('first-end');
    });
    const second = withUserDataLock(async () => {
      order.push('second-start');
    });

    // Give the microtask queue a couple of ticks — long enough for
    // `second`'s executor to have run already if the lock weren't
    // serializing it behind `first`.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['first-start']);

    resolveFirst!();
    await first;
    await second;
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('still runs a queued operation after an earlier one rejects', async () => {
    const order: string[] = [];

    await withUserDataLock(async () => {
      order.push('will-reject');
      throw new Error('boom');
    }).catch(() => {});

    await withUserDataLock(async () => {
      order.push('runs-after');
    });

    expect(order).toEqual(['will-reject', 'runs-after']);
  });
});

// Delays every write by the same amount so two concurrent writers'
// writeText calls reliably overlap, instead of leaving the race to
// real filesystem timing (which could pass by luck on a fast machine).
function delayedWriteFileIO(base: FileIO, delayMs: number): FileIO {
  return {
    exists: (path) => base.exists(path),
    readText: (path) => base.readText(path),
    writeText: async (path, content) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return base.writeText(path, content);
    },
    move: (from, to) => base.move(from, to),
  };
}

describe('concurrent writes across repositories', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'user-data-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('serializes writes from two different repositories so neither is lost', async () => {
    const slowIO = delayedWriteFileIO(nodeFileIO, 20);
    const recipeRepo = createRecipeRepository(slowIO, dir);
    const ingredientRepo = createUserIngredientRepository(slowIO, dir);
    const customIngredient = {
      id: 'user:1', name: 'Custom',
      nutritionPer100g: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 },
      portions: [], source: 'user' as const,
    };

    await Promise.all([recipeRepo.save(porridge), ingredientRepo.save(customIngredient)]);

    const data = await readUserData(nodeFileIO, dir);
    expect(data.recipes).toEqual([porridge]);
    expect(data.userIngredients).toEqual([customIngredient]);
  });
});
