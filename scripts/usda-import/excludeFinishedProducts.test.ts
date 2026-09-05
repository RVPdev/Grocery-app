import { excludeFinishedProducts } from './excludeFinishedProducts';
import type { FoodRow } from './types';

function food(description: string): FoodRow {
  return { fdc_id: '1', data_type: 'sr_legacy_food', description, food_category_id: '1' };
}

describe('excludeFinishedProducts', () => {
  it.each([
    ['Candies, MARS SNACKFOOD US, SNICKERS Bar'],
    ['Ice creams, vanilla'],
    ['Frozen yogurts, chocolate'],
    ['Sherbet, orange'],
    ['Puddings, vanilla, ready-to-eat'],
    ['Gelatin desserts, dry mix'],
    ['Desserts, flan, caramel custard, prepared-from-recipe'],
    ['Cookies, animal crackers'],
    ['Cake, pound, Bimbo Bakeries USA'],
    ['Pie, Dutch Apple, Commercially Prepared'],
    ['Meatballs, frozen, Italian style'],
    ['Frostings, chocolate, creamy, ready-to-eat'],
    ['Cookies, brownies, commercially prepared'],
    ['Doughnuts, yeast-leavened, glazed'],
    ['Danish pastry, cinnamon, enriched'],
    ['Muffin, blueberry, commercially prepared, low-fat'],
    ['Toaster pastries, brown-sugar-cinnamon'],
  ])('excludes a finished product: %s', (description) => {
    expect(excludeFinishedProducts([food(description)])).toEqual([]);
  });

  it.each([
    ['Wheat flour, white, cake, enriched'],
    ['Pie crust, deep dish, frozen, unbaked, made with enriched flour'],
    ['Pie Crust, Cookie-type, Graham Cracker, Ready Crust'],
    ['Puff pastry, frozen, ready-to-bake'],
    ['George Weston Bakeries, Thomas English Muffins'],
  ])('keeps a base ingredient despite matching a marker word: %s', (description) => {
    const item = food(description);
    expect(excludeFinishedProducts([item])).toEqual([item]);
  });

  it('leaves an unrelated ingredient untouched', () => {
    const chicken = food('Chicken, breast, raw');
    expect(excludeFinishedProducts([chicken])).toEqual([chicken]);
  });
});
