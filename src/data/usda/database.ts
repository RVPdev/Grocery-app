import * as SQLite from 'expo-sqlite';
import { importDatabaseFromAssetAsync } from 'expo-sqlite';
import type { Ingredient } from '../../domain/ingredients/types';
import {
  assembleIngredient, buildSearchQuery, type IngredientRow, type PortionRow,
} from './mapRow';

const DB_NAME = 'usda.db';

async function ensureDatabaseCopied(): Promise<void> {
  // expo-sqlite's own asset-import primitive -- the same one SQLiteProvider's
  // `assetSource` prop uses internally -- not expo-file-system's generic
  // copyAsync/makeDirectoryAsync. Those generic calls are blocked from writing
  // into SQLite.defaultDatabaseDirectory under Expo Go (that directory lives
  // outside the sandboxed per-experience storage the generic file-system
  // module is scoped to), while this native import path is specifically
  // allowed to. It's also idempotent (skips the copy if the file is already
  // there) and atomic on the native side, so we don't need to track that
  // ourselves.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro requires a literal require() to bundle a static asset.
  await importDatabaseFromAssetAsync(DB_NAME, { assetId: require('../../../assets/usda.db') });
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = ensureDatabaseCopied().then(() => SQLite.openDatabaseAsync(DB_NAME));
  }
  return dbPromise;
}

async function loadPortions(db: SQLite.SQLiteDatabase, ingredientId: string): Promise<PortionRow[]> {
  return db.getAllAsync<PortionRow>('SELECT * FROM portions WHERE ingredient_id = ?', [ingredientId]);
}

export async function searchIngredients(term: string): Promise<Ingredient[]> {
  const db = await getDatabase();
  const { sql, params } = buildSearchQuery(term);
  const ingredientRows = await db.getAllAsync<IngredientRow>(sql, params as SQLite.SQLiteBindParams);

  const results: Ingredient[] = [];
  for (const row of ingredientRows) {
    results.push(assembleIngredient(row, await loadPortions(db, row.id)));
  }
  return results;
}

export async function getIngredientById(id: string): Promise<Ingredient | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<IngredientRow>('SELECT * FROM ingredients WHERE id = ?', [id]);
  if (!row) return null;
  return assembleIngredient(row, await loadPortions(db, id));
}
