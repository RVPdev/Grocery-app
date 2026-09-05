import type { FoodRow } from './types';

// Verified 2026-09-04 against real SR Legacy descriptions: these mark a
// ready-to-eat finished product, not a component a recipe combines with
// other things. Deliberately scoped to unambiguous dessert/candy/prepared
// words — the mixed categories these run against (Sweets, Baked Products,
// Dairy and Egg Products, Sausages and Luncheon Meats) also contain
// legitimate ingredients (honey, syrups, sugar, bacon, cheese) that must
// not match any of these.
const FINISHED_PRODUCT_MARKERS: RegExp[] = [
  /\bcandy\b/i,
  /\bcandies\b/i,
  /\bice creams?\b/i,
  /\bfrozen yogurt/i,
  /\bfrozen novelt/i,
  /\bsherbet\b/i,
  /\bpudding/i,
  /\bgelatin dessert/i,
  /\bdesserts?,/i,
  /\bcookie/i,
  /\bcake\b/i,
  /\bpie\b/i,
  /\bmeatball/i,
  /\bfrosting/i,
  /\bbrownie/i,
  /\bdoughnut/i,
  /\bpastry\b/i,
  /\bmuffin/i,
  /\btoaster pastr/i,
];

// Verified 2026-09-04: each of these matches a marker above but is a real
// baking/cooking component, not a finished product — checked before the
// markers so they survive regardless.
const KEEP_ANYWAY: RegExp[] = [
  /wheat flour, white, cake, enriched/i, // cake flour, not a cake
  /pie crust/i,
  /puff pastry/i,
  /english muffin/i,
];

export function excludeFinishedProducts(foods: FoodRow[]): FoodRow[] {
  return foods.filter((food) => {
    if (KEEP_ANYWAY.some((pattern) => pattern.test(food.description))) return true;
    return !FINISHED_PRODUCT_MARKERS.some((pattern) => pattern.test(food.description));
  });
}
