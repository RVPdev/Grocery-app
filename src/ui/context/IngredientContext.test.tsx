import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { IngredientProvider, useIngredients } from './IngredientContext';
import type { Ingredient, Portion } from '../../domain/ingredients/types';
import type { UserIngredientRepository, LearnedPortionStore } from '../../data/index';

const granola: Ingredient = {
  id: 'user:1', name: 'Homemade granola',
  nutritionPer100g: { kcal: 450, proteinG: 10, carbsG: 60, fatG: 18 },
  portions: [], source: 'user',
};

const learnedCup: Portion = { label: '1 cup', unit: { kind: 'volume', symbol: 'cup' }, gramsPerUnit: 90 };

function fakeUserIngredientRepo(initial: Ingredient[]): UserIngredientRepository & { saved: Ingredient[] } {
  const saved: Ingredient[] = [];
  return {
    saved,
    async getAll() {
      return initial;
    },
    async save(ingredient) {
      saved.push(ingredient);
    },
  };
}

function fakeLearnedPortionStore(): LearnedPortionStore & { added: Array<{ id: string; portion: Portion }> } {
  const added: Array<{ id: string; portion: Portion }> = [];
  return {
    added,
    async getFor() {
      return [];
    },
    async add(ingredientId, portion) {
      added.push({ id: ingredientId, portion });
    },
  };
}

describe('IngredientProvider', () => {
  it('loads user ingredients from the repository on mount', async () => {
    const userIngredientRepo = fakeUserIngredientRepo([granola]);
    let hookResult: ReturnType<typeof useIngredients>;
    function Consumer() {
      hookResult = useIngredients();
      return null;
    }
    await act(async () => {
      renderer.create(
        <IngredientProvider userIngredientRepository={userIngredientRepo} learnedPortionStore={fakeLearnedPortionStore()}>
          <Consumer />
        </IngredientProvider>,
      );
    });
    expect(hookResult!.userIngredients).toEqual([granola]);
  });

  it('addUserIngredient saves to the repository and updates state', async () => {
    const userIngredientRepo = fakeUserIngredientRepo([]);
    let hookResult: ReturnType<typeof useIngredients>;
    function Consumer() {
      hookResult = useIngredients();
      return null;
    }
    await act(async () => {
      renderer.create(
        <IngredientProvider userIngredientRepository={userIngredientRepo} learnedPortionStore={fakeLearnedPortionStore()}>
          <Consumer />
        </IngredientProvider>,
      );
    });
    await act(async () => {
      await hookResult!.addUserIngredient(granola);
    });
    expect(userIngredientRepo.saved).toEqual([granola]);
    expect(hookResult!.userIngredients).toEqual([granola]);
  });

  it('learnPortion adds to the store and is reflected in a subsequent resolve', async () => {
    const learnedPortionStore = fakeLearnedPortionStore();
    let hookResult: ReturnType<typeof useIngredients>;
    function Consumer() {
      hookResult = useIngredients();
      return null;
    }
    await act(async () => {
      renderer.create(
        <IngredientProvider userIngredientRepository={fakeUserIngredientRepo([])} learnedPortionStore={learnedPortionStore}>
          <Consumer />
        </IngredientProvider>,
      );
    });
    await act(async () => {
      await hookResult!.learnPortion('usda:1001', learnedCup);
    });
    expect(learnedPortionStore.added).toEqual([{ id: 'usda:1001', portion: learnedCup }]);
  });
});
