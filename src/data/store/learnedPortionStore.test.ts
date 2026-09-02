import { mkdtempSync, rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLearnedPortionStore } from './learnedPortionStore';
import type { FileIO } from './fileIO';
import type { Portion } from '../../domain/ingredients/types';

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

const oneCup: Portion = { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 90 };
const oneMedium: Portion = { label: '1 medium', unit: { kind: 'count', label: 'medium' }, gramsPerUnit: 110 };

describe('createLearnedPortionStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'learned-portion-store-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty list for an ingredient with no learned portions', async () => {
    const store = createLearnedPortionStore(nodeFileIO, dir);
    expect(await store.getFor('usda:1001')).toEqual([]);
  });

  it('add then getFor returns the learned portion', async () => {
    const store = createLearnedPortionStore(nodeFileIO, dir);
    await store.add('usda:1001', oneCup);
    expect(await store.getFor('usda:1001')).toEqual([oneCup]);
  });

  it('adding a second portion for the same ingredient appends, not replaces', async () => {
    const store = createLearnedPortionStore(nodeFileIO, dir);
    await store.add('usda:1001', oneCup);
    await store.add('usda:1001', oneMedium);
    expect(await store.getFor('usda:1001')).toEqual([oneCup, oneMedium]);
  });

  it('keeps portions for different ingredients separate', async () => {
    const store = createLearnedPortionStore(nodeFileIO, dir);
    await store.add('usda:1001', oneCup);
    await store.add('usda:2002', oneMedium);
    expect(await store.getFor('usda:1001')).toEqual([oneCup]);
    expect(await store.getFor('usda:2002')).toEqual([oneMedium]);
  });
});
