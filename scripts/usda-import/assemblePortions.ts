import type { Portion } from '../../src/domain/ingredients/types';
import { detectUnitFromText } from './detectUnit';
import type { FoodPortionRow } from './types';

export function assemblePortions(portionRows: FoodPortionRow[]): Portion[] {
  const portions: Portion[] = [];

  for (const row of portionRows) {
    const amount = parseFloat(row.amount);
    const gramWeight = parseFloat(row.gram_weight);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(gramWeight) || gramWeight <= 0) {
      continue;
    }

    const label = row.portion_description.trim() || row.modifier.trim();
    const text = `${row.modifier} ${row.portion_description}`.trim();
    const unit = detectUnitFromText(text);
    if (!unit) continue;

    portions.push({ label, unit, gramsPerUnit: gramWeight / amount });
  }

  return portions;
}
