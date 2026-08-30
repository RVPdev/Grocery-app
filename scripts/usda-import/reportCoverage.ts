import { loadSrLegacyFoods } from './loadSrLegacyFoods.ts';
import { analyzeCoverage } from './analyzeCoverage.ts';

const dataDir = process.argv[2];
if (!dataDir) {
  console.error('Usage: node reportCoverage.ts <path-to-usda-csv-directory>');
  process.exit(1);
}

const ingredients = loadSrLegacyFoods(dataDir);
const report = analyzeCoverage(ingredients);

console.log(`Total foods: ${report.total}`);
console.log(`With any usable portion: ${report.withAnyPortion} (${pct(report.withAnyPortion, report.total)})`);
console.log(`With a volume portion: ${report.withVolumePortion} (${pct(report.withVolumePortion, report.total)})`);

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${((n / total) * 100).toFixed(1)}%`;
}
