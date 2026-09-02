import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUserIngredientRepository } from './userIngredientRepository';
import type { FileIO } from './fileIO';
import type { Ingredient } from '../../domain/ingredients/types';

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

const granola: Ingredient = {
  id: 'user:1', name: 'Homemade granola',
  nutritionPer100g: { kcal: 450, proteinG: 10, carbsG: 60, fatG: 18 },
  portions: [], source: 'user',
};

const jam: Ingredient = {
  id: 'user:2', name: 'Homemade jam',
  nutritionPer100g: { kcal: 250, proteinG: 0, carbsG: 62, fatG: 0 },
  portions: [], source: 'user',
};

describe('createUserIngredientRepository', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'user-ingredient-repo-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty list before anything is saved', async () => {
    const repo = createUserIngredientRepository(nodeFileIO, dir);
    expect(await repo.getAll()).toEqual([]);
  });

  it('save then getAll returns the saved ingredient', async () => {
    const repo = createUserIngredientRepository(nodeFileIO, dir);
    await repo.save(granola);
    expect(await repo.getAll()).toEqual([granola]);
  });

  it('saving an existing id overwrites rather than duplicating', async () => {
    const repo = createUserIngredientRepository(nodeFileIO, dir);
    await repo.save(granola);
    await repo.save({ ...granola, name: 'Homemade granola v2' });
    const all = await repo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Homemade granola v2');
  });

  it('saving a second ingredient preserves the first', async () => {
    const repo = createUserIngredientRepository(nodeFileIO, dir);
    await repo.save(granola);
    await repo.save(jam);
    expect(await repo.getAll()).toEqual([granola, jam]);
  });
});
