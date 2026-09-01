import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import type { Ingredient } from '../../src/domain/ingredients/types';

export function buildDatabase(ingredients: Ingredient[], outPath: string): void {
  // Rebuilding is expected to overwrite a previously-built database at the
  // same path (e.g. re-running the import after a fix); without this, the
  // CREATE TABLE statements below fail because the tables already exist.
  rmSync(outPath, { force: true });
  const db = new DatabaseSync(outPath);

  db.exec(`
    CREATE TABLE ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kcal REAL NOT NULL,
      protein_g REAL NOT NULL,
      carbs_g REAL NOT NULL,
      fat_g REAL NOT NULL
    );
    CREATE INDEX idx_ingredients_name ON ingredients(name COLLATE NOCASE);

    CREATE TABLE portions (
      ingredient_id TEXT NOT NULL,
      label TEXT NOT NULL,
      unit_kind TEXT NOT NULL,
      unit_symbol TEXT,
      unit_label TEXT,
      grams_per_unit REAL NOT NULL
    );
    CREATE INDEX idx_portions_ingredient ON portions(ingredient_id);
  `);

  const insertIngredient = db.prepare(
    'INSERT INTO ingredients (id, name, kcal, protein_g, carbs_g, fat_g) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertPortion = db.prepare(
    'INSERT INTO portions (ingredient_id, label, unit_kind, unit_symbol, unit_label, grams_per_unit) VALUES (?, ?, ?, ?, ?, ?)',
  );

  for (const ingredient of ingredients) {
    insertIngredient.run(
      ingredient.id,
      ingredient.name,
      ingredient.nutritionPer100g.kcal,
      ingredient.nutritionPer100g.proteinG,
      ingredient.nutritionPer100g.carbsG,
      ingredient.nutritionPer100g.fatG,
    );
    for (const portion of ingredient.portions) {
      const unitSymbol = portion.unit.kind === 'count' ? null : portion.unit.symbol;
      const unitLabel = portion.unit.kind === 'count' ? portion.unit.label : null;
      insertPortion.run(
        ingredient.id, portion.label, portion.unit.kind, unitSymbol, unitLabel, portion.gramsPerUnit,
      );
    }
  }

  db.close();
}
