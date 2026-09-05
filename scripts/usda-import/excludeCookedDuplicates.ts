import type { FoodRow } from './types';

// Matches SR Legacy's comma-separated doneness convention, e.g.
// "Chicken, breast, meat only, cooked, roasted". Deliberately narrow: it
// only recognizes the literal word "cooked" (not every cooking-method word
// like "roasted"/"baked" on its own), since those appear in plenty of
// descriptions — "Pepperidge Farm, Goldfish, Baked Snack Crackers" — that
// aren't doneness variants of anything and would be false positives.
const COOKED_MARKER = /,\s*cooked\b/i;

// Verified 2026-09-04 against the real dataset: an exact "<prefix>, raw"
// match alone misses ~37 real pairs where the raw entry has trailing text
// after "raw" (e.g. "..., raw (Includes foods for USDA's Food Distribution
// Program)"), so the raw candidate is matched as a prefix, not full equality.
export function excludeCookedDuplicates(foods: FoodRow[]): FoodRow[] {
  const descriptions = foods.map((food) => food.description);
  return foods.filter((food) => !hasRawCounterpart(food.description, descriptions));
}

function hasRawCounterpart(description: string, allDescriptions: string[]): boolean {
  const match = COOKED_MARKER.exec(description);
  if (!match) return false;
  const rawPrefix = `${description.slice(0, match.index)}, raw`;
  return allDescriptions.some((d) => d === rawPrefix || d.startsWith(rawPrefix));
}
