// USDA FoodData Central data is public domain (CC0 1.0); USDA requests,
// but does not require, attribution as "FoodData Central".
// https://fdc.nal.usda.gov
import { loadSrLegacyFoods } from './loadSrLegacyFoods.ts';
import { buildDatabase } from './buildDatabase.ts';

const dataDir = process.argv[2];
const outPath = process.argv[3] ?? './assets/usda.db';

if (!dataDir) {
  console.error('Usage: node scripts/usda-import/import.ts <path-to-usda-csv-directory> [outPath]');
  process.exit(1);
}

const ingredients = loadSrLegacyFoods(dataDir);
console.log(`Loaded ${ingredients.length} ingredients from ${dataDir}`);

buildDatabase(ingredients, outPath);
console.log(`Wrote ${outPath}`);
