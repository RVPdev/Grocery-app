import { excludeManuallyCuratedNonIngredients } from './excludeManuallyCuratedNonIngredients';
import type { FoodRow } from './types';

function food(fdc_id: string, description: string): FoodRow {
  return { fdc_id, data_type: 'sr_legacy_food', description, food_category_id: '1' };
}

describe('excludeManuallyCuratedNonIngredients', () => {
  it('drops a food whose id is on the curated non-ingredient list', () => {
    const soup = food('168027', 'Soup, fish, homemade (Alaska Native)');
    expect(excludeManuallyCuratedNonIngredients([soup])).toEqual([]);
  });

  it('drops hummus per the explicit exclude decision', () => {
    const hummus = food('172454', 'Hummus, home prepared');
    expect(excludeManuallyCuratedNonIngredients([hummus])).toEqual([]);
  });

  it('keeps a food whose id is not on the list', () => {
    const chicken = food('999999', 'Chicken, breast, raw');
    expect(excludeManuallyCuratedNonIngredients([chicken])).toEqual([chicken]);
  });
});
