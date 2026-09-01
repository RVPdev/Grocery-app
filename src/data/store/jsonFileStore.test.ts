import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readUserData, writeUserData } from './jsonFileStore';
import type { FileIO } from './fileIO';
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

describe('jsonFileStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'user-data-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty store when no file exists yet', async () => {
    expect(await readUserData(nodeFileIO, dir)).toEqual({ recipes: [] });
  });

  it('round-trips a write through a read', async () => {
    await writeUserData(nodeFileIO, dir, { recipes: [porridge] });
    expect(await readUserData(nodeFileIO, dir)).toEqual({ recipes: [porridge] });
  });

  it('overwrites the previous contents on a second write, not appends', async () => {
    await writeUserData(nodeFileIO, dir, { recipes: [porridge] });
    await writeUserData(nodeFileIO, dir, { recipes: [] });
    expect(await readUserData(nodeFileIO, dir)).toEqual({ recipes: [] });
  });

  it('leaves no leftover temp file after a write', async () => {
    await writeUserData(nodeFileIO, dir, { recipes: [porridge] });
    const entries = await fs.readdir(dir);
    expect(entries).toEqual(['user-data.json']);
  });
});
