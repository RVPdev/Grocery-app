import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDatabase } from './buildDatabase';
import type { Ingredient } from '../../src/domain/ingredients/types';

const oats: Ingredient = {
  id: 'usda:1001', name: 'Oats, rolled', source: 'usda',
  nutritionPer100g: { kcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
  portions: [{ label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 80 }],
};

const onion: Ingredient = {
  id: 'usda:1002', name: 'Onion, raw', source: 'usda',
  nutritionPer100g: { kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1 },
  portions: [{ label: '1 medium', unit: { kind: 'count', label: '1 medium' }, gramsPerUnit: 110 }],
};

describe('buildDatabase', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'usda-db-test-'));
    dbPath = join(dir, 'usda.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes one row per ingredient into the ingredients table', () => {
    buildDatabase([oats, onion], dbPath);
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare('SELECT * FROM ingredients ORDER BY id').all();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'usda:1001', name: 'Oats, rolled', kcal: 389 });
    db.close();
  });

  it('writes one row per portion, tagged by unit kind', () => {
    buildDatabase([oats, onion], dbPath);
    const db = new DatabaseSync(dbPath);
    const oatPortions = db.prepare('SELECT * FROM portions WHERE ingredient_id = ?').all('usda:1001');
    expect(oatPortions).toEqual([
      { ingredient_id: 'usda:1001', label: '1 cup', unit_kind: 'volume', unit_symbol: 'cup', unit_label: null, grams_per_unit: 80 },
    ]);
    const onionPortions = db.prepare('SELECT * FROM portions WHERE ingredient_id = ?').all('usda:1002');
    expect(onionPortions).toEqual([
      { ingredient_id: 'usda:1002', label: '1 medium', unit_kind: 'count', unit_symbol: null, unit_label: '1 medium', grams_per_unit: 110 },
    ]);
    db.close();
  });

  it('writes no portion rows for an ingredient with none', () => {
    const water: Ingredient = {
      id: 'usda:1003', name: 'Water', source: 'usda',
      nutritionPer100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      portions: [],
    };
    buildDatabase([water], dbPath);
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare('SELECT * FROM portions WHERE ingredient_id = ?').all('usda:1003');
    expect(rows).toEqual([]);
    db.close();
  });
});
