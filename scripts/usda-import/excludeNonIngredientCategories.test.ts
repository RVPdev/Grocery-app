import { excludeNonIngredientCategories } from './excludeNonIngredientCategories';
import type { FoodCategoryRow, FoodRow } from './types';

const categories: FoodCategoryRow[] = [
  { id: '1', code: '0100', description: 'Dairy and Egg Products' },
  { id: '2', code: '2100', description: 'Fast Foods' },
];

function food(overrides: Partial<FoodRow>): FoodRow {
  return { fdc_id: '1', data_type: 'sr_legacy_food', description: 'Food', food_category_id: '1', ...overrides };
}

describe('excludeNonIngredientCategories', () => {
  it('drops a food whose category is Fast Foods', () => {
    const foods = [food({ fdc_id: '1', description: 'Fast foods, cheeseburger', food_category_id: '2' })];
    expect(excludeNonIngredientCategories(foods, categories)).toEqual([]);
  });

  it('keeps a food whose category is not excluded', () => {
    const foods = [food({ fdc_id: '1', description: 'Milk, whole', food_category_id: '1' })];
    expect(excludeNonIngredientCategories(foods, categories)).toEqual(foods);
  });

  it('keeps a food whose category id does not resolve to any known category', () => {
    const foods = [food({ fdc_id: '1', description: 'Mystery food', food_category_id: '999' })];
    expect(excludeNonIngredientCategories(foods, categories)).toEqual(foods);
  });
});
