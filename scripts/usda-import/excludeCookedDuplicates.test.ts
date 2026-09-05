import { excludeCookedDuplicates } from './excludeCookedDuplicates';
import type { FoodRow } from './types';

function food(fdc_id: string, description: string): FoodRow {
  return { fdc_id, data_type: 'sr_legacy_food', description, food_category_id: '1' };
}

describe('excludeCookedDuplicates', () => {
  it('drops a cooked entry when a matching raw entry exists', () => {
    const raw = food('1', 'Chicken, breast, meat only, raw');
    const cooked = food('2', 'Chicken, breast, meat only, cooked, roasted');
    expect(excludeCookedDuplicates([raw, cooked])).toEqual([raw]);
  });

  it('keeps a cooked entry when no raw counterpart exists', () => {
    const cooked = food('1', 'Turkey, wing, smoked, cooked, with skin, bone removed');
    expect(excludeCookedDuplicates([cooked])).toEqual([cooked]);
  });

  it('drops a cooked entry when the raw counterpart has extra trailing text', () => {
    const raw = food('1', "Pork, fresh, leg, rump half, raw (Includes foods for USDA's Food Distribution Program)");
    const cooked = food('2', 'Pork, fresh, leg, rump half, cooked, roasted');
    expect(excludeCookedDuplicates([raw, cooked])).toEqual([raw]);
  });

  it('leaves foods with neither "raw" nor "cooked" in the description untouched', () => {
    const salt = food('1', 'Salt, table');
    expect(excludeCookedDuplicates([salt])).toEqual([salt]);
  });

  it('never drops a raw entry itself', () => {
    const raw = food('1', 'Chicken, breast, meat only, raw');
    expect(excludeCookedDuplicates([raw])).toEqual([raw]);
  });
});
