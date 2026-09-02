import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecipeRepository } from './recipeRepository';
import { writeUserData } from './jsonFileStore';
import type { FileIO } from './fileIO';
import type { Recipe } from '../../domain/recipes/types';
import type { MealPlan } from '../../domain/plan/types';

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

const soup: Recipe = {
  id: 'recipe-2', name: 'Soup', servings: 4,
  ingredients: [{ ingredientId: 'usda:1002', quantity: { grams: 220, input: { amount: 220, unit: { kind: 'mass', symbol: 'g' } } } }],
  steps: ['Simmer everything.'],
};

describe('createRecipeRepository', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'recipe-repo-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty list before anything is saved', async () => {
    const repo = createRecipeRepository(nodeFileIO, dir);
    expect(await repo.getAll()).toEqual([]);
  });

  it('save then getAll returns the saved recipe', async () => {
    const repo = createRecipeRepository(nodeFileIO, dir);
    await repo.save(porridge);
    expect(await repo.getAll()).toEqual([porridge]);
  });

  it('saving an existing id overwrites rather than duplicating', async () => {
    const repo = createRecipeRepository(nodeFileIO, dir);
    await repo.save(porridge);
    await repo.save({ ...porridge, name: 'Porridge v2' });
    const all = await repo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Porridge v2');
  });

  it('delete removes only the targeted recipe', async () => {
    const repo = createRecipeRepository(nodeFileIO, dir);
    await repo.save(porridge);
    await repo.save(soup);
    await repo.delete(porridge.id);
    expect(await repo.getAll()).toEqual([soup]);
  });

  it('saving a recipe preserves an already-stored plan, user ingredients, and learned portions', async () => {
    const plan: MealPlan = { id: 'default', name: 'This Week', meals: [{ recipeId: 'recipe-2', servings: 3 }] };
    await writeUserData(nodeFileIO, dir, {
      recipes: [soup], mealPlan: plan,
      userIngredients: [{ id: 'user:1', name: 'Custom', nutritionPer100g: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 }, portions: [], source: 'user' }],
      learnedPortions: { 'usda:1': [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 100 }] },
    });
    const repo = createRecipeRepository(nodeFileIO, dir);
    await repo.save(porridge);

    const raw = JSON.parse(await nodeFileIO.readText(`${dir}/user-data.json`));
    expect(raw.mealPlan).toEqual(plan);
    expect(raw.userIngredients).toHaveLength(1);
    expect(raw.learnedPortions).toEqual({ 'usda:1': [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 100 }] });
  });
});
