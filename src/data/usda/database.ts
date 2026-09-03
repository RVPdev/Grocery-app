import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import type { Ingredient } from '../../domain/ingredients/types';
import {
  assembleIngredient, buildSearchQuery, type IngredientRow, type PortionRow,
} from './mapRow';

const DB_NAME = 'usda.db';

async function ensureDatabaseCopied(): Promise<void> {
  const sqliteDir = `${FileSystem.documentDirectory}SQLite`;
  const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
  }

  const dbPath = `${sqliteDir}/${DB_NAME}`;
  const dbInfo = await FileSystem.getInfoAsync(dbPath);
  if (dbInfo.exists) return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro requires a literal require() to bundle a static asset.
  const [asset] = await Asset.loadAsync(require('../../../assets/usda.db'));
  if (!asset.localUri) {
    throw new Error('Bundled USDA database asset failed to resolve a local URI.');
  }

  // Copy to a temp path and move into place only once the copy fully succeeds,
  // so an interrupted copy (e.g. a flaky connection while fetching the asset)
  // never leaves a broken file at dbPath that ensureDatabaseCopied would then
  // treat as "already copied" on every future launch.
  const tmpPath = `${dbPath}.tmp`;
  await FileSystem.copyAsync({ from: asset.localUri, to: tmpPath });
  await FileSystem.moveAsync({ from: tmpPath, to: dbPath });
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
