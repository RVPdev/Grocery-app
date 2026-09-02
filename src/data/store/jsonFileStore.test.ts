import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readUserData, writeUserData } from './jsonFileStore';
import type { FileIO } from './fileIO';
import type { Recipe } from '../../domain/recipes/types';
import type { MealPlan } from '../../domain/plan/types';
import type { Ingredient, Portion } from '../../domain/ingredients/types';

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
});
